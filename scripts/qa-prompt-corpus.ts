#!/usr/bin/env -S node --import tsx
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompactionSummarizationInstructions } from "../src/agents/compaction.js";
import { buildAgentSystemPrompt } from "../src/agents/system-prompt.js";
import {
  analyzePromptCorpus,
  analyzePromptCorpusText,
  fetchExternalPromptCorpus,
} from "../src/infra/prompt-corpus-analysis.js";

type CliOptions = {
  repoRoot?: string;
  manifest?: string;
  cacheRoot?: string;
  dryRun?: boolean;
  json?: boolean;
};

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  node --import tsx scripts/qa-prompt-corpus.ts fetch [--repo-root <path>] [--manifest <path>] [--cache-root <path>] [--dry-run] [--json]",
      "  node --import tsx scripts/qa-prompt-corpus.ts analyze [--repo-root <path>] [--manifest <path>] [--cache-root <path>] [--json]",
    ].join("\n") + "\n",
  );
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  if (!command || (command !== "fetch" && command !== "analyze")) {
    usage();
    throw new Error("Expected subcommand fetch or analyze.");
  }
  const options: CliOptions = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    switch (token) {
      case "--repo-root":
        options.repoRoot = rest[++index];
        break;
      case "--manifest":
        options.manifest = rest[++index];
        break;
      case "--cache-root":
        options.cacheRoot = rest[++index];
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        usage();
        process.exit(0);
      default:
        usage();
        throw new Error(`Unknown argument: ${token}`);
    }
  }
  return { command, options };
}

function resolveDefaultRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function buildOpenClawAnalysisSamples(repoRoot: string) {
  const fullPrompt = buildAgentSystemPrompt({
    workspaceDir: repoRoot,
  });
  const minimalPrompt = buildAgentSystemPrompt({
    workspaceDir: repoRoot,
    promptMode: "minimal",
  });
  const compactionPrompt = buildCompactionSummarizationInstructions() ?? "";
  return [
    {
      path: "openclaw/system-prompt/full",
      status: "analyzed" as const,
      analysis: analyzePromptCorpusText(fullPrompt),
    },
    {
      path: "openclaw/system-prompt/minimal",
      status: "analyzed" as const,
      analysis: analyzePromptCorpusText(minimalPrompt),
    },
    {
      path: "openclaw/compaction/resume-state",
      status: "analyzed" as const,
      analysis: analyzePromptCorpusText(compactionPrompt),
    },
  ];
}

function renderFetchSummary(summary: Awaited<ReturnType<typeof fetchExternalPromptCorpus>>) {
  const lines = [
    `Prompt corpus manifest: ${summary.manifest.id}`,
    `Source: ${summary.manifest.repositoryUrl} @ ${summary.manifest.ref.type}:${summary.manifest.ref.value}`,
    `Cache dir: ${summary.cache.corpusDir}`,
    `Counts: downloaded=${summary.counts.downloaded} cached=${summary.counts.cached} dry-run=${summary.counts.dryRun} failed=${summary.counts.failed}`,
  ];
  for (const warning of summary.warnings) {
    lines.push(`Warning: ${warning}`);
  }
  for (const file of summary.files) {
    lines.push(`${file.status.padEnd(10)} ${file.path}${file.error ? ` :: ${file.error}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderAnalysisSummary(summary: Awaited<ReturnType<typeof analyzePromptCorpus>>) {
  const lines = [
    `Prompt corpus manifest: ${summary.manifest.id}`,
    `Source: ${summary.manifest.repositoryUrl} @ ${summary.manifest.ref.type}:${summary.manifest.ref.value}`,
    `Cache dir: ${summary.cache.corpusDir}`,
    `OpenClaw samples: ${summary.aggregates.openclaw.count} analyzed, max ${summary.aggregates.openclaw.maxEstimatedTokens} est. tokens`,
    `External samples: ${summary.aggregates.external.count} analyzed, max ${summary.aggregates.external.maxEstimatedTokens} est. tokens`,
  ];
  for (const warning of summary.warnings) {
    lines.push(`Warning: ${warning}`);
  }
  const missing = summary.externalSamples.filter((sample) => sample.status === "missing");
  if (missing.length > 0) {
    lines.push(`Missing cached external files: ${missing.map((sample) => sample.path).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options.repoRoot ?? resolveDefaultRepoRoot());
  if (command === "fetch") {
    const summary = await fetchExternalPromptCorpus({
      repoRoot,
      manifestPath: options.manifest,
      cacheRoot: options.cacheRoot,
      dryRun: options.dryRun,
    });
    process.stdout.write(
      options.json ? `${JSON.stringify(summary, null, 2)}\n` : renderFetchSummary(summary),
    );
    return;
  }
  const summary = await analyzePromptCorpus({
    repoRoot,
    manifestPath: options.manifest,
    cacheRoot: options.cacheRoot,
    openclawSamples: buildOpenClawAnalysisSamples(repoRoot),
  });
  process.stdout.write(
    options.json ? `${JSON.stringify(summary, null, 2)}\n` : renderAnalysisSummary(summary),
  );
}

await main();
