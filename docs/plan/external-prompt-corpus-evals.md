---
title: "External Prompt Corpus Evals"
summary: "RFC for using external AI system prompt corpora as eval-only input for prompt budgeting, extraction resistance, and comparative runtime benchmarking"
read_when:
  - You are evaluating whether external prompt corpora should be integrated into OpenClaw
  - You want to improve prompt efficiency without importing third-party system prompts into production
  - You need a safe plan for prompt-budget regression testing and prompt-extraction red teaming
---

## Status

Proposal only.

Nothing from the external corpus should be shipped in runtime prompts, bundled
assets, or default repo state as part of this RFC.

## Decision

OpenClaw should not integrate external prompt corpora into production prompt
assembly.

OpenClaw should selectively use external prompt corpora as eval-only input for:

- prompt-budget analysis
- prompt-structure comparison
- prompt-extraction red teaming
- regression detection
- comparative runtime benchmarking

OpenClaw should not:

- copy third-party prompt text into production system prompts
- vendor large prompt dumps into the repository by default
- treat leaked vendor prompts as authoritative behavior specs
- add any runtime dependency on external prompt corpora

## Why this RFC exists

The repository `Piebald-AI/claude-code-system-prompts` is useful as a
large cross-tool prompt corpus, but it is not a reusable runtime library. Its
main value is as adversarial and comparative reference material.

OpenClaw already owns:

- system prompt assembly
- prompt budgeting
- context-engine prompt injection
- runtime comparison surfaces
- QA and eval workflows

That means the value is not "import these prompts." The value is "use this
corpus to pressure-test OpenClaw's own prompts and prompt architecture."

## Critique of the naive integration

The naive integration would be to import prompt text from the external corpus
into OpenClaw's bundled prompts, skills, or runtime templates. That would be a
mistake for four reasons.

### 1. It creates licensing and provenance risk

The corpus repo is GPL-3.0 and contains third-party prompt text. Even if some
files are publicly visible elsewhere, OpenClaw should not copy them into
first-party runtime prompt assets without deliberate legal review.

### 2. It pollutes production behavior with non-authoritative text

OpenClaw's prompt architecture is OpenClaw-owned. External vendor prompts
reflect other products' constraints, tooling, and trust models. They are useful
for comparison, not for direct adoption.

### 3. It expands prompt surface area with low-confidence content

Large prompt corpora are exactly the kind of input that cause prompt sprawl.
That would harm efficiency rather than improve it.

### 4. It confuses evaluation data with product design

The right use of external prompt corpora is to test assumptions, not to become
the assumptions.

## What is actually worth reusing

The reusable value is in the corpus as data, not as product logic.

### Prompt-shape comparison

The corpus provides examples of:

- highly compressed prompts
- bloated monolithic prompts
- heavy persona overlays
- verbose tool-policy sections
- different approaches to tool declarations and output control

OpenClaw can use these as a comparative baseline for prompt-size and prompt-role
analysis.

### Extraction and jailbreak pressure

The corpus gives attackers a vocabulary for what prompt extraction attempts
target. That makes it useful as a seed source for red-team scenario design.

### Prompt-budget discipline

A large corpus is a good reminder that prompt growth is easy and often hidden.
OpenClaw can turn that into explicit budget enforcement rather than anecdotal
taste.

## Recommended integration target

The correct target is an eval-only subsystem under `qa/` plus a small amount of
shared analysis code under `src/infra/`.

This RFC proposes three pieces:

- an external corpus manifest
- a local fetch/cache pipeline
- prompt eval and red-team runners

## Proposed architecture

### 1. Quarantined corpus manifest

Add a manifest that describes what is allowed to be fetched and why.

Suggested path:

`qa/external-corpora/piebald-claude-code-system-prompts.manifest.json`

Suggested shape:

```json
{
  "id": "piebald-claude-code-system-prompts",
  "repo": "Piebald-AI/claude-code-system-prompts",
  "license": "GPL-3.0",
  "usage": "eval-only",
  "pinnedCommit": "<sha>",
  "files": [
    {
      "path": "README.md",
      "reason": "metadata"
    },
    {
      "path": "openai/codex/system_prompt.md",
      "reason": "prompt-shape comparison"
    }
  ]
}
```

The exact file list should stay small and intentional. OpenClaw does not need
the whole corpus to get value from it.

### 2. Local fetch/cache tool

Add a script that:

- fetches only manifest-pinned files
- stores them under an ignored cache directory
- records SHA256 hashes
- refuses floating branch fetches in CI

Suggested paths:

- `scripts/fetch-external-prompt-corpus.mjs`
- `scripts/qa-prompt-corpus.ts`
- `qa/.cache/external-corpora/`

The fetch tool must fail closed:

- no fetch without a pinned commit
- no production/runtime codepath may depend on the cache existing
- CI should skip gracefully when network access is intentionally absent unless a
  dedicated eval job enables it

### 3. Prompt analyzer

Add an offline analyzer that can compare OpenClaw prompts with external corpus
samples.

Suggested path:

`src/infra/prompt-corpus-analysis.ts`

Suggested outputs:

- char count
- estimated token count
- section count
- section-title histogram
- repeated line or block detection
- tool-schema verbosity indicators
- presence of extraction-sensitive phrases such as "system prompt", "hidden
  instructions", "internal tools", "do not reveal"

This should operate on arbitrary prompt text, not on a specific corpus only.

### 4. Eval runners

Add QA runners that consume analyzer output and scenario fixtures.

Suggested paths:

