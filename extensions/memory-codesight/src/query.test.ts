import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveMemoryCodesightConfig } from "./config.js";
import {
  _clearCodesightWorkspaceCacheForTests,
  getCodesightCorpusEntry,
  searchCodesightCorpus,
} from "./query.js";

const tempDirs: string[] = [];

afterEach(async () => {
  _clearCodesightWorkspaceCacheForTests();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createWorkspace(): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "memory-codesight-test-"));
  tempDirs.push(workspace);
  await fs.mkdir(path.join(workspace, ".codesight", "wiki"), { recursive: true });
  return workspace;
}

function createAppConfig(workspaceDir: string) {
  return {
    agents: {
      defaults: { workspace: workspaceDir },
      list: [{ id: "main", default: true }],
    },
  };
}

describe("searchCodesightCorpus", () => {
  it("reads .codesight artifacts and returns ranked supplement results", async () => {
    const workspace = await createWorkspace();
    await fs.writeFile(
      path.join(workspace, ".codesight", "CODESIGHT.md"),
      "# Project Overview\n\nPayments route uses webhook verification.\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspace, ".codesight", "wiki", "payments.md"),
      "# Payments\n\nStripe webhook handling and billing retries.\n",
      "utf8",
    );
    const config = resolveMemoryCodesightConfig({});

    const results = await searchCodesightCorpus({
      query: "webhook billing",
      appConfig: createAppConfig(workspace),
      config,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.corpus).toBe("codesight");
    expect(results[0]?.path.startsWith("codesight/")).toBe(true);
    expect(results[0]?.sourceType).toBe("codesight");
  });

  it("marks stale artifacts when mtime is old relative to staleAfterHours", async () => {
    const workspace = await createWorkspace();
    const artifactPath = path.join(workspace, ".codesight", "KNOWLEDGE.md");
    await fs.writeFile(artifactPath, "# Knowledge\n\nLegacy decision log.\n", "utf8");
    const now = Date.now();
    const oldMs = now - 8 * 24 * 60 * 60 * 1000;
    await fs.utimes(artifactPath, oldMs / 1000, oldMs / 1000);
    const config = resolveMemoryCodesightConfig({ staleAfterHours: 24 * 3 });

    const results = await searchCodesightCorpus({
      query: "legacy decision",
      appConfig: createAppConfig(workspace),
      config,
      nowMs: now,
    });

    expect(results[0]?.provenanceLabel).toBe("codesight (stale)");
  });

  it("serves last-known-good cache when artifact root becomes unreadable", async () => {
    const workspace = await createWorkspace();
    const codesightDir = path.join(workspace, ".codesight");
    await fs.writeFile(
      path.join(codesightDir, "CODESIGHT.md"),
      "# Project Overview\n\nresilient cache check\n",
      "utf8",
    );
    const config = resolveMemoryCodesightConfig({});
    const appConfig = createAppConfig(workspace);

    const first = await searchCodesightCorpus({
      query: "resilient",
      appConfig,
      config,
    });
    expect(first).toHaveLength(1);

    await fs.rename(codesightDir, `${codesightDir}.offline`);
    const second = await searchCodesightCorpus({
      query: "resilient",
      appConfig,
      config,
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.provenanceLabel).toBe("codesight (stale)");
  });
});

describe("getCodesightCorpusEntry", () => {
  it("returns requested lines for a prefixed lookup path", async () => {
    const workspace = await createWorkspace();
    await fs.writeFile(
      path.join(workspace, ".codesight", "wiki", "auth.md"),
      "# Auth\n\nline-1\nline-2\nline-3\nline-4\n",
      "utf8",
    );
    const config = resolveMemoryCodesightConfig({});

    const entry = await getCodesightCorpusEntry({
      lookup: "codesight/wiki/auth.md",
      fromLine: 3,
      lineCount: 2,
      appConfig: createAppConfig(workspace),
      config,
    });

    expect(entry?.corpus).toBe("codesight");
    expect(entry?.path).toBe("codesight/wiki/auth.md");
    expect(entry?.fromLine).toBe(3);
    expect(entry?.lineCount).toBe(2);
    expect(entry?.content).toContain("line-1");
  });
});
