#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_MANIFEST = new URL(
  "../qa/external-corpora/piebald-claude-code-system-prompts.manifest.json",
  import.meta.url,
);
const DEFAULT_OUTPUT_DIR = new URL(
  "../qa/.cache/external-corpora/piebald-claude-code-system-prompts",
  import.meta.url,
);

function parseArgs(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--manifest" && next) {
      options.manifest = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      options.outDir = next;
      index += 1;
    } else if (arg === "--help") {
      options.help = true;
    }
  }
  return options;
}

function isValidSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function normalizeRepoPath(repoPath) {
  return repoPath.split("/").filter(Boolean).join("/");
}

function sanitizeManifestPath(filePath) {
  const normalized = path.posix.normalize(filePath);
  if (!normalized || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid manifest path: ${filePath}`);
  }
  return normalized;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function encodeRepoPath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(
      "Usage: node scripts/fetch-external-prompt-corpus.mjs [--manifest <path>] [--out-dir <path>]",
    );
    process.exit(0);
  }

  const manifestPath = path.resolve(
    process.cwd(),
    options.manifest ?? fileURLToPath(DEFAULT_MANIFEST),
  );
  const outputDir = path.resolve(
    process.cwd(),
    options.outDir ?? fileURLToPath(DEFAULT_OUTPUT_DIR),
  );

  const manifest = await readJson(manifestPath);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Manifest must be an object");
  }
  if (manifest.usage !== "eval-only") {
    throw new Error("Manifest usage must be eval-only");
  }
  if (typeof manifest.repo !== "string" || !manifest.repo.trim()) {
    throw new Error("Manifest repo is required");
  }
  if (!isValidSha(manifest.pinnedCommit)) {
    throw new Error("Manifest pinnedCommit must be a full 40-character commit SHA");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Manifest must include at least one allowlisted file");
  }

  const repo = normalizeRepoPath(manifest.repo);
  await ensureDir(outputDir);

  const index = {
    id: manifest.id,
    repo,
    pinnedCommit: manifest.pinnedCommit,
    usage: manifest.usage,
    license: manifest.license,
    fetchedAt: new Date().toISOString(),
    files: [],
  };

  for (const entry of manifest.files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Manifest file entry must be an object");
    }
    const filePath = sanitizeManifestPath(entry.path);
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${manifest.pinnedCommit}/${encodeRepoPath(filePath)}`;
    const contents = await fetchText(rawUrl);
    const targetPath = path.join(outputDir, filePath);
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, contents, "utf8");
    index.files.push({
      path: filePath,
      reason: typeof entry.reason === "string" ? entry.reason : undefined,
      bytes: Buffer.byteLength(contents, "utf8"),
      sha256: sha256(contents),
    });
  }

  await fs.writeFile(
    path.join(outputDir, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8",
  );
  console.log(`Fetched ${index.files.length} files into ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
