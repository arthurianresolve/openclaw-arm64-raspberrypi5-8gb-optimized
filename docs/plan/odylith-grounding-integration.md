---
summary: "RFC for the Odylith-inspired grounding plugin and governed component seed in excaliclaw"
title: "Odylith Grounding Integration"
read_when:
  - You want the rationale for adding the odylith-grounding plugin
  - You are expanding or replacing the governed component seed
  - You need to review the integration boundary against core plugin rules
---

## Decision

`excaliclaw` adopts a narrow Odylith-inspired integration instead of a full
Odylith install.

Chosen:

- a bundled `context-engine` plugin: `odylith-grounding`
- a small tracked governance catalog under `governance/odylith-grounding/`
- bounded subagent packet inheritance
- fail-closed widening guidance

Rejected for now:

- repo-root guidance takeover
- managed `.codex/`, `.claude/`, or `.agents/skills/` mutation
- full Odylith governance surfaces
- Tribunal or Remediator style orchestration

## Why this shape fits

`excaliclaw` already has the correct seam for this work:

- pluggable context engines
- Codex prompt projection
- existing memory and dreaming systems
- extension-owned plugin boundaries

That means the efficient move is to add better grounding at assemble time,
without fighting the repo's current runtime and plugin ownership model.

## Initial governed seed

The first tracked component set is intentionally limited to the areas where
agent rediscovery cost is highest:

- Codex runtime bridge
- context-engine core
- embedded PI runner
- plugin control plane

Each component carries:

- owned paths
- keywords
- relevant docs
- tests and validation targets
- invariants
- a short dossier

## Expected effect

This integration is meant to reduce:

- blind repo scans for routine maintenance
- repeated rediscovery of the same boundaries
- subagent launches without enough local slice context
- edits that widen before the operator has explained why widening is necessary

## Maintenance rule

Keep the governance seed small and high signal.

If a component cannot justify durable invariants, validation targets, and owned
paths, it does not belong in the catalog yet.
