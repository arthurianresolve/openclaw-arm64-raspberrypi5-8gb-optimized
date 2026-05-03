export type TaskFlowVerificationCommand = {
  command: string;
  passed: boolean;
  exitCode?: number | null;
  signal?: string | null;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export type TaskFlowVerificationHistoryEntry = {
  taskId?: string;
  status: "passed" | "failed";
  failMode?: "stop" | "record_only";
  verifiedAt?: number;
  summary: string;
  commands: TaskFlowVerificationCommand[];
};

export type TaskFlowVerificationState = {
  latestTaskId?: string;
  status: "passed" | "failed";
  failMode?: "stop" | "record_only";
  verifiedAt?: number;
  summary: string;
  commands: TaskFlowVerificationCommand[];
  remainingRepairBudget?: number;
  repairTaskId?: string;
  resumeStepAfterRepair?: string;
  repairAttemptCount?: number;
  repairSuccessCount?: number;
  repairFailureCount?: number;
  history?: TaskFlowVerificationHistoryEntry[];
};

function asObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeVerificationCommand(value: unknown): TaskFlowVerificationCommand | undefined {
  const record = asObjectRecord(value);
  if (!record) {
    return undefined;
  }
  const command = asString(record.command);
  const passed = asBoolean(record.passed);
  if (!command || passed === undefined) {
    return undefined;
  }
  return {
    command,
    passed,
    ...(record.exitCode === null || typeof record.exitCode === "number"
      ? { exitCode: record.exitCode }
      : {}),
    ...(record.signal === null || typeof record.signal === "string"
      ? { signal: record.signal }
      : {}),
    ...(asNumber(record.durationMs) !== undefined
      ? { durationMs: asNumber(record.durationMs)! }
      : {}),
    ...(asString(record.stdout) ? { stdout: asString(record.stdout)! } : {}),
    ...(asString(record.stderr) ? { stderr: asString(record.stderr)! } : {}),
    ...(asString(record.error) ? { error: asString(record.error)! } : {}),
  };
}

function normalizeVerificationHistoryEntry(
  value: unknown,
): TaskFlowVerificationHistoryEntry | undefined {
  const record = asObjectRecord(value);
  if (!record) {
    return undefined;
  }
  const status =
    record.status === "passed" || record.status === "failed" ? record.status : undefined;
  const summary = asString(record.summary);
  if (!status || !summary) {
    return undefined;
  }
  return {
    ...(asString(record.taskId) ? { taskId: asString(record.taskId)! } : {}),
    status,
    ...(record.failMode === "stop" || record.failMode === "record_only"
      ? { failMode: record.failMode }
      : {}),
    ...(asNumber(record.verifiedAt) !== undefined
      ? { verifiedAt: asNumber(record.verifiedAt)! }
      : {}),
    summary,
    commands: Array.isArray(record.commands)
      ? record.commands
          .map((command) => normalizeVerificationCommand(command))
          .filter((command): command is TaskFlowVerificationCommand => Boolean(command))
      : [],
  };
}

export function normalizeTaskFlowVerificationState(
  value: unknown,
): TaskFlowVerificationState | undefined {
  const record = asObjectRecord(value);
  if (!record) {
    return undefined;
  }
  const status =
    record.status === "passed" || record.status === "failed" ? record.status : undefined;
  const summary = asString(record.summary);
  if (!status || !summary) {
    return undefined;
  }
  const commands = Array.isArray(record.commands)
    ? record.commands
        .map((command) => normalizeVerificationCommand(command))
        .filter((command): command is TaskFlowVerificationCommand => Boolean(command))
    : [];
  const history = Array.isArray(record.history)
    ? record.history
        .map((entry) => normalizeVerificationHistoryEntry(entry))
        .filter((entry): entry is TaskFlowVerificationHistoryEntry => Boolean(entry))
    : undefined;
  return {
    ...(asString(record.latestTaskId) ? { latestTaskId: asString(record.latestTaskId)! } : {}),
    status,
    ...(record.failMode === "stop" || record.failMode === "record_only"
      ? { failMode: record.failMode }
      : {}),
    ...(asNumber(record.verifiedAt) !== undefined
      ? { verifiedAt: asNumber(record.verifiedAt)! }
      : {}),
    summary,
    commands,
    ...(asNumber(record.remainingRepairBudget) !== undefined
      ? { remainingRepairBudget: asNumber(record.remainingRepairBudget)! }
      : {}),
    ...(asString(record.repairTaskId) ? { repairTaskId: asString(record.repairTaskId)! } : {}),
    ...(asString(record.resumeStepAfterRepair)
      ? { resumeStepAfterRepair: asString(record.resumeStepAfterRepair)! }
      : {}),
    ...(asNumber(record.repairAttemptCount) !== undefined
      ? { repairAttemptCount: asNumber(record.repairAttemptCount)! }
      : {}),
    ...(asNumber(record.repairSuccessCount) !== undefined
      ? { repairSuccessCount: asNumber(record.repairSuccessCount)! }
      : {}),
    ...(asNumber(record.repairFailureCount) !== undefined
      ? { repairFailureCount: asNumber(record.repairFailureCount)! }
      : {}),
    ...(history && history.length > 0 ? { history } : {}),
  };
}

export function cloneTaskFlowVerificationState(
  value: TaskFlowVerificationState | undefined,
): TaskFlowVerificationState | undefined {
  return value ? structuredClone(value) : undefined;
}
