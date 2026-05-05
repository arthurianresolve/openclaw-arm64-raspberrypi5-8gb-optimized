---
title: "GSD 2 Pattern Integration"
summary: "RFC for selectively importing GSD 2 orchestration patterns into OpenClaw without importing its standalone application shell"
read_when:
  - You are evaluating whether GSD 2 ideas belong in OpenClaw
  - You want a narrow plan for unit-oriented autonomous execution
  - You need to review project orchestration boundaries against existing Task Flow, Lobster, and context-engine architecture
---

## Status

Partially implemented.

Implemented now:

- typed `UnitContextPacket` persistence on flows and detached tasks
- typed `UnitVerificationPolicy` persistence and inheritance
- packet-aware Lobster flow metadata
- packet-aware subagent handoff via context engines
- bounded verification execution after successful unit completion
- automatic repair-task queueing with retry budget enforcement
- repair-priority ordering for owner-visible flow lists
- suppression of generic child work during `verification_repair`
- single active repair-task enforcement per flow
- durable typed `verificationState` storage plus maintenance backfill from legacy `stateJson.verification`
- `openclaw tasks flow audit` and machine-facing repair metrics

Still not implemented:

- isolated-session or isolated-subagent execution policy as a first-class flow runtime mode
- per-unit model routing
- optional worktree execution

## Decision

OpenClaw should not integrate GSD 2 as a product or control plane.

OpenClaw should selectively adopt a small set of GSD 2 patterns:

- fresh-session-per-unit execution
- typed unit context packets
- bounded verification and retry policy
- better detached-run forensics
- optional per-unit model routing

OpenClaw should not adopt:

- GSD's standalone CLI shell
- GSD's `.gsd/` state tree
- GSD's milestone or slice model as a new core product abstraction
- GSD's worktree-driven git lifecycle as a default execution model
- GSD's bundled extension sync and runtime loader model

## Why this RFC exists

GSD 2 and OpenClaw sit at different layers.

GSD 2 is an opinionated application built on the Pi SDK. Its value comes from
an explicit state machine, disk-backed project state, and autonomous dispatch
across milestone, slice, and task units.

OpenClaw is already the broader platform:

- multiple agent runtimes
- pluggable context engines
- detached task tracking
- Task Flow orchestration
- Lobster workflow execution
- memory and knowledge systems

That means the right question is not whether OpenClaw should "become GSD."
The right question is which GSD ideas improve OpenClaw's existing orchestration
surfaces without creating a competing control plane.

## Critique of the naive integration

The naive integration path is to copy GSD's whole autonomy layer into
OpenClaw. That would be a mistake for five reasons.

### 1. It duplicates state ownership

GSD's `.gsd/` files are its source of truth. OpenClaw already has durable state
for sessions, tasks, flows, hooks, memory, and plugin config. Adding a second
disk-first project state tree would create split-brain behavior and force
operators to reason about two orchestration systems.

### 2. It imports product policy, not just technical capability

GSD's milestone, slice, and task hierarchy is a workflow opinion. OpenClaw
should not make that opinion a core concept unless it wants to become a project
management product. The useful technical substrate is unit-oriented detached
execution, not the specific planning taxonomy.

### 3. It collides with existing orchestration surfaces

OpenClaw already has:

- Task Flow for durable multi-step orchestration
- Lobster for deterministic pipelines with approvals
- context engines for prompt assembly
- tasks for detached-run lifecycle tracking

Importing a second autonomous state machine without first mapping onto these
surfaces would create overlapping abstractions instead of improving the current
ones.

### 4. It would overfit OpenClaw to one execution style

GSD assumes "fresh session per unit" as a default. That is a good pattern for
some autonomous build workflows, but OpenClaw also serves chat, cron, gateway,
channel, ACP, and runtime-bridge use cases where session continuity is the
point. The pattern should be optional, not foundational.

### 5. It hides the riskiest feature behind the most attractive one

Worktree-based git automation, autonomous verification retries, and crash
recovery sound attractive together, but they carry very different risk.
OpenClaw should not bundle them into one large feature where failure analysis
becomes difficult. The safer path is to separate unit execution, verification,
and git isolation into phases.

## What GSD 2 gets right

The GSD 2 ideas worth importing are architectural, not cosmetic.

### Fresh session per unit

This is GSD's strongest execution pattern. It limits context bloat, lowers
rediscovery overhead, and reduces orchestration chatter inside long-lived
threads.

