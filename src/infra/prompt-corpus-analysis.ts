import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeStructuredPromptSection } from "../agents/prompt-cache-stability.js";
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from "../agents/system-prompt-cache-boundary.js";

export type PromptCorpusRepeatedBlock = {
  text: string;
  count: number;
};

export type PromptCorpusSectionCount = {
  heading: string;
  count: number;
};

export type PromptCorpusAnalysis = {
  chars: number;
  estimatedTokens: number;
  lineCount: number;
  sectionCount: number;
  sectionHistogram: PromptCorpusSectionCount[];
  repeatedBlocks: PromptCorpusRepeatedBlock[];
  cacheBoundaryIndex: number | null;
  stablePrefixChars: number;
  volatileSuffixChars: number;
};

export type PromptCorpusComparison = {
  charsDelta: number;
  estimatedTokensDelta: number;
  lineCountDelta: number;
  sectionCountDelta: number;
  stablePrefixCharsDelta: number;
  volatileSuffixCharsDelta: number;
};

export type PromptCorpusManifestFile = {
  path: string;
  reason?: string;
};

export type PromptCorpusManifest = {
  id: string;
  repo: string;
  license?: string;
  usage: string;
  pinnedCommit: string;
  files: PromptCorpusManifestFile[];
};

export type PromptCorpusResolvedManifest = {
  id: string;
  repo: string;
  repositoryUrl: string;
  ref: {
    type: "commit";
    value: string;
  };
  license?: string;
  usage: string;
  files: PromptCorpusManifestFile[];
};

export type PromptCorpusFetchSummary = {
  manifest: PromptCorpusResolvedManifest;
  cache: {
    corpusDir: string;
  };
  counts: {
    downloaded: number;
    cached: number;
    dryRun: number;
    failed: number;
  };
  warnings: string[];
  files: Array<{
    path: string;
    status: "downloaded" | "cached" | "planned" | "failed";
    error?: string;
    sha256?: string;
    bytes?: number;
  }>;
};

export type PromptCorpusAnalysisSample = {
  path: string;
  status: "analyzed" | "missing";
  analysis?: PromptCorpusAnalysis;
  error?: string;
};

export type PromptCorpusAnalyzeSummary = {
  manifest: PromptCorpusResolvedManifest;
  cache: {
    corpusDir: string;
  };
  warnings: string[];
  openclawSamples: PromptCorpusAnalysisSample[];
  externalSamples: PromptCorpusAnalysisSample[];
  aggregates: {
    openclaw: {
      count: number;
      maxEstimatedTokens: number;
    };
    external: {
      count: number;
      maxEstimatedTokens: number;
    };
  };
};

const HEADING_RE = /^#{1,6}\s+(.+)$/gm;

function estimatePromptTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

function normalizeBlock(block: string): string {
  return normalizeStructuredPromptSection(block).replace(/\s+/g, " ").trim().toLowerCase();
}

