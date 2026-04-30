import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildSubagentSystemPrompt } from "../agents/subagent-system-prompt.js";
import { buildAgentSystemPrompt } from "../agents/system-prompt.js";
import { estimateStringChars, estimateTokensFromChars } from "../utils/cjk-chars.js";

export type ExternalPromptCorpusRef = {
  type: "branch" | "commit";
  value: string;
};

export type ExternalPromptCorpusFile = {
  path: string;
  kind: string;
  label?: string;
  notes?: string;
};

export type ExternalPromptCorpusManifest = {
  id: string;
  owner: string;
  repo: string;
  repositoryUrl: string;
  license: string;
  usage: "eval-only";
  description?: string;
  ref: ExternalPromptCorpusRef;
  files: ExternalPromptCorpusFile[];
  pinRequiredInCi?: boolean;
};

export type PromptTextSuspiciousPhrase = {
  phrase: string;
  count: number;
};

export type PromptTextAnalysis = {
  chars: number;
  adjustedChars: number;
  estimatedTokens: number;
  lines: number;
  headingCount: number;
  duplicateHeadingCount: number;
  xmlTagCount: number;
  jsonSchemaHintCount: number;
  longestLineChars: number;
  sha256: string;
  suspiciousPhrases: PromptTextSuspiciousPhrase[];
};

export type PromptCorpusSample = {
  id: string;
  label: string;
  source: "openclaw" | "external";
  path?: string;
  rawUrl?: string;
  cachePath?: string;
  kind?: string;
  analysis?: PromptTextAnalysis;
  status: "analyzed" | "missing";
};

export type PromptCorpusAggregate = {
  count: number;
  totalChars: number;
  totalEstimatedTokens: number;
  maxChars: number;
  maxEstimatedTokens: number;
  avgChars: number;
  avgEstimatedTokens: number;
};

export type PromptCorpusAnalysisSummary = {
  manifest: {
    id: string;
    repositoryUrl: string;
    license: string;
    usage: "eval-only";
    ref: ExternalPromptCorpusRef;
    fileCount: number;
  };
  cache: {
    cacheRoot: string;
    corpusDir: string;
  };
  warnings: string[];
  localSamples: PromptCorpusSample[];
  externalSamples: PromptCorpusSample[];
  aggregates: {
    openclaw: PromptCorpusAggregate;
    external: PromptCorpusAggregate;
  };
};

export type ExternalPromptCorpusFetchEntry = {
  path: string;
  kind: string;
  label?: string;
  rawUrl: string;
  cachePath: string;
  status: "downloaded" | "cached" | "dry-run" | "failed";
  sha256?: string;
  chars?: number;
  error?: string;
};

export type ExternalPromptCorpusFetchSummary = {
  manifest: {
    id: string;
    repositoryUrl: string;
    ref: ExternalPromptCorpusRef;
    fileCount: number;
  };
  cache: {
    cacheRoot: string;
    corpusDir: string;
  };
  warnings: string[];
  files: ExternalPromptCorpusFetchEntry[];
  counts: {
    downloaded: number;
    cached: number;
    dryRun: number;
    failed: number;
  };
};

type ReadFileLike = (filePath: string, encoding: BufferEncoding) => Promise<string>;
type WriteFileLike = (filePath: string, data: string, encoding: BufferEncoding) => Promise<void>;
type MkdirLike = (dirPath: string, options: { recursive: true }) => Promise<void>;
type FetchTextResult = { ok: boolean; status: number; text: string };
type FetchTextLike = (url: string) => Promise<FetchTextResult>;
type DelayLike = (ms: number) => Promise<void>;

const DEFAULT_MANIFEST_PATH = path.join(
  "qa",
  "external-corpora",
  "system-prompts-and-models-of-ai-tools.manifest.json",
);
const DEFAULT_CACHE_ROOT = path.join("qa", ".cache", "external-corpora");
const DEFAULT_FETCH_RETRY_LIMIT = 2;
const DEFAULT_FETCH_RETRY_DELAY_MS = 1_000;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

const SUSPICIOUS_PHRASES = [
  "system prompt",
  "hidden instructions",
  "internal tools",
  "do not reveal",
  "ignore previous",
  "developer message",
] as const;

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Prompt corpus manifest field "${key}" must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Prompt corpus manifest field "${key}" must be a string when present.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRef(input: unknown): ExternalPromptCorpusRef {
  if (!isRecord(input)) {
    throw new Error('Prompt corpus manifest field "ref" must be an object.');
  }
  const type = readRequiredString(input, "type");
  if (type !== "branch" && type !== "commit") {
    throw new Error('Prompt corpus manifest field "ref.type" must be "branch" or "commit".');
  }
  return {
    type,
    value: readRequiredString(input, "value"),
  };
}

