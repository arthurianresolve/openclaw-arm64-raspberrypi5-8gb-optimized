#!/usr/bin/env -S node --import tsx

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectClawHubPublishablePluginPackages } from "./lib/plugin-clawhub-release.ts";
import { collectPublishablePluginPackages } from "./lib/plugin-npm-release.ts";

type NpmDistTag = "alpha" | "beta" | "latest";

type NpmRegistryCheck = {
  registry: "npm";
  packageName: string;
  version: string;
  distTag: NpmDistTag;
};

type ClawHubRegistryCheck = {
  registry: "clawhub";
  packageName: string;
  version: string;
  registryBaseUrl: string;
};

export type ReleaseRegistryCheck = NpmRegistryCheck | ClawHubRegistryCheck;

export type ReleaseRegistryResult = ReleaseRegistryCheck & {
  ok: boolean;
  detail: string;
};

export type ReleaseRegistryClients = {
  npmView?: (args: string[]) => string;
  clawHubStatus?: (
    packageName: string,
    version: string,
    registryBaseUrl: string,
  ) => Promise<number>;
};

function readRootVersion(rootDir: string) {
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as {
    version?: unknown;
  };
  if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
    throw new Error("Root package.json version is required.");
  }
  return packageJson.version.trim();
}

function parseDistTag(value: string): NpmDistTag {
  if (value === "alpha" || value === "beta" || value === "latest") {
    return value;
  }
  throw new Error(`Unsupported npm dist-tag: ${value}`);
}

function defaultNpmView(args: string[]) {
  return execFileSync("npm", ["view", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function defaultClawHubStatus(packageName: string, version: string, registryBaseUrl: string) {
  const encodedName = encodeURIComponent(packageName);
  const encodedVersion = encodeURIComponent(version);
  const url = `${registryBaseUrl.replace(/\/+$/u, "")}/api/v1/packages/${encodedName}/versions/${encodedVersion}`;
  const response = await fetch(url);
  return response.status;
}

export function collectReleaseRegistryChecks(params: {
  rootDir?: string;
  version?: string;
  npmDistTag?: NpmDistTag;
  clawHubRegistryBaseUrl?: string;
}): ReleaseRegistryCheck[] {
  const rootDir = resolve(params.rootDir ?? ".");
  const version = params.version ?? readRootVersion(rootDir);
  const npmDistTag = params.npmDistTag ?? "beta";
  const clawHubRegistryBaseUrl =
    params.clawHubRegistryBaseUrl?.trim() ||
    process.env.CLAWHUB_REGISTRY?.trim() ||
    "https://clawhub.ai";
  const checks: ReleaseRegistryCheck[] = [
    {
      registry: "npm",
      packageName: "openclaw",
      version,
      distTag: npmDistTag,
    },
  ];
  const seenNpmPackages = new Set(["openclaw"]);
  for (const plugin of collectPublishablePluginPackages(rootDir)) {
    if (seenNpmPackages.has(plugin.packageName)) {
      continue;
    }
    seenNpmPackages.add(plugin.packageName);
    checks.push({
      registry: "npm",
      packageName: plugin.packageName,
      version,
      distTag: npmDistTag,
    });
  }
  const seenClawHubPackages = new Set<string>();
  for (const plugin of collectClawHubPublishablePluginPackages(rootDir)) {
    if (seenClawHubPackages.has(plugin.packageName)) {
      continue;
    }
    seenClawHubPackages.add(plugin.packageName);
    checks.push({
      registry: "clawhub",
      packageName: plugin.packageName,
      version,
      registryBaseUrl: clawHubRegistryBaseUrl,
    });
  }
  return checks.toSorted((left, right) => {
    const registryCompare = left.registry.localeCompare(right.registry);
    return registryCompare || left.packageName.localeCompare(right.packageName);
  });
}

export async function verifyReleaseRegistries(
  checks: ReleaseRegistryCheck[],
  clients: ReleaseRegistryClients = {},
): Promise<ReleaseRegistryResult[]> {
  const npmView = clients.npmView ?? defaultNpmView;
  const clawHubStatus = clients.clawHubStatus ?? defaultClawHubStatus;
  const results: ReleaseRegistryResult[] = [];

  for (const check of checks) {
    if (check.registry === "npm") {
      try {
        const publishedVersion = npmView([`${check.packageName}@${check.version}`, "version"]);
        const publishedDistTag = npmView([check.packageName, `dist-tags.${check.distTag}`]);
        const ok = publishedVersion === check.version && publishedDistTag === check.version;
        results.push({
          ...check,
          ok,
          detail: ok
            ? `${check.packageName}@${check.version} ${check.distTag}`
            : `expected version/dist-tag ${check.version}, got version=${publishedVersion || "<missing>"} dist-tag=${publishedDistTag || "<missing>"}`,
        });
      } catch (error) {
        results.push({
          ...check,
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    try {
      const status = await clawHubStatus(check.packageName, check.version, check.registryBaseUrl);
      results.push({
        ...check,
        ok: status >= 200 && status < 300,
        detail: `HTTP ${status}`,
      });
    } catch (error) {
      results.push({
        ...check,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function parseArgs(argv: string[]) {
  let version: string | undefined;
  let npmDistTag: NpmDistTag = "beta";
  let rootDir = ".";
  let clawHubRegistryBaseUrl: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      index += 1;
      return value;
    };
    if (arg === "--version") {
      version = next();
    } else if (arg === "--npm-dist-tag") {
      npmDistTag = parseDistTag(next());
    } else if (arg === "--root") {
      rootDir = next();
    } else if (arg === "--clawhub-registry") {
      clawHubRegistryBaseUrl = next();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { rootDir, version, npmDistTag, clawHubRegistryBaseUrl };
}

async function main(argv: string[]) {
  const params = parseArgs(argv);
  const checks = collectReleaseRegistryChecks(params);
  const results = await verifyReleaseRegistries(checks);
  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    const label =
      result.registry === "npm"
        ? `npm ${result.packageName}@${result.version}`
        : `clawhub ${result.packageName}@${result.version}`;
    console.log(`${result.ok ? "ok" : "fail"} ${label}: ${result.detail}`);
  }
  if (failed.length > 0) {
    throw new Error(
      `release registry verification failed for ${failed.length}/${results.length} checks`,
    );
  }
  console.log(`release registry verification passed for ${results.length} checks`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
