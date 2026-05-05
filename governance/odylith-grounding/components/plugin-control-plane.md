# Plugin control plane

## Summary

The plugin control plane owns manifest validation, capability registration,
activation planning, and plugin runtime boundaries. New bundled plugins must fit
here cleanly without reaching into core internals from extension code.

## Entry points

- `src/plugins/registry.ts`
- `src/plugins/types.ts`
- `src/plugins/loader.ts`
- `docs/plugins/architecture.md`
- `docs/plugins/manifest.md`

## Invariants

- extension production code stays on `openclaw/plugin-sdk/*` seams
- manifest metadata remains cheap and accurate without loading plugin runtime code
- context-engine ids stay plugin-owned and cannot reuse the reserved `legacy` id

## Failure modes

- plugin code depends on core internals instead of plugin-sdk seams
- manifest/runtime drift makes validation or activation misleading
- duplicate context-engine ids or incompatible slot ownership

## Validation

- `pnpm test src/plugins/loader.test.ts`
- `pnpm build`
