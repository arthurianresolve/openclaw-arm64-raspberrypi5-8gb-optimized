---
name: excaliclaw-maintainer
description: Maintain arthurianresolve/excaliclaw with selective upstream ports, strict TypeScript proof, and sequential validation on constrained hardware.
---

# Excaliclaw Maintainer

Use this skill for `arthurianresolve/excaliclaw`.

## Read First

- [`AGENTS.md`](/home/george/excaliclaw/AGENTS.md)
- [`MEMORY.md`](/home/george/excaliclaw/MEMORY.md)
- [`docs/reference/test.md`](/home/george/excaliclaw/docs/reference/test.md)
- [`docs/reference/AGENTS.default.md`](/home/george/excaliclaw/docs/reference/AGENTS.default.md)

## Default Behavior

- Prefer selective upstream ports over blind syncs.
- Keep TypeScript strict. Preserve helper seams. Avoid one-off special cases.
- Make trust explicit. If an event is synthesized or fallback-only, mark it `trusted: false`.
- Rebuild only derived data. For session skills, restore missing `resolvedSkills` without mutating persisted fields.
- Keep audit and security helpers generic. Filter by structure, not plugin name, when possible.
- Keep public docs generic OpenClaw-facing. Put fork-local, machine-local, and session-local facts in memory, skill guidance, or handoff notes.
- For agentic architecture work, use `docs/concepts/agentic-architecture.md` as the durable map.
- Treat third-party GitHub Actions as trust-boundary dependencies. Review them for behavior changes, not just version bumps.
- Treat global TypeScript declaration packages as public type-surface risks. `@total-typescript/ts-reset` is allowed only through `internal-types/ts-reset.d.ts` with scoped JSON/fetch imports unless plugin SDK declaration drift checks prove a broader reset is safe.
- Use clean-room process ideas from `warpdotdev/warp` only when they fit OpenClaw ownership and validation. Do not import Warp code, command-signature bundles, UI code, or verbatim skill text.
- Use clean-room learning-path ideas from public guide sets only as docs information architecture. Sequence existing OpenClaw docs by role or task; do not copy guide text, external ordering, or vendor claims.
- For substantial or ambiguous changes, consider `$excaliclaw-spec-driven-implementation`. Use `$excaliclaw-product-spec` for behavior and `$excaliclaw-tech-spec` for implementation plans.
- For risky agent runtime, prompt, tool, sandbox, approval, memory, subagent, MCP, or autonomous workflow changes, use `$excaliclaw-agent-harness-review`.
- Keep `oxlint` and `vitest` stable on `master`. If prereleases are worth evaluating, do it on a canary branch or CI lane first and only promote after they show a concrete repo-level benefit without breaking custom wrappers or sequential validation.

## Validation

- On the Raspberry Pi host, run heavy checks sequentially.
- For `oxlint`, prefer the sequential shard runner with the 4 GB heap cap and small file batches on the Raspberry Pi 5 8 GB host; treat that tuning as arm64-specific unless a later benchmark proves otherwise.
- For `pnpm test` on the Raspberry Pi 5 8 GB host, prefer `OPENCLAW_TEST_PROFILE=pi5-8gb` or `pnpm test:perf:arm64`; the profile serializes shards, defaults Vitest to one worker, keeps local-check policy enabled, and reports profile/timing data through plan or benchmark JSON.
- Do not launch multiple independent `pnpm test` or `tsgo` jobs in parallel in the same worktree.
- Use these compile checks first:
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:core`
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:src`
  - `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:root`
- For `test/scripts/*`, use the tooling Vitest config plus an explicit JSON include file when default routing misses the file.
- Prove the touched surface first. Broaden only when the changed contract requires it.
- Docs-only architecture changes use `git diff --check` plus `pnpm check:docs`.

## Harness Notes

- Local heavy-check locks live under `.git/openclaw-local-checks/`.
- If a lock owner PID is dead, reclaim the lock instead of waiting.
- Prefer a visible reclamation log when the helper self-heals a stale lock.
- Keep `scripts/run-vitest.mjs` and `scripts/test-projects.mjs` aligned for `close` completion, PTY fallback, and no-output watchdog behavior.

## Agentic Architecture Notes

- Require an agentic change record for risky runtime, prompt, command, harness, context, or tool-contract changes.
- Change records should include failure evidence, root cause, targeted fix, component level, owner path, changed invariant, predicted impact, risk surface, validation artifact, and rollback or pivot trigger.
- External agentic repos are design influences unless they map to an OpenClaw owner path and validation artifact.
- Adopt process ideas from agentic harness references: change attribution, component pivot rules, PEV, dry-run, meta-controller vocabulary, memory/reasoning vocabulary, and evidence ladders.
- Reject implementation dependencies from those references by default: Python harness code, LangChain, LangGraph, Jupyter, Nebius, Tavily, Neo4j, FAISS, E2B, NexAU, tmux, high-concurrency loops, and autonomous policy mutation.
- Repo-local spec skills complement the agentic change record. `PRODUCT.md` owns behavior, `TECH.md` owns implementation and validation, and the change record owns risky agentic invariant attribution.

## Git / Push

- If `git push` fails while `gh auth status` is healthy, run `gh auth setup-git` and retry.
- Push to `origin/master`.
- GitHub repo is `arthurianresolve/excaliclaw`; upstream comparison source is `openclaw/openclaw`.
- Keep upstream-port commits grouped by behavior.

## Current Memory

- Prompt-corpus cache integrity and fetch-control fixes were already ported.
- Vitest direct runs use PTY fallback when useful and wait for `close`.
- PTY output is sanitized and carriage-return progress updates are rendered logically.
- On the Raspberry Pi 5 8 GB host, the shared `extensions` Vitest project needs a 300000ms per-test timeout for `extensions/codex/src/app-server/run-attempt.test.ts`, and the sequential full-suite `pnpm test` path needs a 420000ms no-output watchdog budget.
- Arm64/Pi validation speedups should favor deterministic scheduling over added concurrency: sequential full-suite runs reuse `.artifacts/vitest-shard-timings.json` longest-first, with static wrapper weights as fallback, and `--benchmark-json` records shard durations and no-output retries.
- The key upstream ports here were session skill hydration, restart-lock recovery, `SecretRef` auth-rotation detection, plugin audit debris filtering, and fallback trust marking.
- A stale heavy-check lock once stalled on `EPERM`; the helper now reclaims it and logs the reclaim.
- `docs/concepts/agentic-architecture.md` now captures orchestration, context, harnesses, advanced feature engineering, command and prompt adoption, debugging, validation, upstream/downstream port review, external references considered, and agentic pattern applicability.
- Workflow-action review lessons from 2026-05-03: `openai/codex-action` bumps may tighten bot eligibility and should be treated as behavior changes; `pnpm/action-setup` bumps are usually inert when the workflow passes an explicit `version` or the repo pins `packageManager`.
- Dependabot PR maintenance lesson: if a `pull_request_target` job fails on a merged or rebased Dependabot PR, update the base branch workflow file on `master` and then rebase the PR head so GitHub reevaluates the real policy.
- Warp review lesson: the useful integration path is clean-room spec workflow guidance, not direct terminal/UI/code integration.
- Blake guide-set review lesson: adopt clean-room review vocabulary and docs sequencing only. Keep media prompt guidance provider-neutral, enforce iOS agent boundaries locally, sequence existing OpenClaw docs by role, and defer retrieval runtime changes until benchmarked.
- ts-reset review lesson: scoped JSON/fetch reset improves internal boundary safety, but full reset bundles are rejected by default because Excaliclaw publishes plugin SDK declarations.
