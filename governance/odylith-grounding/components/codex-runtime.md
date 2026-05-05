# Codex runtime bridge

## Summary

The Codex runtime bridge owns the OpenClaw-to-Codex app-server handoff. It is
responsible for projecting assembled context into Codex-safe prompt inputs,
maintaining thread bindings, and preserving the boundary where Codex owns the
native loop while OpenClaw still owns channel delivery and plugin context.

## Entry points

- `extensions/codex/index.ts`
- `extensions/codex/src/app-server/run-attempt.ts`
- `extensions/codex/src/app-server/context-engine-projection.ts`
- `extensions/codex/src/conversation-binding.ts`

## Invariants

- OpenClaw assembles context first; Codex sees a projection of that context.
- The projection must mark context as quoted reference, not fresh instructions.
- Native Codex compaction and OpenClaw transcript mirroring must stay aligned.

## Failure modes

- duplicated trailing user prompt in projected context
- context projected as instructions instead of quoted reference
- Codex thread state or transcript mirror divergence
- compaction notifications emitted without matching runtime state

## Validation

- `pnpm test extensions/codex`
- `pnpm build`
