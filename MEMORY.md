# Excaliclaw Memory

Updated: 2026-05-02

## Decisions

- Prefer selective upstream ports from `openclaw/openclaw`; do not blind-sync when local work exists.
- Keep TypeScript strict. Use repo `tsgo` wrappers, not ad hoc `tsc --noEmit`.
- Preserve helper seams. Avoid hard-coded owner/plugin exceptions when a generic helper works.
- Rebuild only derived data. Session skill hydration should restore missing `resolvedSkills` and leave persisted fields alone.
- Make trust explicit. Fallback or synthesized events should be `trusted: false`.

## Validation

- On the Raspberry Pi 8 GB / Raspberry Pi OS Trixie host, run heavy checks sequentially.
- Do not run multiple independent `pnpm test` or `tsgo` jobs in parallel in one worktree.
- Default strict compile proof:
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:core`
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:src`
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:root`
- For `test/scripts/*`, use the tooling Vitest config with an explicit JSON include file if routing misses the file.

## Harness

- Local heavy-check locks live under `.git/openclaw-local-checks/`.
- If the owner PID is dead, reclaim the lock.
- Log stale-lock reclamation so self-healing is visible.
- Keep `scripts/run-vitest.mjs` and `scripts/test-projects.mjs` aligned for `close` completion, PTY fallback, and no-output watchdog behavior.

## Git

- `git push` may need `gh auth setup-git` even when `gh auth status` already passes.
- Canonical remote: `origin/master`.
- Keep upstream-port commits grouped by behavior.

## Session Facts

- Prompt-corpus fetch controls were fixed before push.
- Vitest direct runs now use PTY fallback and wait for `close`.
- PTY output is sanitized and carriage-return progress updates are rendered logically.
- The key upstream ports were session skill hydration, restart-lock recovery, `SecretRef` auth-rotation detection, plugin audit debris filtering, and fallback trust marking.
- A stale heavy-check lock once hit an `EPERM` liveness edge; the helper now reclaims it and logs the reclaim.
