import * as core from '@actions/core';
import { DynatraceClient } from './client';
import {
  ActionInputs,
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchStatus,
  FailedExecutionStatus,
} from './types';

function getInputs(): ActionInputs {
  const csvToArray = (value: string): string[] =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    environmentUrl: core.getInput('environment_url', { required: true }),
    apiToken: core.getInput('api_token', { required: true }),
    tags: csvToArray(core.getInput('tags')),
    monitorIds: csvToArray(core.getInput('monitor_ids')),
    applications: csvToArray(core.getInput('applications')),
    services: csvToArray(core.getInput('services')),
    locations: csvToArray(core.getInput('locations')),
    failOnPerformanceIssue:
      core.getInput('fail_on_performance_issue') !== 'false',
    failOnSslWarning: core.getInput('fail_on_ssl_warning') !== 'false',
    pollInterval: parseInt(core.getInput('poll_interval') || '30', 10),
    timeout: parseInt(core.getInput('timeout') || '600', 10),
  };
}

function buildRequest(inputs: ActionInputs): BatchExecutionRequest {
  const metadata: Record<string, string> = {
    source: 'github-actions',
    repository: process.env.GITHUB_REPOSITORY ?? '',
    run_id: process.env.GITHUB_RUN_ID ?? '',
    sha: process.env.GITHUB_SHA ?? '',
  };

  const request: BatchExecutionRequest = {
    failOnPerformanceIssue: inputs.failOnPerformanceIssue,
    failOnSslWarning: inputs.failOnSslWarning,
    metadata,
  };

  if (inputs.monitorIds.length > 0) {
    request.monitors = inputs.monitorIds.map((id) => ({
      monitorId: id,
      ...(inputs.locations.length > 0
        ? { locations: inputs.locations }
        : {}),
    }));
  } else {
    const group: BatchExecutionRequest['group'] = {};
    if (inputs.tags.length > 0) group.tags = inputs.tags;
    if (inputs.applications.length > 0)
      group.applications = inputs.applications;
    if (inputs.services.length > 0) group.services = inputs.services;
    if (inputs.locations.length > 0) group.locations = inputs.locations;

    if (Object.keys(group).length === 0) {
      throw new Error(
        'You must specify at least one of: tags, monitor_ids, applications, or services.'
      );
    }
    request.group = group;
  }

  return request;
}

function writeTriggerSummary(result: BatchExecutionResult): void {
  core.summary
    .addHeading('Dynatrace Synthetic — Batch Triggered', 3)
    .addList([
      `<b>Batch ID:</b> <code>${result.batchId}</code>`,
      `<b>Triggered:</b> ${result.triggeredCount} execution(s)`,
    ]);

  if (result.triggeringProblemsCount > 0) {
    core.warning(
      `${result.triggeringProblemsCount} triggering problem(s) encountered`
    );
    core.summary.addRaw(
      `<b>Triggering problems:</b> ${result.triggeringProblemsCount}\n`
    );
    if (result.triggeringProblemsDetails) {
      core.summary.addCodeBlock(
        JSON.stringify(result.triggeringProblemsDetails, null, 2),
        'json'
      );
    }
  }
}

function writeResultsSummary(
  status: BatchStatus,
  triggeredCount: number
): void {
  core.summary
    .addHeading('Dynatrace Synthetic — Results', 3)
    .addTable([
      [
        { data: 'Metric', header: true },
        { data: 'Count', header: true },
      ],
      ['Triggered', String(triggeredCount)],
      ['Executed', String(status.executedCount)],
      ['Failed', String(status.failedCount)],
      ['Failed to execute', String(status.failedToExecuteCount)],
      [
        { data: '<b>Status</b>' },
        { data: `<b>${status.batchStatus}</b>` },
      ],
    ]);

  const formatFailures = (
    failures: FailedExecutionStatus[] | undefined,
    title: string
  ) => {
    if (failures && failures.length > 0) {
      core.summary.addHeading(title, 4);
      core.summary.addCodeBlock(
        JSON.stringify(failures, null, 2),
        'json'
      );
    }
  };

  formatFailures(status.failedExecutions, 'Failed executions');
  formatFailures(status.failedToExecute, 'Failed to execute');
}

async function run(): Promise<void> {
  try {
    // --- Parse inputs ---
    const inputs = getInputs();
    core.setSecret(inputs.apiToken);

    const client = new DynatraceClient(
      inputs.environmentUrl,
      inputs.apiToken
    );

    // --- Build and log request ---
    const request = buildRequest(inputs);

    core.startGroup('Request body');
    core.info(JSON.stringify(request, null, 2));
    core.endGroup();

    // --- Trigger batch ---
    core.info('Triggering Dynatrace Synthetic monitors...');
    const triggerResult: BatchExecutionResult =
      await client.triggerBatch(request);

    writeTriggerSummary(triggerResult);

    if (triggerResult.triggeredCount === 0) {
      core.setFailed(
        'No monitors were triggered. Verify tags/monitor IDs and ensure matching monitors exist.'
      );
      await core.summary.write();
      return;
    }

    core.setOutput('batch_id', triggerResult.batchId);
    core.setOutput('triggered_count', triggerResult.triggeredCount);

    core.startGroup('Triggered monitors');
    for (const monitor of triggerResult.triggered) {
      core.info(
        `${monitor.monitorId}: ${monitor.executions.length} execution(s)`
      );
      for (const exec of monitor.executions) {
        core.info(`  → ${exec.executionId} @ ${exec.locationId}`);
      }
    }
    core.endGroup();

    // --- Poll for results ---
    const status: BatchStatus = await client.waitForBatch(
      triggerResult.batchId,
      triggerResult.triggeredCount,
      inputs.pollInterval * 1000,
      inputs.timeout * 1000
    );

    core.setOutput('batch_status', status.batchStatus);
    core.setOutput('executed_count', status.executedCount);
    core.setOutput('failed_count', status.failedCount);

    writeResultsSummary(status, triggerResult.triggeredCount);

    // --- Evaluate results ---
    if (status.failedCount > 0) {
      core.startGroup('Failed execution details');
      core.info(
        JSON.stringify(status.failedExecutions, null, 2)
      );
      core.endGroup();

      core.summary.addRaw('\n**Result: FAILED**\n');
      await core.summary.write();
      core.setFailed(
        `${status.failedCount} synthetic monitor(s) failed`
      );
      return;
    }

    if (status.failedToExecuteCount > 0) {
      core.startGroup('Failed-to-execute details');
      core.info(
        JSON.stringify(status.failedToExecute, null, 2)
      );
      core.endGroup();

      core.summary.addRaw('\n**Result: FAILED TO EXECUTE**\n');
      await core.summary.write();
      core.setFailed(
        `${status.failedToExecuteCount} execution(s) failed to execute (engine timeout)`
      );
      return;
    }

    core.summary.addRaw(
      `\n**All ${status.executedCount} monitor(s) passed.**\n`
    );
    await core.summary.write();
    core.info(
      `All ${status.executedCount} synthetic monitor(s) passed!`
    );
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

run();
