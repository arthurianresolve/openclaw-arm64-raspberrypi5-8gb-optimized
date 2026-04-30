# Odylith Grounding Seed

This tree is the minimal governed truth layer consumed by the bundled
`odylith-grounding` context-engine plugin.

It intentionally stays small.

Goals:

- give the agent stable component boundaries for repeated work in this repo
- reduce blind repo scans for common maintenance tasks
- keep the truth layer close to the code without imposing full Odylith product workflow

Current seeded components:

- `codex-runtime`
- `context-engine-core`
- `embedded-runner`
- `plugin-control-plane`

Update discipline:

- change component dossiers when invariants, entrypoints, or validation targets move
- keep the catalog in `component-catalog.json` aligned with the markdown dossiers
- prefer small, high-signal updates over broad taxonomy growth
