import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OPENCLAW_PLUGIN_NPM_REPOSITORY_URL } from "../../scripts/lib/plugin-npm-release.ts";
import {
  collectReleaseRegistryChecks,
  verifyReleaseRegistries,
  type ReleaseRegistryCheck,
} from "../../scripts/release-registries-verify.ts";
import { cleanupTempDirs, makeTempRepoRoot } from "../helpers/temp-repo.js";

const tempDirs: string[] = [];

afterEach(() => {
  cleanupTempDirs(tempDirs);
});

describe("collectReleaseRegistryChecks", () => {
  it("collects core npm, plugin npm, and ClawHub checks for one release version", () => {
    const repoDir = makeTempRepoRoot(tempDirs, "openclaw-release-registries-");
    writeJson(join(repoDir, "package.json"), {
      name: "openclaw",
      version: "2026.5.3-beta.4",
    });
    writePluginPackage(repoDir, "discord", {
      publishToNpm: true,
      publishToClawHub: true,
    });

    expect(collectReleaseRegistryChecks({ rootDir: repoDir })).toEqual([
      {
        registry: "clawhub",
        packageName: "@openclaw/discord",
        version: "2026.5.3-beta.4",
        registryBaseUrl: "https://clawhub.ai",
      },
      {
        registry: "npm",
        packageName: "@openclaw/discord",
        version: "2026.5.3-beta.4",
        distTag: "beta",
      },
      {
        registry: "npm",
        packageName: "openclaw",
        version: "2026.5.3-beta.4",
        distTag: "beta",
      },
    ]);
  });
});

describe("verifyReleaseRegistries", () => {
  it("fails when npm dist-tags or ClawHub versions are stale", async () => {
    const checks: ReleaseRegistryCheck[] = [
      {
        registry: "npm",
        packageName: "openclaw",
        version: "2026.5.3-beta.4",
        distTag: "beta",
      },
      {
        registry: "clawhub",
        packageName: "@openclaw/discord",
        version: "2026.5.3-beta.4",
        registryBaseUrl: "https://clawhub.ai",
      },
    ];

    const results = await verifyReleaseRegistries(checks, {
      npmView: (args) => (args[1] === "version" ? "2026.5.3-beta.4" : "2026.5.3-beta.2"),
      clawHubStatus: async () => 404,
    });

    expect(results.map((result) => result.ok)).toEqual([false, false]);
    expect(results[0]?.detail).toContain("dist-tag=2026.5.3-beta.2");
    expect(results[1]?.detail).toBe("HTTP 404");
  });
});

function writePluginPackage(
  repoDir: string,
  extensionId: string,
  release: { publishToNpm: boolean; publishToClawHub: boolean },
) {
  const packageDir = join(repoDir, "extensions", extensionId);
  mkdirSync(packageDir, { recursive: true });
  writeJson(join(packageDir, "package.json"), {
    name: `@openclaw/${extensionId}`,
    version: "2026.5.3-beta.4",
    repository: {
      type: "git",
      url: OPENCLAW_PLUGIN_NPM_REPOSITORY_URL,
    },
    openclaw: {
      extensions: ["./index.ts"],
      install: {
        npmSpec: `@openclaw/${extensionId}`,
      },
      compat: {
        pluginApi: ">=2026.5.3-beta.4",
      },
      build: {
        openclawVersion: "2026.5.3-beta.4",
      },
      release,
    },
  });
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
