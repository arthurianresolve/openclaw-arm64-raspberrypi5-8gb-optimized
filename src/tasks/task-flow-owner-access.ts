import { normalizeOptionalString } from "../shared/string-coerce.js";
import {
  findLatestTaskFlowForOwnerKey,
  getTaskFlowById,
  listTaskFlowsForOwnerKey,
} from "./task-flow-registry.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";

function isRepairPriorityFlow(flow: TaskFlowRecord): boolean {
  return normalizeOptionalString(flow.currentStep) === "verification_repair";
}

function compareOwnerVisibleTaskFlows(left: TaskFlowRecord, right: TaskFlowRecord): number {
  const leftRepairPriority = isRepairPriorityFlow(left);
  const rightRepairPriority = isRepairPriorityFlow(right);
  if (leftRepairPriority !== rightRepairPriority) {
    return leftRepairPriority ? -1 : 1;
  }
  return right.createdAt - left.createdAt;
}

export function getTaskFlowByIdForOwner(params: {
  flowId: string;
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  const flow = getTaskFlowById(params.flowId);
  return flow &&
    normalizeOptionalString(flow.ownerKey) === normalizeOptionalString(params.callerOwnerKey)
    ? flow
    : undefined;
}

export function listTaskFlowsForOwner(params: { callerOwnerKey: string }): TaskFlowRecord[] {
  const ownerKey = normalizeOptionalString(params.callerOwnerKey);
  return ownerKey ? listTaskFlowsForOwnerKey(ownerKey).toSorted(compareOwnerVisibleTaskFlows) : [];
}

export function findLatestTaskFlowForOwner(params: {
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  const ownerKey = normalizeOptionalString(params.callerOwnerKey);
  if (!ownerKey) {
    return undefined;
  }
  const prioritized = listTaskFlowsForOwner({ callerOwnerKey: ownerKey })[0];
  return prioritized ?? findLatestTaskFlowForOwnerKey(ownerKey);
}

export function resolveTaskFlowForLookupTokenForOwner(params: {
  token: string;
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  const direct = getTaskFlowByIdForOwner({
    flowId: params.token,
    callerOwnerKey: params.callerOwnerKey,
  });
  if (direct) {
    return direct;
  }
  const normalizedToken = normalizeOptionalString(params.token);
  const normalizedCallerOwnerKey = normalizeOptionalString(params.callerOwnerKey);
  if (!normalizedToken || normalizedToken !== normalizedCallerOwnerKey) {
    return undefined;
  }
  return findLatestTaskFlowForOwner({ callerOwnerKey: normalizedCallerOwnerKey });
}
