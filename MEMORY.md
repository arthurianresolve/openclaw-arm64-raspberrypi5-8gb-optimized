# Excaliclaw Memory

Updated: 2026-05-03

## Decisions

- Prefer selective upstream ports from `openclaw/openclaw`; do not blind-sync when local work exists.
- Keep TypeScript strict. Use repo `tsgo` wrappers, not ad hoc `tsc --noEmit`.
- Preserve helper seams. Avoid hard-coded owner/plugin exceptions when a generic helper works.
- Rebuild only derived data. Session skill hydration should restore missing `resolvedSkills` and leave persisted fields alone.
- Make trust explicit. Fallback or synthesized events should be `trusted: false`.
- Keep public docs generic OpenClaw-facing. Fork-local or machine-local facts belong in memory, skills, or handoff notes, not Mintlify docs.
- Treat external agentic repos as design influences unless they have a local owner path, validation artifact, and rollback or pivot trigger.
- For risky runtime, prompt, command, harness, context, or tool-contract changes, require an agentic change record with failure evidence, root cause, targeted fix, changed invariant, risk surface, validation artifact, and pivot trigger.
- Use agentic pattern catalogs as review vocabulary only. Adopt PEV, dry-run, meta-controller, memory, ensemble, and attribution ideas when they map to OpenClaw owner paths; reject Python/LangChain/LangGraph/Jupyter/Nebius/Tavily/Neo4j/FAISS/notebook-code dependencies by default.
- Treat third-party GitHub Actions as trust-boundary dependencies. Review action bumps for behavior changes, not just version numbers.
- Use clean-room spec-first workflow ideas from `warpdotdev/warp` only as process influence. Do not import Warp implementation code, command-signature bundles, UI code, or verbatim skill text.
- For substantial or ambiguous work, prefer repo-local spec skills: `$excaliclaw-product-spec` for `PRODUCT.md`, `$excaliclaw-tech-spec` for `TECH.md`, and `$excaliclaw-spec-driven-implementation` to decide whether the overhead is warranted.

## Validation

- On the Raspberry Pi 8 GB / Raspberry Pi OS Trixie host, run heavy checks sequentially.
- Do not run multiple independent `pnpm test` or `tsgo` jobs in parallel in one worktree.
- Default strict compile proof:
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:core`
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:src`
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:root`
- For `test/scripts/*`, use the tooling Vitest config with an explicit JSON include file if routing misses the file.
- Docs-only architecture changes use `git diff --check` plus `pnpm check:docs`; `docs:check-i18n-glossary` may skip when no merge base exists.

## Harness

- Local heavy-check locks live under `.git/openclaw-local-checks/`.
- If the owner PID is dead, reclaim the lock.
- Log stale-lock reclamation so self-healing is visible.
- Keep `scripts/run-vitest.mjs` and `scripts/test-projects.mjs` aligned for `close` completion, PTY fallback, and no-output watchdog behavior.

## Git

- `git push` may need `gh auth setup-git` even when `gh auth status` already passes.
- Canonical remote: `origin/master`.
- Canonical GitHub repo: `arthurianresolve/excaliclaw`; upstream comparison source: `openclaw/openclaw`.
- Keep upstream-port commits grouped by behavior.

## Session Facts

- Prompt-corpus fetch controls were fixed before push.
- Vitest direct runs now use PTY fallback and wait for `close`.
- PTY output is sanitized and carriage-return progress updates are rendered logically.
- The key upstream ports were session skill hydration, restart-lock recovery, `SecretRef` auth-rotation detection, plugin audit debris filtering, and fallback trust marking.
- A stale heavy-check lock once hit an `EPERM` liveness edge; the helper now reclaims it and logs the reclaim.
- Added `docs/concepts/agentic-architecture.md` and docs nav entry. The page captures orchestration, context, harnesses, advanced feature engineering, command and prompt adoption, debugging, validation, upstream/downstream port review, external references considered, and agentic pattern applicability.
- Added clean-room spec workflow skills inspired by Warp's public repository process, adapted to excaliclaw and tied to the existing agentic change record.
- PR #22 (Gradle wrapper bump) was merged after fixing maintainer automation skips for Dependabot PRs. The durable fix was committed on `master` because `pull_request_target` uses the base-branch workflow files.
- PR #23 (actions group bump) was merged; it updated `openai/codex-action` to `v1.8` and `pnpm/action-setup` to `v6.0.3`. The `codex-action` change was behavior-relevant, while the pnpm action bump was effectively pinned away by the repo's explicit pnpm versioning.
- Documentation now records the trust-boundary impact of workflow-action bumps in `docs/concepts/agentic-architecture.md` and `docs/help/testing.md`.
- External references reviewed this session: `china-qijizhifeng/agentic-harness-engineering` for change attribution and pivot rules; `FareedKhan-dev/all-agentic-architectures` for pattern taxonomy. Both are design influences, not implementation dependencies.
