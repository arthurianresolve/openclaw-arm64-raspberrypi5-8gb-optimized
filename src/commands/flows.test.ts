import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import { createRunningTaskRun } from "../tasks/task-executor.js";
import {
  createManagedTaskFlow,
  resetTaskFlowRegistryForTests,
} from "../tasks/task-flow-registry.js";
import {
  resetTaskRegistryDeliveryRuntimeForTests,
  resetTaskRegistryForTests,
} from "../tasks/task-registry.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  flowsAuditCommand,
  flowsCancelCommand,
  flowsListCommand,
  flowsShowCommand,
} from "./flows.js";

vi.mock("../config/config.js", () => ({
  getRuntimeConfig: vi.fn(() => ({})),
  loadConfig: vi.fn(() => ({})),
}));

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;

function createRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  } as unknown as RuntimeEnv;
}

async function withTaskFlowCommandStateDir(run: (root: string) => Promise<void>): Promise<void> {
  await withTempDir({ prefix: "openclaw-flows-command-" }, async (root) => {
    process.env.OPENCLAW_STATE_DIR = root;
    resetTaskRegistryDeliveryRuntimeForTests();
    resetTaskRegistryForTests({ persist: false });
    resetTaskFlowRegistryForTests({ persist: false });
    try {
      await run(root);
    } finally {
      resetTaskRegistryDeliveryRuntimeForTests();
      resetTaskRegistryForTests({ persist: false });
      resetTaskFlowRegistryForTests({ persist: false });
    }
  });
}

