---
summary: "Role-based paths through the OpenClaw docs for operators, agent builders, security reviewers, automators, and contributors."
read_when:
  - You want a sequenced route through the OpenClaw docs
  - You are choosing what to read after Getting Started
  - You are onboarding a new operator, agent builder, or contributor
title: "Learning paths"
---

OpenClaw has many focused docs. Use these paths when you want a sequenced route
instead of a complete index.

<Note>
If you are installing OpenClaw for the first time, start with
[Getting Started](/start/getting-started), then choose the path that matches
what you want to operate or build.
</Note>

## Personal operator

Run one Gateway, connect a chat surface, and keep it healthy.

1. [Getting Started](/start/getting-started)
2. [Onboarding overview](/start/onboarding-overview)
3. [Configuration](/gateway/configuration)
4. [Channels overview](/channels)
5. [Pairing](/channels/pairing)
6. [Gateway runbook](/gateway)
7. [Troubleshooting](/gateway/troubleshooting)

Use this path when your goal is a dependable personal assistant reachable from
your normal messaging apps.

## Agent builder

Build and operate coding-agent workflows with explicit workspace, skill, and
runtime boundaries.

1. [Agent workspace](/concepts/agent-workspace)
2. [Agent runtime](/concepts/agent)
3. [Agent loop](/concepts/agent-loop)
4. [Skills](/tools/skills)
5. [Sub-agents](/tools/subagents)
6. [ACP agents](/tools/acp-agents)
7. [Agentic architecture](/concepts/agentic-architecture)
8. [Trajectory](/tools/trajectory)

Use this path before changing agent execution, context, skills, subagents, or
native harness behavior.

## Security reviewer

Review trust boundaries before exposing agents, tools, or channels to more
people and networks.

1. [Pairing](/channels/pairing)
2. [Gateway security](/gateway/security)
3. [Sandboxing](/gateway/sandboxing)
4. [Sandbox vs tool policy vs elevated](/gateway/sandbox-vs-tool-policy-vs-elevated)
5. [Exec approvals](/tools/exec-approvals)
6. [Threat model atlas](/security/THREAT-MODEL-ATLAS)
7. [Agentic architecture](/concepts/agentic-architecture)

Use this path when tools can mutate state, channels can reach the Gateway from
outside loopback, or automation will run without immediate human review.

## Automation operator

Turn repeated work into durable tasks, schedules, hooks, and standing authority.

1. [Automation and tasks](/automation)
2. [Background tasks](/automation/tasks)
3. [Cron jobs](/automation/cron-jobs)
4. [Hooks](/automation/hooks)
5. [Standing orders](/automation/standing-orders)
6. [Task Flow](/automation/taskflow)
7. [Task Flow CLI](/cli/tasks)

Use this path when a workflow needs persistence, recovery, or a clear boundary
between automatic and approval-required work.

## Media and node operator

Configure media generation, speech, and device nodes without mixing provider
setup with channel or Gateway policy.

1. [Media overview](/tools/media-overview)
2. [Image generation](/tools/image-generation)
3. [Video generation](/tools/video-generation)
4. [Music generation](/tools/music-generation)
5. [Text to speech](/tools/tts)
6. [Nodes overview](/nodes)
7. [iOS](/platforms/ios)
8. [Android](/platforms/android)

Use this path when the agent needs to create, understand, or deliver media
through companion apps or paired nodes.

## Contributor

Make code or docs changes with the right owner boundaries and validation proof.

1. [Architecture](/concepts/architecture)
2. [Capability cookbook](/tools/capability-cookbook)
3. [Plugin architecture](/plugins/architecture)
4. [Building plugins](/plugins/building-plugins)
5. [Testing](/reference/test)
6. [CI](/ci)
7. [Agentic architecture](/concepts/agentic-architecture)

Use this path before adding a shared capability, changing plugin contracts, or
reviewing an upstream or downstream agentic change.

## Complete maps

- [Docs directory](/start/docs-directory) has the most commonly used links.
- [Docs hubs](/start/hubs) links every maintained docs page, including deep
  reference pages that are not shown in the left navigation.
