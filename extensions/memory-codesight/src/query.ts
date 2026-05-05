import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir } from "openclaw/plugin-sdk/agent-runtime";
import { resolveDefaultAgentId, resolveSessionAgentId } from "openclaw/plugin-sdk/memory-host-core";
import { normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/text-runtime";
import type { OpenClawConfig } from "../api.js";
import type { ResolvedMemoryCodesightConfig } from "./config.js";

const TOKEN_RE = /[\p{L}\p{N}_-]+/gu;
const INDEX_FILES = ["CODESIGHT.md", "KNOWLEDGE.md"] as const;
const WIKI_DIR = "wiki";

type ParsedArtifact = {
  absolutePath: string;
  relativePath: string;
  prefixedPath: string;
  title: string;
  content: string;
  lines: string[];
  mtimeMs: number;
  size: number;
  hash: string;
  stale: boolean;
};

type CachedArtifact = {
  artifact: ParsedArtifact;
  mtimeMs: number;
  size: number;
};

type WorkspaceCache = Map<string, CachedArtifact>;

const workspaceCaches = new Map<string, WorkspaceCache>();
const workspaceFailureCounts = new Map<string, number>();
const WORKSPACE_FAILURE_WARN_THRESHOLD = 3;

function getWorkspaceCache(workspaceDir: string): WorkspaceCache {
  const existing = workspaceCaches.get(workspaceDir);
  if (existing) {
    return existing;
  }
  const created: WorkspaceCache = new Map();
  workspaceCaches.set(workspaceDir, created);
  return created;
}

function hashString(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function tokenize(text: string): string[] {
  return (
    text
      .match(TOKEN_RE)
      ?.map((token) => token.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

function makeTitle(relativePath: string, content: string): string {
  const firstHeader = content.split(/\r?\n/).find((line) => line.trim().startsWith("#"));
  if (firstHeader) {
    return firstHeader.replace(/^#+\s*/, "").trim() || relativePath;
  }
  return path.basename(relativePath, path.extname(relativePath));
}

function resolveArtifactRoot(workspaceDir: string, config: ResolvedMemoryCodesightConfig): string {
  return path.isAbsolute(config.rootDir)
    ? config.rootDir
    : path.join(workspaceDir, config.rootDir.replaceAll("/", path.sep));
}

async function listArtifactPaths(rootDir: string): Promise<{ files: string[]; failed: boolean }> {
  const paths: string[] = [];
  const rootEntries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => null);
  if (!rootEntries) {
    return { files: [], failed: true };
  }
  const hasMarkdownAtRoot = new Set(
    rootEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name),
  );
  for (const fileName of INDEX_FILES) {
    if (hasMarkdownAtRoot.has(fileName)) {
      paths.push(path.join(rootDir, fileName));
    }
  }
  const wikiDir = path.join(rootDir, WIKI_DIR);
  const wikiEntries = await fs.readdir(wikiDir, { withFileTypes: true }).catch(() => []);
  for (const entry of wikiEntries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(path.join(wikiDir, entry.name));
    }
  }
  return {
    files: paths.toSorted((left, right) => left.localeCompare(right)),
    failed: false,
  };
}

async function loadArtifact(params: {
  rootDir: string;
  absolutePath: string;
  config: ResolvedMemoryCodesightConfig;
  nowMs: number;
}): Promise<ParsedArtifact | null> {
  const stat = await fs.stat(params.absolutePath).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }
  if (stat.size > params.config.limits.maxFileBytes) {
    return null;
  }
  const raw = await fs.readFile(params.absolutePath, "utf8").catch(() => null);
  if (raw == null) {
    return null;
  }
  const relativePath = path.relative(params.rootDir, params.absolutePath).replaceAll("\\", "/");
  const staleCutoffMs = params.config.staleAfterHours * 60 * 60 * 1000;
  return {
    absolutePath: params.absolutePath,
    relativePath,
    prefixedPath: `codesight/${relativePath}`,
    title: makeTitle(relativePath, raw),
    content: raw,
    lines: raw.split(/\r?\n/),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    hash: hashString(raw),
    stale: params.nowMs - stat.mtimeMs > staleCutoffMs,
  };
}

async function loadArtifacts(params: {
  workspaceDir: string;
  config: ResolvedMemoryCodesightConfig;
  nowMs: number;
}): Promise<ParsedArtifact[]> {
  const rootDir = resolveArtifactRoot(params.workspaceDir, params.config);
  const { files, failed } = await listArtifactPaths(rootDir);
  const cache = getWorkspaceCache(params.workspaceDir);
  if (failed && cache.size > 0) {
    const nextFailures = (workspaceFailureCounts.get(params.workspaceDir) ?? 0) + 1;
    workspaceFailureCounts.set(params.workspaceDir, nextFailures);
    if (nextFailures >= WORKSPACE_FAILURE_WARN_THRESHOLD) {
      console.warn(
        `[memory-codesight] artifact scan failed for ${params.workspaceDir}; serving last-known-good cache (${nextFailures} consecutive failures).`,
      );
    }
    return Array.from(cache.values()).map((entry) =>
      Object.assign({}, entry.artifact, { stale: true }),
    );
  }
  workspaceFailureCounts.set(params.workspaceDir, 0);
  const nextCache: WorkspaceCache = new Map();
  const artifacts: ParsedArtifact[] = [];

  for (const absolutePath of files) {
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile() || stat.size > params.config.limits.maxFileBytes) {
      continue;
    }
    const previous = cache.get(absolutePath);
    if (previous && previous.mtimeMs === stat.mtimeMs && previous.size === stat.size) {
      nextCache.set(absolutePath, previous);
      artifacts.push({
        ...previous.artifact,
        stale: params.nowMs - previous.artifact.mtimeMs > params.config.staleAfterHours * 3_600_000,
      });
      continue;
    }
    const artifact = await loadArtifact({
      rootDir,
      absolutePath,
      config: params.config,
      nowMs: params.nowMs,
    });
    if (!artifact) {
      continue;
    }
    const cached: CachedArtifact = {
      artifact,
      mtimeMs: artifact.mtimeMs,
      size: artifact.size,
    };
    nextCache.set(absolutePath, cached);
    artifacts.push(artifact);
  }

  workspaceCaches.set(params.workspaceDir, nextCache);
  return artifacts;
}

function scoreArtifact(artifact: ParsedArtifact, query: string): number {
  const queryLower = normalizeLowercaseStringOrEmpty(query);
  if (!queryLower) {
    return 0;
  }
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) {
    return 0;
  }
  const titleLower = normalizeLowercaseStringOrEmpty(artifact.title);
  const pathLower = normalizeLowercaseStringOrEmpty(artifact.prefixedPath);
  const bodyLower = normalizeLowercaseStringOrEmpty(artifact.content);

  let score = 0;
  if (titleLower.includes(queryLower)) {
    score += 25;
  }
  if (pathLower.includes(queryLower)) {
    score += 15;
  }
  if (bodyLower.includes(queryLower)) {
    score += 12;
  }

  const titleTokens = new Set(tokenize(artifact.title));
  const pathTokens = new Set(tokenize(artifact.prefixedPath));
  const bodyTokens = new Set(tokenize(artifact.content));
  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      score += 4.5;
    }
    if (pathTokens.has(token)) {
      score += 3;
    }
    if (bodyTokens.has(token)) {
      score += 1.2;
    }
  }

  if (artifact.stale) {
    score *= 0.9;
  }
  return Math.max(0, Math.min(1, score / 60));
}

