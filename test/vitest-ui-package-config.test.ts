import { describe, expect, it } from "vitest";
import uiConfig from "../ui/vitest.config.ts";
import uiNodeConfig from "../ui/vitest.node.config.ts";

describe("ui package vitest config", () => {
  it("keeps the standalone ui package on thread workers with isolation enabled", () => {
    const config = uiConfig as {
      test?: { pool?: string; isolate?: boolean; projects?: unknown[] };
    };
    expect(config.test?.pool).toBe("threads");
    expect(config.test?.isolate).toBe(true);
    expect(config.test?.projects).toHaveLength(3);

    for (const project of config.test?.projects ?? []) {
      if (!project || typeof project !== "object" || !("test" in project)) {
        continue;
      }
      const typedProject = project as {
        test?: { pool?: string; isolate?: boolean; runner?: unknown };
      };
      expect(typedProject.test?.pool).toBe("threads");
      expect(typedProject.test?.isolate).toBe(true);
      expect(typedProject.test?.runner).toBeUndefined();
    }
  });

  it("keeps the standalone ui node config on thread workers with isolation enabled", () => {
    expect(uiNodeConfig.test?.pool).toBe("threads");
    expect(uiNodeConfig.test?.isolate).toBe(true);
    expect(uiNodeConfig.test?.runner).toBeUndefined();
  });
});