function normalizeFiles(input: unknown): ExternalPromptCorpusFile[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Prompt corpus manifest field "files" must be a non-empty array.');
  }
  return input.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Prompt corpus manifest file entry #${index + 1} must be an object.`);
    }
    return {
      path: readRequiredString(entry, "path"),
      kind: readRequiredString(entry, "kind"),
      label: readOptionalString(entry, "label"),
      notes: readOptionalString(entry, "notes"),
    };
  });
}

export function parseExternalPromptCorpusManifest(input: unknown): ExternalPromptCorpusManifest {
  if (!isRecord(input)) {
    throw new Error("Prompt corpus manifest must be a JSON object.");
  }
  const usage = readRequiredString(input, "usage");
  if (usage !== "eval-only") {
    throw new Error('Prompt corpus manifest field "usage" must be "eval-only".');
  }
  const pinRequiredInCi = input.pinRequiredInCi;
  if (pinRequiredInCi !== undefined && typeof pinRequiredInCi !== "boolean") {
    throw new Error('Prompt corpus manifest field "pinRequiredInCi" must be a boolean.');
  }
  return {
    id: readRequiredString(input, "id"),
    owner: readRequiredString(input, "owner"),
    repo: readRequiredString(input, "repo"),
    repositoryUrl: readRequiredString(input, "repositoryUrl"),
    license: readRequiredString(input, "license"),
    usage,
    description: readOptionalString(input, "description"),
    ref: normalizeRef(input.ref),
    files: normalizeFiles(input.files),
    pinRequiredInCi,
  };
}

export async function readExternalPromptCorpusManifest(
  manifestPath: string,
  deps?: { readFile?: ReadFileLike },
) {
  const readFile = deps?.readFile ?? fs.readFile;
  const payload = await readFile(manifestPath, "utf8");
  return parseExternalPromptCorpusManifest(JSON.parse(payload) as unknown);
}

