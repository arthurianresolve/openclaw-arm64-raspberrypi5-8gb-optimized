import path from "node:path";
import type { OpenClawPluginConfigSchema } from "../api.js";

export type OdylithGroundingConfig = {
  repoRoot: string;
  governanceRoot: string;
  historyWindowMessages: number;
  maxCandidateComponents: number;
  dossierCharBudget: number;
};

const DEFAULT_HISTORY_WINDOW_MESSAGES = 12;
const DEFAULT_MAX_CANDIDATE_COMPONENTS = 2;
const DEFAULT_DOSSIER_CHAR_BUDGET = 1400;

export const odylithGroundingConfigSchema = {
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      repoRoot: { type: "string" },
      governanceRoot: { type: "string" },
      historyWindowMessages: {
        type: "integer",
        minimum: 1,
        maximum: 40,
        default: DEFAULT_HISTORY_WINDOW_MESSAGES,
      },
      maxCandidateComponents: {
        type: "integer",
        minimum: 1,
        maximum: 6,
        default: DEFAULT_MAX_CANDIDATE_COMPONENTS,
      },
      dossierCharBudget: {
        type: "integer",
        minimum: 400,
        maximum: 4000,
        default: DEFAULT_DOSSIER_CHAR_BUDGET,
      },
    },
  },
} satisfies OpenClawPluginConfigSchema;

export function normalizeOdylithGroundingConfig(
  pluginConfig: unknown,
  options?: { cwd?: string },
): OdylithGroundingConfig {
  const cwd = options?.cwd ?? process.cwd();
  const record = isRecord(pluginConfig) ? pluginConfig : {};
  const repoRoot = resolveRoot(cwd, record.repoRoot, cwd);
  return {
    repoRoot,
    governanceRoot: resolveRoot(
      repoRoot,
      record.governanceRoot,
      path.join(repoRoot, "governance/odylith-grounding"),
    ),
    historyWindowMessages: normalizeInteger(
      record.historyWindowMessages,
      DEFAULT_HISTORY_WINDOW_MESSAGES,
      1,
      40,
    ),
    maxCandidateComponents: normalizeInteger(
      record.maxCandidateComponents,
      DEFAULT_MAX_CANDIDATE_COMPONENTS,
      1,
      6,
    ),
    dossierCharBudget: normalizeInteger(
      record.dossierCharBudget,
      DEFAULT_DOSSIER_CHAR_BUDGET,
      400,
      4000,
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveRoot(baseDir: string, configured: unknown, fallback: string): string {
  if (typeof configured !== "string" || configured.trim().length === 0) {
    return path.resolve(fallback);
  }
  return path.resolve(baseDir, configured.trim());
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  if (normalized < min || normalized > max) {
    return fallback;
  }
  return normalized;
}
