import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  DetachedRunningTaskCreateParams,
  DetachedTaskCreateParams,
  DetachedTaskFinalizeParams,
} from "./detached-task-runtime-contract.js";
import { getRegisteredDetachedTaskLifecycleRuntime } from "./detached-task-runtime-state.js";
import {
  cancelTaskById,
  createTaskRecord,
  findLatestTaskForFlowId,
  getTaskById,
  isParentFlowLinkError,
  linkTaskToFlowById,
  listTasksForFlowId,
  markTaskLostById,
  markTaskRunningByRunId,
  finalizeTaskRunByRunId as finalizeTaskRunByRunIdInRegistry,
  recordTaskProgressByRunId,
  setTaskRunDeliveryStatusByRunId,
} from "./runtime-internal.js";
import { getTaskFlowByIdForOwner } from "./task-flow-owner-access.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";
import {
  createTaskFlowForTask,
  deleteTaskFlowRecordById,
  getTaskFlowById,
  requestFlowCancel,
  updateFlowRecordByIdExpectedRevision,
} from "./task-flow-runtime-internal.js";
import type { TaskFlowVerificationState } from "./task-flow-verification-state.js";
import { summarizeTaskRecords } from "./task-registry.summary.js";
import type {
  TaskDeliveryState,
  TaskDeliveryStatus,
  TaskNotifyPolicy,
  TaskRecord,
  TaskRegistrySummary,
  TaskRuntime,
  TaskStatus,
  TaskTerminalOutcome,
} from "./task-registry.types.js";
import {
  runUnitVerificationForTask,
  type UnitVerificationResult,
} from "./task-verification-runtime.js";
import type { UnitContextPacket } from "./unit-context-packet.js";
import type { UnitVerificationPolicy } from "./unit-verification-policy.js";

const log = createSubsystemLogger("tasks/executor");
const VERIFICATION_REPAIR_LABEL_PREFIX = "Verification repair:";

function isOneTaskFlowEligible(task: TaskRecord): boolean {
  if (task.parentFlowId?.trim() || task.scopeKind !== "session") {
    return false;
  }
  if (task.deliveryStatus === "not_applicable") {
    return false;
  }
  return task.runtime === "acp" || task.runtime === "subagent";
}

function ensureSingleTaskFlow(params: {
  task: TaskRecord;
  requesterOrigin?: TaskDeliveryState["requesterOrigin"];
}): TaskRecord {
  if (!isOneTaskFlowEligible(params.task)) {
    return params.task;
  }
  try {
    const flow = createTaskFlowForTask({
      task: params.task,
      requesterOrigin: params.requesterOrigin,
    });
    const linked = linkTaskToFlowById({
      taskId: params.task.taskId,
      flowId: flow.flowId,
    });
    if (!linked) {
      deleteTaskFlowRecordById(flow.flowId);
      return params.task;
    }
    if (linked.parentFlowId !== flow.flowId) {
      deleteTaskFlowRecordById(flow.flowId);
      return linked;
    }
    return linked;
  } catch (error) {
    log.warn("Failed to create one-task flow for detached run", {
      taskId: params.task.taskId,
      runId: params.task.runId,
      error,
    });
    return params.task;
  }
}

type TaskRunCreateParams = DetachedTaskCreateParams;
type RunningTaskRunCreateParams = DetachedRunningTaskCreateParams;

export function createQueuedTaskRun(params: TaskRunCreateParams): TaskRecord {
  const task = createTaskRecord({
    ...params,
    status: "queued",
  });
  return ensureSingleTaskFlow({
    task,
    requesterOrigin: params.requesterOrigin,
  });
}

export function getFlowTaskSummary(flowId: string): TaskRegistrySummary {
  return summarizeTaskRecords(listTasksForFlowId(flowId));
}

export function createRunningTaskRun(params: RunningTaskRunCreateParams): TaskRecord {
  const task = createTaskRecord({
    ...params,
    status: "running",
  });
  return ensureSingleTaskFlow({
    task,
    requesterOrigin: params.requesterOrigin,
  });
}

