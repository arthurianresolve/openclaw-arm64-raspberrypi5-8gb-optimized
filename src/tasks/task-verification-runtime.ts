import { spawnSync } from "node:child_process";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import type { TaskRecord } from "./task-registry.types.js";

export type UnitVerificationCommandResult = {
  command: string;
  passed: boolean;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export type UnitVerificationResult = {
  taskId: string;
  flowId?: string;
  passed: boolean;
  verifiedAt: number;
  failMode: "stop" | "record_only";
  summary: string;
  commands: UnitVerificationCommandResult[];
};

type TaskVerificationRuntime = {
  runCommand: (params: { command: string; cwd: string; timeoutMs: number }) => {
    passed: boolean;
    exitCode: number | null;
    signal: string | null;
    stdout?: string;
    stderr?: string;
    error?: string;
  };
};

const TASK_VERIFICATION_RUNTIME_OVERRIDE_KEY = Symbol.for(
  "openclaw.taskVerification.runtimeOverride",
);

type TaskVerificationGlobal = typeof globalThis & {
  [TASK_VERIFICATION_RUNTIME_OVERRIDE_KEY]?: TaskVerificationRuntime | null;
};

const DEFAULT_VERIFICATION_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_OUTPUT_PREVIEW_CHARS = 400;

function truncate(value: string | undefined, maxChars = DEFAULT_OUTPUT_PREVIEW_CHARS) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1)}…`;
}

function getTaskVerificationRuntime(): TaskVerificationRuntime {
  const runtime = (globalThis as TaskVerificationGlobal)[TASK_VERIFICATION_RUNTIME_OVERRIDE_KEY];
  if (runtime) {
    return runtime;
  }
  return {
    runCommand: ({ command, cwd, timeoutMs }) => {
      const result = spawnSync(command, {
        cwd,
        encoding: "utf8",
        shell: true,
        timeout: timeoutMs,
      });
      return {
        passed: result.status === 0 && !result.error,
        exitCode: result.status,
        signal: result.signal,
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
        ...(result.error ? { error: String(result.error.message || result.error) } : {}),
      };
    },
  };
}

function resolveVerificationCwd(): string {
  return normalizeOptionalString(process.env.OPENCLAW_TASK_VERIFICATION_CWD) ?? process.cwd();
}

function resolveVerificationTimeoutMs(): number {
  const raw = Number.parseInt(process.env.OPENCLAW_TASK_VERIFICATION_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_VERIFICATION_TIMEOUT_MS;
}

function buildVerificationSummary(results: UnitVerificationCommandResult[]): string {
  const failed = results.find((result) => !result.passed);
  if (!failed) {
    return `Verification passed (${results.length} command${results.length === 1 ? "" : "s"}).`;
  }
  const exitDetail =
    failed.exitCode != null
      ? `exit ${failed.exitCode}`
      : failed.signal
        ? `signal ${failed.signal}`
        : "unknown failure";
  return `Verification failed: ${failed.command} (${exitDetail}).`;
}

export function runUnitVerificationForTask(task: TaskRecord): UnitVerificationResult | null {
  const policy = task.unitVerificationPolicy;
  if (!policy || policy.commands.length === 0) {
    return null;
  }
  const runtime = getTaskVerificationRuntime();
  const cwd = resolveVerificationCwd();
  const timeoutMs = resolveVerificationTimeoutMs();
  const commands: UnitVerificationCommandResult[] = [];
  for (const command of policy.commands) {
    const startedAt = Date.now();
    const result = runtime.runCommand({
      command,
      cwd,
      timeoutMs,
    });
    commands.push({
      command,
      passed: result.passed,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: Math.max(0, Date.now() - startedAt),
      ...(result.stdout ? { stdout: result.stdout } : {}),
      ...(result.stderr ? { stderr: result.stderr } : {}),
      ...(result.error ? { error: result.error } : {}),
    });
    if (!result.passed) {
      break;
    }
  }
  const passed = commands.every((result) => result.passed);
  return {
    taskId: task.taskId,
    ...(task.parentFlowId ? { flowId: task.parentFlowId } : {}),
    passed,
    verifiedAt: Date.now(),
    failMode: policy.failMode ?? "stop",
    summary: buildVerificationSummary(commands),
    commands,
  };
}

export function setTaskVerificationRuntimeForTests(runtime: TaskVerificationRuntime | null) {
  (globalThis as TaskVerificationGlobal)[TASK_VERIFICATION_RUNTIME_OVERRIDE_KEY] = runtime;
}

export function resetTaskVerificationRuntimeForTests() {
  delete (globalThis as TaskVerificationGlobal)[TASK_VERIFICATION_RUNTIME_OVERRIDE_KEY];
}
