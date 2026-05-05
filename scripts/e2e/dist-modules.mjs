// @ts-nocheck

const resolveDistModule = (relativePath) => new URL(relativePath, import.meta.url).href;

const runMain = await import(resolveDistModule("../../dist/cli/run-main.js"));
const config = await import(resolveDistModule("../../dist/config/config.js"));
const crestodian = await import(resolveDistModule("../../dist/crestodian/crestodian.js"));
const rescueMessage = await import(resolveDistModule("../../dist/crestodian/rescue-message.js"));
const gatewayProtocol = await import(resolveDistModule("../../dist/gateway/protocol/index.js"));
const infraErrors = await import(resolveDistModule("../../dist/infra/errors.js"));
const infraWs = await import(resolveDistModule("../../dist/infra/ws.js"));
const stringCoerce = await import(resolveDistModule("../../dist/shared/string-coerce.js"));
const openAiImageGeneration = await import(
  resolveDistModule("../../dist/extensions/openai/image-generation-provider.js")
);
const mcpMaterialize = await import(
  resolveDistModule("../../dist/agents/pi-bundle-mcp-materialize.js")
);
const mcpRuntime = await import(resolveDistModule("../../dist/agents/pi-bundle-mcp-runtime.js"));
const toolPolicy = await import(
  resolveDistModule("../../dist/agents/pi-embedded-runner/effective-tool-policy.js")
);
const pluginTools = await import(resolveDistModule("../../dist/plugins/tools.js"));
const runtimeContextPrompt = await import(
  resolveDistModule("../../dist/agents/pi-embedded-runner/run/runtime-context-prompt.js")
);

export const runCli = runMain.runCli;
export const shouldStartCrestodianForBareRoot = runMain.shouldStartCrestodianForBareRoot;
export const clearConfigCache = config.clearConfigCache;
export const runCrestodian = crestodian.runCrestodian;
export const runCrestodianRescueMessage = rescueMessage.runCrestodianRescueMessage;
export const PROTOCOL_VERSION = gatewayProtocol.PROTOCOL_VERSION;
export const formatErrorMessage = infraErrors.formatErrorMessage;
export const rawDataToString = infraWs.rawDataToString;
export const readStringValue = stringCoerce.readStringValue;
export const buildOpenAIImageGenerationProvider =
  openAiImageGeneration.buildOpenAIImageGenerationProvider;
export const materializeBundleMcpToolsForRun = mcpMaterialize.materializeBundleMcpToolsForRun;
export const disposeAllSessionMcpRuntimes = mcpRuntime.disposeAllSessionMcpRuntimes;
export const getOrCreateSessionMcpRuntime = mcpRuntime.getOrCreateSessionMcpRuntime;
export const applyFinalEffectiveToolPolicy = toolPolicy.applyFinalEffectiveToolPolicy;
export const getPluginToolMeta = pluginTools.getPluginToolMeta;
export const queueRuntimeContextForNextTurn = runtimeContextPrompt.queueRuntimeContextForNextTurn;
export const resolveRuntimeContextPromptParts =
  runtimeContextPrompt.resolveRuntimeContextPromptParts;