type RunTaskInFlowParams = {
  flowId: string;
  runtime: TaskRuntime;
  sourceId?: string;
  childSessionKey?: string;
  parentTaskId?: string;
  agentId?: string;
  runId?: string;
  label?: string;
  task: string;
  unitContextPacket?: UnitContextPacket;
  unitVerificationPolicy?: UnitVerificationPolicy;
  notifyPolicy?: TaskNotifyPolicy;
  deliveryStatus?: TaskDeliveryStatus;
  preferMetadata?: boolean;
  status?: "queued" | "running";
  startedAt?: number;
  lastEventAt?: number;
  progressSummary?: string | null;
  allowDuringRepair?: boolean;
};

export function startTaskRunByRunId(params: {
  runId: string;
  runtime?: TaskRuntime;
  sessionKey?: string;
  startedAt?: number;
  lastEventAt?: number;
  progressSummary?: string | null;
  eventSummary?: string | null;
}) {
  return markTaskRunningByRunId(params);
}

export function recordTaskRunProgressByRunId(params: {
  runId: string;
  runtime?: TaskRuntime;
  sessionKey?: string;
  lastEventAt?: number;
  progressSummary?: string | null;
  eventSummary?: string | null;
}) {
  return recordTaskProgressByRunId(params);
}

export function completeTaskRunByRunId(params: {
  runId: string;
  runtime?: TaskRuntime;
  sessionKey?: string;
  endedAt: number;
  lastEventAt?: number;
  progressSummary?: string | null;
  terminalSummary?: string | null;
  terminalOutcome?: TaskTerminalOutcome | null;
}) {
  return finalizeTaskRunByRunId({
    ...params,
    status: "succeeded",
  });
}

function mergeVerificationState(params: {
  previousVerificationState: TaskFlowVerificationState | undefined;
  result: UnitVerificationResult;
  remainingRepairBudget?: number;
  repairTaskId?: string;
  resumeStepAfterRepair?: string;
  repairAttemptIncrement?: number;
  repairSuccessIncrement?: number;
  repairFailureIncrement?: number;
}): TaskFlowVerificationState {
  const history = params.previousVerificationState?.history
    ? [...params.previousVerificationState.history]
    : [];
  const historyEntry = {
    taskId: params.result.taskId,
    status: params.result.passed ? "passed" : "failed",
    failMode: params.result.failMode,
    verifiedAt: params.result.verifiedAt,
    summary: params.result.summary,
    commands: params.result.commands.map((command) => ({
      command: command.command,
      passed: command.passed,
      exitCode: command.exitCode,
      signal: command.signal,
      durationMs: command.durationMs,
      ...(command.stdout ? { stdout: command.stdout } : {}),
      ...(command.stderr ? { stderr: command.stderr } : {}),
      ...(command.error ? { error: command.error } : {}),
    })),
  } satisfies NonNullable<TaskFlowVerificationState["history"]>[number];
  history.push(historyEntry);

  return {
    latestTaskId: params.result.taskId,
    status: params.result.passed ? "passed" : "failed",
    failMode: params.result.failMode,
    verifiedAt: params.result.verifiedAt,
    summary: params.result.summary,
    commands: params.result.commands.map((command) => ({
      command: command.command,
      passed: command.passed,
      exitCode: command.exitCode,
      signal: command.signal,
      durationMs: command.durationMs,
      ...(command.stdout ? { stdout: command.stdout } : {}),
      ...(command.stderr ? { stderr: command.stderr } : {}),
      ...(command.error ? { error: command.error } : {}),
    })),
    history,
    ...(params.remainingRepairBudget !== undefined
      ? { remainingRepairBudget: params.remainingRepairBudget }
      : {}),
    ...(params.repairTaskId ? { repairTaskId: params.repairTaskId } : {}),
    ...(!params.repairTaskId && params.previousVerificationState?.repairTaskId
      ? { repairTaskId: params.previousVerificationState.repairTaskId }
      : {}),
    ...(params.resumeStepAfterRepair
      ? { resumeStepAfterRepair: params.resumeStepAfterRepair }
      : params.previousVerificationState?.resumeStepAfterRepair
        ? { resumeStepAfterRepair: params.previousVerificationState.resumeStepAfterRepair }
        : {}),
    repairAttemptCount:
      (params.previousVerificationState?.repairAttemptCount ?? 0) +
      (params.repairAttemptIncrement ?? 0),
    repairSuccessCount:
      (params.previousVerificationState?.repairSuccessCount ?? 0) +
      (params.repairSuccessIncrement ?? 0),
    repairFailureCount:
      (params.previousVerificationState?.repairFailureCount ?? 0) +
      (params.repairFailureIncrement ?? 0),
  } satisfies TaskFlowVerificationState;
}

