#!/usr/bin/env -S node --import tsx

import { cwd } from "node:process";
import tsdownConfig from "../tsdown.config.ts";
import { collectRootPackageExcludedExtensionDirs } from "./lib/bundled-plugin-build-entries.mjs";

type TsdownConfigEntry = {
  entry?: Record<string, string> | string[];
};

function asConfigArray(config: unknown): TsdownConfigEntry[] {
  return Array.isArray(config) ? (config as TsdownConfigEntry[]) : [config as TsdownConfigEntry];
}

function entrySources(config: TsdownConfigEntry): Record<string, string> {
  if (!config.entry || Array.isArray(config.entry)) {
    return {};
  }
  return config.entry;
}

function findRootDistGraph(): TsdownConfigEntry | undefined {
  return asConfigArray(tsdownConfig).find((config) => {
    const entries = entrySources(config);
    return entries["plugins/runtime/index"] === "src/plugins/runtime/index.ts";
  });
}

function entryReferencesPlugin(params: { entryKey: string; pluginId: string; source: string }) {
  const pluginEntryPrefix = `extensions/${params.pluginId}/`;
  return (
    params.entryKey === `extensions/${params.pluginId}` ||
    params.entryKey.startsWith(pluginEntryPrefix) ||
    params.source === `extensions/${params.pluginId}` ||
    params.source.startsWith(pluginEntryPrefix)
  );
}

function collectErrors(params: {
  excludedPluginIds: readonly string[];
  rootEntries: Record<string, string>;
}) {
  const errors: string[] = [];
  for (const pluginId of params.excludedPluginIds) {
    for (const [entryKey, source] of Object.entries(params.rootEntries)) {
      if (entryReferencesPlugin({ entryKey, pluginId, source })) {
        errors.push(
          `root package excludes dist/extensions/${pluginId}/**, but tsdown root entry "${entryKey}" still builds ${source}`,
        );
      }
    }
  }
  return errors;
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const excludedPluginIds = [...collectRootPackageExcludedExtensionDirs({ cwd: cwd() })].toSorted(
    (left, right) => left.localeCompare(right),
  );
  const rootGraph = findRootDistGraph();
  const rootEntries = rootGraph ? entrySources(rootGraph) : {};
  const errors = rootGraph
    ? collectErrors({ excludedPluginIds, rootEntries })
    : ["could not find tsdown root dist graph"];

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: errors.length === 0,
          excludedPluginIds,
          rootEntryCount: Object.keys(rootEntries).length,
          errors,
        },
        null,
        2,
      ),
    );
  } else if (errors.length === 0) {
    console.log(
      `root package exclusions synced: ${excludedPluginIds.length} excluded plugin dirs omitted from ${Object.keys(rootEntries).length} root tsdown entries.`,
    );
  } else {
    for (const error of errors) {
      console.error(`[root-package-exclusions] ${error}`);
    }
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
