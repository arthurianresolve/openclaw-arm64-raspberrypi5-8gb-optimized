import { normalizeLowercaseStringOrEmpty } from "../../../shared/string-coerce.js";

export type RunPromptProfile = "default" | "explore" | "plan" | "verify";

const READ_ONLY_TOOLS = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "web_search",
  "web_fetch",
  "browser",
  "canvas",
  "session_status",
]);

const VERIFY_TOOLS = new Set(["exec", "process"]);
const WRITE_TOOLS = new Set(["write", "edit", "apply_patch"]);

function normalizeToolNames(toolNames: readonly string[]): Set<string> {
  return new Set(
    toolNames
      .map((tool) => normalizeLowercaseStringOrEmpty(tool))
      .filter((tool): tool is string => Boolean(tool)),
  );
}

function hasAny(source: Set<string>, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (source.has(candidate)) {
      return true;
    }
  }
  return false;
}

function isSubset(source: Set<string>, allowed: Set<string>): boolean {
  for (const value of source) {
    if (!allowed.has(value)) {
      return false;
    }
  }
  return true;
}

export function resolveRunPromptProfile(params: {
  promptMode?: "full" | "minimal" | "none";
  toolsAllow?: readonly string[];
  modelRun?: boolean;
}): RunPromptProfile {
  if (params.promptMode !== "minimal" || params.modelRun === true) {
    return "default";
  }

  const tools = normalizeToolNames(params.toolsAllow ?? []);
  if (tools.size === 0) {
    return "default";
  }
  if (hasAny(tools, WRITE_TOOLS)) {
    return "plan";
  }
  if (isSubset(tools, READ_ONLY_TOOLS)) {
    return "explore";
  }
  if (hasAny(tools, VERIFY_TOOLS)) {
    return "verify";
  }
  return "plan";
}

export function renderRunPromptProfileGuidance(profile: RunPromptProfile): string | undefined {
  switch (profile) {
    case "explore":
      return [
        "## Delegated Profile: Explore",
        "- Read first and search broadly before concluding.",
        "- Do not modify files or propose edits until the explored facts are grounded.",
        "- Report findings, unknowns, and the smallest useful next step.",
      ].join("\n");
    case "plan":
      return [
        "## Delegated Profile: Plan",
        "- Turn the request into a concise execution plan with dependencies and checkpoints.",
        "- Prefer actionable sequencing over brainstorming.",
        "- Keep the plan small enough to execute without re-deriving the task.",
      ].join("\n");
    case "verify":
      return [
        "## Delegated Profile: Verify",
        "- Verify with the smallest evidence-gathering step that can settle the question.",
        "- Prefer tests, inspection, and direct checks over speculation.",
        "- Return pass/fail plus the exact evidence observed.",
      ].join("\n");
    default:
      return undefined;
  }
}
