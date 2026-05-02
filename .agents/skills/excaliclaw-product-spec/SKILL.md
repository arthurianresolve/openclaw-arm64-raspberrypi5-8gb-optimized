---
name: excaliclaw-product-spec
description: Write a PRODUCT.md behavior spec for substantial OpenClaw/excaliclaw changes before implementation.
---

# Excaliclaw Product Spec

Use this skill when a requested change is user-facing, behaviorally ambiguous,
or large enough that a reviewer should agree on behavior before code changes.

This is a clean-room excaliclaw workflow influenced by public spec-first
repository practices. Do not copy external spec text. Write OpenClaw-facing
behavior, using repo docs and code as the source of truth.

## When To Use

Use a product spec for:

- new or changed user-facing behavior
- command, config, gateway, UI, channel, plugin, or agent behavior with edge
  cases
- work where ClaudeCode or another reviewer needs clear acceptance criteria
- changes where the implementation should not define the product behavior by
  accident

Skip it for:

- small local bug fixes with an obvious expected result
- pure refactors with unchanged behavior
- narrow docs-only corrections
- dependency bumps whose behavior impact is already covered by release notes

## Path

Write specs under `specs/<id>/PRODUCT.md`.

Use this `<id>` order:

1. GitHub issue id as `gh-<number>` when the work tracks an issue.
2. PR id as `pr-<number>` when the spec documents a PR already under review.
3. Short kebab-case feature name when no issue or PR exists.

Do not create engineer-name subdirectories.

## Required Sections

Use only sections that add signal, but include these for normal feature specs:

```markdown
# <Feature Name> Product Spec

Status: draft

## Summary

## Behavior

## Non-Goals

## Open Questions
```

## Behavior Rules

- Describe behavior from the consumer's perspective: end user, CLI caller,
  plugin author, channel owner, gateway client, or maintainer.
- Number behavior invariants so `TECH.md` and tests can reference them directly.
- Include normal flow, error flow, empty state, cancellation, stale data, auth,
  permissions, and concurrency behavior when relevant.
- Keep implementation details out of `PRODUCT.md` unless they are visible API or
  compatibility contracts.
- Prefer concrete observable outcomes over intent words like "better",
  "improved", or "seamless".

## Review Hand-Off

End with any unresolved decisions that block implementation. If there are no
open questions, omit the `Open Questions` section instead of writing "none".
