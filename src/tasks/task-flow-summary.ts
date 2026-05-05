import type { TaskFlowRecord } from "./task-flow-registry.types.js";

export type TaskFlowRepairMetrics = {
  total: number;
  active: number;
  blocked: number;
  waiting: number;
  terminal: number;
  cancelRequested: number;
  repairPriority: number;
  verificationTracked: number;
  verificationPassed: number;
  verificationFailed: number;
  repairAttempts: number;
  repairSuccesses: number;
  repairFailures: number;
  repairSuccessRate: number | null;
};

function isActiveStatus(status: TaskFlowRecord["status"]): boolean {
  return status === "queued" || status === "running";
}

function isTerminalStatus(status: TaskFlowRecord["status"]): boolean {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled" || status === "lost"
  );
}

export function summarizeTaskFlows(flows: TaskFlowRecord[]): TaskFlowRepairMetrics {
  let active = 0;
  let blocked = 0;
  let waiting = 0;
  let terminal = 0;
  let cancelRequested = 0;
  let repairPriority = 0;
  let verificationTracked = 0;
  let verificationPassed = 0;
  let verificationFailed = 0;
  let repairAttempts = 0;
  let repairSuccesses = 0;
  let repairFailures = 0;

  for (const flow of flows) {
    if (isActiveStatus(flow.status)) {
      active += 1;
    }
    if (flow.status === "blocked") {
      blocked += 1;
    }
    if (flow.status === "waiting") {
      waiting += 1;
    }
    if (isTerminalStatus(flow.status)) {
      terminal += 1;
    }
    if (flow.cancelRequestedAt != null) {
      cancelRequested += 1;
    }
    if (flow.currentStep?.trim() === "verification_repair") {
      repairPriority += 1;
    }
    if (flow.verificationState) {
      verificationTracked += 1;
      if (flow.verificationState.status === "passed") {
        verificationPassed += 1;
      } else {
        verificationFailed += 1;
      }
      repairAttempts += flow.verificationState.repairAttemptCount ?? 0;
      repairSuccesses += flow.verificationState.repairSuccessCount ?? 0;
      repairFailures += flow.verificationState.repairFailureCount ?? 0;
    }
  }

  return {
    total: flows.length,
    active,
    blocked,
    waiting,
    terminal,
    cancelRequested,
    repairPriority,
    verificationTracked,
    verificationPassed,
    verificationFailed,
    repairAttempts,
    repairSuccesses,
    repairFailures,
    repairSuccessRate: repairAttempts > 0 ? repairSuccesses / repairAttempts : null,
  };
}
