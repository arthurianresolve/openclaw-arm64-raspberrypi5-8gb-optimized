import { normalizeOptionalString } from "../shared/string-coerce.js";

export type UnitContextMode = "shared-session" | "isolated-session" | "isolated-subagent";
export type UnitModelHint = "light" | "standard" | "heavy";
export type UnitPacketSource = "taskflow" | "lobster" | "cron" | "subagent" | "manual";

export type UnitContextPacket = {
  unitId: string;
  flowId?: string;
  objective: string;
  ownedPaths: string[];
  relevantDocs: string[];
  invariants: string[];
  validationCommands: string[];
  stopCondition?: string;
  modelHint?: UnitModelHint;
  contextMode: UnitContextMode;
  packetSource: UnitPacketSource;
};

function normalizeStringList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const next = normalizeOptionalString(value);
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

export function cloneUnitContextPacket(
  packet: UnitContextPacket | undefined,
): UnitContextPacket | undefined {
  return packet ? structuredClone(packet) : undefined;
}

export function normalizeUnitContextPacket(
  packet: UnitContextPacket | null | undefined,
  opts?: { defaultFlowId?: string | null },
): UnitContextPacket | undefined {
  if (!packet) {
    return undefined;
  }
  const unitId = normalizeOptionalString(packet.unitId);
  const objective = normalizeOptionalString(packet.objective);
  if (!unitId || !objective) {
    return undefined;
  }
  const flowId =
    normalizeOptionalString(packet.flowId) ?? normalizeOptionalString(opts?.defaultFlowId);
  const contextMode =
    packet.contextMode === "isolated-session" || packet.contextMode === "isolated-subagent"
      ? packet.contextMode
      : "shared-session";
  const packetSource =
    packet.packetSource === "taskflow" ||
    packet.packetSource === "lobster" ||
    packet.packetSource === "cron" ||
    packet.packetSource === "subagent"
      ? packet.packetSource
      : "manual";
  const modelHint =
    packet.modelHint === "light" || packet.modelHint === "standard" || packet.modelHint === "heavy"
      ? packet.modelHint
      : undefined;
  const stopCondition = normalizeOptionalString(packet.stopCondition);
  return {
    unitId,
    ...(flowId ? { flowId } : {}),
    objective,
    ownedPaths: normalizeStringList(packet.ownedPaths),
    relevantDocs: normalizeStringList(packet.relevantDocs),
    invariants: normalizeStringList(packet.invariants),
    validationCommands: normalizeStringList(packet.validationCommands),
    ...(stopCondition ? { stopCondition } : {}),
    ...(modelHint ? { modelHint } : {}),
    contextMode,
    packetSource,
  };
}
