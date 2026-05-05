import { spawnSync } from "node:child_process";

const DEFAULT_TSC_MAX_OLD_SPACE_MB = 4096;

export function resolveTscMaxOldSpaceMb(env = process.env) {
  const raw = env.OPENCLAW_TSC_MAX_OLD_SPACE_MB?.trim();
  if (!raw) {
    return DEFAULT_TSC_MAX_OLD_SPACE_MB;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TSC_MAX_OLD_SPACE_MB;
  }
  return parsed;
}

function hasMaxOldSpaceSize(nodeOptions = "") {
  return /--max-old-space-size=\d+/u.test(nodeOptions);
}

export function resolveTscSpawnEnv(env = process.env) {
  const nextEnv = { ...env };
  const existingNodeOptions = nextEnv.NODE_OPTIONS?.trim() ?? "";
  if (hasMaxOldSpaceSize(existingNodeOptions)) {
    return nextEnv;
  }
  const maxOldSpaceMb = resolveTscMaxOldSpaceMb(nextEnv);
  nextEnv.NODE_OPTIONS = [existingNodeOptions, `--max-old-space-size=${maxOldSpaceMb}`]
    .filter(Boolean)
    .join(" ");
  return nextEnv;
}

export function runTsc(args = process.argv.slice(2), env = process.env) {
  const result = spawnSync("pnpm", ["exec", "tsc", ...args], {
    stdio: "inherit",
    env: resolveTscSpawnEnv(env),
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

if (import.meta.main) {
  process.exitCode = runTsc();
}
