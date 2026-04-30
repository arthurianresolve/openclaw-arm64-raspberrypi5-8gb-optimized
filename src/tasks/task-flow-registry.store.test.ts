import { statSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  createManagedTaskFlow,
  getTaskFlowById,
  requestFlowCancel,
  resetTaskFlowRegistryForTests,
  setFlowWaiting,
} from "./task-flow-registry.js";
import {
  resolveTaskFlowRegistryDir,
  resolveTaskFlowRegistrySqlitePath,
} from "./task-flow-registry.paths.js";
import { configureTaskFlowRegistryRuntime } from "./task-flow-registry.store.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";

function createStoredFlow(): TaskFlowRecord {
  return {
    flowId: "flow-restored",
    syncMode: "managed",
    ownerKey: "agent:main:main",
    controllerId: "tests/restored-controller",
    revision: 4,
    status: "blocked",
    notifyPolicy: "done_only",
    goal: "Restored flow",
    currentStep: "spawn_task",
    blockedTaskId: "task-restored",
    blockedSummary: "Writable session required.",
    stateJson: { lane: "triage", done: 3 },
    verificationState: {
      status: "failed",
      summary: "Persisted verification state",
      commands: [],
    },
    waitJson: { kind: "task", taskId: "task-restored" },
    cancelRequestedAt: 115,
    createdAt: 100,
    updatedAt: 120,
    endedAt: 120,
  };
}

async function withFlowRegistryTempDir<T>(run: (root: string) => Promise<T>): Promise<T> {
  return await withTempDir({ prefix: "openclaw-task-flow-store-" }, async (root) => {
    process.env.OPENCLAW_STATE_DIR = root;
    resetTaskFlowRegistryForTests();
    try {
      return await run(root);
    } finally {
      resetTaskFlowRegistryForTests();
    }
  });
}

