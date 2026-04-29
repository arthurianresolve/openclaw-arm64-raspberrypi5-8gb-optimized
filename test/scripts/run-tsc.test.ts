import { describe, expect, it } from "vitest";
import { resolveTscMaxOldSpaceMb, resolveTscSpawnEnv } from "../../scripts/run-tsc.mjs";

describe("scripts/run-tsc", () => {
  it("uses default heap when override is absent", () => {
    expect(resolveTscMaxOldSpaceMb({})).toBe(4096);
  });

  it("honors OPENCLAW_TSC_MAX_OLD_SPACE_MB when valid", () => {
    expect(resolveTscMaxOldSpaceMb({ OPENCLAW_TSC_MAX_OLD_SPACE_MB: "6144" })).toBe(6144);
  });

  it("injects NODE_OPTIONS heap flag when missing", () => {
    const env = resolveTscSpawnEnv({ PATH: "/usr/bin" });
    expect(env.NODE_OPTIONS).toContain("--max-old-space-size=4096");
  });

  it("preserves explicit max-old-space-size in NODE_OPTIONS", () => {
    const env = resolveTscSpawnEnv({
      NODE_OPTIONS: "--trace-warnings --max-old-space-size=3072",
      PATH: "/usr/bin",
    });
    expect(env.NODE_OPTIONS).toBe("--trace-warnings --max-old-space-size=3072");
  });
});
