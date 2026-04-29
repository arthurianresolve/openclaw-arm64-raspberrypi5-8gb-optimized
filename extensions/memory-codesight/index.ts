import { definePluginEntry } from "./api.js";
import { resolveMemoryCodesightConfig } from "./src/config.js";
import { createCodesightCorpusSupplement } from "./src/corpus-supplement.js";

export default definePluginEntry({
  id: "memory-codesight",
  name: "Memory Codesight",
  description: "Expose .codesight artifacts as an additive memory corpus supplement.",
  register(api) {
    const config = resolveMemoryCodesightConfig(api.pluginConfig);
    api.registerMemoryCorpusSupplement(
      createCodesightCorpusSupplement({
        config,
        appConfig: api.config,
      }),
    );
  },
});