describe("flows commands", () => {
  afterEach(() => {
    if (ORIGINAL_STATE_DIR === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
    }
    resetTaskRegistryDeliveryRuntimeForTests();
    resetTaskRegistryForTests({ persist: false });
    resetTaskFlowRegistryForTests({ persist: false });
  });

  it("lists TaskFlows as JSON with linked tasks and summaries", async () => {
    await withTaskFlowCommandStateDir(async () => {
      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/flows-command",
        goal: "Inspect a PR cluster",
        status: "blocked",
        blockedSummary: "Waiting on child task",
        createdAt: 100,
        updatedAt: 100,
      });

      createRunningTaskRun({
        runtime: "acp",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        parentFlowId: flow.flowId,
        childSessionKey: "agent:main:child",
        runId: "run-child-1",
        label: "Inspect PR 123",
        task: "Inspect PR 123",
        startedAt: 100,
        lastEventAt: 100,
      });

      const runtime = createRuntime();
      await flowsListCommand({ json: true, status: "blocked" }, runtime);

      const payload = JSON.parse(String(vi.mocked(runtime.log).mock.calls[0]?.[0])) as {
        count: number;
        metrics: { blocked: number; repairAttempts: number };
        status: string | null;
        flows: Array<{
          flowId: string;
          tasks: Array<{ runId?: string; label?: string }>;
          taskSummary: { total: number; active: number };
        }>;
      };

      expect(payload).toMatchObject({
        count: 1,
        metrics: {
          blocked: 1,
          repairAttempts: 0,
        },
        status: "blocked",
        flows: [
          {
            flowId: flow.flowId,
            taskSummary: {
              total: 1,
              active: 1,
            },
            tasks: [
              {
                runId: "run-child-1",
                label: "Inspect PR 123",
              },
            ],
          },
        ],
      });
    });
  });

  it("shows one TaskFlow with linked task details in text mode", async () => {
    await withTaskFlowCommandStateDir(async () => {
      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/flows-command",
        goal: "Investigate a flaky queue",
        status: "blocked",
        currentStep: "spawn_child",
        blockedSummary: "Waiting on child task output",
        unitContextPacket: {
          unitId: "queue-debug",
          objective: "Investigate the flaky queue",
          ownedPaths: ["src/queue"],
          relevantDocs: ["docs/help/testing.md"],
          invariants: ["Do not drop queued work"],
          validationCommands: ["pnpm test -- queue"],
          contextMode: "isolated-session",
          modelHint: "light",
          packetSource: "taskflow",
        },
        unitVerificationPolicy: {
          commands: ["pnpm test -- queue"],
          retryCount: 1,
          autoRepair: false,
          failMode: "stop",
        },
        createdAt: 100,
        updatedAt: 100,
      });

      createRunningTaskRun({
        runtime: "subagent",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        parentFlowId: flow.flowId,
        childSessionKey: "agent:main:child",
        runId: "run-child-2",
        label: "Collect logs",
        task: "Collect logs",
        startedAt: 100,
        lastEventAt: 100,
      });

      const runtime = createRuntime();
      await flowsShowCommand({ lookup: flow.flowId, json: false }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(output).toContain("TaskFlow:");
      expect(output).toContain(`flowId: ${flow.flowId}`);
      expect(output).toContain("status: blocked");
      expect(output).toContain("priority: normal");
      expect(output).toContain("goal: Investigate a flaky queue");
      expect(output).toContain("currentStep: spawn_child");
      expect(output).toContain("unitId: queue-debug");
      expect(output).toContain("contextMode: isolated-session");
      expect(output).toContain("modelHint: light");
      expect(output).toContain("verifyCommands: 1");
      expect(output).toContain("verifyRetryCount: 1");
      expect(output).toContain("verifyAutoRepair: off");
      expect(output).toContain("verifyFailMode: stop");
      expect(output).toContain("owner: agent:main:main");
      expect(output).toContain("state: Waiting on child task output");
      expect(output).toContain("Linked tasks:");
      expect(output).toContain("run-child-2");
      expect(output).toContain("Collect logs");
      expect(output).not.toContain("syncMode:");
      expect(output).not.toContain("controllerId:");
      expect(output).not.toContain("revision:");
      expect(output).not.toContain("blockedTaskId:");
      expect(output).not.toContain("blockedSummary:");
      expect(output).not.toContain("wait:");
    });
  });

  it("shows repair priority first in flow lists and surfaces it in text output", async () => {
    await withTaskFlowCommandStateDir(async () => {
      createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/flows-command",
        goal: "Generic queued flow",
        status: "running",
        createdAt: 200,
        updatedAt: 200,
      });
      createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/flows-command",
        goal: "Repair verification failure",
        status: "running",
        currentStep: "verification_repair",
        createdAt: 100,
        updatedAt: 100,
      });

      const runtime = createRuntime();
      await flowsListCommand({ json: false }, runtime);

      const lines = vi.mocked(runtime.log).mock.calls.map(([line]) => String(line));
      expect(lines.some((line) => line.includes("repair-priority"))).toBe(true);
      const repairRow = lines.find((line) => line.includes("Repair verification failure"));
      expect(repairRow).toBeDefined();
      expect(repairRow).toContain("repair");
      const genericRow = lines.find((line) => line.includes("Generic queued flow"));
      expect(lines.indexOf(repairRow ?? "")).toBeLessThan(lines.indexOf(genericRow ?? ""));
    });
  });

  it("surfaces verification summaries from flow state when the flow is not blocked or waiting", async () => {
    await withTaskFlowCommandStateDir(async () => {
      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/flows-command",
        goal: "Review docs patch",
        status: "succeeded",
        stateJson: {
          verification: {
            status: "failed",
            summary: "Verification failed: pnpm lint -- docs (exit 2).",
          },
        },
        createdAt: 100,
        updatedAt: 100,
      });

      const runtime = createRuntime();
      await flowsShowCommand({ lookup: flow.flowId, json: false }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(output).toContain("status: succeeded");
      expect(output).toContain("priority: normal");
      expect(output).toContain("state: Verification failed: pnpm lint -- docs (exit 2).");
    });
  });

  it("shows verification history and repair linkage in audit mode", async () => {
    await withTaskFlowCommandStateDir(async () => {
      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/flows-command",
        goal: "Repair docs verification",
        status: "running",
        currentStep: "verification_repair",
        stateJson: {
          verification: {
            latestTaskId: "task-parent",
            status: "failed",
            failMode: "stop",
            verifiedAt: 123,
            summary: "Verification failed: pnpm lint -- docs (exit 2).",
            commands: [
              {
                command: "pnpm lint -- docs",
                passed: false,
                exitCode: 2,
              },
            ],
            remainingRepairBudget: 1,
            repairTaskId: "task-repair",
            resumeStepAfterRepair: "execute_unit",
            repairAttemptCount: 2,
            repairSuccessCount: 1,
            repairFailureCount: 1,
            history: [
              {
                taskId: "task-parent",
                status: "failed",
                failMode: "stop",
                verifiedAt: 123,
                summary: "Verification failed: pnpm lint -- docs (exit 2).",
                commands: [
                  {
                    command: "pnpm lint -- docs",
                    passed: false,
                    exitCode: 2,
                  },
                ],
              },
            ],
          },
        },
        createdAt: 100,
        updatedAt: 100,
      });

      createRunningTaskRun({
        runtime: "acp",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        parentFlowId: flow.flowId,
        childSessionKey: "agent:main:child",
        runId: "repair-run-1",
        label: "Verification repair: Repair docs verification",
        task: "Repair the unit so the verification commands pass.",
        startedAt: 100,
        lastEventAt: 100,
      });

      const runtime = createRuntime();
      await flowsAuditCommand({ lookup: flow.flowId, json: false }, runtime);

      const output = vi
        .mocked(runtime.log)
        .mock.calls.map(([line]) => String(line))
        .join("\n");
      expect(output).toContain("TaskFlow audit:");
      expect(output).toContain("priority: repair");
      expect(output).toContain("requiresRepair: yes");
      expect(output).toContain("verification.historyCount: 1");
      expect(output).toContain("verification.repairTaskId: task-repair");
      expect(output).toContain("verification.resumeStepAfterRepair: execute_unit");
      expect(output).toContain("verification.repairAttemptCount: 2");
      expect(output).toContain("verification.repairSuccessCount: 1");
      expect(output).toContain("verification.repairFailureCount: 1");
      expect(output).toContain("history:");
      expect(output).toContain("repairTasks: 1");
      expect(output).toContain("repair-run-1");
    });
  });

  it("sanitizes TaskFlow text output before printing to the terminal", async () => {
    await withTaskFlowCommandStateDir(async () => {
      const unsafeOwnerKey = "agent:main:\u001b[31mowner";
      const flow = createManagedTaskFlow({
        ownerKey: unsafeOwnerKey,
        controllerId: "tests/flows-command",
        goal: "Investigate\nqueue\tstate",
        status: "blocked",
        currentStep: "spawn\u001b[2K_child",
        blockedSummary: "Waiting\u001b[31m on child\nforged: yes",
        createdAt: 100,
        updatedAt: 100,
      });

      createRunningTaskRun({
        runtime: "subagent",
        ownerKey: unsafeOwnerKey,
        scopeKind: "session",
        parentFlowId: flow.flowId,
        childSessionKey: "agent:main:child",
        runId: "run-child-3",
        label: "Collect\nlogs\u001b[2K",
        task: "Collect logs",
        startedAt: 100,
        lastEventAt: 100,
      });

      const runtime = createRuntime();
      await flowsShowCommand({ lookup: flow.flowId, json: false }, runtime);

      const lines = vi.mocked(runtime.log).mock.calls.map(([line]) => String(line));
      expect(lines).toContain("goal: Investigate\\nqueue\\tstate");
      expect(lines).toContain("currentStep: spawn_child");
      expect(lines).toContain("owner: agent:main:owner");
      expect(lines).toContain("state: Waiting on child\\nforged: yes");
      expect(
        lines.some((line) => line.includes("run-child-3") && line.includes("Collect\\nlogs")),
      ).toBe(true);
      expect(lines.join("\n")).not.toContain("\u001b[");
    });
  });

  it("cancels a managed TaskFlow with no active children", async () => {
    await withTaskFlowCommandStateDir(async () => {
      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/flows-command",
        goal: "Stop detached work",
        status: "running",
        createdAt: 100,
        updatedAt: 100,
      });

      const runtime = createRuntime();
      await flowsCancelCommand({ lookup: flow.flowId }, runtime);

      expect(vi.mocked(runtime.error)).not.toHaveBeenCalled();
      expect(vi.mocked(runtime.exit)).not.toHaveBeenCalled();
      expect(String(vi.mocked(runtime.log).mock.calls[0]?.[0])).toContain("Cancelled");
      expect(String(vi.mocked(runtime.log).mock.calls[0]?.[0])).toContain(flow.flowId);
      expect(String(vi.mocked(runtime.log).mock.calls[0]?.[0])).toContain("cancelled");
    });
  });
});
