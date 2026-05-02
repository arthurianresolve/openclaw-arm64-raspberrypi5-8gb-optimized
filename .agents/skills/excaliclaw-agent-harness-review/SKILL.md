---
name: excaliclaw-agent-harness-review
description: Review substantial Excaliclaw agent harness changes across sandboxing, approvals, hooks, skills, memory, subagents, MCP, validation, and rollback.
---

# Excaliclaw Agent Harness Review

Use this skill when a change affects agent runtime behavior, prompts, command
execution, sandbox policy, approvals, hooks, skills, memory, subagents, MCP,
provider payloads, or autonomous workflow validation.

This is a clean-room Excaliclaw workflow. Public agent guides can inform review
vocabulary, but OpenClaw docs and current code are the source of truth.

## Inputs

Read only the surfaces that match the change:

- `AGENTS.md`
- `MEMORY.md`
- `docs/concepts/agentic-architecture.md`
- `docs/tools/exec-approvals.md` and `docs/tools/elevated.md` for command or
  sandbox policy
- `docs/tools/skills.md` and `docs/tools/creating-skills.md` for skill changes
- `docs/tools/subagents.md` for subagent routing
- `docs/cli/mcp.md` and `docs/tools/acp-agents.md` for MCP or ACP changes
- `docs/tools/trajectory.md` for debugging and evidence artifacts

## Review Checklist

- Owner path: identify the component that owns the invariant instead of
  patching prompts by default.
- Trust boundary: mark untrusted inputs, fallback-only events, external
  providers, third-party actions, and imported state explicitly.
- Determinism: prefer schemas, typed state, command policy, tests, and dry-run
  previews over prompt-only promises.
- Context budget: keep main-session context lean; use subagents only when work
  is independent and bounded.
- Memory safety: separate durable user facts from session-local handoff notes;
  avoid storing secrets or local machine details in public docs.
- Validation: map each changed invariant to the narrowest deterministic proof,
  then add trajectory, QA, parity, or manual transcript evidence when runtime
  behavior cannot be unit-tested.
- Rollback: define the artifact that would prove the fix was wrong and the
  owner path to pivot to next.

## Output

For implementation tasks, produce or update an agentic change record when the
change is risky. For review-only tasks, report:

- beneficial parts to adopt
- rejected parts and why
- owner paths
- validation commands
- residual risks
