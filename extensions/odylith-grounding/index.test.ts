import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { PluginLogger } from "./api.js";
import { normalizeOdylithGroundingConfig } from "./src/config.js";
import { createOdylithGroundingContextEngine } from "./src/engine.js";

const REPO_ROOT = "/home/george/excaliclaw";

const logger: PluginLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function createUserMessage(text: string): AgentMessage {
  return {
    role: "user",
    content: [{ type: "text", text }],
  } as AgentMessage;
}

describe("odylith-grounding context engine", () => {
  it("grounds explicit file-path requests to the matching governed component", async () => {
    const engine = createOdylithGroundingContextEngine({
      config: normalizeOdylithGroundingConfig(undefined, { cwd: REPO_ROOT }),
      logger,
    });

    const result = await engine.assemble({
      sessionId: "session-codex",
      sessionKey: "agent:main:session-codex",
      prompt:
        "Tighten context projection in extensions/codex/src/app-server/context-engine-projection.ts",
      messages: [createUserMessage("Previous request about Codex prompt projection")],
      availableTools: new Set(),
      citationsMode: undefined,
      model: "gpt-5.5",
    });

    expect(result.systemPromptAddition).toContain("packet_quality: explicit");
    expect(result.systemPromptAddition).toContain("target_component: codex-runtime");
    expect(result.systemPromptAddition).toContain(
      "extensions/codex/src/app-server/context-engine-projection.ts",
    );
    expect(result.systemPromptAddition).toContain("extensions/AGENTS.md");
  });

  it("fails closed when the request is too broad to bind to one governed slice", async () => {
    const engine = createOdylithGroundingContextEngine({
      config: normalizeOdylithGroundingConfig(undefined, { cwd: REPO_ROOT }),
      logger,
    });

    const result = await engine.assemble({
      sessionId: "session-ambiguous",
      sessionKey: "agent:main:session-ambiguous",
      prompt: "Something is wrong somewhere in the repo, investigate everything and fix it.",
      messages: [createUserMessage("Need a general improvement")],
      availableTools: new Set(),
      citationsMode: undefined,
      model: "gpt-5.5",
    });

    expect(result.systemPromptAddition).toContain("packet_quality: ambiguous");
    expect(result.systemPromptAddition).toContain("not grounded enough for a broad repo scan");
  });

  it("hands inherited grounded packets to subagents when the child prompt is underspecified", async () => {
    const engine = createOdylithGroundingContextEngine({
      config: normalizeOdylithGroundingConfig(undefined, { cwd: REPO_ROOT }),
      logger,
    });

    await engine.assemble({
      sessionId: "parent-session",
      sessionKey: "agent:main:parent-session",
      prompt: "Debug src/context-engine/registry.ts slot selection behavior.",
      messages: [createUserMessage("Focus on the context engine selection path")],
      availableTools: new Set(),
      citationsMode: undefined,
      model: "gpt-5.5",
    });

    const preparation = await engine.prepareSubagentSpawn?.({
      parentSessionId: "parent-session",
      parentSessionKey: "agent:main:parent-session",
      childSessionId: "child-session",
      childSessionKey: "agent:main:child-session",
      contextMode: "isolated",
    });

    expect(preparation?.systemPromptAddition).toContain("packet_source: inherited-subagent");
    expect(preparation?.initialUserMessageAddition).toContain("Stay within the grounded slice");

    const child = await engine.assemble({
      sessionId: "child-session",
      sessionKey: "agent:main:child-session",
      prompt: "Continue the previous fix.",
      messages: [createUserMessage("Continue the previous fix.")],
      availableTools: new Set(),
      citationsMode: undefined,
      model: "gpt-5.5",
    });

    expect(child.systemPromptAddition).toContain("packet_source: inherited-subagent");
    expect(child.systemPromptAddition).toContain("target_component: context-engine-core");
  });
});
