---
name: excaliclaw-spec-driven-implementation
description: Decide when excaliclaw work needs PRODUCT.md and TECH.md specs, keep them current, then implement and validate against them.
---

# Excaliclaw Spec-Driven Implementation

Use this skill when starting or reviewing substantial OpenClaw/excaliclaw work
where a checked-in spec would reduce ambiguity, improve agent execution, or make
ClaudeCode review faster.

This skill adapts a public spec-first repository pattern to excaliclaw. It is
process guidance only. Do not copy external code or templates.

## Decision

Create specs when the change has one or more of these traits:

- product or architecture ambiguity
- expected implementation size around 1k LOC or more
- cross-subsystem ownership
- risky behavior where regressions would be expensive
- multiple agents or reviewers need a shared contract
- behavior needs acceptance criteria before implementation starts

Skip specs when the work is a small fix, a straightforward refactor, a narrow
dependency update, or a docs correction where the existing docs are the spec.

## Workflow

1. Read `AGENTS.md`, `MEMORY.md`, and relevant docs.
2. Decide whether specs are worth the overhead.
3. If behavior is ambiguous, write `specs/<id>/PRODUCT.md` with
   `$excaliclaw-product-spec`.
4. If implementation is substantial, write `specs/<id>/TECH.md` with
   `$excaliclaw-tech-spec`.
5. Implement against the approved spec, preserving existing ownership
   boundaries.
6. Keep `PRODUCT.md` and `TECH.md` current when behavior, boundaries, risks, or
   validation change during implementation.
7. Validate the shipped behavior against the numbered product invariants and
   tech-spec validation plan.

## Relationship To Agentic Change Records

Specs do not replace the agentic change record in
`docs/concepts/agentic-architecture.md`.

- Use `PRODUCT.md` for behavior the consumer relies on.
- Use `TECH.md` for implementation and validation.
- Use an agentic change record for risky runtime, prompt, command, harness,
  context, or tool-contract changes.

For large agentic work, include the agentic change record inside `TECH.md`.
For small risky fixes, the change record alone is enough.

## Handoff

When handing work to ClaudeCode or another reviewer, include:

- spec path, if specs were created
- behavior invariants implemented
- files changed
- validation commands and results
- any spec deltas made during implementation
