import type { OpenClawPluginApi } from "../api.js";
import { normalizeOdylithGroundingConfig } from "./config.js";
import { createOdylithGroundingContextEngine } from "./engine.js";

export function registerOdylithGroundingPlugin(api: OpenClawPluginApi): void {
  if (api.registrationMode !== "full") {
    return;
  }
  const config = normalizeOdylithGroundingConfig(api.pluginConfig, { cwd: process.cwd() });
  api.registerContextEngine("odylith-grounding", () =>
    createOdylithGroundingContextEngine({
      config,
      logger: api.logger,
    }),
  );
}
