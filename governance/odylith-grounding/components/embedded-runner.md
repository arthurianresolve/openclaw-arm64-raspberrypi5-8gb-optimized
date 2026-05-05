# Embedded PI runner

## Summary

The embedded PI runner owns the default OpenClaw execution loop. It assembles
model context, executes tools, applies overflow compaction recovery, and runs
post-turn maintenance including deferred context-engine work.

## Entry points

- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-runner/context-engine-maintenance.ts`
- `src/agents/harness/context-engine-lifecycle.ts`

## Invariants

- prepared prompt assembly remains runtime-owned in PI mode
- deferred maintenance cannot rewrite transcript lineage unsafely
- retries and overflow compaction reuse stable runtime context

## Failure modes

- maintenance tasks race with active transcript updates
- overflow compaction drops runtime state needed for recovery
- prompt assembly and maintenance disagree about token accounting

## Validation

- `pnpm test src/agents/pi-embedded-runner/run/attempt.test.ts`
- `pnpm build`
