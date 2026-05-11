/** Request/response types for the Dynatrace Synthetic API v2. */

export interface ActionInputs {
  environmentUrl: string;
  apiToken: string;
  tags: string[];
  monitorIds: string[];
  applications: string[];
  services: string[];
  locations: string[];
  failOnPerformanceIssue: boolean;
  failOnSslWarning: boolean;
  pollInterval: number;
  timeout: number;
}

// --- Trigger batch (POST) ---

export interface MonitorExecutionRequest {
  monitorId: string;
  locations?: string[];
  executionCount?: number;
}

export interface GroupExecutionRequest {
  tags?: string[];
  applications?: string[];
  services?: string[];
  locations?: string[];
}

export interface BatchExecutionRequest {
  monitors?: MonitorExecutionRequest[];
  group?: GroupExecutionRequest;
  failOnPerformanceIssue?: boolean;
  failOnSslWarning?: boolean;
  metadata?: Record<string, string>;
}

export interface TriggeredExecutionDetails {
  executionId: string;
  locationId: string;
}

export interface TriggeredMonitor {
  monitorId: string;
  executions: TriggeredExecutionDetails[];
}

export interface TriggeringProblemDetails {
  entityId: string;
  locationId?: string;
  executionId?: string;
  cause: string;
  details?: string;
}

export interface BatchExecutionResult {
  batchId: string;
  triggered: TriggeredMonitor[];
  triggeredCount: number;
  triggeringProblemsCount: number;
  triggeringProblemsDetails?: TriggeringProblemDetails[];
}

// --- Batch status (GET) ---

export interface FailedExecutionStatus {
  executionId: string;
  monitorId: string;
  locationId: string;
  executionStage: string;
  executionTimestamp?: number;
  failureMessage?: string;
  errorCode?: string;
}

export interface BatchStatus {
  batchId: string;
  batchStatus: string;
  triggeredCount: number;
  executedCount: number;
  failedCount: number;
  failedToExecuteCount: number;
  failedExecutions?: FailedExecutionStatus[];
  failedToExecute?: FailedExecutionStatus[];
  triggeringProblems?: TriggeringProblemDetails[];
  triggeringProblemsCount: number;
  metadata?: Record<string, string>;
  userId?: string;
}
