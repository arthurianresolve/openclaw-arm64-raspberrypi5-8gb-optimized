---
summary: "Odylith-inspired bounded repo grounding as an OpenClaw context-engine plugin"
title: "Odylith Grounding"
read_when:
  - You want narrower, fail-closed repo grounding for repeated maintenance work
  - You are enabling a context-engine plugin for Codex or PI runtime work
  - You need to update the governed component catalog used by the grounding engine
---

`odylith-grounding` is a bundled `context-engine` plugin for `excaliclaw`.

It does **not** install the full Odylith product. Instead, it borrows the part
that fits OpenClaw cleanly here: bounded repo grounding before a turn starts.

## What it does

Before a model run, the plugin tries to bind the request to the smallest honest
slice it can justify.

Signals it uses:

- explicit repo paths in the prompt or recent transcript
- a tracked governance catalog under `governance/odylith-grounding/`
- component keywords, invariants, docs, and validation targets from that catalog
- scoped `AGENTS.md` and `CLAUDE.md` files near the matched paths

When the slice is strong, the plugin injects:

- the target component
- owned paths
- relevant docs
- validation targets
- working invariants
- a dossier excerpt

When the slice is weak, it fails closed and tells the runtime not to broaden
into a blind repo scan.

## What it does not do

- no repo-root guidance takeover
- no `.codex/` or `.claude/` asset management
- no full Compass, Radar, Atlas, or Casebook surface set
- no execution-engine enforcement beyond prompt guidance

## Enable it

```json5
{
  plugins: {
    slots: {
      contextEngine: "odylith-grounding",
    },
    entries: {
      "odylith-grounding": {
        enabled: true,
        config: {
          repoRoot: ".",
          governanceRoot: "governance/odylith-grounding",
          historyWindowMessages: 12,
          maxCandidateComponents: 2,
          dossierCharBudget: 1400,
        },
      },
    },
  },
}
```

## Governed seed

The initial seed is intentionally small:

- `codex-runtime`
- `context-engine-core`
- `embedded-runner`
- `plugin-control-plane`

Update the tracked catalog in `governance/odylith-grounding/component-catalog.json`
when those boundaries or validation targets move.

## Related

- [Context engine](/concepts/context-engine)
- [Agent runtimes](/concepts/agent-runtimes)
- [Plugin internals](/plugins/architecture)