function buildVerificationRepairTaskPrompt(params: {
  task: TaskRecord;
  result: UnitVerificationResult;
  remainingRepairBudget: number;
}): string {
  const label = params.task.label?.trim() || params.task.task.trim() || "unit";
  const lines = [
    `Repair the failing verification for ${label}.`,
    `Latest verification summary: ${params.result.summary}`,
    "Focus only on the files and invariants already assigned to this unit.",
    "After fixing the issue, rerun the verification commands listed below.",
    "",
    "Failing verification commands:",
    ...params.result.commands
      .filter((command) => !command.passed)
      .map((command) => `- ${command.command}`),
    `Remaining automatic repair budget after this retry: ${params.remainingRepairBudget}.`,
  ];
  return lines.join("\n");
}

function enqueueVerificationRepairTask(params: {
  flow: TaskFlowRecord;
  task: TaskRecord;
  result: UnitVerificationResult;
  remainingRepairBudget: number;
}): TaskRecord | null {
  const retried = runTaskInFlow({
    flowId: params.flow.flowId,
    runtime: params.task.runtime,
    sourceId: params.task.sourceId,
    parentTaskId: params.task.taskId,
    agentId: params.task.agentId,
    runId:
      params.task.runId != null
        ? `${params.task.runId}:verification-repair:${params.remainingRepairBudget}`
        : `verification-repair:${params.task.taskId}:${params.remainingRepairBudget}`,
    label: `${VERIFICATION_REPAIR_LABEL_PREFIX} ${params.task.label?.trim() || params.task.task.trim() || "unit"}`,
    task: buildVerificationRepairTaskPrompt({
      task: params.task,
      result: params.result,
      remainingRepairBudget: params.remainingRepairBudget,
    }),
    unitContextPacket: params.task.unitContextPacket ?? params.flow.unitContextPacket,
    unitVerificationPolicy: {
      commands: [...(params.task.unitVerificationPolicy?.commands ?? [])],
      retryCount: params.remainingRepairBudget,
      autoRepair: params.remainingRepairBudget > 0,
      failMode: params.task.unitVerificationPolicy?.failMode ?? "stop",
    },
    preferMetadata: true,
    notifyPolicy: params.task.notifyPolicy,
    deliveryStatus: "pending",
    status: "queued",
    allowDuringRepair: true,
  });
  return retried.created ? (retried.task ?? null) : null;
}

