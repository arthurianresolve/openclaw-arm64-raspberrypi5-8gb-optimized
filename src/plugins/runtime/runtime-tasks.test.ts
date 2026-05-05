import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDetachedTaskLifecycleRuntime,
  setDetachedTaskLifecycleRuntime,
} from "../../tasks/detached-task-runtime.js";
import {
  getRuntimeTaskMocks,
  installRuntimeTaskDeliveryMock,
  resetRuntimeTaskTestState,
} from "./runtime-task-test-harness.js";
import { createRuntimeTaskFlow } from "./runtime-taskflow.js";
import { createRuntimeTaskFlows, createRuntimeTaskRuns } from "./runtime-tasks.js";

const runtimeTaskMocks = getRuntimeTaskMocks();

afterEach(() => {
  resetRuntimeTaskTestState();
});

describe("runtime tasks", () => {
  beforeEach(() => {
    installRuntimeTaskDeliveryMock();
  });

  it("exposes canonical task and TaskFlow DTOs without leaking raw registry fields", () => {
    const legacyTaskFlow = createRuntimeTaskFlow().bindSession({
      sessionKey: "agent:main:main",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
    });
    const taskFlows = createRuntimeTaskFlows().bindSession({
      sessionKey: "agent:main:main",
    });
    const taskRuns = createRuntimeTaskRuns().bindSession({
      sessionKey: "agent:main:main",
    });
    const otherTaskFlows = createRuntimeTaskFlows().bindSession({
      sessionKey: "agent:main:other",
    });
    const otherTaskRuns = createRuntimeTaskRuns().bindSession({
      sessionKey: "agent:main:other",
    });

    const created = legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Review inbox",
      currentStep: "triage",
      stateJson: { lane: "priority" },
    });
    const child = legacyTaskFlow.runTask({
      flowId: created.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-task-run",
      label: "Inbox triage",
      task: "Review PR 1",
      status: "running",
      startedAt: 10,
      lastEventAt: 11,
      progressSummary: "Inspecting",
    });
    if (!child.created) {
      throw new Error("expected child task creation to succeed");
    }

    expect(taskFlows.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.flowId,
          ownerKey: "agent:main:main",
          goal: "Review inbox",
          currentStep: "triage",
          priority: "normal",
        }),
      ]),
    );
    expect(taskFlows.get(created.flowId)).toMatchObject({
      id: created.flowId,
      ownerKey: "agent:main:main",
      goal: "Review inbox",
      currentStep: "triage",
      priority: "normal",
      state: { lane: "priority" },
      taskSummary: {
        total: 1,
        active: 1,
      },
      tasks: [
        expect.objectContaining({
          id: child.task.taskId,
          flowId: created.flowId,
          title: "Review PR 1",
          label: "Inbox triage",
          runId: "runtime-task-run",
        }),
      ],
    });
    expect(taskRuns.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: child.task.taskId,
          flowId: created.flowId,
          sessionKey: "agent:main:main",
          title: "Review PR 1",
          status: "running",
        }),
      ]),
    );
    expect(taskRuns.get(child.task.taskId)).toMatchObject({
      id: child.task.taskId,
      flowId: created.flowId,
      title: "Review PR 1",
      progressSummary: "Inspecting",
    });
    expect(taskRuns.findLatest()?.id).toBe(child.task.taskId);
    expect(taskRuns.resolve("runtime-task-run")?.id).toBe(child.task.taskId);
    expect(taskFlows.getTaskSummary(created.flowId)).toMatchObject({
      total: 1,
      active: 1,
    });

    expect(otherTaskFlows.get(created.flowId)).toBeUndefined();
    expect(otherTaskRuns.get(child.task.taskId)).toBeUndefined();

    const flowDetail = taskFlows.get(created.flowId);
    expect(flowDetail).not.toHaveProperty("revision");
    expect(flowDetail).not.toHaveProperty("controllerId");
    expect(flowDetail).not.toHaveProperty("syncMode");

    const taskDetail = taskRuns.get(child.task.taskId);
    expect(taskDetail).not.toHaveProperty("taskId");
    expect(taskDetail).not.toHaveProperty("requesterSessionKey");
    expect(taskDetail).not.toHaveProperty("scopeKind");
  });

  it("exposes verification and repair metadata in TaskFlow DTOs", () => {
    const legacyTaskFlow = createRuntimeTaskFlow().bindSession({
      sessionKey: "agent:main:main",
    });
    const taskFlows = createRuntimeTaskFlows().bindSession({
      sessionKey: "agent:main:main",
    });

    const created = legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Repair failing verification",
      currentStep: "verification_repair",
      stateJson: {
        verification: {
          latestTaskId: "task-parent",
          status: "failed",
          failMode: "stop",
          verifiedAt: 123,
          summary: "Verification failed: pnpm tsc --noEmit (exit 2).",
          commands: [
            {
              command: "pnpm tsc --noEmit",
              passed: false,
              exitCode: 2,
              durationMs: 25,
            },
          ],
          remainingRepairBudget: 1,
          repairTaskId: "task-repair",
          repairAttemptCount: 2,
          repairSuccessCount: 1,
          repairFailureCount: 1,
          history: [
            {
              taskId: "task-parent",
              status: "failed",
              failMode: "stop",
              verifiedAt: 123,
              summary: "Verification failed: pnpm tsc --noEmit (exit 2).",
              commands: [
                {
                  command: "pnpm tsc --noEmit",
                  passed: false,
                  exitCode: 2,
                },
              ],
            },
          ],
        },
      },
    });

    expect(taskFlows.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.flowId,
          currentStep: "verification_repair",
          priority: "repair",
          requiresRepair: true,
          verification: expect.objectContaining({
            status: "failed",
            summary: "Verification failed: pnpm tsc --noEmit (exit 2).",
            remainingRepairBudget: 1,
            repairTaskId: "task-repair",
          }),
        }),
      ]),
    );
    expect(taskFlows.get(created.flowId)).toMatchObject({
      id: created.flowId,
      currentStep: "verification_repair",
      priority: "repair",
      requiresRepair: true,
      verification: {
        latestTaskId: "task-parent",
        status: "failed",
        failMode: "stop",
        verifiedAt: 123,
        summary: "Verification failed: pnpm tsc --noEmit (exit 2).",
        commands: [
          {
            command: "pnpm tsc --noEmit",
            passed: false,
            exitCode: 2,
            durationMs: 25,
          },
        ],
        remainingRepairBudget: 1,
        repairTaskId: "task-repair",
        repairAttemptCount: 2,
        repairSuccessCount: 1,
        repairFailureCount: 1,
        history: [
          {
            taskId: "task-parent",
            status: "failed",
            failMode: "stop",
            verifiedAt: 123,
            summary: "Verification failed: pnpm tsc --noEmit (exit 2).",
            commands: [
              {
                command: "pnpm tsc --noEmit",
                passed: false,
                exitCode: 2,
              },
            ],
          },
        ],
      },
    });
  });

  it("prioritizes repair flows in list and latest lookups", () => {
    const legacyTaskFlow = createRuntimeTaskFlow().bindSession({
      sessionKey: "agent:main:main",
    });
    const taskFlows = createRuntimeTaskFlows().bindSession({
      sessionKey: "agent:main:main",
    });

    const generic = legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Generic queued work",
      createdAt: 200,
      updatedAt: 200,
    });
    const repair = legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Repair failing verification",
      currentStep: "verification_repair",
      createdAt: 100,
      updatedAt: 100,
      stateJson: {
        verification: {
          status: "failed",
          failMode: "stop",
          summary: "Verification failed.",
        },
      },
    });

    expect(taskFlows.list().map((flow) => flow.id)).toEqual([repair.flowId, generic.flowId]);
    expect(taskFlows.findLatest()?.id).toBe(repair.flowId);
    expect(taskFlows.resolve("agent:main:main")?.id).toBe(repair.flowId);
  });

  it("summarizes repair metrics for machine-facing callers", () => {
    const legacyTaskFlow = createRuntimeTaskFlow().bindSession({
      sessionKey: "agent:main:main",
    });
    const taskFlows = createRuntimeTaskFlows().bindSession({
      sessionKey: "agent:main:main",
    });

    legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Verified flow",
      stateJson: {
        verification: {
          status: "passed",
          summary: "Verification passed.",
          commands: [],
          repairAttemptCount: 1,
          repairSuccessCount: 1,
          repairFailureCount: 0,
        },
      },
    });
    legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Repair in progress",
      status: "running",
      currentStep: "verification_repair",
      stateJson: {
        verification: {
          status: "failed",
          summary: "Verification failed.",
          commands: [],
          repairAttemptCount: 2,
          repairSuccessCount: 1,
          repairFailureCount: 1,
        },
      },
    });

    expect(taskFlows.summarize()).toEqual({
      total: 2,
      active: 2,
      blocked: 0,
      waiting: 0,
      terminal: 0,
      cancelRequested: 0,
      repairPriority: 1,
      verificationTracked: 2,
      verificationPassed: 1,
      verificationFailed: 1,
      repairAttempts: 3,
      repairSuccesses: 2,
      repairFailures: 1,
      repairSuccessRate: 2 / 3,
    });
  });

  it("maps task cancellation results onto canonical task DTOs", async () => {
    const legacyTaskFlow = createRuntimeTaskFlow().bindSession({
      sessionKey: "agent:main:main",
    });
    const taskRuns = createRuntimeTaskRuns().bindSession({
      sessionKey: "agent:main:main",
    });

    const created = legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Cancel active task",
    });
    const child = legacyTaskFlow.runTask({
      flowId: created.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-task-cancel",
      task: "Cancel me",
      status: "running",
      startedAt: 20,
      lastEventAt: 21,
    });
    if (!child.created) {
      throw new Error("expected child task creation to succeed");
    }

    const result = await taskRuns.cancel({
      taskId: child.task.taskId,
      cfg: {} as never,
    });

    expect(runtimeTaskMocks.cancelSessionMock).toHaveBeenCalledWith({
      cfg: {},
      sessionKey: "agent:main:subagent:child",
      reason: "task-cancel",
    });
    expect(result).toMatchObject({
      found: true,
      cancelled: true,
      task: {
        id: child.task.taskId,
        title: "Cancel me",
        status: "cancelled",
      },
    });
  });

  it("routes runtime task cancellation through the detached task runtime seam", async () => {
    const legacyTaskFlow = createRuntimeTaskFlow().bindSession({
      sessionKey: "agent:main:main",
    });
    const taskRuns = createRuntimeTaskRuns().bindSession({
      sessionKey: "agent:main:main",
    });

    const created = legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Cancel through runtime seam",
    });
    const child = legacyTaskFlow.runTask({
      flowId: created.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-task-cancel-seam",
      task: "Cancel via seam",
      status: "running",
      startedAt: 22,
      lastEventAt: 23,
    });
    if (!child.created) {
      throw new Error("expected child task creation to succeed");
    }

    const defaultRuntime = getDetachedTaskLifecycleRuntime();
    const cancelDetachedTaskRunByIdSpy = vi.fn(
      (...args: Parameters<typeof defaultRuntime.cancelDetachedTaskRunById>) =>
        defaultRuntime.cancelDetachedTaskRunById(...args),
    );
    setDetachedTaskLifecycleRuntime({
      ...defaultRuntime,
      cancelDetachedTaskRunById: cancelDetachedTaskRunByIdSpy,
    });

    await taskRuns.cancel({
      taskId: child.task.taskId,
      cfg: {} as never,
    });

    expect(cancelDetachedTaskRunByIdSpy).toHaveBeenCalledWith({
      cfg: {} as never,
      taskId: child.task.taskId,
    });
  });

  it("does not allow cross-owner task cancellation or leak task details", async () => {
    const legacyTaskFlow = createRuntimeTaskFlow().bindSession({
      sessionKey: "agent:main:main",
    });
    const otherTaskRuns = createRuntimeTaskRuns().bindSession({
      sessionKey: "agent:main:other",
    });

    const created = legacyTaskFlow.createManaged({
      controllerId: "tests/runtime-tasks",
      goal: "Keep owner isolation",
    });
    const child = legacyTaskFlow.runTask({
      flowId: created.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-task-isolation",
      task: "Do not cancel me",
      status: "running",
      startedAt: 30,
      lastEventAt: 31,
    });
    if (!child.created) {
      throw new Error("expected child task creation to succeed");
    }

    const result = await otherTaskRuns.cancel({
      taskId: child.task.taskId,
      cfg: {} as never,
    });

    expect(runtimeTaskMocks.cancelSessionMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: false,
      cancelled: false,
      reason: "Task not found.",
    });
    expect(otherTaskRuns.get(child.task.taskId)).toBeUndefined();
  });
});