describe("task-flow-registry store runtime", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENCLAW_STATE_DIR;
    resetTaskFlowRegistryForTests();
  });

  it("uses the configured flow store for restore and save", () => {
    const storedFlow = createStoredFlow();
    const loadSnapshot = vi.fn(() => ({
      flows: new Map([[storedFlow.flowId, storedFlow]]),
    }));
    const saveSnapshot = vi.fn();
    configureTaskFlowRegistryRuntime({
      store: {
        loadSnapshot,
        saveSnapshot,
      },
    });

    expect(getTaskFlowById("flow-restored")).toMatchObject({
      flowId: "flow-restored",
      syncMode: "managed",
      controllerId: "tests/restored-controller",
      revision: 4,
      stateJson: { lane: "triage", done: 3 },
      verificationState: {
        status: "failed",
        summary: "Persisted verification state",
        commands: [],
      },
      waitJson: { kind: "task", taskId: "task-restored" },
      cancelRequestedAt: 115,
    });
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    createManagedTaskFlow({
      ownerKey: "agent:main:main",
      controllerId: "tests/new-flow",
      goal: "New flow",
      status: "running",
      currentStep: "wait_for",
    });

    expect(saveSnapshot).toHaveBeenCalled();
    const latestSnapshot = saveSnapshot.mock.calls.at(-1)?.[0] as {
      flows: ReadonlyMap<string, TaskFlowRecord>;
    };
    expect(latestSnapshot.flows.size).toBe(2);
    expect(latestSnapshot.flows.get("flow-restored")?.goal).toBe("Restored flow");
  });

  it("restores persisted wait-state, revision, and cancel intent from sqlite", async () => {
    await withFlowRegistryTempDir(async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskFlowRegistryForTests();

      const created = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/persisted-flow",
        goal: "Persisted flow",
        status: "running",
        currentStep: "spawn_task",
        stateJson: { phase: "spawn" },
      });
      const waiting = setFlowWaiting({
        flowId: created.flowId,
        expectedRevision: created.revision,
        currentStep: "ask_user",
        stateJson: { phase: "ask_user" },
        waitJson: { kind: "external_event", topic: "forum" },
      });
      expect(waiting).toMatchObject({
        applied: true,
      });
      const cancelRequested = requestFlowCancel({
        flowId: created.flowId,
        expectedRevision: waiting.applied ? waiting.flow.revision : -1,
        cancelRequestedAt: 444,
      });
      expect(cancelRequested).toMatchObject({
        applied: true,
      });

      resetTaskFlowRegistryForTests({ persist: false });

      expect(getTaskFlowById(created.flowId)).toMatchObject({
        flowId: created.flowId,
        syncMode: "managed",
        controllerId: "tests/persisted-flow",
        revision: 2,
        status: "waiting",
        currentStep: "ask_user",
        stateJson: { phase: "ask_user" },
        waitJson: { kind: "external_event", topic: "forum" },
        cancelRequestedAt: 444,
      });
    });
  });

  it("migrates legacy stateJson.verification from configured stores into verificationState", () => {
    const storedFlow: TaskFlowRecord = {
      flowId: "flow-legacy-verification",
      syncMode: "managed",
      ownerKey: "agent:main:main",
      controllerId: "tests/restored-controller",
      revision: 1,
      status: "running",
      notifyPolicy: "done_only",
      goal: "Legacy verification flow",
      stateJson: {
        lane: "triage",
        verification: {
          status: "failed",
          summary: "Legacy verification payload",
          commands: [],
        },
      },
      createdAt: 100,
      updatedAt: 100,
    };
    configureTaskFlowRegistryRuntime({
      store: {
        loadSnapshot: () => ({
          flows: new Map([[storedFlow.flowId, storedFlow]]),
        }),
        saveSnapshot: () => {},
      },
    });

    expect(getTaskFlowById(storedFlow.flowId)).toMatchObject({
      flowId: storedFlow.flowId,
      stateJson: { lane: "triage" },
      verificationState: {
        status: "failed",
        summary: "Legacy verification payload",
        commands: [],
      },
    });
  });

  it("round-trips explicit json null through sqlite", async () => {
    await withFlowRegistryTempDir(async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskFlowRegistryForTests();

      const created = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/null-roundtrip",
        goal: "Persist null payloads",
        stateJson: null,
        waitJson: null,
      });

      resetTaskFlowRegistryForTests({ persist: false });

      expect(getTaskFlowById(created.flowId)).toMatchObject({
        flowId: created.flowId,
        stateJson: null,
        waitJson: null,
      });
    });
  });

  it("persists indexed verification summary columns alongside verification_state_json", async () => {
    await withFlowRegistryTempDir(async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskFlowRegistryForTests();

      const created = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/verification-indexes",
        goal: "Persist verification indexes",
        status: "running",
        currentStep: "verification_repair",
        verificationState: {
          status: "failed",
          summary: "Verification failed.",
          commands: [],
          verifiedAt: 222,
          repairTaskId: "task-repair",
          repairAttemptCount: 2,
          repairSuccessCount: 1,
          repairFailureCount: 1,
        },
      });

      const sqlitePath = resolveTaskFlowRegistrySqlitePath(process.env);
      const { DatabaseSync } = requireNodeSqlite();
      const db = new DatabaseSync(sqlitePath);
      const row = db
        .prepare(
          `
            SELECT
              verification_status,
              verification_verified_at,
              verification_repair_task_id,
              verification_requires_repair,
              verification_repair_attempt_count,
              verification_repair_success_count,
              verification_repair_failure_count
            FROM flow_runs
            WHERE flow_id = ?
          `,
        )
        .get(created.flowId) as Record<string, unknown>;
      db.close();

      expect(row).toEqual({
        verification_status: "failed",
        verification_verified_at: 222,
        verification_repair_task_id: "task-repair",
        verification_requires_repair: 1,
        verification_repair_attempt_count: 2,
        verification_repair_success_count: 1,
        verification_repair_failure_count: 1,
      });
    });
  });

  it("hardens the sqlite flow store directory and file modes", async () => {
    if (process.platform === "win32") {
      return;
    }
    await withFlowRegistryTempDir(async (root) => {
      process.env.OPENCLAW_STATE_DIR = root;
      resetTaskFlowRegistryForTests();

      createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/secured-flow",
        goal: "Secured flow",
        status: "blocked",
        blockedTaskId: "task-secured",
        blockedSummary: "Need auth.",
        waitJson: { kind: "task", taskId: "task-secured" },
      });

      const registryDir = resolveTaskFlowRegistryDir(process.env);
      const sqlitePath = resolveTaskFlowRegistrySqlitePath(process.env);
      expect(statSync(registryDir).mode & 0o777).toBe(0o700);
      expect(statSync(sqlitePath).mode & 0o777).toBe(0o600);
    });
  });
});