### Explicit dispatch packets

GSD does not merely ask the model to "read some files." It computes a focused
unit, selects the right context, and injects it deterministically. OpenClaw now
has the seams to do this via context engines and task orchestration.

### Verification as part of orchestration

Verification is not a follow-up suggestion. It is a step in the unit lifecycle.
That is a better abstraction than pushing verification discipline into prompts.

### Recovery-oriented observability

GSD treats stuck detection, timeout supervision, and forensics as first-class
execution concerns. OpenClaw already has a task ledger, so it can add better
recovery diagnostics without copying GSD's application shell.

### Optional model routing per unit

Per-unit model selection is useful when the orchestration layer knows the type
of work being executed. OpenClaw already tracks usage and cost; it lacks a
clean per-step policy layer above Task Flow and Lobster.

## Recommended integration target

The correct OpenClaw target is an optional unit-oriented orchestration layer
implemented on top of existing primitives:

- Task Flow owns multi-step state
- Lobster remains the deterministic workflow shell
- context engines assemble bounded unit context
- tasks remain the detached execution ledger
- runtimes remain runtime-specific

This RFC proposes a reusable concept called a `UnitContextPacket`.

## Proposed architecture

### New concept: UnitContextPacket

A `UnitContextPacket` is a typed, bounded description of one execution unit.
It is not a plan document format and it is not a second state store. It is the
machine-facing packet that detached execution receives.

Suggested shape:

```ts
type UnitContextPacket = {
  unitId: string;
  flowId?: string;
  objective: string;
  ownedPaths: string[];
  relevantDocs: string[];
  invariants: string[];
  validationCommands: string[];
  stopCondition?: string;
  modelHint?: "light" | "standard" | "heavy";
  contextMode: "shared-session" | "isolated-session" | "isolated-subagent";
  packetSource: "taskflow" | "lobster" | "cron" | "subagent" | "manual";
};
```

The key point is ownership:

- Task Flow or Lobster decides what unit is being executed
- the active context engine assembles the bounded packet context
- the runtime executes the unit
- the task ledger records what happened

### New execution mode: unit-oriented detached execution

Task Flow and Lobster should gain an optional execution policy:

- `shared-session`
- `isolated-session`
- `isolated-subagent`

This is where OpenClaw imports GSD's "fresh session per unit" idea without
forcing it into chat or normal gateway sessions.

### Context assembly should stay in context engines

GSD's focused context injection is valuable, but OpenClaw should not build a
separate prompt assembly subsystem for it. The packet should be passed into the
active context engine, and the engine should emit a bounded
`systemPromptAddition` or unit prompt projection.

That keeps one owner for context shaping.

## API sketch

The first implementation should stay smaller than the full plan. Phase 1 only
needs a packet contract and inheritance rules, not a full autonomous executor.

```ts
type UnitContextMode = "shared-session" | "isolated-session" | "isolated-subagent";
type UnitModelHint = "light" | "standard" | "heavy";
type UnitPacketSource = "taskflow" | "lobster" | "cron" | "subagent" | "manual";

type UnitContextPacket = {
  unitId: string;
  flowId?: string;
  objective: string;
  ownedPaths: string[];
  relevantDocs: string[];
  invariants: string[];
  validationCommands: string[];
  stopCondition?: string;
  modelHint?: UnitModelHint;
  contextMode: UnitContextMode;
  packetSource: UnitPacketSource;
};
```

Phase 1 write-path changes:

- `TaskFlowRecord.unitContextPacket?: UnitContextPacket`
- `TaskRecord.unitContextPacket?: UnitContextPacket`
- `BoundTaskFlowRuntime.createManaged({ ..., unitContextPacket? })`
- `BoundTaskFlowRuntime.runTask({ ..., unitContextPacket? })`

Phase 1 inheritance rule:

- if a managed flow has a packet and `runTask(...)` does not provide one, the
  detached child task inherits the flow packet
- packet persistence stays inside existing task and flow registries
- packet `flowId` is normalized to the owning flow when available

Phase 1 non-goals:

- no new `.gsd`-style durable state tree
- no autonomous planner loop
- no worktree execution
- no verification retry runner yet

## Implementation plan

### Phase 1: unit packet contract

Status: implemented.

Add a harness-neutral `UnitContextPacket` type and wire it through:

- Task Flow state
- Lobster step metadata
- subagent spawn preparation
- detached task metadata

