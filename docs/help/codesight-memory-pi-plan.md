---
summary: "Implementation plan for integrating Codesight artifacts into memory retrieval on ARM64 Raspberry Pi hosts"
read_when:
  - You are implementing Codesight memory integration in OpenClaw
  - You need ARM64 Raspberry Pi (8GB) rollout constraints and acceptance criteria
title: "Codesight Memory Plan (Pi ARM64)"
---

This plan defines a review-ready implementation path for integrating
[`codesight`](https://github.com/Houseofmvps/codesight) artifacts into OpenClaw
memory while preserving interactive latency on Raspberry Pi OS Trixie
(`arm64`, 8 GB RAM).

## Scope and sequencing

Deliver in this order:

1. `A`: Codesight artifact ingestion as a new memory corpus supplement.
2. `B`: cross-corpus ranking/normalization in memory-core.
3. `C`: native repo-intel compiler only if `A+B` show measurable wins.

Rationale: isolate risk and attribute wins to each change.

## Phase A: Codesight supplement

### Phase A goals

- Add a new plugin (`memory-codesight`) implementing
  `MemoryCorpusSupplement.search/get`.
- Read only generated artifacts:
  - `.codesight/CODESIGHT.md`
  - `.codesight/KNOWLEDGE.md`
  - `.codesight/wiki/*.md`
- Build incremental digest cache keyed by `mtime + size + sha256`.
- Return explicit provenance metadata:
  - `corpus = "codesight"`
  - `sourcePath`
  - `generatedAt`
  - `stale`
- Enforce hard query limits:
  - max parsed bytes per file
  - max files scanned per query
  - max snippet chars per hit

### Phase A acceptance criteria

- No behavior change when `.codesight/` is absent.
- Warm-cache supplement overhead stays below `150ms p95` on Pi.
- Identical inputs produce deterministic ordering.

## Phase B: memory architecture improvements

### Phase B goals

- Add corpus-aware normalization before merge
  (for builtin memory, wiki, and codesight corpora).
- Add per-corpus quotas before final rank
  (for example: `memory:2 wiki:2 codesight:2`, configurable).
- Add rerank tie-breakers in explicit order:
  1. normalized score
  2. freshness/staleness
  3. source diversity
  4. snippet quality
- Preserve diagnostics in result payload:
  - `vectorScore`
  - `textScore`
  - `normalizedScore`
  - `finalScore`
- Add rollout flags:
  - `memorySearch.query.crossCorpus.enabled`
  - `memorySearch.query.crossCorpus.normalization`
  - `memorySearch.query.crossCorpus.quota`
  - `memorySearch.query.crossCorpus.stalenessPenalty`

### Phase B acceptance criteria

- Existing single-corpus ranking tests keep passing.
- Mixed-corpus relevance and citation diversity improve in snapshots.
- With cross-corpus flags off, behavior is unchanged (or documented).

## Phase C: Pi/Trixie operational hardening

### Phase C goals

- Run Codesight refresh out-of-band (systemd timer or post-commit hook),
  never on request path.
- De-prioritize refresh process:
  - `Nice=10`
  - `IOSchedulingClass=idle`
  - lower `CPUWeight`
- Add process ceilings:
  - `TimeoutStartSec`
  - `MemoryMax`
- Define stale-serving behavior:
  - serve last-known-good index when refresh fails
  - mark results with `stale=true`
  - emit warnings only after repeated failures

### Phase C acceptance criteria

- Interactive latency remains stable during refresh runs.
- No boot-time dependency on refresh completion.
- Refresh failures recover automatically without manual intervention.

## Initial Pi profile

Recommended starting values for `arm64` Pi 8GB:

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        query: {
          maxResults: 4,
          hybrid: {
            candidateMultiplier: 2,
            mmr: { enabled: true },
          },
        },
        sync: {
          watchDebounceMs: 5000,
          intervalMinutes: 15,
        },
        cache: { maxEntries: 15000 },
      },
    },
  },
  memory: {
    backend: "qmd",
    qmd: {
      searchMode: "search",
    },
  },
}
```

Notes:

- Keep QMD `searchMode: "search"` for the interactive path on Pi.
- Reserve `query`/rerank-heavy QMD flows for explicit deep-recall operations.

## Verification plan

Run all of the following before default enablement:

1. Unit tests:
   - artifact parser + cache invalidation
   - normalization math
   - per-corpus quota enforcement
   - staleness penalty behavior
2. Integration tests:
   - `.codesight/` present and absent
   - corrupted/partial artifact files
   - mixed-corpus search snapshots
3. Pi performance:
   - `p50/p95` search latency (`cold` and `warm`)
   - CPU/IO impact during background refresh
   - memory footprint over 24h soak
4. Regression tests:
   - sqlite-vec unavailable fallback behavior
   - QMD enabled/disabled parity

## Implementation anchors

Core integration points in OpenClaw:

- config defaults and limits:
  - `src/agents/memory-search.ts`
- memory plugin capability and corpus supplement contracts:
  - `src/plugins/memory-state.ts`
- builtin search merge/ranking path:
  - `extensions/memory-core/src/memory/hybrid.ts`
  - `extensions/memory-core/src/memory/manager-search.ts`
- wiki corpus supplement behavior:
  - `extensions/memory-wiki/src/corpus-supplement.ts`
  - `extensions/memory-wiki/src/query.ts`
- QMD behavior and Pi notes:
  - `docs/concepts/memory-qmd.md`
  - `docs/reference/memory-config.md`
