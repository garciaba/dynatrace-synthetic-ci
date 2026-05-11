import * as core from '@actions/core';
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import {
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchStatus,
} from './types';

export class DynatraceClient {
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(environmentUrl: string, apiToken: string) {
    this.baseUrl = environmentUrl.replace(/\/+$/, '');
    this.http = new HttpClient('dynatrace-synthetic-ci', [], {
      headers: {
        Authorization: `Api-Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Trigger a batch execution of synthetic monitors.
   * POST /api/v2/synthetic/executions/batch
   */
  async triggerBatch(
    request: BatchExecutionRequest
  ): Promise<BatchExecutionResult> {
    const url = `${this.baseUrl}/api/v2/synthetic/executions/batch`;
    const body = JSON.stringify(request);

    core.debug(`POST ${url}`);
    core.debug(`Request body: ${body}`);

    const response: HttpClientResponse = await this.http.post(url, body);
    const responseBody = await response.readBody();

    if (response.message.statusCode !== 201) {
      throw new Error(
        `Failed to trigger batch execution (HTTP ${response.message.statusCode}): ${responseBody}`
      );
    }

    return JSON.parse(responseBody) as BatchExecutionResult;
  }

  /**
   * Get the summary/status of a batch execution.
   * GET /api/v2/synthetic/executions/batch/{batchId}
   */
  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    const url = `${this.baseUrl}/api/v2/synthetic/executions/batch/${batchId}`;

    core.debug(`GET ${url}`);

    const response = await this.http.get(url);
    const responseBody = await response.readBody();

    if (response.message.statusCode !== 200) {
      throw new Error(
        `Failed to get batch status (HTTP ${response.message.statusCode}): ${responseBody}`
      );
    }

    return JSON.parse(responseBody) as BatchStatus;
  }

  /**
   * Poll until the batch completes or the timeout is reached.
   * Returns the final BatchStatus.
   */
  async waitForBatch(
    batchId: string,
    triggeredCount: number,
    pollIntervalMs: number,
    timeoutMs: number
  ): Promise<BatchStatus> {
    const startTime = Date.now();
    let lastStatus: BatchStatus | null = null;

    core.info(
      `Polling batch ${batchId} every ${pollIntervalMs / 1000}s (timeout: ${timeoutMs / 1000}s)...`
    );

    while (Date.now() - startTime < timeoutMs) {
      await this.sleep(pollIntervalMs);

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      lastStatus = await this.getBatchStatus(batchId);

      const totalDone =
        lastStatus.executedCount + lastStatus.failedToExecuteCount;

      core.info(
        `[${elapsed}s] Status: ${lastStatus.batchStatus} | ` +
          `Executed: ${lastStatus.executedCount}/${triggeredCount} | ` +
          `Failed: ${lastStatus.failedCount} | ` +
          `FailedToExecute: ${lastStatus.failedToExecuteCount}`
      );

      if (totalDone >= triggeredCount) {
        return lastStatus;
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const done = lastStatus
      ? lastStatus.executedCount + lastStatus.failedToExecuteCount
      : 0;

    throw new Error(
      `Timed out after ${elapsed}s waiting for batch ${batchId} ` +
        `(${done}/${triggeredCount} done)`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