function countHeadings(text: string): PromptCorpusSectionCount[] {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(HEADING_RE)) {
    const heading = normalizeStructuredPromptSection(match[1] ?? "");
    if (!heading) {
      continue;
    }
    counts.set(heading, (counts.get(heading) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([heading, count]) => ({ heading, count }))
    .toSorted(
      (left, right) => right.count - left.count || left.heading.localeCompare(right.heading),
    );
}

function countRepeatedBlocks(text: string): PromptCorpusRepeatedBlock[] {
  const counts = new Map<string, { text: string; count: number }>();
  for (const block of text.split(/\n\s*\n+/g)) {
    const normalized = normalizeBlock(block);
    if (!normalized) {
      continue;
    }
    const existing = counts.get(normalized);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(normalized, { text: normalizeStructuredPromptSection(block), count: 1 });
  }
  return [...counts.values()]
    .filter((entry) => entry.count > 1)
    .toSorted((left, right) => right.count - left.count || right.text.length - left.text.length);
}

function isValidSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRepoPath(repoPath: string): string {
  return repoPath.split("/").filter(Boolean).join("/");
}

function sanitizeRelativePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath);
  if (!normalized || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid manifest path: ${filePath}`);
  }
  return normalized;
}

function encodeRepoPath(filePath: string): string {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath: string): Promise<unknown> {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function resolveManifestPath(repoRoot: string, manifestPath?: string): string {
  if (!manifestPath) {
    return path.resolve(
      repoRoot,
      "qa/external-corpora/piebald-claude-code-system-prompts.manifest.json",
    );
  }
  return path.isAbsolute(manifestPath) ? manifestPath : path.resolve(repoRoot, manifestPath);
}

function resolveCacheRoot(repoRoot: string, cacheRoot?: string): string {
  if (!cacheRoot) {
    return path.resolve(repoRoot, "qa/.cache/external-corpora");
  }
  return path.isAbsolute(cacheRoot) ? cacheRoot : path.resolve(repoRoot, cacheRoot);
}

function normalizeManifest(raw: unknown): PromptCorpusManifest {
  if (!isObject(raw)) {
    throw new Error("Manifest must be an object");
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const repo = typeof raw.repo === "string" ? raw.repo.trim() : "";
  const license = typeof raw.license === "string" ? raw.license.trim() : undefined;
  const usage = typeof raw.usage === "string" ? raw.usage.trim() : "";
  const pinnedCommit = typeof raw.pinnedCommit === "string" ? raw.pinnedCommit.trim() : "";
  if (!id) {
    throw new Error("Manifest id is required");
  }
  if (!repo) {
    throw new Error("Manifest repo is required");
  }
  if (usage !== "eval-only") {
    throw new Error("Manifest usage must be eval-only");
  }
  if (!isValidSha(pinnedCommit)) {
    throw new Error("Manifest pinnedCommit must be a full 40-character commit SHA");
  }
  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new Error("Manifest must include at least one allowlisted file");
  }
  const files = raw.files.map((entry) => {
    if (!isObject(entry)) {
      throw new Error("Manifest file entry must be an object");
    }
    const filePath = typeof entry.path === "string" ? entry.path.trim() : "";
    if (!filePath) {
      throw new Error("Manifest file entry path is required");
    }
    const normalized: PromptCorpusManifestFile = {
      path: sanitizeRelativePath(filePath),
    };
    if (typeof entry.reason === "string" && entry.reason.trim()) {
      normalized.reason = entry.reason.trim();
    }
    return normalized;
  });
  return { id, repo: normalizeRepoPath(repo), license, usage, pinnedCommit, files };
}

function resolveManifest(manifest: PromptCorpusManifest): PromptCorpusResolvedManifest {
  return {
    id: manifest.id,
    repo: manifest.repo,
    repositoryUrl: `https://github.com/${manifest.repo}`,
    ref: {
      type: "commit",
      value: manifest.pinnedCommit,
    },
    license: manifest.license,
    usage: manifest.usage,
    files: manifest.files,
  };
}

function createAnalysisAggregate(samples: PromptCorpusAnalysisSample[]): {
  count: number;
  maxEstimatedTokens: number;
} {
  const analyzed = samples.filter(
    (sample): sample is PromptCorpusAnalysisSample & { analysis: PromptCorpusAnalysis } =>
      sample.status === "analyzed" && Boolean(sample.analysis),
  );
  return {
    count: analyzed.length,
    maxEstimatedTokens: analyzed.reduce(
      (max, sample) => Math.max(max, sample.analysis.estimatedTokens),
      0,
    ),
  };
}

async function fetchUrlText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

export function analyzePromptCorpusText(text: string): PromptCorpusAnalysis {
  const normalized = typeof text === "string" ? text : "";
  const chars = normalized.length;
  const boundaryIndex = normalized.indexOf(SYSTEM_PROMPT_CACHE_BOUNDARY);
  const stablePrefixChars = boundaryIndex >= 0 ? boundaryIndex : chars;
  const volatileSuffixChars =
    boundaryIndex >= 0 ? chars - boundaryIndex - SYSTEM_PROMPT_CACHE_BOUNDARY.length : 0;
  const sectionHistogram = countHeadings(normalized);
  const repeatedBlocks = countRepeatedBlocks(normalized);

  return {
    chars,
    estimatedTokens: estimatePromptTokens(chars),
    lineCount: normalized.length > 0 ? normalized.split("\n").length : 0,
    sectionCount: sectionHistogram.reduce((sum, entry) => sum + entry.count, 0),
    sectionHistogram,
    repeatedBlocks,
    cacheBoundaryIndex: boundaryIndex >= 0 ? boundaryIndex : null,
    stablePrefixChars,
    volatileSuffixChars,
  };
}

