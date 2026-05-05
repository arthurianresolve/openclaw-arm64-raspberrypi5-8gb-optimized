import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTaskFlowById } from "../../tasks/task-flow-registry.js";
import { getTaskById } from "../../tasks/task-registry.js";
import {
  installRuntimeTaskDeliveryMock,
  resetRuntimeTaskTestState,
} from "./runtime-task-test-harness.js";
import { createRuntimeTaskFlow } from "./runtime-taskflow.js";

afterEach(() => {
  resetRuntimeTaskTestState({ persist: false });
});

describe("runtime TaskFlow", () => {
  beforeEach(() => {
    installRuntimeTaskDeliveryMock();
  });

  it("binds managed TaskFlow operations to a session key", () => {
    const runtime = createRuntimeTaskFlow();
    const taskFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
    });

    const created = taskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Triage inbox",
      currentStep: "classify",
      unitContextPacket: {
        unitId: "inbox-triage",
        objective: "Classify the inbound queue",
        ownedPaths: ["src/inbox"],
        relevantDocs: ["docs/ops/inbox.md"],
        invariants: ["Do not alter routing rules"],
        validationCommands: ["pnpm test -- inbox"],
        contextMode: "isolated-session",
        modelHint: "standard",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- inbox"],
        retryCount: 1,
        autoRepair: false,
        failMode: "stop",
      },
      stateJson: { lane: "inbox" },
    });

    expect(created).toMatchObject({
      syncMode: "managed",
      ownerKey: "agent:main:main",
      controllerId: "tests/runtime-taskflow",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
      goal: "Triage inbox",
      unitContextPacket: {
        unitId: "inbox-triage",
        flowId: created.flowId,
        objective: "Classify the inbound queue",
        ownedPaths: ["src/inbox"],
        relevantDocs: ["docs/ops/inbox.md"],
        invariants: ["Do not alter routing rules"],
        validationCommands: ["pnpm test -- inbox"],
        contextMode: "isolated-session",
        modelHint: "standard",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- inbox"],
        retryCount: 1,
        autoRepair: false,
        failMode: "stop",
      },
    });
    expect(taskFlow.get(created.flowId)?.flowId).toBe(created.flowId);
    expect(taskFlow.findLatest()?.flowId).toBe(created.flowId);
    expect(taskFlow.resolve("agent:main:main")?.flowId).toBe(created.flowId);
  });

  it("binds TaskFlows from trusted tool context", () => {
    const runtime = createRuntimeTaskFlow();
    const taskFlow = runtime.fromToolContext({
      sessionKey: "agent:main:main",
      deliveryContext: {
        channel: "discord",
        to: "channel:123",
        threadId: "thread:456",
      },
    });

    const created = taskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Review queue",
    });

    expect(created.requesterOrigin).toMatchObject({
      channel: "discord",
      to: "channel:123",
      threadId: "thread:456",
    });
  });

  it("rejects tool contexts without a bound session key", () => {
    const runtime = createRuntimeTaskFlow();
    expect(() =>
      runtime.fromToolContext({
        sessionKey: undefined,
        deliveryContext: undefined,
      }),
    ).toThrow("TaskFlow runtime requires tool context with a sessionKey.");
  });

  it("keeps TaskFlow reads owner-scoped and runs child tasks under the bound TaskFlow", () => {
    const runtime = createRuntimeTaskFlow();
    const ownerTaskFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
    });
    const otherTaskFlow = runtime.bindSession({
      sessionKey: "agent:main:other",
    });

    const created = ownerTaskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Inspect PR batch",
      unitContextPacket: {
        unitId: "inspect-pr-batch",
        objective: "Inspect one PR batch",
        ownedPaths: ["src/plugins/runtime"],
        relevantDocs: ["docs/automation/taskflow.md"],
        invariants: ["Keep owner scoping intact"],
        validationCommands: ["pnpm test -- runtime-taskflow"],
        contextMode: "isolated-subagent",
        modelHint: "heavy",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- runtime-taskflow"],
        retryCount: 2,
        autoRepair: true,
        failMode: "record_only",
      },
    });

    expect(otherTaskFlow.get(created.flowId)).toBeUndefined();
    expect(otherTaskFlow.list()).toEqual([]);

    const child = ownerTaskFlow.runTask({
      flowId: created.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-taskflow-child",
      task: "Inspect PR 1",
      status: "running",
      startedAt: 10,
      lastEventAt: 10,
    });

    expect(child).toMatchObject({
      created: true,
      flow: expect.objectContaining({
        flowId: created.flowId,
      }),
      task: expect.objectContaining({
        parentFlowId: created.flowId,
        ownerKey: "agent:main:main",
        runId: "runtime-taskflow-child",
      }),
    });
    if (!child.created) {
      throw new Error("expected child task creation to succeed");
    }
    expect(getTaskById(child.task.taskId)).toMatchObject({
      parentFlowId: created.flowId,
      ownerKey: "agent:main:main",
      unitContextPacket: {
        unitId: "inspect-pr-batch",
        flowId: created.flowId,
        objective: "Inspect one PR batch",
        ownedPaths: ["src/plugins/runtime"],
        relevantDocs: ["docs/automation/taskflow.md"],
        invariants: ["Keep owner scoping intact"],
        validationCommands: ["pnpm test -- runtime-taskflow"],
        contextMode: "isolated-subagent",
        modelHint: "heavy",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- runtime-taskflow"],
        retryCount: 2,
        autoRepair: true,
        failMode: "record_only",
      },
    });
    expect(child.task.task).toContain("[Unit Verification]");
    expect(child.task.task).toContain("- pnpm test -- runtime-taskflow");
    expect(child.task.task).toContain("Retry budget: 2 repair attempts.");
    expect(child.task.task).toContain("Failure mode: record verification failures");
    expect(getTaskFlowById(created.flowId)).toMatchObject({
      flowId: created.flowId,
    });
    expect(ownerTaskFlow.getTaskSummary(created.flowId)).toMatchObject({
      total: 1,
      active: 1,
    });
  });

  it("allows managed flow transitions to update unit packet and verification policy", () => {
    const runtime = createRuntimeTaskFlow();
    const taskFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
    });

    const created = taskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Process review queue",
      currentStep: "seed",
      unitContextPacket: {
        unitId: "review:seed",
        objective: "Seed flow packet",
        ownedPaths: ["src/tasks"],
        relevantDocs: ["docs/automation/taskflow.md"],
        invariants: ["Keep ownership scoped"],
        validationCommands: ["pnpm test -- taskflow"],
        contextMode: "isolated-session",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- taskflow"],
        retryCount: 1,
        autoRepair: false,
        failMode: "stop",
      },
    });

    const waiting = taskFlow.setWaiting({
      flowId: created.flowId,
      expectedRevision: created.revision,
      currentStep: "await_input",
      unitContextPacket: {
        unitId: "review:await_input",
        objective: "Wait for human approval",
        ownedPaths: ["src/tasks", "src/plugins/runtime"],
        relevantDocs: ["docs/automation/taskflow.md"],
        invariants: ["Keep ownership scoped", "Do not enqueue duplicate work"],
        validationCommands: ["pnpm test -- runtime-taskflow"],
        contextMode: "isolated-subagent",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- runtime-taskflow"],
        retryCount: 2,
        autoRepair: true,
        failMode: "record_only",
      },
      waitJson: { kind: "approval" },
    });

    expect(waiting).toMatchObject({
      applied: true,
      flow: {
        status: "waiting",
        currentStep: "await_input",
        unitContextPacket: {
          unitId: "review:await_input",
          flowId: created.flowId,
          contextMode: "isolated-subagent",
        },
        unitVerificationPolicy: {
          commands: ["pnpm test -- runtime-taskflow"],
          retryCount: 2,
          autoRepair: true,
          failMode: "record_only",
        },
      },
    });
    if (!waiting.applied) {
      throw new Error("expected waiting mutation to apply");
    }

    const resumed = taskFlow.resume({
      flowId: created.flowId,
      expectedRevision: waiting.flow.revision,
      status: "running",
      currentStep: "execute",
      unitContextPacket: {
        unitId: "review:execute",
        objective: "Execute the approved unit",
        ownedPaths: ["src/tasks"],
        relevantDocs: ["docs/automation/taskflow.md"],
        invariants: ["Keep ownership scoped"],
        validationCommands: ["pnpm test -- runtime-taskflow"],
        contextMode: "isolated-session",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- runtime-taskflow --changed"],
        retryCount: 0,
        autoRepair: false,
        failMode: "stop",
      },
    });

    expect(resumed).toMatchObject({
      applied: true,
      flow: {
        status: "running",
        currentStep: "execute",
        unitContextPacket: {
          unitId: "review:execute",
          flowId: created.flowId,
        },
        unitVerificationPolicy: {
          commands: ["pnpm test -- runtime-taskflow --changed"],
          retryCount: 0,
          autoRepair: false,
          failMode: "stop",
        },
      },
    });
    if (!resumed.applied) {
      throw new Error("expected resume mutation to apply");
    }

    const finished = taskFlow.finish({
      flowId: created.flowId,
      expectedRevision: resumed.flow.revision,
      currentStep: "done",
      unitContextPacket: null,
      unitVerificationPolicy: null,
    });

    expect(finished).toMatchObject({
      applied: true,
      flow: {
        status: "succeeded",
        currentStep: "done",
      },
    });
    if (!finished.applied) {
      throw new Error("expected finish mutation to apply");
    }
    expect(finished.flow.unitContextPacket).toBeUndefined();
    expect(finished.flow.unitVerificationPolicy).toBeUndefined();

    const failedCreated = taskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Process another queue",
    });
    const failed = taskFlow.fail({
      flowId: failedCreated.flowId,
      expectedRevision: failedCreated.revision,
      currentStep: "verify",
      unitContextPacket: {
        unitId: "review:failed",
        objective: "Capture failed verification state",
        ownedPaths: ["src/tasks"],
        relevantDocs: [],
        invariants: ["Do not lose failure context"],
        validationCommands: ["pnpm test -- runtime-taskflow"],
        contextMode: "isolated-session",
        packetSource: "taskflow",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- runtime-taskflow"],
        retryCount: 1,
        autoRepair: false,
        failMode: "stop",
      },
      blockedSummary: "verification failed",
    });

    expect(failed).toMatchObject({
      applied: true,
      flow: {
        status: "failed",
        currentStep: "verify",
        blockedSummary: "verification failed",
        unitContextPacket: {
          unitId: "review:failed",
          flowId: failedCreated.flowId,
        },
        unitVerificationPolicy: {
          commands: ["pnpm test -- runtime-taskflow"],
          retryCount: 1,
          autoRepair: false,
          failMode: "stop",
        },
      },
    });
  });

  it("prioritizes verification repair flows in legacy TaskFlow list and latest lookups", () => {
    const runtime = createRuntimeTaskFlow();
    const taskFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
    });

    const generic = taskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Generic queued work",
      createdAt: 200,
      updatedAt: 200,
    });
    const repair = taskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Repair verification",
      currentStep: "verification_repair",
      createdAt: 100,
      updatedAt: 100,
    });

    expect(taskFlow.list().map((flow) => flow.flowId)).toEqual([repair.flowId, generic.flowId]);
    expect(taskFlow.findLatest()?.flowId).toBe(repair.flowId);
    expect(taskFlow.resolve("agent:main:main")?.flowId).toBe(repair.flowId);
  });

  it("suppresses generic managed child tasks while the flow is in verification repair", () => {
    const runtime = createRuntimeTaskFlow();
    const taskFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
    });

    const repair = taskFlow.createManaged({
      controllerId: "tests/runtime-taskflow",
      goal: "Repair verification",
      currentStep: "verification_repair",
    });

    const child = taskFlow.runTask({
      flowId: repair.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-taskflow-repair-blocked",
      task: "Start unrelated work",
    });

    expect(child).toMatchObject({
      created: false,
      found: true,
      reason:
        "Flow is in verification repair mode; generic child work is suppressed until repair completes.",
      flow: expect.objectContaining({
        flowId: repair.flowId,
      }),
    });
  });
});