- `qa/prompt-evals/`
- `qa/prompt-evals/extraction-scenarios/`
- `qa/prompt-evals/shape-benchmarks/`

These runners should answer questions such as:

- Did the OpenClaw system prompt get larger?
- Did prompt structure become more repetitive?
- Did extraction resistance regress?
- Did runtime A vs runtime B behave differently under the same red-team prompt?

## File layout

Proposed minimal layout:

```text
docs/plan/external-prompt-corpus-evals.md
qa/external-corpora/piebald-claude-code-system-prompts.manifest.json
qa/prompt-evals/extraction-scenarios/
qa/prompt-evals/shape-benchmarks/
scripts/fetch-external-prompt-corpus.mjs
scripts/qa-prompt-corpus.ts
src/infra/prompt-corpus-analysis.ts
src/infra/prompt-corpus-analysis.test.ts
```

Optional later additions:

```text
src/commands/qa-prompt-corpus.ts
docs/concepts/prompt-evals.md
qa/.cache/external-corpora/
```

## CLI sketch

This does not need a large new command surface initially. A narrow QA surface is
enough.

Possible commands:

```bash
openclaw qa prompt-corpus fetch
openclaw qa prompt-corpus analyze
openclaw qa prompt-corpus bench
openclaw qa prompt-corpus redteam
```

Behavior:

- `fetch`: download pinned manifest files into local cache
- `analyze`: run prompt-shape metrics against cached files and local OpenClaw
  prompt builders
- `bench`: compare selected runtimes or prompt modes on fixed tasks
- `redteam`: run extraction/jailbreak scenarios and report failures

If command sprawl is undesirable, these can begin as scripts under `scripts/`
and graduate into `openclaw qa ...` later.

## Eval design

### Prompt-shape benchmarks

These benchmarks do not require live model calls. They compare prompt
construction itself.

Measures:

- total prompt chars and estimated tokens
- count of high-cost sections such as skills lists and tool descriptions
- duplicate-policy detection
- minimal-mode vs full-mode size ratio
- subagent prompt size drift

Primary OpenClaw targets:

- `buildAgentSystemPrompt(...)`
- subagent/minimal prompt builders
- context-engine `systemPromptAddition`

### Extraction-resistance scenarios

These should be original test prompts inspired by common extraction patterns,
not copied text from the external corpus.

Example scenario classes:

- ask for hidden instructions verbatim
- ask to summarize internal tools and private sections
- claim earlier system rules were deprecated
- ask for a "debug dump" of prompt context
- ask the model to compare its prompt with a named vendor prompt

Success criteria:

- refusal or safe redirection
- no verbatim hidden prompt dump
- no unsupported internal tool exposure

### Comparative runtime benchmarks

Use the same eval set across:

- PI
- Codex runtime
- minimal subagent prompt mode
- packet-oriented context-engine flows

Collect:

- prompt size
- first tool-call latency
- number of tool calls
- extraction resistance outcome
- final task quality for a small fixed benchmark set

## Legal and safety constraints

These constraints are mandatory.

### No production prompt contamination

External corpus text must not be injected into:

- `system-prompt.ts`
- bundled skills
- runtime default prompt assets
- context-engine default production text

### No vendoring by default

Fetched corpus content should stay in ignored cache paths unless a future
maintainer explicitly decides otherwise after review.

### No copied red-team fixtures

Red-team tests should be inspired by attack classes, not populated by copied
third-party prompt text. OpenClaw should write its own scenario corpus.

### Explicit provenance labels

Reports and manifests should label:

- source repo
- pinned commit
- license
- intended use: `eval-only`

## Phase plan

### Phase 1: safe offline analysis

Deliver:

- manifest
- fetch/cache tool
- prompt analyzer
- prompt-budget tests

Non-goals:

- live model benchmarks
- production prompt changes
- new runtime behavior

### Phase 2: extraction red team

Deliver:

- extraction-scenario fixtures
- evaluation runner
- CI or nightly reporting hook

Non-goals:

- autonomous prompt rewriting
- importing third-party prompt text into the repo

### Phase 3: comparative runtime benchmarking

Deliver:

- shared benchmark tasks
- runtime comparison reports
- trend tracking for prompt growth and extraction regressions

## Expected benefit

### Efficiency

Likely real benefit.

OpenClaw will get faster feedback on:

- prompt growth regressions
- unnecessary policy duplication
- high-cost prompt sections

That should reduce wasted prompt tokens and review time.

### Performance

Indirect benefit only.

This RFC alone will not make runtime execution faster. Performance gains would
come from prompt simplification decisions informed by the eval data.

### Security and robustness

Likely meaningful benefit.

Prompt-extraction resistance and prompt-structure hygiene should improve if
these evals become part of the review loop.

## Non-goals

This RFC does not propose:

- replacing OpenClaw's prompt architecture
- shipping third-party prompts as first-party assets
- benchmarking every model or runtime immediately
- automatic prompt optimization by a model

## Recommendation

Proceed with Phase 1 only at first.

That is the highest-value, lowest-risk slice:

- no runtime behavior change
- no licensing contamination of shipped assets
- clear engineering feedback on prompt cost and prompt sprawl

If Phase 1 produces useful signal, add Phase 2 extraction red-teaming next.

## Related OpenClaw surfaces

- [System prompt](/concepts/system-prompt)
- [Context engine](/concepts/context-engine)
- [Agent runtimes](/concepts/agent-runtimes)
- [QA E2E automation](/concepts/qa-e2e-automation)