export function comparePromptCorpusAnalyses(
  base: PromptCorpusAnalysis,
  head: PromptCorpusAnalysis,
): PromptCorpusComparison {
  return {
    charsDelta: head.chars - base.chars,
    estimatedTokensDelta: head.estimatedTokens - base.estimatedTokens,
    lineCountDelta: head.lineCount - base.lineCount,
    sectionCountDelta: head.sectionCount - base.sectionCount,
    stablePrefixCharsDelta: head.stablePrefixChars - base.stablePrefixChars,
    volatileSuffixCharsDelta: head.volatileSuffixChars - base.volatileSuffixChars,
  };
}

export async function fetchExternalPromptCorpus(params: {
  repoRoot: string;
  manifestPath?: string;
  cacheRoot?: string;
  dryRun?: boolean;
}): Promise<PromptCorpusFetchSummary> {
  const resolvedManifestPath = resolveManifestPath(params.repoRoot, params.manifestPath);
  const resolvedCacheRoot = resolveCacheRoot(params.repoRoot, params.cacheRoot);
  const manifest = resolveManifest(normalizeManifest(await readJson(resolvedManifestPath)));
  const corpusDir = path.join(resolvedCacheRoot, manifest.id);
  if (params.dryRun !== true) {
    await ensureDir(corpusDir);
  }

  const summary: PromptCorpusFetchSummary = {
    manifest,
    cache: {
      corpusDir,
    },
    counts: {
      downloaded: 0,
      cached: 0,
      dryRun: 0,
      failed: 0,
    },
    warnings: [],
    files: [],
  };

  for (const entry of manifest.files) {
    const targetPath = path.join(corpusDir, entry.path);
    if (params.dryRun === true) {
      summary.counts.dryRun += 1;
      summary.files.push({ path: entry.path, status: "planned" });
      continue;
    }

    const cached = await readTextIfExists(targetPath);
    if (cached !== undefined) {
      summary.counts.cached += 1;
      summary.files.push({
        path: entry.path,
        status: "cached",
        bytes: Buffer.byteLength(cached, "utf8"),
        sha256: sha256(cached),
      });
      continue;
    }

    try {
      const rawUrl = `https://raw.githubusercontent.com/${manifest.repo}/${manifest.ref.value}/${encodeRepoPath(entry.path)}`;
      const contents = await fetchUrlText(rawUrl);
      await ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, contents, "utf8");
      summary.counts.downloaded += 1;
      summary.files.push({
        path: entry.path,
        status: "downloaded",
        bytes: Buffer.byteLength(contents, "utf8"),
        sha256: sha256(contents),
      });
    } catch (error) {
      summary.counts.failed += 1;
      summary.files.push({
        path: entry.path,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const indexPath = path.join(corpusDir, "index.json");
  if (params.dryRun !== true) {
    await fs.writeFile(
      indexPath,
      `${JSON.stringify(
        {
          id: manifest.id,
          repo: manifest.repo,
          pinnedCommit: manifest.ref.value,
          usage: manifest.usage,
          license: manifest.license,
          fetchedAt: new Date().toISOString(),
          files: summary.files,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return summary;
}

export async function analyzePromptCorpus(params: {
  repoRoot: string;
  manifestPath?: string;
  cacheRoot?: string;
  openclawSamples?: PromptCorpusAnalysisSample[];
}): Promise<PromptCorpusAnalyzeSummary> {
  const resolvedManifestPath = resolveManifestPath(params.repoRoot, params.manifestPath);
  const resolvedCacheRoot = resolveCacheRoot(params.repoRoot, params.cacheRoot);
  const manifest = resolveManifest(normalizeManifest(await readJson(resolvedManifestPath)));
  const corpusDir = path.join(resolvedCacheRoot, manifest.id);
  const warnings: string[] = [];

  const openclawSamples = params.openclawSamples ?? [];
  const externalSamples: PromptCorpusAnalysisSample[] = [];

  for (const entry of manifest.files) {
    const targetPath = path.join(corpusDir, entry.path);
    const contents = await readTextIfExists(targetPath);
    if (contents === undefined) {
      externalSamples.push({
        path: entry.path,
        status: "missing",
      });
      continue;
    }
    externalSamples.push({
      path: entry.path,
      status: "analyzed",
      analysis: analyzePromptCorpusText(contents),
    });
  }

  if (!(await pathExists(corpusDir))) {
    warnings.push(`Cache directory does not exist yet: ${corpusDir}`);
  }

  return {
    manifest,
    cache: {
      corpusDir,
    },
    warnings,
    openclawSamples,
    externalSamples,
    aggregates: {
      openclaw: createAnalysisAggregate(openclawSamples),
      external: createAnalysisAggregate(externalSamples),
    },
  };
}
