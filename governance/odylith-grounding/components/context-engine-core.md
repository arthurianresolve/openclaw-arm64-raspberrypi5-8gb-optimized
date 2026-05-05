# Context engine core

## Summary

This component defines the contract all context-engine plugins must satisfy. It
covers lifecycle methods, token-budget semantics, compaction delegation, and the
subagent preparation hooks that allow context to follow bounded delegated work.

## Entry points

- `src/context-engine/types.ts`
- `src/context-engine/registry.ts`
- `src/context-engine/delegate.ts`
- `src/context-engine/init.ts`

## Invariants

- selected engine resolution must fail closed when the configured engine is invalid
- `assemble()` must return ordered messages plus a token estimate
- compaction delegation must preserve runtime-owned transcript rotation behavior

## Failure modes

- invalid engine selected but silently ignored
- engine returns unusable prompt payloads or token estimates
- transcript rotation data dropped during delegated compaction
- subagent context leaks between unrelated sessions

## Validation

- `pnpm test src/context-engine/context-engine.test.ts`
- `pnpm build`
