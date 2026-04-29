import type { OpenClawConfig } from "../api.js";
import type { ResolvedMemoryCodesightConfig } from "./config.js";
import { getCodesightCorpusEntry, searchCodesightCorpus } from "./query.js";

export function createCodesightCorpusSupplement(params: {
  config: ResolvedMemoryCodesightConfig;
  appConfig?: OpenClawConfig;
}) {
  return {
    search: async (input: { query: string; maxResults?: number; agentSessionKey?: string }) =>
      await searchCodesightCorpus({
        query: input.query,
        maxResults: input.maxResults,
        appConfig: params.appConfig,
        agentSessionKey: input.agentSessionKey,
        config: params.config,
      }),
    get: async (input: {
      lookup: string;
      fromLine?: number;
      lineCount?: number;
      agentSessionKey?: string;
    }) =>
      await getCodesightCorpusEntry({
        lookup: input.lookup,
        fromLine: input.fromLine,
        lineCount: input.lineCount,
        appConfig: params.appConfig,
        agentSessionKey: input.agentSessionKey,
        config: params.config,
      }),
  };
}
