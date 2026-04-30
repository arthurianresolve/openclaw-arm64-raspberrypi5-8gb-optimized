import type { DeliveryContext } from "../utils/delivery-context.types.js";
import type { TaskFlowVerificationState } from "./task-flow-verification-state.js";
import type { TaskNotifyPolicy } from "./task-registry.types.js";
import type { UnitContextPacket } from "./unit-context-packet.js";
import type { UnitVerificationPolicy } from "./unit-verification-policy.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TaskFlowSyncMode = "task_mirrored" | "managed";

export type TaskFlowStatus =
  | "queued"
  | "running"
  | "waiting"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "lost";

export type TaskFlowRecord = {
  flowId: string;
  syncMode: TaskFlowSyncMode;
  ownerKey: string;
  requesterOrigin?: DeliveryContext;
  controllerId?: string;
  revision: number;
  status: TaskFlowStatus;
  notifyPolicy: TaskNotifyPolicy;
  goal: string;
  currentStep?: string;
  blockedTaskId?: string;
  blockedSummary?: string;
  unitContextPacket?: UnitContextPacket;
  unitVerificationPolicy?: UnitVerificationPolicy;
  verificationState?: TaskFlowVerificationState;
  stateJson?: JsonValue;
  waitJson?: JsonValue;
  cancelRequestedAt?: number;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
};