function applyVerificationResultToFlow(task: TaskRecord, result: UnitVerificationResult): void {
  const flowId = task.parentFlowId?.trim();
  if (!flowId) {
    return;
  }
  const currentPolicy = task.unitVerificationPolicy;
  const remainingRepairBudget = Math.max(0, currentPolicy?.retryCount ?? 0);
  const isRepairTask = isVerificationRepairTask(task);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const flow = getTaskFlowById(flowId);
    if (!flow) {
      return;
    }
    const shouldAutoRepair =
      !result.passed &&
      flow.syncMode === "managed" &&
      currentPolicy?.autoRepair === true &&
      remainingRepairBudget > 0;
    const resumeStepAfterRepair =
      flow.verificationState?.resumeStepAfterRepair ??
      (isVerificationRepairStep(flow.currentStep) ? undefined : flow.currentStep);
    const updated = updateFlowRecordByIdExpectedRevision({
      flowId: flow.flowId,
      expectedRevision: flow.revision,
      patch: {
        verificationState: mergeVerificationState({
          previousVerificationState: flow.verificationState,
          result,
          remainingRepairBudget: shouldAutoRepair
            ? remainingRepairBudget - 1
            : remainingRepairBudget,
          ...(shouldAutoRepair && resumeStepAfterRepair ? { resumeStepAfterRepair } : {}),
          ...(shouldAutoRepair ? { repairAttemptIncrement: 1 } : {}),
          ...(isRepairTask && result.passed ? { repairSuccessIncrement: 1 } : {}),
          ...(isRepairTask && !result.passed ? { repairFailureIncrement: 1 } : {}),
        }),
        updatedAt: task.endedAt ?? task.lastEventAt ?? Date.now(),
        ...(shouldAutoRepair
          ? {
              status: "running" as const,
              currentStep: "verification_repair",
              blockedTaskId: null,
              blockedSummary: null,
              waitJson: null,
              endedAt: null,
            }
          : !result.passed && result.failMode === "stop"
            ? {
                status: "blocked" as const,
                blockedTaskId: task.taskId,
                blockedSummary: result.summary,
                waitJson: null,
              }
            : result.passed
              ? {
                  ...(isVerificationRepairStep(flow.currentStep)
                    ? {
                        currentStep: resumeStepAfterRepair ?? null,
                      }
                    : {}),
                  blockedTaskId: null,
                  blockedSummary: null,
                }
              : {}),
      },
    });
    if (!updated.applied) {
      if (updated.reason === "not_found") {
        return;
      }
      continue;
    }
    if (shouldAutoRepair) {
      const repairTask = enqueueVerificationRepairTask({
        flow: updated.flow,
        task,
        result,
        remainingRepairBudget: remainingRepairBudget - 1,
      });
      if (repairTask) {
        const nextVerificationState = updated.flow.verificationState
          ? {
              ...updated.flow.verificationState,
              repairTaskId: repairTask.taskId,
            }
          : undefined;
        void updateFlowRecordByIdExpectedRevision({
          flowId: updated.flow.flowId,
          expectedRevision: updated.flow.revision,
          patch: {
            verificationState: nextVerificationState,
            updatedAt: repairTask.createdAt,
          },
        });
      }
      return;
    }
    return;
  }
}

function maybeRunUnitVerification(tasks: TaskRecord[]): void {
  for (const task of tasks) {
    if (task.status !== "succeeded" || task.terminalOutcome === "blocked") {
      continue;
    }
    const result = runUnitVerificationForTask(task);
    if (!result) {
      continue;
    }
    applyVerificationResultToFlow(task, result);
  }
}

export function finalizeTaskRunByRunId(params: DetachedTaskFinalizeParams) {
  const updated = finalizeTaskRunByRunIdInRegistry(params);
  maybeRunUnitVerification(updated);
  return updated;
}

export function failTaskRunByRunId(params: {
  runId: string;
  runtime?: TaskRuntime;
  sessionKey?: string;
  status?: Extract<TaskStatus, "failed" | "timed_out" | "cancelled">;
  endedAt: number;
  lastEventAt?: number;
  error?: string;
  progressSummary?: string | null;
  terminalSummary?: string | null;
}) {
  return finalizeTaskRunByRunId({
    ...params,
    status: params.status ?? "failed",
  });
}

export function markTaskRunLostById(params: {
  taskId: string;
  endedAt: number;
  lastEventAt?: number;
  error?: string;
  cleanupAfter?: number;
}) {
  return markTaskLostById(params);
}

export function setDetachedTaskDeliveryStatusByRunId(params: {
  runId: string;
  runtime?: TaskRuntime;
  sessionKey?: string;
  deliveryStatus: TaskDeliveryStatus;
  error?: string;
}) {
  return setTaskRunDeliveryStatusByRunId(params);
}

