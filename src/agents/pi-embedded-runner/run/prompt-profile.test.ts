import { describe, expect, it } from "vitest";
import { renderRunPromptProfileGuidance, resolveRunPromptProfile } from "./prompt-profile.js";

describe("resolveRunPromptProfile", () => {
  it("keeps the default profile for full runs", () => {
    expect(
      resolveRunPromptProfile({
        promptMode: "full",
        toolsAllow: ["read"],
      }),
    ).toBe("default");
  });

  it("selects explore for read-only minimal runs", () => {
    expect(
      resolveRunPromptProfile({
        promptMode: "minimal",
        toolsAllow: ["read", "grep", "find"],
      }),
    ).toBe("explore");
  });

  it("selects plan when write-capable tools are present", () => {
    expect(
      resolveRunPromptProfile({
        promptMode: "minimal",
        toolsAllow: ["read", "write"],
      }),
    ).toBe("plan");
  });

  it("selects verify for inspection-and-exec runs", () => {
    expect(
      resolveRunPromptProfile({
        promptMode: "minimal",
        toolsAllow: ["read", "exec"],
      }),
    ).toBe("verify");
  });
});

describe("renderRunPromptProfileGuidance", () => {
  it("renders stable guidance for each delegated profile", () => {
    expect(renderRunPromptProfileGuidance("explore")).toContain("Delegated Profile: Explore");
    expect(renderRunPromptProfileGuidance("plan")).toContain("Delegated Profile: Plan");
    expect(renderRunPromptProfileGuidance("verify")).toContain("Delegated Profile: Verify");
  });
});