function encodePathForRawUrl(filePath: string) {
  return filePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sanitizeRefForDir(ref: string) {
  return ref.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function resolvePromptCorpusManifestPath(repoRoot: string, manifestPath?: string) {
  if (!manifestPath) {
    return path.join(repoRoot, DEFAULT_MANIFEST_PATH);
  }
  return path.isAbsolute(manifestPath) ? manifestPath : path.resolve(repoRoot, manifestPath);
}

export function resolvePromptCorpusCachePaths(params: {
  repoRoot: string;
  cacheRoot?: string;
  manifest: ExternalPromptCorpusManifest;
}) {
  const cacheRoot = params.cacheRoot
    ? path.isAbsolute(params.cacheRoot)
      ? params.cacheRoot
      : path.resolve(params.repoRoot, params.cacheRoot)
    : path.join(params.repoRoot, DEFAULT_CACHE_ROOT);
  const corpusDir = path.join(
    cacheRoot,
    params.manifest.id,
    `${params.manifest.ref.type}-${sanitizeRefForDir(params.manifest.ref.value)}`,
  );
  return { cacheRoot, corpusDir };
}

export function buildExternalPromptCorpusRawUrl(
  manifest: ExternalPromptCorpusManifest,
  filePath: string,
) {
  return `https://raw.githubusercontent.com/${encodeURIComponent(
    manifest.owner,
  )}/${encodeURIComponent(manifest.repo)}/${encodeURIComponent(
    manifest.ref.value,
  )}/${encodePathForRawUrl(filePath)}`;
}

function countMatches(text: string, pattern: RegExp) {
  return (text.match(pattern) ?? []).length;
}

function formatFetchErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function shouldRetryFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("eai_again") ||
    message.includes("enotfound") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("timeout")
  );
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function analyzePromptText(text: string): PromptTextAnalysis {
  const adjustedChars = estimateStringChars(text);
  const headings = Array.from(text.matchAll(/^(#{1,6})\s+(.+)$/gm)).map((match) =>
    match[2]?.trim().toLowerCase(),
  );
  const headingCounts = new Map<string, number>();
  for (const heading of headings) {
    if (!heading) {
      continue;
    }
    headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1);
  }
  const duplicateHeadingCount = Array.from(headingCounts.values()).filter(
    (count) => count > 1,
  ).length;
  const suspiciousPhrases = SUSPICIOUS_PHRASES.map((phrase) => ({
    phrase,
    count: countMatches(text, new RegExp(phrase.replaceAll(" ", "\\s+"), "gi")),
  })).filter((entry) => entry.count > 0);
  const lines = text.length === 0 ? 0 : text.split(/\r?\n/u).length;
  const longestLineChars = Math.max(0, ...text.split(/\r?\n/u).map((line) => line.length));
  return {
    chars: text.length,
    adjustedChars,
    estimatedTokens: estimateTokensFromChars(adjustedChars),
    lines,
    headingCount: headings.length,
    duplicateHeadingCount,
    xmlTagCount: countMatches(text, /<([a-z][\w-]*)\b[^>]*>/giu),
    jsonSchemaHintCount: countMatches(text, /"properties"|"required"|"type"\s*:\s*"object"/giu),
    longestLineChars,
    sha256: sha256(text),
    suspiciousPhrases,
  };
}

function buildAggregate(samples: PromptCorpusSample[]): PromptCorpusAggregate {
  const analyses = samples
    .map((sample) => sample.analysis)
    .filter((analysis): analysis is PromptTextAnalysis => analysis !== undefined);
  if (analyses.length === 0) {
    return {
      count: 0,
      totalChars: 0,
      totalEstimatedTokens: 0,
      maxChars: 0,
      maxEstimatedTokens: 0,
      avgChars: 0,
      avgEstimatedTokens: 0,
    };
  }
  const totalChars = analyses.reduce((sum, analysis) => sum + analysis.chars, 0);
  const totalEstimatedTokens = analyses.reduce(
    (sum, analysis) => sum + analysis.estimatedTokens,
    0,
  );
  return {
    count: analyses.length,
    totalChars,
    totalEstimatedTokens,
    maxChars: Math.max(...analyses.map((analysis) => analysis.chars)),
    maxEstimatedTokens: Math.max(...analyses.map((analysis) => analysis.estimatedTokens)),
    avgChars: Math.round(totalChars / analyses.length),
    avgEstimatedTokens: Math.round(totalEstimatedTokens / analyses.length),
  };
}

export function buildOpenClawPromptCorpusSamples(repoRoot: string): PromptCorpusSample[] {
  const skillsPrompt = [
    "<available_skills>",
    "  <skill>",
    "    <name>prompt-budget</name>",
    "    <description>Inspect prompt growth and section duplication.</description>",
    "  </skill>",
    "</available_skills>",
  ].join("\n");
  const fullPrompt = buildAgentSystemPrompt({
    workspaceDir: repoRoot,
    promptMode: "full",
    toolNames: ["read", "exec", "message", "web_search", "sessions_spawn"],
    skillsPrompt,
    docsPath: path.join(repoRoot, "docs"),
    sourcePath: repoRoot,
    runtimeInfo: {
      os: process.platform,
      arch: process.arch,
      shell: process.env.SHELL ?? "bash",
      repoRoot,
      node: process.version,
      channel: "webchat",
    },
  });
  const minimalPrompt = buildAgentSystemPrompt({
    workspaceDir: repoRoot,
    promptMode: "minimal",
    toolNames: ["read", "exec", "sessions_spawn"],
    skillsPrompt,
  });
  const subagentPrompt = buildSubagentSystemPrompt({
    childSessionKey: "qa-prompt-corpus-child",
    label: "Prompt Corpus Sample",
    task: "Analyze prompt sprawl and summarize prompt-shape risks.",
  });

  return [
    {
      id: "openclaw-main-full",
      label: "OpenClaw main agent prompt (full)",
      source: "openclaw",
      status: "analyzed",
      analysis: analyzePromptText(fullPrompt),
    },
    {
      id: "openclaw-main-minimal",
      label: "OpenClaw main agent prompt (minimal)",
      source: "openclaw",
      status: "analyzed",
      analysis: analyzePromptText(minimalPrompt),
    },
    {
      id: "openclaw-subagent",
      label: "OpenClaw subagent prompt",
      source: "openclaw",
      status: "analyzed",
      analysis: analyzePromptText(subagentPrompt),
    },
  ];
}

async function defaultFetchText(url: string): Promise<FetchTextResult> {
  const timeoutMs = readPromptCorpusFetchTimeoutMsFromEnv();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

async function defaultDelay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readNonNegativeIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function readPromptCorpusFetchRetryLimitFromEnv() {
  return readNonNegativeIntegerEnv(
    "OPENCLAW_QA_PROMPT_CORPUS_FETCH_RETRIES",
    DEFAULT_FETCH_RETRY_LIMIT,
  );
}

function readPromptCorpusFetchRetryDelayMsFromEnv() {
  return readNonNegativeIntegerEnv(
    "OPENCLAW_QA_PROMPT_CORPUS_FETCH_RETRY_DELAY_MS",
    DEFAULT_FETCH_RETRY_DELAY_MS,
  );
}

function readPromptCorpusFetchTimeoutMsFromEnv() {
  const timeoutMs = readNonNegativeIntegerEnv(
    "OPENCLAW_QA_PROMPT_CORPUS_FETCH_TIMEOUT_MS",
    DEFAULT_FETCH_TIMEOUT_MS,
  );
  return Math.max(1, timeoutMs);
}

async function fetchWithRetry(params: {
  url: string;
  fetchText: FetchTextLike;
  retryLimit: number;
  retryDelayMs: number;
  delay: DelayLike;
}) {
  let lastStatus: number | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt <= params.retryLimit; attempt += 1) {
    try {
      const result = await params.fetchText(params.url);
      if (result.ok) {
        return result;
      }
      lastStatus = result.status;
      if (attempt >= params.retryLimit || !shouldRetryStatus(result.status)) {
        return result;
      }
    } catch (error) {
      lastError = error;
      if (attempt >= params.retryLimit || !shouldRetryFetchError(error)) {
        throw error;
      }
    }
    await params.delay(params.retryDelayMs * (attempt + 1));
  }
  if (lastError) {
    throw lastError;
  }
  if (lastStatus !== undefined) {
    throw new Error(`Prompt corpus fetch failed (${lastStatus}) for ${params.url}`);
  }
  throw new Error(`Prompt corpus fetch exhausted retries for ${params.url}`);
}

export async function fetchExternalPromptCorpus(params: {
  repoRoot: string;
  manifestPath?: string;
  cacheRoot?: string;
  dryRun?: boolean;
  readFile?: ReadFileLike;
  writeFile?: WriteFileLike;
  mkdir?: MkdirLike;
  fetchText?: FetchTextLike;
  delay?: DelayLike;
  retryLimit?: number;
  retryDelayMs?: number;
}) {
  const manifestPath = resolvePromptCorpusManifestPath(params.repoRoot, params.manifestPath);
  const manifest = await readExternalPromptCorpusManifest(manifestPath, {
    readFile: params.readFile,
  });
  if (process.env.CI && manifest.pinRequiredInCi !== false && manifest.ref.type !== "commit") {
    throw new Error(
      `Prompt corpus manifest "${manifest.id}" uses ref ${manifest.ref.type}:${manifest.ref.value}; CI requires a pinned commit ref.`,
    );
  }
  const writeFile = params.writeFile ?? fs.writeFile;
  const mkdir = params.mkdir ?? fs.mkdir;
  const readFile = params.readFile ?? fs.readFile;
  const fetchText = params.fetchText ?? defaultFetchText;
  const delay = params.delay ?? defaultDelay;
  const retryLimit = Math.max(0, params.retryLimit ?? readPromptCorpusFetchRetryLimitFromEnv());
  const retryDelayMs = Math.max(
    0,
    params.retryDelayMs ?? readPromptCorpusFetchRetryDelayMsFromEnv(),
  );
  const cache = resolvePromptCorpusCachePaths({
    repoRoot: params.repoRoot,
    cacheRoot: params.cacheRoot,
    manifest,
  });
  const warnings =
    manifest.ref.type === "commit"
      ? []
      : [`Manifest ${manifest.id} is using an unpinned ${manifest.ref.type} ref.`];
  const entries: ExternalPromptCorpusFetchEntry[] = [];

  for (const file of manifest.files) {
    const rawUrl = buildExternalPromptCorpusRawUrl(manifest, file.path);
    const cachePath = path.join(cache.corpusDir, file.path);
    if (params.dryRun === true) {
      entries.push({
        path: file.path,
        kind: file.kind,
        label: file.label,
        rawUrl,
        cachePath,
        status: "dry-run",
      });
      continue;
    }
    try {
      const fetched = await fetchWithRetry({
        url: rawUrl,
        fetchText,
        retryLimit,
        retryDelayMs,
        delay,
      });
      if (!fetched.ok) {
        throw new Error(`Prompt corpus fetch failed (${fetched.status}) for ${rawUrl}`);
      }
      const contentHash = sha256(fetched.text);
      let status: ExternalPromptCorpusFetchEntry["status"] = "downloaded";
      try {
        const existing = await readFile(cachePath, "utf8");
        if (sha256(existing) === contentHash) {
          status = "cached";
        }
      } catch {
        // Missing cache is expected on first fetch.
      }
      if (status !== "cached") {
        await mkdir(path.dirname(cachePath), { recursive: true });
        await writeFile(cachePath, fetched.text, "utf8");
      }
      entries.push({
        path: file.path,
        kind: file.kind,
        label: file.label,
        rawUrl,
        cachePath,
        status,
        sha256: contentHash,
        chars: fetched.text.length,
      });
    } catch (error) {
      warnings.push(`Fetch failed for ${file.path}: ${formatFetchErrorMessage(error)}`);
      entries.push({
        path: file.path,
        kind: file.kind,
        label: file.label,
        rawUrl,
        cachePath,
        status: "failed",
        error: formatFetchErrorMessage(error),
      });
    }
  }

  const counts = {
    downloaded: entries.filter((entry) => entry.status === "downloaded").length,
    cached: entries.filter((entry) => entry.status === "cached").length,
    dryRun: entries.filter((entry) => entry.status === "dry-run").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
  };

  if (params.dryRun !== true) {
    await mkdir(cache.corpusDir, { recursive: true });
    await writeFile(
      path.join(cache.corpusDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(cache.corpusDir, "index.json"),
      `${JSON.stringify(
        {
          manifestId: manifest.id,
          repositoryUrl: manifest.repositoryUrl,
          ref: manifest.ref,
          files: entries,
          counts,
          warnings,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return {
    manifest: {
      id: manifest.id,
      repositoryUrl: manifest.repositoryUrl,
      ref: manifest.ref,
      fileCount: manifest.files.length,
    },
    cache,
    warnings,
    files: entries,
    counts,
  } satisfies ExternalPromptCorpusFetchSummary;
}

export async function analyzePromptCorpus(params: {
  repoRoot: string;
  manifestPath?: string;
  cacheRoot?: string;
  readFile?: ReadFileLike;
}) {
  const readFile = params.readFile ?? fs.readFile;
  const manifestPath = resolvePromptCorpusManifestPath(params.repoRoot, params.manifestPath);
  const manifest = await readExternalPromptCorpusManifest(manifestPath, { readFile });
  const cache = resolvePromptCorpusCachePaths({
    repoRoot: params.repoRoot,
    cacheRoot: params.cacheRoot,
    manifest,
  });
  const warnings =
    manifest.ref.type === "commit"
      ? []
      : [`Manifest ${manifest.id} is using an unpinned ${manifest.ref.type} ref.`];
  const localSamples = buildOpenClawPromptCorpusSamples(params.repoRoot);
  const externalSamples: PromptCorpusSample[] = [];

  for (const file of manifest.files) {
    const cachePath = path.join(cache.corpusDir, file.path);
    const rawUrl = buildExternalPromptCorpusRawUrl(manifest, file.path);
    try {
      const text = await readFile(cachePath, "utf8");
      externalSamples.push({
        id: `${manifest.id}:${file.path}`,
        label: file.label ?? file.path,
        source: "external",
        path: file.path,
        kind: file.kind,
        rawUrl,
        cachePath,
        status: "analyzed",
        analysis: analyzePromptText(text),
      });
    } catch {
      externalSamples.push({
        id: `${manifest.id}:${file.path}`,
        label: file.label ?? file.path,
        source: "external",
        path: file.path,
        kind: file.kind,
        rawUrl,
        cachePath,
        status: "missing",
      });
    }
  }

  return {
    manifest: {
      id: manifest.id,
      repositoryUrl: manifest.repositoryUrl,
      license: manifest.license,
      usage: manifest.usage,
      ref: manifest.ref,
      fileCount: manifest.files.length,
    },
    cache,
    warnings,
    localSamples,
    externalSamples,
    aggregates: {
      openclaw: buildAggregate(localSamples),
      external: buildAggregate(externalSamples),
    },
  } satisfies PromptCorpusAnalysisSummary;
}