type RetryBlockedFlowResult = {
  found: boolean;
  retried: boolean;
  reason?: string;
  previousTask?: TaskRecord;
  task?: TaskRecord;
};

type RetryBlockedFlowParams = {
  flowId: string;
  sourceId?: string;
  requesterOrigin?: TaskDeliveryState["requesterOrigin"];
  childSessionKey?: string;
  agentId?: string;
  runId?: string;
  label?: string;
  task?: string;
  preferMetadata?: boolean;
  notifyPolicy?: TaskNotifyPolicy;
  deliveryStatus?: TaskDeliveryStatus;
  status: "queued" | "running";
  startedAt?: number;
  lastEventAt?: number;
  progressSummary?: string | null;
};

function resolveRetryableBlockedFlowTask(flowId: string): {
  flowFound: boolean;
  retryable: boolean;
  latestTask?: TaskRecord;
  reason?: string;
} {
  const flow = getTaskFlowById(flowId);
  if (!flow) {
    return {
      flowFound: false,
      retryable: false,
      reason: "Flow not found.",
    };
  }
  const latestTask = findLatestTaskForFlowId(flowId);
  if (!latestTask) {
    return {
      flowFound: true,
      retryable: false,
      reason: "Flow has no retryable task.",
    };
  }
  if (flow.status !== "blocked") {
    return {
      flowFound: true,
      retryable: false,
      latestTask,
      reason: "Flow is not blocked.",
    };
  }
  if (latestTask.status !== "succeeded" || latestTask.terminalOutcome !== "blocked") {
    return {
      flowFound: true,
      retryable: false,
      latestTask,
      reason: "Latest TaskFlow task is not blocked.",
    };
  }
  return {
    flowFound: true,
    retryable: true,
    latestTask,
  };
}

function retryBlockedFlowTask(params: RetryBlockedFlowParams): RetryBlockedFlowResult {
  const resolved = resolveRetryableBlockedFlowTask(params.flowId);
  if (!resolved.retryable || !resolved.latestTask) {
    return {
      found: resolved.flowFound,
      retried: false,
      reason: resolved.reason,
    };
  }
  const flow = getTaskFlowById(params.flowId);
  if (!flow) {
    return {
      found: false,
      retried: false,
      reason: "Flow not found.",
      previousTask: resolved.latestTask,
    };
  }
  const task = createTaskRecord({
    runtime: resolved.latestTask.runtime,
    sourceId: params.sourceId ?? resolved.latestTask.sourceId,
    ownerKey: flow.ownerKey,
    scopeKind: "session",
    requesterOrigin: params.requesterOrigin ?? flow.requesterOrigin,
    parentFlowId: flow.flowId,
    childSessionKey: params.childSessionKey,
    parentTaskId: resolved.latestTask.taskId,
    agentId: params.agentId ?? resolved.latestTask.agentId,
    runId: params.runId,
    label: params.label ?? resolved.latestTask.label,
    task: params.task ?? resolved.latestTask.task,
    preferMetadata: params.preferMetadata,
    notifyPolicy: params.notifyPolicy ?? resolved.latestTask.notifyPolicy,
    deliveryStatus: params.deliveryStatus ?? "pending",
    status: params.status,
    startedAt: params.startedAt,
    lastEventAt: params.lastEventAt,
    progressSummary: params.progressSummary,
  });
  return {
    found: true,
    retried: true,
    previousTask: resolved.latestTask,
    task,
  };
}

export function retryBlockedFlowAsQueuedTaskRun(
  params: Omit<RetryBlockedFlowParams, "status" | "startedAt" | "lastEventAt" | "progressSummary">,
): RetryBlockedFlowResult {
  return retryBlockedFlowTask({
    ...params,
    status: "queued",
  });
}

export function retryBlockedFlowAsRunningTaskRun(
  params: Omit<RetryBlockedFlowParams, "status">,
): RetryBlockedFlowResult {
  return retryBlockedFlowTask({
    ...params,
    status: "running",
  });
}

