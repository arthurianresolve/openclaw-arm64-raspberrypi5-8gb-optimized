import { describe, expect, it, vi } from "vitest";
import type { LobsterRunner } from "./lobster-runner.js";
import { resumeManagedLobsterFlow, runManagedLobsterFlow } from "./lobster-taskflow.js";
import { createFakeTaskFlow } from "./taskflow-test-helpers.js";

function expectManagedFlowFailure(
  result: Awaited<ReturnType<typeof runManagedLobsterFlow | typeof resumeManagedLobsterFlow>>,
) {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected managed Lobster flow to fail");
  }
  return result;
}
function createRunner(result: Awaited<ReturnType<LobsterRunner["run"]>>): LobsterRunner {
  return {
    run: vi.fn().mockResolvedValue(result),
  };
}

function createRunFlowParams(
  taskFlow: ReturnType<typeof createFakeTaskFlow>,
  runner: LobsterRunner,
): Parameters<typeof runManagedLobsterFlow>[0] {
  return {
    taskFlow,
    runner,
    runnerParams: {
      action: "run",
      pipeline: "noop",
      cwd: process.cwd(),
      timeoutMs: 1000,
      maxStdoutBytes: 4096,
    },
    controllerId: "tests/lobster",
    goal: "Run Lobster workflow",
  };
}

function createResumeFlowParams(
  taskFlow: ReturnType<typeof createFakeTaskFlow>,
  runner: LobsterRunner,
): Parameters<typeof resumeManagedLobsterFlow>[0] {
  return {
    taskFlow,
    runner,
    flowId: "flow-1",
    expectedRevision: 4,
    runnerParams: {
      action: "resume",
      token: "resume-1",
      approve: true,
      cwd: process.cwd(),
      timeoutMs: 1000,
      maxStdoutBytes: 4096,
    },
  };
}

describe("runManagedLobsterFlow", () => {
  it("creates a flow and finishes it when Lobster succeeds", async () => {
    const taskFlow = createFakeTaskFlow();
    const runner = createRunner({
      ok: true,
      status: "ok",
      output: [{ id: "result-1" }],
      requiresApproval: null,
    });

    const result = await runManagedLobsterFlow(createRunFlowParams(taskFlow, runner));

    expect(result.ok).toBe(true);
    expect(taskFlow.createManaged).toHaveBeenCalledWith({
      controllerId: "tests/lobster",
      goal: "Run Lobster workflow",
      currentStep: "run_lobster",
      unitContextPacket: {
        unitId: "lobster:tests/lobster",
        objective: "Run Lobster workflow",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
    });
    expect(taskFlow.finish).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      currentStep: "lobster_complete",
      unitContextPacket: {
        unitId: "lobster:tests/lobster@lobster_complete",
        objective: "Run Lobster workflow (lobster_complete)",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: undefined,
    });
  });

  it("moves the flow to waiting when Lobster requests approval", async () => {
    const taskFlow = createFakeTaskFlow();
    const createdAt = new Date("2026-04-05T21:00:00.000Z");
    const runner = createRunner({
      ok: true,
      status: "needs_approval",
      output: [],
      requiresApproval: {
        type: "approval_request",
        prompt: "Approve this?",
        items: [{ id: "item-1", createdAt, count: 2n, skip: undefined }],
        resumeToken: "resume-1",
      },
    });

    const result = await runManagedLobsterFlow(createRunFlowParams(taskFlow, runner));

    expect(result.ok).toBe(true);
    expect(taskFlow.setWaiting).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      currentStep: "await_lobster_approval",
      unitContextPacket: {
        unitId: "lobster:tests/lobster@await_lobster_approval",
        objective: "Run Lobster workflow (await_lobster_approval)",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: undefined,
      waitJson: {
        kind: "lobster_approval",
        prompt: "Approve this?",
        items: [{ id: "item-1", createdAt: createdAt.toISOString(), count: "2" }],
        resumeToken: "resume-1",
      },
    });
  });

  it("passes explicit flow packet and verification policy into managed runs", async () => {
    const taskFlow = createFakeTaskFlow();
    const runner = createRunner({
      ok: true,
      status: "ok",
      output: [],
      requiresApproval: null,
    });

    await runManagedLobsterFlow({
      ...createRunFlowParams(taskFlow, runner),
      unitContextPacket: {
        unitId: "lobster:review",
        objective: "Review workflow output",
        ownedPaths: ["extensions/lobster"],
        relevantDocs: ["docs/tools/lobster.md"],
        invariants: ["Keep managed flow state deterministic"],
        validationCommands: ["pnpm test -- lobster-taskflow"],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- lobster-taskflow"],
        retryCount: 1,
        autoRepair: false,
        failMode: "stop",
      },
    });

    expect(taskFlow.createManaged).toHaveBeenCalledWith({
      controllerId: "tests/lobster",
      goal: "Run Lobster workflow",
      currentStep: "run_lobster",
      unitContextPacket: {
        unitId: "lobster:review",
        objective: "Review workflow output",
        ownedPaths: ["extensions/lobster"],
        relevantDocs: ["docs/tools/lobster.md"],
        invariants: ["Keep managed flow state deterministic"],
        validationCommands: ["pnpm test -- lobster-taskflow"],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: {
        commands: ["pnpm test -- lobster-taskflow"],
        retryCount: 1,
        autoRepair: false,
        failMode: "stop",
      },
    });
  });

  it("fails the flow when Lobster returns an error envelope", async () => {
    const taskFlow = createFakeTaskFlow();
    const runner = createRunner({
      ok: false,
      error: {
        type: "runtime_error",
        message: "boom",
      },
    });

    const result = expectManagedFlowFailure(
      await runManagedLobsterFlow(createRunFlowParams(taskFlow, runner)),
    );
    expect(result.error.message).toBe("boom");
    expect(taskFlow.fail).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      currentStep: "lobster_failed",
      unitContextPacket: {
        unitId: "lobster:tests/lobster@lobster_failed",
        objective: "Run Lobster workflow (lobster_failed)",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: undefined,
    });
  });

  it("fails the flow when the runner throws", async () => {
    const taskFlow = createFakeTaskFlow();
    const runner: LobsterRunner = {
      run: vi.fn().mockRejectedValue(new Error("crashed")),
    };

    const result = expectManagedFlowFailure(
      await runManagedLobsterFlow(createRunFlowParams(taskFlow, runner)),
    );
    expect(result.error.message).toBe("crashed");
    expect(taskFlow.fail).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 1,
      currentStep: "lobster_failed",
      unitContextPacket: {
        unitId: "lobster:tests/lobster@lobster_failed",
        objective: "Run Lobster workflow (lobster_failed)",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: undefined,
    });
  });
});

