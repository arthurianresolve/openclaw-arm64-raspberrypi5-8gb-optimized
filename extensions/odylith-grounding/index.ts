import { definePluginEntry } from "./api.js";
import { odylithGroundingConfigSchema } from "./src/config.js";
import { registerOdylithGroundingPlugin } from "./src/plugin.js";

export default definePluginEntry({
  id: "odylith-grounding",
  name: "Odylith Grounding",
  description: "Bounded repo-grounding context engine inspired by Odylith.",
  kind: "context-engine",
  configSchema: odylithGroundingConfigSchema,
  register: registerOdylithGroundingPlugin,
});