type CancelFlowResult = {
  found: boolean;
  cancelled: boolean;
  reason?: string;
  flow?: TaskFlowRecord;
  tasks?: TaskRecord[];
};

type RunTaskInFlowResult = {
  found: boolean;
  created: boolean;
  reason?: string;
  flow?: TaskFlowRecord;
  task?: TaskRecord;
};

function isActiveTaskStatus(status: TaskStatus): boolean {
  return status === "queued" || status === "running";
}

function isVerificationRepairStep(step: string | undefined): boolean {
  return step?.trim() === "verification_repair";
}

function isVerificationRepairTask(task: Pick<TaskRecord, "label" | "task">): boolean {
  const label = task.label?.trim();
  if (label?.startsWith(VERIFICATION_REPAIR_LABEL_PREFIX)) {
    return true;
  }
  return task.task.trim().startsWith("Repair the unit so the verification commands pass.");
}

function hasActiveVerificationRepairTask(flowId: string): boolean {
  return listTasksForFlowId(flowId).some(
    (task) => isActiveTaskStatus(task.status) && isVerificationRepairTask(task),
  );
}

function isTerminalFlowStatus(status: TaskFlowRecord["status"]): boolean {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled" || status === "lost"
  );
}

function markFlowCancelRequested(flow: TaskFlowRecord): TaskFlowRecord | FlowUpdateFailure {
  if (flow.cancelRequestedAt != null) {
    return flow;
  }
  const result = requestFlowCancel({
    flowId: flow.flowId,
    expectedRevision: flow.revision,
  });
  if (result.applied) {
    return result.flow;
  }
  return {
    reason:
      result.reason === "revision_conflict"
        ? "Flow changed while cancellation was in progress."
        : "Flow not found.",
    flow: result.current ?? getTaskFlowById(flow.flowId),
  };
}

type FlowUpdateFailure = {
  reason: string;
  flow?: TaskFlowRecord;
};

function cancelManagedFlowAfterChildrenSettle(
  flow: TaskFlowRecord,
  endedAt: number,
): TaskFlowRecord | FlowUpdateFailure {
  const result = updateFlowRecordByIdExpectedRevision({
    flowId: flow.flowId,
    expectedRevision: flow.revision,
    patch: {
      status: "cancelled",
      blockedTaskId: null,
      blockedSummary: null,
      waitJson: null,
      endedAt,
      updatedAt: endedAt,
    },
  });
  if (result.applied) {
    return result.flow;
  }
  return {
    reason:
      result.reason === "revision_conflict"
        ? "Flow changed while cancellation was in progress."
        : "Flow not found.",
    flow: result.current ?? getTaskFlowById(flow.flowId),
  };
}

function mapRunTaskInFlowCreateError(params: {
  error: unknown;
  flowId: string;
}): RunTaskInFlowResult {
  const flow = getTaskFlowById(params.flowId);
  if (isParentFlowLinkError(params.error)) {
    if (params.error.code === "cancel_requested") {
      return {
        found: true,
        created: false,
        reason: "Flow cancellation has already been requested.",
        ...(flow ? { flow } : {}),
      };
    }
    if (params.error.code === "terminal") {
      const terminalStatus = flow?.status ?? params.error.details?.status ?? "terminal";
      return {
        found: true,
        created: false,
        reason: `Flow is already ${terminalStatus}.`,
        ...(flow ? { flow } : {}),
      };
    }
    if (params.error.code === "parent_flow_not_found") {
      return {
        found: false,
        created: false,
        reason: "Flow not found.",
      };
    }
  }
  throw params.error;
}

function buildVerificationInstructions(policy: UnitVerificationPolicy | undefined): string {
  if (!policy || policy.commands.length === 0) {
    return "";
  }
  const retryCount = policy.retryCount ?? 0;
  const failMode = policy.failMode ?? "stop";
  return [
    "",
    "[Unit Verification]",
    "Before marking this unit complete, run these verification commands:",
    ...policy.commands.map((command) => `- ${command}`),
    `If verification fails, ${policy.autoRepair ? "make a bounded repair attempt and rerun the failing commands" : "do not make unbounded follow-up edits; stop and report the failing commands"}.`,
    `Retry budget: ${retryCount} ${retryCount === 1 ? "repair attempt" : "repair attempts"}.`,
    `Failure mode: ${failMode === "record_only" ? "record verification failures in the final result if the task cannot be repaired within budget" : "stop the unit and report the failing verification state if it cannot be repaired within budget"}.`,
  ].join("\n");
}

