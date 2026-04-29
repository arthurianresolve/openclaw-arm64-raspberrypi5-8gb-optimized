import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/plugins/plugin-api.js";
import plugin from "./index.js";

describe("memory-codesight plugin", () => {
  it("registers one memory corpus supplement", () => {
    const registerMemoryCorpusSupplement = vi.fn();
    const api = createTestPluginApi({
      id: "memory-codesight",
      name: "Memory Codesight",
      source: "test",
      config: {},
      registerMemoryCorpusSupplement,
      runtime: {} as never,
    });

    plugin.register(api);

    expect(registerMemoryCorpusSupplement).toHaveBeenCalledTimes(1);
  });
});