function buildSnippet(params: { content: string; query: string; maxChars: number }): string {
  const lines = params.content.split(/\r?\n/);
  const queryLower = normalizeLowercaseStringOrEmpty(params.query);
  const matching = lines.find(
    (line) =>
      normalizeLowercaseStringOrEmpty(line).includes(queryLower) &&
      line.trim().length > 0 &&
      !line.trim().startsWith("#"),
  );
  const firstBody = lines.find((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
  const snippet = (matching ?? firstBody ?? lines[0] ?? "").trim();
  return snippet.length <= params.maxChars ? snippet : `${snippet.slice(0, params.maxChars - 1)}…`;
}

function resolveSearchWorkspace(params: {
  config?: OpenClawConfig;
  agentSessionKey?: string;
}): string | null {
  if (!params.config) {
    return null;
  }
  const agentId = params.agentSessionKey
    ? resolveSessionAgentId({ sessionKey: params.agentSessionKey, config: params.config })
    : resolveDefaultAgentId(params.config);
  if (!agentId) {
    return null;
  }
  return resolveAgentWorkspaceDir(params.config, agentId);
}

function normalizeLookup(value: string): string {
  return value.trim().replaceAll("\\", "/");
}

export async function searchCodesightCorpus(params: {
  query: string;
  maxResults?: number;
  appConfig?: OpenClawConfig;
  agentSessionKey?: string;
  config: ResolvedMemoryCodesightConfig;
  nowMs?: number;
}) {
  const workspaceDir = resolveSearchWorkspace({
    config: params.appConfig,
    agentSessionKey: params.agentSessionKey,
  });
  if (!workspaceDir) {
    return [];
  }
  const nowMs = params.nowMs ?? Date.now();
  const artifacts = await loadArtifacts({
    workspaceDir,
    config: params.config,
    nowMs,
  });
  const scored = artifacts
    .map((artifact) => ({
      artifact,
      score: scoreArtifact(artifact, params.query),
    }))
    .filter((row) => row.score > 0)
    .toSorted((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return left.artifact.prefixedPath.localeCompare(right.artifact.prefixedPath);
    })
    .slice(0, Math.min(params.config.limits.maxFilesPerQuery, artifacts.length));

  const hardLimit = Math.max(1, Math.min(params.maxResults ?? 10, params.config.limits.maxResults));
  return scored.slice(0, hardLimit).map((row) => ({
    corpus: "codesight",
    path: row.artifact.prefixedPath,
    title: row.artifact.title,
    kind: "codesight-artifact",
    score: row.score,
    snippet: buildSnippet({
      content: row.artifact.content,
      query: params.query,
      maxChars: params.config.limits.maxSnippetChars,
    }),
    sourceType: "codesight",
    sourcePath: row.artifact.relativePath,
    provenanceLabel: row.artifact.stale ? "codesight (stale)" : "codesight",
    updatedAt: new Date(row.artifact.mtimeMs).toISOString(),
  }));
}

export async function getCodesightCorpusEntry(params: {
  lookup: string;
  fromLine?: number;
  lineCount?: number;
  appConfig?: OpenClawConfig;
  agentSessionKey?: string;
  config: ResolvedMemoryCodesightConfig;
  nowMs?: number;
}) {
  const workspaceDir = resolveSearchWorkspace({
    config: params.appConfig,
    agentSessionKey: params.agentSessionKey,
  });
  if (!workspaceDir) {
    return null;
  }
  const nowMs = params.nowMs ?? Date.now();
  const artifacts = await loadArtifacts({
    workspaceDir,
    config: params.config,
    nowMs,
  });
  const lookup = normalizeLookup(params.lookup);
  const lookupCandidates = new Set([
    lookup,
    lookup.replace(/^codesight\//, ""),
    `codesight/${lookup.replace(/^codesight\//, "")}`,
  ]);
  const artifact = artifacts.find((entry) => lookupCandidates.has(entry.prefixedPath));
  if (!artifact) {
    return null;
  }
  const fromLine = Math.max(1, Math.floor(params.fromLine ?? 1));
  const requestedLines = Math.max(1, Math.floor(params.lineCount ?? 120));
  const start = fromLine - 1;
  const chunk = artifact.lines.slice(start, start + requestedLines);
  return {
    corpus: "codesight",
    path: artifact.prefixedPath,
    title: artifact.title,
    kind: "codesight-artifact",
    content: chunk.join("\n"),
    fromLine,
    lineCount: chunk.length,
    sourceType: "codesight",
    sourcePath: artifact.relativePath,
    provenanceLabel: artifact.stale ? "codesight (stale)" : "codesight",
    updatedAt: new Date(artifact.mtimeMs).toISOString(),
  };
}

export function _clearCodesightWorkspaceCacheForTests(): void {
  workspaceCaches.clear();
  workspaceFailureCounts.clear();
}