export function runTaskInFlow(params: RunTaskInFlowParams): RunTaskInFlowResult {
  const flow = getTaskFlowById(params.flowId);
  if (!flow) {
    return {
      found: false,
      created: false,
      reason: "Flow not found.",
    };
  }
  if (flow.syncMode !== "managed") {
    return {
      found: true,
      created: false,
      reason: "Flow does not accept managed child tasks.",
      flow,
    };
  }
  if (flow.cancelRequestedAt != null) {
    return {
      found: true,
      created: false,
      reason: "Flow cancellation has already been requested.",
      flow,
    };
  }
  if (isTerminalFlowStatus(flow.status)) {
    return {
      found: true,
      created: false,
      reason: `Flow is already ${flow.status}.`,
      flow,
    };
  }
  if (isVerificationRepairStep(flow.currentStep) && params.allowDuringRepair !== true) {
    return {
      found: true,
      created: false,
      reason:
        "Flow is in verification repair mode; generic child work is suppressed until repair completes.",
      flow,
    };
  }
  if (params.allowDuringRepair === true && hasActiveVerificationRepairTask(flow.flowId)) {
    return {
      found: true,
      created: false,
      reason: "Flow already has an active verification repair task.",
      flow,
    };
  }

  const unitVerificationPolicy = params.unitVerificationPolicy ?? flow.unitVerificationPolicy;
  const common = {
    runtime: params.runtime,
    sourceId: params.sourceId,
    ownerKey: flow.ownerKey,
    scopeKind: "session" as const,
    requesterOrigin: flow.requesterOrigin,
    parentFlowId: flow.flowId,
    childSessionKey: params.childSessionKey,
    parentTaskId: params.parentTaskId,
    agentId: params.agentId,
    runId: params.runId,
    label: params.label,
    task: [params.task, buildVerificationInstructions(unitVerificationPolicy)]
      .filter(Boolean)
      .join("\n"),
    unitContextPacket: params.unitContextPacket ?? flow.unitContextPacket,
    unitVerificationPolicy,
    preferMetadata: params.preferMetadata,
    notifyPolicy: params.notifyPolicy,
    deliveryStatus: params.deliveryStatus ?? "pending",
  };
  let task: TaskRecord;
  try {
    task =
      params.status === "running"
        ? createRunningTaskRun({
            ...common,
            startedAt: params.startedAt,
            lastEventAt: params.lastEventAt,
            progressSummary: params.progressSummary,
          })
        : createQueuedTaskRun(common);
  } catch (error) {
    return mapRunTaskInFlowCreateError({
      error,
      flowId: flow.flowId,
    });
  }

  return {
    found: true,
    created: true,
    flow: getTaskFlowById(flow.flowId) ?? flow,
    task,
  };
}

export function runTaskInFlowForOwner(
  params: RunTaskInFlowParams & { callerOwnerKey: string },
): RunTaskInFlowResult {
  const flow = getTaskFlowByIdForOwner({
    flowId: params.flowId,
    callerOwnerKey: params.callerOwnerKey,
  });
  if (!flow) {
    return {
      found: false,
      created: false,
      reason: "Flow not found.",
    };
  }
  return runTaskInFlow({
    flowId: flow.flowId,
    runtime: params.runtime,
    sourceId: params.sourceId,
    childSessionKey: params.childSessionKey,
    parentTaskId: params.parentTaskId,
    agentId: params.agentId,
    runId: params.runId,
    label: params.label,
    task: params.task,
    unitContextPacket: params.unitContextPacket,
    unitVerificationPolicy: params.unitVerificationPolicy,
    preferMetadata: params.preferMetadata,
    notifyPolicy: params.notifyPolicy,
    deliveryStatus: params.deliveryStatus,
    status: params.status,
    startedAt: params.startedAt,
    lastEventAt: params.lastEventAt,
    progressSummary: params.progressSummary,
  });
}