describe("resumeManagedLobsterFlow", () => {
  it("resumes the flow and finishes it on success", async () => {
    const taskFlow = createFakeTaskFlow();
    const runner = createRunner({
      ok: true,
      status: "ok",
      output: [],
      requiresApproval: null,
    });

    const result = await resumeManagedLobsterFlow(createResumeFlowParams(taskFlow, runner));

    expect(result.ok).toBe(true);
    expect(taskFlow.resume).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 4,
      status: "running",
      currentStep: "resume_lobster",
      unitContextPacket: {
        unitId: "lobster:tests/lobster@resume_lobster",
        objective: "Run Lobster workflow (resume_lobster)",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: undefined,
    });
    expect(taskFlow.finish).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 5,
      currentStep: "lobster_complete",
      unitContextPacket: {
        unitId: "lobster:tests/lobster@lobster_complete",
        objective: "Run Lobster workflow (lobster_complete)",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: undefined,
    });
  });

  it("returns a mutation error when taskFlow resume is rejected", async () => {
    const taskFlow = createFakeTaskFlow({
      resume: vi.fn().mockReturnValue({
        applied: false,
        code: "revision_conflict",
      }),
    });
    const runner = createRunner({
      ok: true,
      status: "ok",
      output: [],
      requiresApproval: null,
    });

    const result = expectManagedFlowFailure(
      await resumeManagedLobsterFlow(createResumeFlowParams(taskFlow, runner)),
    );
    expect(result.error.message).toMatch(/revision_conflict/);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("returns to waiting when the resumed Lobster run needs approval again", async () => {
    const taskFlow = createFakeTaskFlow();
    const runner = createRunner({
      ok: true,
      status: "needs_approval",
      output: [],
      requiresApproval: {
        type: "approval_request",
        prompt: "Approve this too?",
        items: [{ id: "item-2" }],
        resumeToken: "resume-2",
      },
    });

    const result = await resumeManagedLobsterFlow(createResumeFlowParams(taskFlow, runner));

    expect(result.ok).toBe(true);
    expect(taskFlow.setWaiting).toHaveBeenCalledWith({
      flowId: "flow-1",
      expectedRevision: 5,
      currentStep: "await_lobster_approval",
      unitContextPacket: {
        unitId: "lobster:tests/lobster@await_lobster_approval",
        objective: "Run Lobster workflow (await_lobster_approval)",
        ownedPaths: [],
        relevantDocs: [],
        invariants: [],
        validationCommands: [],
        contextMode: "isolated-session",
        packetSource: "lobster",
      },
      unitVerificationPolicy: undefined,
      waitJson: {
        kind: "lobster_approval",
        prompt: "Approve this too?",
        items: [{ id: "item-2" }],
        resumeToken: "resume-2",
      },
    });
  });
});
