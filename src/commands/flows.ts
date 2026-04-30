import { getRuntimeConfig } from "../config/config.js";
import { info } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { listTasksForFlowId } from "../tasks/runtime-internal.js";
import { mapTaskFlowDetail } from "../tasks/task-domain-views.js";
import { cancelFlowById, getFlowTaskSummary } from "../tasks/task-executor.js";
import type { TaskFlowRecord, TaskFlowStatus } from "../tasks/task-flow-registry.types.js";
import {
  getTaskFlowById,
  listTaskFlowRecords,
  resolveTaskFlowForLookupToken,
} from "../tasks/task-flow-runtime-internal.js";
import { summarizeTaskFlows } from "../tasks/task-flow-summary.js";
import type { UnitContextPacket } from "../tasks/unit-context-packet.js";
import type { UnitVerificationPolicy } from "../tasks/unit-verification-policy.js";
import { sanitizeTerminalText } from "../terminal/safe-text.js";
import { isRich, theme } from "../terminal/theme.js";

const ID_PAD = 10;
const PRIORITY_PAD = 10;
const STATUS_PAD = 10;
const MODE_PAD = 14;
const REV_PAD = 6;
const CTRL_PAD = 20;

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 1) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, maxChars - 1)}…`;
}

function safeFlowDisplayText(value: string | undefined, maxChars?: number): string {
  const sanitized = sanitizeTerminalText(value ?? "").trim();
  if (!sanitized) {
    return "n/a";
  }
  return typeof maxChars === "number" ? truncate(sanitized, maxChars) : sanitized;
}

function shortToken(value: string | undefined, maxChars = ID_PAD): string {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return "n/a";
  }
  return truncate(trimmed, maxChars);
}

function formatFlowStatusCell(status: TaskFlowStatus, rich: boolean) {
  const padded = status.padEnd(STATUS_PAD);
  if (!rich) {
    return padded;
  }
  if (status === "succeeded") {
    return theme.success(padded);
  }
  if (status === "failed" || status === "lost") {
    return theme.error(padded);
  }
  if (status === "running") {
    return theme.accentBright(padded);
  }
  if (status === "blocked") {
    return theme.warn(padded);
  }
  return theme.muted(padded);
}

function isRepairPriorityFlow(flow: Pick<TaskFlowRecord, "currentStep">): boolean {
  return normalizeOptionalString(flow.currentStep) === "verification_repair";
}

function formatPriorityCell(flow: Pick<TaskFlowRecord, "currentStep">, rich: boolean) {
  const value = isRepairPriorityFlow(flow) ? "repair" : "normal";
  const padded = value.padEnd(PRIORITY_PAD);
  if (!rich) {
    return padded;
  }
  return isRepairPriorityFlow(flow) ? theme.warn(padded) : theme.muted(padded);
}

function compareFlowDisplayPriority(left: TaskFlowRecord, right: TaskFlowRecord): number {
  const leftRepair = isRepairPriorityFlow(left);
  const rightRepair = isRepairPriorityFlow(right);
  if (leftRepair !== rightRepair) {
    return leftRepair ? -1 : 1;
  }
  return right.createdAt - left.createdAt;
}

function formatFlowRows(flows: TaskFlowRecord[], rich: boolean) {
  const header = [
    "TaskFlow".padEnd(ID_PAD),
    "Priority".padEnd(PRIORITY_PAD),
    "Mode".padEnd(MODE_PAD),
    "Status".padEnd(STATUS_PAD),
    "Rev".padEnd(REV_PAD),
    "Controller".padEnd(CTRL_PAD),
    "Tasks".padEnd(14),
    "Goal",
  ].join(" ");
  const lines = [rich ? theme.heading(header) : header];
  for (const flow of flows) {
    const taskSummary = getFlowTaskSummary(flow.flowId);
    const counts = `${taskSummary.active} active/${taskSummary.total} total`;
    lines.push(
      [
        shortToken(flow.flowId).padEnd(ID_PAD),
        formatPriorityCell(flow, rich),
        flow.syncMode.padEnd(MODE_PAD),
        formatFlowStatusCell(flow.status, rich),
        String(flow.revision).padEnd(REV_PAD),
        safeFlowDisplayText(flow.controllerId, CTRL_PAD).padEnd(CTRL_PAD),
        counts.padEnd(14),
        safeFlowDisplayText(flow.goal, 80),
      ].join(" "),
    );
  }
  return lines;
}

function formatPercent(value: number | null): string {
  return value == null ? "n/a" : `${Math.round(value * 100)}%`;
}

function formatFlowListSummary(flows: TaskFlowRecord[]) {
  const metrics = summarizeTaskFlows(flows);
  return `${metrics.active} active · ${metrics.blocked} blocked · ${metrics.repairPriority} repair-priority · ${metrics.cancelRequested} cancel-requested · ${metrics.repairAttempts} repair-attempts · ${metrics.repairSuccesses} repair-successes (${formatPercent(metrics.repairSuccessRate)}) · ${metrics.total} total`;
}

function summarizeWait(flow: TaskFlowRecord): string {
  if (flow.waitJson == null) {
    return "n/a";
  }
  if (
    typeof flow.waitJson === "string" ||
    typeof flow.waitJson === "number" ||
    typeof flow.waitJson === "boolean"
  ) {
    return String(flow.waitJson);
  }
  if (Array.isArray(flow.waitJson)) {
    return `array(${flow.waitJson.length})`;
  }
  return Object.keys(flow.waitJson).toSorted().join(", ") || "object";
}

function summarizeUnitContextPacket(packet: UnitContextPacket | undefined) {
  if (!packet) {
    return [];
  }
  return [
    `unitId: ${safeFlowDisplayText(packet.unitId)}`,
    `contextMode: ${packet.contextMode}`,
    `modelHint: ${packet.modelHint ?? "n/a"}`,
  ];
}

function summarizeUnitVerificationPolicy(policy: UnitVerificationPolicy | undefined) {
  if (!policy) {
    return [];
  }
  return [
    `verifyCommands: ${policy.commands.length}`,
    `verifyRetryCount: ${policy.retryCount ?? 0}`,
    `verifyAutoRepair: ${policy.autoRepair === true ? "on" : "off"}`,
    `verifyFailMode: ${policy.failMode ?? "stop"}`,
  ];
}

function summarizeFlowState(flow: TaskFlowRecord): string | null {
  if (flow.status === "blocked") {
    if (flow.blockedSummary) {
      return flow.blockedSummary;
    }
    if (flow.blockedTaskId) {
      return `blocked by ${flow.blockedTaskId}`;
    }
    return "blocked";
  }
  if (flow.status === "waiting" && flow.waitJson != null) {
    return summarizeWait(flow);
  }
  const verification = flow.verificationState?.summary;
  if (verification) {
    return verification;
  }
  return null;
}

function formatVerificationAuditLines(flow: TaskFlowRecord): string[] {
  const detail = mapTaskFlowDetail({
    flow,
    tasks: listTasksForFlowId(flow.flowId),
    summary: getFlowTaskSummary(flow.flowId),
  });
  const verification = detail.verification;
  if (!verification) {
    return ["verification: none"];
  }
  const lines = [
    `priority: ${detail.priority}`,
    `requiresRepair: ${detail.requiresRepair === true ? "yes" : "no"}`,
    `verification.status: ${verification.status}`,
    `verification.summary: ${safeFlowDisplayText(verification.summary)}`,
    `verification.failMode: ${verification.failMode ?? "n/a"}`,
    `verification.latestTaskId: ${safeFlowDisplayText(verification.latestTaskId)}`,
    `verification.repairTaskId: ${safeFlowDisplayText(verification.repairTaskId)}`,
    `verification.resumeStepAfterRepair: ${safeFlowDisplayText(verification.resumeStepAfterRepair)}`,
    `verification.remainingRepairBudget: ${String(verification.remainingRepairBudget ?? 0)}`,
    `verification.repairAttemptCount: ${String(verification.repairAttemptCount ?? 0)}`,
    `verification.repairSuccessCount: ${String(verification.repairSuccessCount ?? 0)}`,
    `verification.repairFailureCount: ${String(verification.repairFailureCount ?? 0)}`,
    `verification.verifiedAt: ${verification.verifiedAt ? new Date(verification.verifiedAt).toISOString() : "n/a"}`,
    `verification.historyCount: ${verification.history?.length ?? 0}`,
  ];
  if (verification.commands.length > 0) {
    lines.push("latest commands:");
    for (const command of verification.commands) {
      lines.push(
        `- ${command.passed ? "PASS" : "FAIL"} ${safeFlowDisplayText(command.command)} exit=${command.exitCode ?? "n/a"} durationMs=${command.durationMs ?? "n/a"}`,
      );
    }
  }
  if (verification.history?.length) {
    lines.push("history:");
    for (const entry of verification.history) {
      lines.push(
        `- ${entry.status.toUpperCase()} task=${safeFlowDisplayText(entry.taskId)} failMode=${entry.failMode ?? "n/a"} verifiedAt=${entry.verifiedAt ? new Date(entry.verifiedAt).toISOString() : "n/a"}`,
      );
      lines.push(`  summary: ${safeFlowDisplayText(entry.summary)}`);
      for (const command of entry.commands) {
        lines.push(
          `  command: ${command.passed ? "PASS" : "FAIL"} ${safeFlowDisplayText(command.command)} exit=${command.exitCode ?? "n/a"}`,
        );
      }
    }
  }
  const repairTasks = detail.tasks.filter((task) =>
    (task.label ?? task.title).includes("Verification repair:"),
  );
  lines.push(`repairTasks: ${repairTasks.length}`);
  for (const task of repairTasks) {
    lines.push(
      `- ${task.id} ${task.status} run=${task.runId ?? "n/a"} label=${safeFlowDisplayText(task.label ?? task.title)}`,
    );
  }
  return lines;
}

export async function flowsListCommand(
  opts: { json?: boolean; status?: string },
  runtime: RuntimeEnv,
) {
  const statusFilter = opts.status?.trim();
  const flows = listTaskFlowRecords()
    .toSorted(compareFlowDisplayPriority)
    .filter((flow) => {
      if (statusFilter && flow.status !== statusFilter) {
        return false;
      }
      return true;
    });

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          count: flows.length,
          status: statusFilter ?? null,
          metrics: summarizeTaskFlows(flows),
          flows: flows.map((flow) => {
            const detail = mapTaskFlowDetail({
              flow,
              tasks: listTasksForFlowId(flow.flowId),
              summary: getFlowTaskSummary(flow.flowId),
            });
            return {
              ...flow,
              priority: detail.priority,
              requiresRepair: detail.requiresRepair ?? false,
              verification: detail.verification ?? null,
              tasks: listTasksForFlowId(flow.flowId),
              taskSummary: getFlowTaskSummary(flow.flowId),
            };
          }),
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log(info(`TaskFlows: ${flows.length}`));
  runtime.log(info(`TaskFlow pressure: ${formatFlowListSummary(flows)}`));
  if (statusFilter) {
    runtime.log(info(`Status filter: ${statusFilter}`));
  }
  if (flows.length === 0) {
    runtime.log("No TaskFlows found.");
    return;
  }
  const rich = isRich();
  for (const line of formatFlowRows(flows, rich)) {
    runtime.log(line);
  }
}

export async function flowsShowCommand(
  opts: { json?: boolean; lookup: string },
  runtime: RuntimeEnv,
) {
  const flow = resolveTaskFlowForLookupToken(opts.lookup);
  if (!flow) {
    runtime.error(`TaskFlow not found: ${opts.lookup}`);
    runtime.exit(1);
    return;
  }
  const tasks = listTasksForFlowId(flow.flowId);
  const taskSummary = getFlowTaskSummary(flow.flowId);
  const stateSummary = summarizeFlowState(flow);

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        (() => {
          const detail = mapTaskFlowDetail({
            flow,
            tasks,
            summary: taskSummary,
          });
          return {
            ...flow,
            priority: detail.priority,
            requiresRepair: detail.requiresRepair ?? false,
            verification: detail.verification ?? null,
            tasks,
            taskSummary,
          };
        })(),
        null,
        2,
      ),
    );
    return;
  }

  const lines = [
    "TaskFlow:",
    `flowId: ${flow.flowId}`,
    `status: ${flow.status}`,
    `priority: ${isRepairPriorityFlow(flow) ? "repair" : "normal"}`,
    `goal: ${safeFlowDisplayText(flow.goal)}`,
    `currentStep: ${safeFlowDisplayText(flow.currentStep)}`,
    ...summarizeUnitContextPacket(flow.unitContextPacket),
    ...summarizeUnitVerificationPolicy(flow.unitVerificationPolicy),
    `owner: ${safeFlowDisplayText(flow.ownerKey)}`,
    `notify: ${flow.notifyPolicy}`,
    ...(stateSummary ? [`state: ${safeFlowDisplayText(stateSummary)}`] : []),
    ...(flow.cancelRequestedAt
      ? [`cancelRequestedAt: ${new Date(flow.cancelRequestedAt).toISOString()}`]
      : []),
    `createdAt: ${new Date(flow.createdAt).toISOString()}`,
    `updatedAt: ${new Date(flow.updatedAt).toISOString()}`,
    `endedAt: ${flow.endedAt ? new Date(flow.endedAt).toISOString() : "n/a"}`,
    `tasks: ${taskSummary.total} total · ${taskSummary.active} active · ${taskSummary.failures} issues`,
  ];
  for (const line of lines) {
    runtime.log(line);
  }
  if (tasks.length === 0) {
    runtime.log("Linked tasks: none");
    return;
  }
  runtime.log("Linked tasks:");
  for (const task of tasks) {
    const safeLabel = safeFlowDisplayText(task.label ?? task.task);
    runtime.log(`- ${task.taskId} ${task.status} ${task.runId ?? "n/a"} ${safeLabel}`);
  }
}

export async function flowsCancelCommand(opts: { lookup: string }, runtime: RuntimeEnv) {
  const flow = resolveTaskFlowForLookupToken(opts.lookup);
  if (!flow) {
    runtime.error(`Flow not found: ${opts.lookup}`);
    runtime.exit(1);
    return;
  }
  const result = await cancelFlowById({
    cfg: getRuntimeConfig(),
    flowId: flow.flowId,
  });
  if (!result.found) {
    runtime.error(result.reason ?? `Flow not found: ${opts.lookup}`);
    runtime.exit(1);
    return;
  }
  if (!result.cancelled) {
    runtime.error(result.reason ?? `Could not cancel TaskFlow: ${opts.lookup}`);
    runtime.exit(1);
    return;
  }
  const updated = getTaskFlowById(flow.flowId) ?? result.flow ?? flow;
  runtime.log(`Cancelled ${updated.flowId} (${updated.syncMode}) with status ${updated.status}.`);
}

export async function flowsAuditCommand(
  opts: { json?: boolean; lookup: string },
  runtime: RuntimeEnv,
) {
  const flow = resolveTaskFlowForLookupToken(opts.lookup);
  if (!flow) {
    runtime.error(`TaskFlow not found: ${opts.lookup}`);
    runtime.exit(1);
    return;
  }
  const detail = mapTaskFlowDetail({
    flow,
    tasks: listTasksForFlowId(flow.flowId),
    summary: getFlowTaskSummary(flow.flowId),
  });

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          id: detail.id,
          status: detail.status,
          priority: detail.priority,
          requiresRepair: detail.requiresRepair ?? false,
          verification: detail.verification ?? null,
          tasks: detail.tasks,
          taskSummary: detail.taskSummary,
        },
        null,
        2,
      ),
    );
    return;
  }

  runtime.log("TaskFlow audit:");
  runtime.log(`flowId: ${detail.id}`);
  for (const line of formatVerificationAuditLines(flow)) {
    runtime.log(line);
  }
}
