---
name: excaliclaw-tech-spec
description: Write a TECH.md implementation plan grounded in current excaliclaw code, ownership boundaries, and validation.
---

# Excaliclaw Tech Spec

Use this skill after `PRODUCT.md` exists, or when the user explicitly asks for
an implementation plan for a substantial change. The tech spec translates agreed
behavior into repo-specific files, boundaries, risks, and validation.

This is a clean-room excaliclaw workflow. Do not import external code,
templates, or legal assumptions. Ground the plan in this repository.

## Before Writing

Read the relevant docs and code first:

- `AGENTS.md`
- `MEMORY.md`
- `docs/concepts/agentic-architecture.md` for agentic/runtime work
- the nearest scoped `AGENTS.md` for touched subtrees
- the relevant existing implementation and tests

Do not guess current architecture when it can be inspected.

## Path

Write specs under `specs/<id>/TECH.md`, using the same `<id>` as the related
`PRODUCT.md` when one exists.

## Required Sections

```markdown
# <Feature Name> Tech Spec

Status: draft

## Context

## Proposed Changes

## Validation

## Risks And Mitigations
```

## Content Rules

- Reference concrete repo paths and line numbers when describing current code.
- Map each important `PRODUCT.md` behavior invariant to a test, check, manual
  proof, or documented non-test validation.
- Identify the owner boundary: core, gateway, command, plugin, channel, UI,
  docs, tests, workflow, or local maintainer policy.
- Prefer existing helpers, schemas, registries, and command surfaces.
- Call out rejected alternatives only when a reviewer might reasonably ask why
  they were not chosen.
- Include an agentic change record when the plan touches runtime, prompt,
  command, harness, context, tool contracts, provider-visible payloads, or
  selective upstream/downstream ports.

## Validation Rules

Use the narrowest proof that covers the changed invariant:

- docs-only: `git diff --check` plus `pnpm check:docs`
- workflow-only: `git diff --check` plus workflow syntax/lint when available
- source or tests: `pnpm changed:lanes --json`, then the narrowest applicable
  repo check or Vitest route
- risky agentic behavior: include QA, trajectory, parity, or live proof when
  deterministic unit tests are insufficient
