#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function isExecutableCandidate(candidate) {
  return typeof candidate === "string" && candidate.length > 0 && existsSync(candidate);
}

function* markdownlintBinaryCandidates() {
  const explicit = process.env.OPENCLAW_MARKDOWNLINT_CLI2_BIN;
  if (isExecutableCandidate(explicit)) {
    yield explicit;
  }

  const local = path.join(process.cwd(), "node_modules", ".bin", "markdownlint-cli2");
  if (isExecutableCandidate(local)) {
    yield local;
  }

  const dlxRoot = path.join(homedir(), ".cache", "pnpm", "dlx");
  if (!existsSync(dlxRoot)) {
    return;
  }
  for (const hashDir of readdirSync(dlxRoot, { withFileTypes: true })) {
    if (!hashDir.isDirectory()) {
      continue;
    }
    const cached = path.join(
      dlxRoot,
      hashDir.name,
      "pkg",
      "node_modules",
      ".bin",
      "markdownlint-cli2",
    );
    if (isExecutableCandidate(cached)) {
      yield cached;
    }
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
for (const candidate of markdownlintBinaryCandidates()) {
  run(candidate, args);
}

run("pnpm", ["dlx", "markdownlint-cli2", ...args]);