Deliverables:

- public internal type
- packet serialization in task/flow records
- packet-aware subagent handoff

Non-goals:

- no new planner UI
- no milestone or slice semantics
- no git worktree changes

### Phase 2: isolated-per-unit execution

Status: not implemented.

Add optional unit execution mode to Task Flow and Lobster.

Initial policy:

- default remains current behavior
- opt-in units can run in a fresh detached session
- packet context is injected at run start

This is the smallest form of GSD's fresh-session-per-unit pattern.

### Phase 3: verification policy

Status: substantially implemented.

Add a first-class verification contract to unit execution:

- `commands`
- `retryCount`
- `autoRepair`
- `failMode`

Implemented shape:

- verification commands run after successful unit completion
- repair history and repair counters are stored in typed `verificationState`
- repair retries are bounded by `retryCount`
- `autoRepair` queues a repair task instead of mutating code inside the verifier
- successful repair exits `verification_repair` and restores the pre-repair step
- generic child work is suppressed while repair is in progress

Default recommended policy:

- execute the unit
- run verification once
- if verification fails and `autoRepair` is allowed, permit one bounded repair
  attempt
- rerun verification
- if still failing, stop and record a structured failure reason

This should live in orchestration, not in ad hoc prompts.

### Phase 4: detached-run forensics

Status: partially implemented.

Extend task and flow records with:

- packet id
- last forward progress timestamp
- retry count
- timeout class
- verification result
- terminal artifact summary

Expose:

- `openclaw tasks flow audit`
- `openclaw tasks flow show`
- Control UI flow diagnostics

Implemented now:

- typed `priority` and `requiresRepair` in Task Flow DTOs
- webhook flow views expose `priority`, `requiresRepair`, and `verification`
- CLI audit shows repair history, repair linkage, resume step, and repair counters
- maintenance reports verification backfill counts

This phase imports GSD's "stuck detection and recovery visibility" idea without
copying its standalone dashboard model.

### Phase 5: per-unit model routing

Allow flows or units to declare a complexity hint:

- `light`
- `standard`
- `heavy`

Map that hint through configured routing policy to a model selection decision.
Keep this simple in the first version:

- no adaptive learning
- no hidden reprioritization
- no automatic budget policy changes beyond the configured mapping

### Phase 6: optional git isolation experiment

Only after the earlier phases prove useful should OpenClaw explore a flow-level
git execution policy:

- `in-place`
- `worktree`

This must be explicit, off by default, and isolated to orchestration runs that
have clear operator ownership.

Worktree execution is the highest-risk GSD feature to import and should be
treated as an experiment, not a foundation.

## Kill criteria

Stop or pause the effort if any of these become true:

- packet assembly duplicates existing context-engine logic instead of reusing it
- the feature requires a second durable planning state tree outside existing
  task/flow/session stores
- detached execution becomes runtime-specific rather than runtime-neutral
- verification policy turns into an unbounded auto-fix loop
- worktree isolation becomes a hidden default

## Open questions

### Should UnitContextPacket be plugin-visible?

Likely yes, but not in phase 1. First prove the packet shape inside bundled
Task Flow, Lobster, and context-engine integration.

### Should packets be human-authored?

No. Humans may review or override fields, but the packet is a machine-facing
execution contract, not the user-facing planning artifact.

### Should OpenClaw adopt milestone and slice language?

Not in core. A plugin, skill, or workflow package may layer that vocabulary on
top later, but the base platform should stay unit-neutral.

## Success criteria

The first implementation is successful if OpenClaw can:

- execute a Task Flow step in a fresh detached session
- inject a bounded unit packet through the active context engine
- run declared verification commands with one bounded repair retry
- surface structured failure and timeout diagnostics in the task ledger
- do all of the above without adding a second source of truth beside existing
  session, task, and flow stores

Current state against those criteria:

- bounded packets: implemented
- verification with bounded repair retry: implemented
- structured repair/verification diagnostics: implemented
- isolated detached execution mode: not yet implemented

## Summary

The efficient way to integrate GSD 2 ideas is to treat them as orchestration
patterns, not as a product to import.

OpenClaw should copy the small set of ideas that fit its current architecture:

- unit-oriented execution
- bounded context packets
- verification-as-orchestration
- detached-run forensics
- optional per-unit model routing

OpenClaw should not copy the standalone shell, `.gsd/` control plane, or
project-management abstractions into core.