export async function cancelFlowById(params: {
  cfg: OpenClawConfig;
  flowId: string;
}): Promise<CancelFlowResult> {
  const flow = getTaskFlowById(params.flowId);
  if (!flow) {
    return {
      found: false,
      cancelled: false,
      reason: "Flow not found.",
    };
  }
  if (isTerminalFlowStatus(flow.status)) {
    return {
      found: true,
      cancelled: false,
      reason: `Flow is already ${flow.status}.`,
      flow,
      tasks: listTasksForFlowId(flow.flowId),
    };
  }
  const cancelRequestedFlow = markFlowCancelRequested(flow);
  if ("reason" in cancelRequestedFlow) {
    return {
      found: true,
      cancelled: false,
      reason: cancelRequestedFlow.reason,
      flow: cancelRequestedFlow.flow,
      tasks: listTasksForFlowId(flow.flowId),
    };
  }
  const linkedTasks = listTasksForFlowId(flow.flowId);
  const activeTasks = linkedTasks.filter((task) => isActiveTaskStatus(task.status));
  for (const task of activeTasks) {
    await cancelDetachedTaskRunById({
      cfg: params.cfg,
      taskId: task.taskId,
    });
  }
  const refreshedTasks = listTasksForFlowId(flow.flowId);
  const remainingActive = refreshedTasks.filter((task) => isActiveTaskStatus(task.status));
  if (remainingActive.length > 0) {
    return {
      found: true,
      cancelled: false,
      reason: "One or more child tasks are still active.",
      flow: getTaskFlowById(flow.flowId) ?? cancelRequestedFlow,
      tasks: refreshedTasks,
    };
  }
  const now = Date.now();
  const refreshedFlow = getTaskFlowById(flow.flowId) ?? cancelRequestedFlow;
  if (isTerminalFlowStatus(refreshedFlow.status)) {
    return {
      found: true,
      cancelled: refreshedFlow.status === "cancelled",
      reason:
        refreshedFlow.status === "cancelled"
          ? undefined
          : `Flow is already ${refreshedFlow.status}.`,
      flow: refreshedFlow,
      tasks: refreshedTasks,
    };
  }
  const updatedFlow = cancelManagedFlowAfterChildrenSettle(refreshedFlow, now);
  if ("reason" in updatedFlow) {
    return {
      found: true,
      cancelled: false,
      reason: updatedFlow.reason,
      flow: updatedFlow.flow,
      tasks: refreshedTasks,
    };
  }
  return {
    found: true,
    cancelled: true,
    flow: updatedFlow,
    tasks: refreshedTasks,
  };
}

export async function cancelFlowByIdForOwner(params: {
  cfg: OpenClawConfig;
  flowId: string;
  callerOwnerKey: string;
}): Promise<CancelFlowResult> {
  const flow = getTaskFlowByIdForOwner({
    flowId: params.flowId,
    callerOwnerKey: params.callerOwnerKey,
  });
  if (!flow) {
    return {
      found: false,
      cancelled: false,
      reason: "Flow not found.",
    };
  }
  return cancelFlowById({
    cfg: params.cfg,
    flowId: flow.flowId,
  });
}

export async function cancelDetachedTaskRunById(params: { cfg: OpenClawConfig; taskId: string }) {
  const task = getTaskById(params.taskId);
  if (!task) {
    return cancelTaskById(params);
  }
  const registeredRuntime = getRegisteredDetachedTaskLifecycleRuntime();
  if (registeredRuntime) {
    const cancelled = await registeredRuntime.cancelDetachedTaskRunById(params);
    if (cancelled.found) {
      return cancelled;
    }
  }
  return cancelTaskById(params);
}
