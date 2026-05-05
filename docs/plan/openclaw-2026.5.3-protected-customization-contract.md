# OpenClaw 2026.5.3 Protected Customization Contract (Excaliclaw)

## Purpose

This contract defines fork-owned behavior that must not be impaired while upgrading toward upstream `2026.5.3`.

## Branch Inputs

- `master` (base)
- `upstream/openclaw-2026.4.27`
- `upstream/openclaw-2026.5.2`
- `upstream/openclaw-2026.5.3`

## Conflict Rules

- `fork` owner: preserve Excaliclaw behavior; adapt upstream around the seam.
- `shared` owner: prefer upstream unless it regresses a protected behavior below.
- Every intentional divergence must be logged in `MEMORY.md` with reason and re-evaluation trigger.

## Protected Surfaces

| Surface                                                              | Owner  | Required Behavior                                                                    | Verification Command                                                                                                                       | Conflict Rule                                     |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `.agents/skills/excaliclaw-*`                                        | fork   | Excaliclaw maintainer/spec/review workflows remain available and unchanged in intent | `rg -n "name: excaliclaw-\|Use this skill for\|Priority" .agents/skills/excaliclaw-*`                                                      | keep fork                                         |
| `MEMORY.md` + `docs/concepts/agentic-architecture.md`                | fork   | Fork operational memory and trust-boundary guidance remain intact                    | `rg -n "trust-boundary\|Dependabot\|Pi\|agentic" MEMORY.md docs/concepts/agentic-architecture.md`                                          | keep fork                                         |
| `.github/workflows/ci.yml` and maintainer/dependabot guard workflows | fork   | Dependabot/maintainer skip policy semantics remain effective                         | `rg -n "dependabot\|pull_request_target\|author\|actor\|skip" .github/workflows/*.yml`                                                     | keep fork semantics; adapt upstream pins only     |
| `scripts/run-vitest.mjs`                                             | fork   | PTY/no-output watchdog and Pi-safe behavior do not regress                           | `pnpm test test/scripts/run-vitest.test.ts`                                                                                                | keep fork                                         |
| `scripts/test-projects.mjs`                                          | fork   | Pi profile scheduling, shard behavior, and no-output handling remain stable          | `pnpm test test/scripts/test-projects.test.ts`                                                                                             | keep fork                                         |
| `extensions/memory-codesight/**`                                     | fork   | Plugin remains buildable and functional with same contract                           | `pnpm test extensions/memory-codesight`                                                                                                    | keep fork                                         |
| `extensions/odylith-grounding/**`                                    | fork   | Plugin remains buildable and functional with same contract                           | `pnpm test extensions/odylith-grounding`                                                                                                   | keep fork                                         |
| `src/tasks/**` touched by upstream merges                            | shared | No regression in task verification/runtime behavior relied on by fork                | `pnpm test src/tasks`                                                                                                                      | prefer upstream, preserve fork-dependent behavior |
| `src/gateway/**` touched by upstream merges                          | shared | No regression in config/runtime seams used by fork plugins/workflows                 | `pnpm test src/gateway`                                                                                                                    | prefer upstream, patch for fork compatibility     |
| `src/infra/update*` and doctor/update paths                          | shared | Update/doctor behavior remains Pi-safe and fork-correct                              | `pnpm test src/infra/update-check.test.ts src/infra/update-runner.test.ts src/commands/doctor-platform-notes.startup-optimization.test.ts` | prefer upstream with fork-compatible fixes        |

## Mandatory Compile Gates (per merge checkpoint)

Run sequentially on Raspberry Pi 5 8GB:

- `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:core`
- `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:src`
- `OPENCLAW_TSGO_HEAVY_CHECK_LOCK_HELD=1 pnpm tsgo:test:root`

## Mandatory Stability Rules (arm64 Pi5)

- Run heavy checks sequentially only.
- No parallel independent `pnpm test` or `tsgo` commands in same worktree.
- For broad test passes use: `OPENCLAW_TEST_PROFILE=pi5-8gb pnpm test`.
- Fail current merge checkpoint on repeatable OOM, repeatable watchdog stall, or protected behavior regression.

## Merge Checkpoints

1. Merge `upstream/openclaw-2026.4.27` into branch, run full gates, log divergences.
2. Merge `upstream/openclaw-2026.5.2` into branch, run full gates, log divergences.
3. Merge `upstream/openclaw-2026.5.3` into branch, run full gates, log divergences.

No checkpoint may proceed until gates for current checkpoint are green.
