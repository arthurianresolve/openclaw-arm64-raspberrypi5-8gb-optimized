import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { createRunningTaskRun } from "./task-executor.js";
import {
  createManagedTaskFlow,
  getTaskFlowById,
  listTaskFlowRecords,
  requestFlowCancel,
  resetTaskFlowRegistryForTests,
} from "./task-flow-registry.js";
import {
  previewTaskFlowRegistryMaintenance,
  runTaskFlowRegistryMaintenance,
} from "./task-flow-registry.maintenance.js";
import { configureTaskFlowRegistryRuntime } from "./task-flow-registry.store.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";
import {
  resetTaskRegistryDeliveryRuntimeForTests,
  resetTaskRegistryForTests,
} from "./task-registry.js";

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;

async function withTaskFlowMaintenanceStateDir(
  run: (root: string) => Promise<void>,
): Promise<void> {
  await withTempDir({ prefix: "openclaw-task-flow-maintenance-" }, async (root) => {
    process.env.OPENCLAW_STATE_DIR = root;
    resetTaskRegistryDeliveryRuntimeForTests();
    resetTaskRegistryForTests();
    resetTaskFlowRegistryForTests();
    try {
      await run(root);
    } finally {
      resetTaskRegistryDeliveryRuntimeForTests();
      resetTaskRegistryForTests();
      resetTaskFlowRegistryForTests();
    }
  });
}

describe("task-flow-registry maintenance", () => {
  afterEach(() => {
    if (ORIGINAL_STATE_DIR === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
    }
    resetTaskRegistryDeliveryRuntimeForTests();
    resetTaskRegistryForTests();
    resetTaskFlowRegistryForTests();
  });

  it("finalizes cancel-requested managed flows once no child tasks remain active", async () => {
    await withTaskFlowMaintenanceStateDir(async () => {
      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/task-flow-maintenance",
        goal: "Cancel work",
        status: "running",
        cancelRequestedAt: 100,
        createdAt: 1,
        updatedAt: 100,
      });

      expect(previewTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 1,
        pruned: 0,
        backfilled: 0,
      });

      expect(await runTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 1,
        pruned: 0,
        backfilled: 0,
      });
      expect(getTaskFlowById(flow.flowId)).toMatchObject({
        flowId: flow.flowId,
        status: "cancelled",
        cancelRequestedAt: 100,
      });
    });
  });

  it("prunes old terminal flows", async () => {
    await withTaskFlowMaintenanceStateDir(async () => {
      const now = Date.now();
      const oldFlow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/task-flow-maintenance",
        goal: "Old terminal flow",
        status: "succeeded",
        createdAt: now - 8 * 24 * 60 * 60_000,
        updatedAt: now - 8 * 24 * 60 * 60_000,
        endedAt: now - 8 * 24 * 60 * 60_000,
      });

      expect(previewTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 0,
        pruned: 1,
        backfilled: 0,
      });

      expect(await runTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 0,
        pruned: 1,
        backfilled: 0,
      });
      expect(getTaskFlowById(oldFlow.flowId)).toBeUndefined();
    });
  });

  it("does not finalize cancel-requested flows while a child task is still active", async () => {
    await withTaskFlowMaintenanceStateDir(async () => {
      const flow = createManagedTaskFlow({
        ownerKey: "agent:main:main",
        controllerId: "tests/task-flow-maintenance",
        goal: "Wait for child cancel",
        status: "running",
        createdAt: 1,
        updatedAt: 100,
      });

      const child = createRunningTaskRun({
        runtime: "acp",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        parentFlowId: flow.flowId,
        childSessionKey: "agent:main:child",
        runId: "run-active-child",
        task: "Inspect repo",
        startedAt: 100,
        lastEventAt: 100,
      });

      expect(
        requestFlowCancel({
          flowId: flow.flowId,
          expectedRevision: flow.revision,
          cancelRequestedAt: 100,
          updatedAt: 100,
        }),
      ).toMatchObject({
        applied: true,
        flow: expect.objectContaining({
          flowId: flow.flowId,
          cancelRequestedAt: 100,
        }),
      });

      expect(previewTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 0,
        pruned: 0,
        backfilled: 0,
      });

      expect(await runTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 0,
        pruned: 0,
        backfilled: 0,
      });
      expect(getTaskFlowById(flow.flowId)).toMatchObject({
        flowId: flow.flowId,
        status: "running",
        cancelRequestedAt: 100,
      });
      expect(child.parentFlowId).toBe(flow.flowId);
    });
  });

  it("prunes many old terminal flows while keeping fresh and active ones", async () => {
    await withTaskFlowMaintenanceStateDir(async () => {
      const now = Date.now();

      for (let index = 0; index < 25; index += 1) {
        createManagedTaskFlow({
          ownerKey: `agent:main:${index}`,
          controllerId: "tests/task-flow-maintenance",
          goal: `Old terminal flow ${index}`,
          status: "succeeded",
          createdAt: now - 8 * 24 * 60 * 60_000 - index,
          updatedAt: now - 8 * 24 * 60 * 60_000 - index,
          endedAt: now - 8 * 24 * 60 * 60_000 - index,
        });
      }

      const fresh = createManagedTaskFlow({
        ownerKey: "agent:main:fresh",
        controllerId: "tests/task-flow-maintenance",
        goal: "Fresh terminal flow",
        status: "succeeded",
        createdAt: now - 2 * 24 * 60 * 60_000,
        updatedAt: now - 2 * 24 * 60 * 60_000,
        endedAt: now - 2 * 24 * 60 * 60_000,
      });

      const running = createManagedTaskFlow({
        ownerKey: "agent:main:running",
        controllerId: "tests/task-flow-maintenance",
        goal: "Active flow",
        status: "running",
        createdAt: now - 60_000,
        updatedAt: now - 60_000,
      });

      expect(previewTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 0,
        pruned: 25,
        backfilled: 0,
      });

      expect(await runTaskFlowRegistryMaintenance()).toEqual({
        reconciled: 0,
        pruned: 25,
        backfilled: 0,
      });

      const remainingFlowIds = new Set(listTaskFlowRecords().map((flow) => flow.flowId));
      expect(remainingFlowIds).toEqual(new Set([fresh.flowId, running.flowId]));
    });
  });

  it("backfills legacy verification payloads from the persisted flow store", async () => {
    const legacyFlow: TaskFlowRecord = {
      flowId: "flow-legacy-maintenance",
      syncMode: "managed",
      ownerKey: "agent:main:main",
      controllerId: "tests/task-flow-maintenance",
      revision: 2,
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
      createdAt: 10,
      updatedAt: 10,
    };
    const saveSnapshot = vi.fn();
    configureTaskFlowRegistryRuntime({
      store: {
        loadSnapshot: () => ({
          flows: new Map([[legacyFlow.flowId, legacyFlow]]),
        }),
        saveSnapshot,
      },
    });

    expect(previewTaskFlowRegistryMaintenance()).toEqual({
      reconciled: 0,
      pruned: 0,
      backfilled: 1,
    });

    expect(await runTaskFlowRegistryMaintenance()).toEqual({
      reconciled: 0,
      pruned: 0,
      backfilled: 1,
    });
    const savedSnapshot = saveSnapshot.mock.calls.at(-1)?.[0] as {
      flows: ReadonlyMap<string, TaskFlowRecord>;
    };
    expect(savedSnapshot.flows.get(legacyFlow.flowId)).toMatchObject({
      flowId: legacyFlow.flowId,
      stateJson: { lane: "triage" },
      verificationState: {
        status: "failed",
        summary: "Legacy verification payload",
        commands: [],
      },
    });
  });
});
