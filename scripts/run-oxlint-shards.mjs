import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const extraArgs = process.argv.slice(2);
const runner = path.resolve("scripts", "run-oxlint.mjs");
// Raspberry Pi 5 8GB on arm64 needs a tighter per-process heap and smaller
// file batches so lint stays sequential and avoids memory pressure.
const MAX_OLD_SPACE_MB = 4096;
const MAX_FILES_PER_SHARD = readPositiveInt(process.env.OPENCLAW_OXLINT_MAX_FILES_PER_SHARD, 600);

const prepareResult = spawnSync(
  process.execPath,
  [path.resolve("scripts", "prepare-extension-package-boundary-artifacts.mjs")],
  {
    stdio: "inherit",
    env: process.env,
  },
);

if (prepareResult.error) {
  throw prepareResult.error;
}
if ((prepareResult.status ?? 1) !== 0) {
  process.exit(prepareResult.status ?? 1);
}

const shardGroups = [
  {
    name: "core",
    tsconfig: "tsconfig.oxlint.core.json",
    targets: ["src", "ui", "packages"],
  },
  {
    name: "extensions",
    tsconfig: "tsconfig.oxlint.extensions.json",
    targets: ["extensions"],
  },
  {
    name: "scripts",
    tsconfig: "tsconfig.oxlint.scripts.json",
    targets: ["scripts"],
  },
];

const shards = [];
for (const group of shardGroups) {
  const chunks = expandTargetsToChunks(group.targets, MAX_FILES_PER_SHARD);
  if (chunks.length === 0) {
    shards.push({
      name: group.name,
      args: ["--tsconfig", group.tsconfig, ...group.targets],
    });
    continue;
  }

  for (const [index, chunk] of chunks.entries()) {
    const suffix = chunks.length > 1 ? ` ${index + 1}/${chunks.length}` : "";
    shards.push({
      name: `${group.name}${suffix}`,
      args: ["--tsconfig", group.tsconfig, ...chunk],
    });
  }
}

let exitCode = 0;
for (const shard of shards) {
  const status = await runShard(shard);
  if (status !== 0) {
    exitCode = status;
    break;
  }
}
process.exitCode = exitCode;

async function runShard(shard) {
  console.error(`[oxlint:${shard.name}] starting`);
  const child = spawn(process.execPath, [runner, ...shard.args, ...extraArgs], {
    stdio: "inherit",
    env: {
      ...withMaxOldSpaceLimit(process.env),
      OPENCLAW_OXLINT_SKIP_LOCK: "1",
      OPENCLAW_OXLINT_SKIP_PREPARE: "1",
    },
  });

  return await new Promise((resolve) => {
    child.once("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.once("close", (status) => {
      console.error(`[oxlint:${shard.name}] finished`);
      resolve(status ?? 1);
    });
  });
}

function expandTargetsToChunks(targets, maxFilesPerShard) {
  const files = listFilesForTargets(targets);
  if (files.length === 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < files.length; index += maxFilesPerShard) {
    chunks.push(files.slice(index, index + maxFilesPerShard));
  }
  return chunks;
}

function listFilesForTargets(targets) {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...targets],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .toSorted((left, right) => left.localeCompare(right));
}

function readPositiveInt(rawValue, fallback) {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function withMaxOldSpaceLimit(env) {
  const existing = env.NODE_OPTIONS?.trim();
  const maxOldSpaceFlag = `--max-old-space-size=${MAX_OLD_SPACE_MB}`;
  if (existing?.includes(maxOldSpaceFlag)) {
    return env;
  }

  return {
    ...env,
    NODE_OPTIONS: existing ? `${existing} ${maxOldSpaceFlag}` : maxOldSpaceFlag,
  };
}
