import { normalizeOptionalString } from "../shared/string-coerce.js";

export type UnitVerificationFailMode = "stop" | "record_only";

export type UnitVerificationPolicy = {
  commands: string[];
  retryCount?: number;
  autoRepair?: boolean;
  failMode?: UnitVerificationFailMode;
};

function normalizeCommandList(values: string[] | null | undefined): string[] {
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

export function cloneUnitVerificationPolicy(
  policy: UnitVerificationPolicy | undefined,
): UnitVerificationPolicy | undefined {
  return policy ? structuredClone(policy) : undefined;
}

export function normalizeUnitVerificationPolicy(
  policy: UnitVerificationPolicy | null | undefined,
): UnitVerificationPolicy | undefined {
  if (!policy) {
    return undefined;
  }
  const commands = normalizeCommandList(policy.commands);
  if (commands.length === 0) {
    return undefined;
  }
  const retryCount =
    typeof policy.retryCount === "number" && Number.isInteger(policy.retryCount)
      ? Math.max(0, Math.min(policy.retryCount, 5))
      : undefined;
  const autoRepair = typeof policy.autoRepair === "boolean" ? policy.autoRepair : undefined;
  const failMode = policy.failMode === "record_only" ? "record_only" : "stop";
  return {
    commands,
    ...(retryCount !== undefined ? { retryCount } : {}),
    ...(autoRepair !== undefined ? { autoRepair } : {}),
    failMode,
  };
}
