import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from "../agents/system-prompt-cache-boundary.js";
import {
  analyzePromptCorpusText,
  comparePromptCorpusAnalyses,
  fetchExternalPromptCorpus,
} from "./prompt-corpus-analysis.js";

describe("prompt corpus analysis", () => {
  it("counts sections, repeated blocks, and cache boundary splits", () => {
    const prompt = [
      "## Alpha",
      "",
      "Shared block one.",
      "",
      "Shared block one.",
      "",
      SYSTEM_PROMPT_CACHE_BOUNDARY.trim(),
      "",
      "## Beta",
      "",
      "Tail block.",
    ].join("\n");

    const analysis = analyzePromptCorpusText(prompt);

    expect(analysis.chars).toBe(prompt.length);
    expect(analysis.estimatedTokens).toBeGreaterThan(0);
    expect(analysis.sectionCount).toBe(2);
    expect(analysis.sectionHistogram).toEqual([
      { heading: "Alpha", count: 1 },
      { heading: "Beta", count: 1 },
    ]);
    expect(analysis.repeatedBlocks).toEqual([
      {
        text: "Shared block one.",
        count: 2,
      },
    ]);
    expect(analysis.cacheBoundaryIndex).toBe(prompt.indexOf(SYSTEM_PROMPT_CACHE_BOUNDARY));
    expect(analysis.stablePrefixChars).toBe(prompt.indexOf(SYSTEM_PROMPT_CACHE_BOUNDARY));
    expect(analysis.volatileSuffixChars).toBe(21);
  });

  it("compares prompt analyses with direct deltas", () => {
    const base = analyzePromptCorpusText("## Alpha\n\nBase.");
    const head = analyzePromptCorpusText("## Alpha\n\n## Beta\n\nBase.\n\nExtra.");
    const comparison = comparePromptCorpusAnalyses(base, head);

    expect(comparison.charsDelta).toBeGreaterThan(0);
    expect(comparison.estimatedTokensDelta).toBeGreaterThanOrEqual(0);
    expect(comparison.sectionCountDelta).toBe(1);
  });

  it("writes repo and hashes into the cache index for cached corpora", async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-prompt-corpus-"));
    const manifestPath = path.join(repoRoot, "manifest.json");
    const cacheRoot = path.join(repoRoot, "cache");
    const corpusDir = path.join(cacheRoot, "external-prompts");
    const cachedFilePath = path.join(corpusDir, "README.md");
    const cachedContents = "cached prompt corpus";

    await fs.mkdir(corpusDir, { recursive: true });
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          id: "external-prompts",
          repo: "example/prompts",
          usage: "eval-only",
          pinnedCommit: "1234567890abcdef1234567890abcdef12345678",
          files: [{ path: "README.md", reason: "metadata" }],
        },
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(cachedFilePath, cachedContents, "utf8");

    try {
      const summary = await fetchExternalPromptCorpus({
        repoRoot,
        manifestPath,
        cacheRoot,
      });
      const index = JSON.parse(await fs.readFile(path.join(corpusDir, "index.json"), "utf8")) as {
        repo?: string;
        files?: Array<{ path?: string; sha256?: string }>;
      };

      expect(summary.counts.cached).toBe(1);
      expect(index.repo).toBe("example/prompts");
      expect(index.files).toEqual([
        expect.objectContaining({
          path: "README.md",
          sha256: "bd41bd21b0fbdb63299a1b6d4967403376fe3bc5ea6403f1c34c2b411610923f",
        }),
      ]);
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
