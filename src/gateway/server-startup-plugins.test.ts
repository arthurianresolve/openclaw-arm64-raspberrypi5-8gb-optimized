import { beforeEach, describe, expect, it, vi } from "vitest";

type ConfiguredDeferredChannelPluginIdsResolver =
  typeof import("../plugins/channel-plugin-ids.js").resolveConfiguredDeferredChannelPluginIds;
type GatewayStartupPluginIdsResolver =
  typeof import("../plugins/channel-plugin-ids.js").resolveGatewayStartupPluginIds;

const applyPluginAutoEnable = vi.hoisted(() =>
  vi.fn((params: { config: unknown }) => ({
    config: params.config,
    changes: [] as string[],
    autoEnabledReasons: {} as Record<string, string[]>,
  })),
);
const initSubagentRegistry = vi.hoisted(() => vi.fn());
const loadGatewayStartupPlugins = vi.hoisted(() =>
  vi.fn((_params: unknown) => ({
    pluginRegistry: { diagnostics: [], gatewayHandlers: {}, plugins: [] },
    gatewayMethods: ["ping"],
  })),
);
const repairBundledRuntimeDepsInstallRoot = vi.hoisted(() => vi.fn((_params: unknown) => ({})));
const resolveBundledRuntimeDependencyPackageInstallRoot = vi.hoisted(() =>
  vi.fn((_packageRoot: string, _params: unknown) => "/runtime"),
);
const resolveConfiguredDeferredChannelPluginIds = vi.hoisted(() =>
  vi.fn<ConfiguredDeferredChannelPluginIdsResolver>(() => []),
);
const resolveGatewayStartupPluginIds = vi.hoisted(() =>
  vi.fn<GatewayStartupPluginIdsResolver>(() => ["memory-core"]),
);
const resolveOpenClawPackageRootSync = vi.hoisted(() => vi.fn((_params: unknown) => "/package"));
const runChannelPluginStartupMaintenance = vi.hoisted(() =>
  vi.fn(async (_params: unknown) => undefined),
);
const runStartupSessionMigration = vi.hoisted(() => vi.fn(async (_params: unknown) => undefined));
const scanBundledPluginRuntimeDeps = vi.hoisted(() =>
  vi.fn((_params: unknown) => ({
    deps: [
      { name: "chokidar", version: "^5.0.0", pluginIds: ["memory-core"] },
      { name: "typebox", version: "^1.0.0", pluginIds: ["memory-core"] },
    ],
    missing: [{ name: "chokidar", version: "^5.0.0", pluginIds: ["memory-core"] }],
    conflicts: [],
  })),
);

vi.mock("../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: () => "/workspace",
  resolveDefaultAgentId: () => "default",
}));

vi.mock("../agents/subagent-registry.js", () => ({
  initSubagentRegistry: () => initSubagentRegistry(),
}));

vi.mock("../channels/plugins/lifecycle-startup.js", () => ({
  runChannelPluginStartupMaintenance: (params: unknown) =>
    runChannelPluginStartupMaintenance(params),
}));

vi.mock("../config/plugin-auto-enable.js", () => ({
  applyPluginAutoEnable: (params: { config: unknown }) => applyPluginAutoEnable(params),
}));

vi.mock("../infra/openclaw-root.js", () => ({
  resolveOpenClawPackageRootSync: (params: unknown) => resolveOpenClawPackageRootSync(params),
}));

vi.mock("../plugins/bundled-runtime-deps.js", () => ({
  repairBundledRuntimeDepsInstallRoot: (params: unknown) =>
    repairBundledRuntimeDepsInstallRoot(params),
  resolveBundledRuntimeDependencyPackageInstallRoot: (packageRoot: string, params: unknown) =>
    resolveBundledRuntimeDependencyPackageInstallRoot(packageRoot, params),
  scanBundledPluginRuntimeDeps: (params: unknown) => scanBundledPluginRuntimeDeps(params),
}));

vi.mock("../plugins/channel-plugin-ids.js", () => ({
  resolveConfiguredDeferredChannelPluginIds: (
    ...args: Parameters<ConfiguredDeferredChannelPluginIdsResolver>
  ) => resolveConfiguredDeferredChannelPluginIds(...args),
  resolveGatewayStartupPluginIds: (...args: Parameters<GatewayStartupPluginIdsResolver>) =>
    resolveGatewayStartupPluginIds(...args),
}));

vi.mock("../plugins/registry.js", () => ({
  createEmptyPluginRegistry: () => ({ diagnostics: [], gatewayHandlers: {}, plugins: [] }),
}));

vi.mock("../plugins/runtime.js", () => ({
  getActivePluginRegistry: () => undefined,
  setActivePluginRegistry: vi.fn(),
}));

vi.mock("./server-methods-list.js", () => ({
  listGatewayMethods: () => ["ping"],
}));

vi.mock("./server-methods.js", () => ({
  coreGatewayHandlers: {},
}));

vi.mock("./server-plugin-bootstrap.js", () => ({
  loadGatewayStartupPlugins: (params: unknown) => loadGatewayStartupPlugins(params),
}));

vi.mock("./server-startup-session-migration.js", () => ({
  runStartupSessionMigration: (params: unknown) => runStartupSessionMigration(params),
}));

function createLog() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe("prepareGatewayPluginBootstrap runtime-deps staging", () => {
  beforeEach(() => {
    applyPluginAutoEnable.mockClear();
    initSubagentRegistry.mockClear();
    loadGatewayStartupPlugins.mockClear();
    repairBundledRuntimeDepsInstallRoot.mockReset().mockReturnValue({});
    resolveBundledRuntimeDependencyPackageInstallRoot.mockClear();
    resolveConfiguredDeferredChannelPluginIds.mockClear().mockReturnValue([]);
    resolveGatewayStartupPluginIds.mockClear().mockReturnValue(["memory-core"]);
    resolveOpenClawPackageRootSync.mockClear().mockReturnValue("/package");
    runChannelPluginStartupMaintenance.mockClear();
    runStartupSessionMigration.mockClear();
    scanBundledPluginRuntimeDeps.mockClear().mockReturnValue({
      deps: [
        { name: "chokidar", version: "^5.0.0", pluginIds: ["memory-core"] },
        { name: "typebox", version: "^1.0.0", pluginIds: ["memory-core"] },
      ],
      missing: [{ name: "chokidar", version: "^5.0.0", pluginIds: ["memory-core"] }],
      conflicts: [],
    });
  });

  it("pre-stages runtime deps for startup-selected memory-core before plugin import", async () => {
    const { prepareGatewayPluginBootstrap } = await import("./server-startup-plugins.js");

    await expect(
      prepareGatewayPluginBootstrap({
        cfgAtStart: {},
        startupRuntimeConfig: {},
        minimalTestGateway: false,
        log: createLog(),
      }),
    ).resolves.toMatchObject({
      baseGatewayMethods: ["ping"],
      startupPluginIds: ["memory-core"],
    });

    expect(scanBundledPluginRuntimeDeps).toHaveBeenCalledWith(
      expect.objectContaining({
        packageRoot: "/package",
        pluginIds: ["memory-core"],
      }),
    );
    expect(repairBundledRuntimeDepsInstallRoot).toHaveBeenCalledWith(
      expect.objectContaining({
        installRoot: "/runtime",
        missingSpecs: ["chokidar@^5.0.0"],
        installSpecs: expect.arrayContaining(["chokidar@^5.0.0", "typebox@^1.0.0"]),
      }),
    );
    expect(repairBundledRuntimeDepsInstallRoot.mock.invocationCallOrder[0]).toBeLessThan(
      loadGatewayStartupPlugins.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
