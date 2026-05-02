import type { AgentTool } from "@mariozechner/pi-agent-core";
import { resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload";
import type { TSchema } from "typebox";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import { isSilentReplyPayloadText, SILENT_REPLY_TOKEN } from "../../auto-reply/tokens.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { ProviderRuntimeModel } from "../../plugins/provider-runtime-model.types.js";
import {
  resolveProviderFollowupFallbackRoute,
  resolveProviderSystemPromptContribution,
} from "../../plugins/provider-runtime.js";
import { resolvePreparedExtraParams } from "../pi-embedded-runner/extra-params.js";
import { classifyEmbeddedPiRunResultForModelFallback } from "../pi-embedded-runner/result-fallback-classifier.js";
import {
  renderRunPromptProfileGuidance,
  type RunPromptProfile,
} from "../pi-embedded-runner/run/prompt-profile.js";
import {
  logProviderToolSchemaDiagnostics,
  normalizeProviderToolSchemas,
} from "../pi-embedded-runner/tool-schema-runtime.js";
import type { ProviderSystemPromptContribution } from "../system-prompt-contribution.js";
import { resolveTranscriptPolicy } from "../transcript-policy.js";
import { buildAgentRuntimeAuthPlan } from "./auth.js";
import type {
  AgentRuntimeDeliveryPlan,
  AgentRuntimeOutcomePlan,
  AgentRuntimePlan,
  BuildAgentRuntimeDeliveryPlanParams,
  BuildAgentRuntimePlanParams,
  AgentRuntimePromptProfile,
} from "./types.js";

function formatResolvedRef(params: { provider: string; modelId: string }): string {
  return `${params.provider}/${params.modelId}`;
}

function hasMedia(payload: { mediaUrl?: string; mediaUrls?: string[] }): boolean {
  return resolveSendableOutboundReplyParts(payload).hasMedia;
}

function asOpenClawConfig(value: unknown): OpenClawConfig | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as OpenClawConfig)
    : undefined;
}

function asProviderRuntimeModel(
  value: BuildAgentRuntimePlanParams["model"],
): ProviderRuntimeModel | undefined {
  return value !== undefined ? (value as ProviderRuntimeModel) : undefined;
}

function asThinkLevel(value: BuildAgentRuntimePlanParams["thinkingLevel"]): ThinkLevel | undefined {
  return value !== undefined ? (value as ThinkLevel) : undefined;
}

function mergeSystemPromptContributions(
  first?: ProviderSystemPromptContribution,
  second?: ProviderSystemPromptContribution,
): ProviderSystemPromptContribution | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  const mergedSectionOverrides: NonNullable<ProviderSystemPromptContribution["sectionOverrides"]> =
    {
      ...(first.sectionOverrides ?? {}),
      ...(second.sectionOverrides ?? {}),
    };
  return {
    stablePrefix:
      [first.stablePrefix, second.stablePrefix].filter(Boolean).join("\n\n") || undefined,
    dynamicSuffix:
      [first.dynamicSuffix, second.dynamicSuffix].filter(Boolean).join("\n\n") || undefined,
    sectionOverrides:
      Object.keys(mergedSectionOverrides).length > 0 ? mergedSectionOverrides : undefined,
  };
}

function resolveRuntimePromptProfileContribution(
  profile: AgentRuntimePromptProfile | undefined,
): ProviderSystemPromptContribution | undefined {
  if (!profile || profile === "default") {
    return undefined;
  }
  const guidance = renderRunPromptProfileGuidance(profile as RunPromptProfile);
  if (!guidance) {
    return undefined;
  }
  return {
    stablePrefix: guidance,
  };
}

export function buildAgentRuntimeDeliveryPlan(
  params: BuildAgentRuntimeDeliveryPlanParams,
): AgentRuntimeDeliveryPlan {
  const config = asOpenClawConfig(params.config);
  return {
    isSilentPayload(payload): boolean {
      return isSilentReplyPayloadText(payload.text, SILENT_REPLY_TOKEN) && !hasMedia(payload);
    },
    resolveFollowupRoute(routeParams) {
      return resolveProviderFollowupFallbackRoute({
        provider: params.provider,
        config,
        workspaceDir: params.workspaceDir,
        context: {
          config,
          agentDir: params.agentDir,
          workspaceDir: params.workspaceDir,
          provider: params.provider,
          modelId: params.modelId,
          payload: routeParams.payload,
          originatingChannel: routeParams.originatingChannel,
          originatingTo: routeParams.originatingTo,
          originRoutable: routeParams.originRoutable,
          dispatcherAvailable: routeParams.dispatcherAvailable,
        },
      });
    },
  };
}

export function buildAgentRuntimeOutcomePlan(): AgentRuntimeOutcomePlan {
  return {
    classifyRunResult: classifyEmbeddedPiRunResultForModelFallback,
  };
}

export function buildAgentRuntimePlan(params: BuildAgentRuntimePlanParams): AgentRuntimePlan {
  const config = asOpenClawConfig(params.config);
  const model = asProviderRuntimeModel(params.model);
  const modelApi = params.modelApi ?? params.model?.api ?? undefined;
  const transport = params.resolvedTransport;
  const auth = buildAgentRuntimeAuthPlan({
    provider: params.provider,
    authProfileProvider: params.authProfileProvider,
    sessionAuthProfileId: params.sessionAuthProfileId,
    config,
    workspaceDir: params.workspaceDir,
    harnessId: params.harnessId,
    harnessRuntime: params.harnessRuntime,
    allowHarnessAuthProfileForwarding: params.allowHarnessAuthProfileForwarding,
  });
  const resolvedRef = {
    provider: params.provider,
    modelId: params.modelId,
    ...(modelApi ? { modelApi } : {}),
    ...(params.harnessId ? { harnessId: params.harnessId } : {}),
    ...(transport ? { transport } : {}),
  };
  const toolContext = {
    provider: params.provider,
    config,
    workspaceDir: params.workspaceDir,
    env: process.env,
    modelId: params.modelId,
    modelApi,
    model,
  };
  const resolveToolContext = (overrides?: {
    workspaceDir?: string;
    modelApi?: string;
    model?: BuildAgentRuntimePlanParams["model"];
  }) => ({
    ...toolContext,
    ...(overrides?.workspaceDir !== undefined ? { workspaceDir: overrides.workspaceDir } : {}),
    ...(overrides?.modelApi !== undefined ? { modelApi: overrides.modelApi } : {}),
    ...(overrides?.model !== undefined ? { model: asProviderRuntimeModel(overrides.model) } : {}),
  });
  const resolveTranscriptRuntimePolicy = (overrides?: {
    workspaceDir?: string;
    modelApi?: string;
    model?: BuildAgentRuntimePlanParams["model"];
  }) =>
    resolveTranscriptPolicy({
      provider: params.provider,
      modelId: params.modelId,
      config,
      workspaceDir: overrides?.workspaceDir ?? params.workspaceDir,
      env: process.env,
      modelApi: overrides?.modelApi ?? modelApi,
      model: asProviderRuntimeModel(overrides?.model) ?? model,
    });
  const resolveTransportExtraParams = (
    overrides: Parameters<AgentRuntimePlan["transport"]["resolveExtraParams"]>[0] = {},
  ) =>
    resolvePreparedExtraParams({
      cfg: config,
      provider: params.provider,
      modelId: params.modelId,
      agentDir: params.agentDir,
      workspaceDir: overrides.workspaceDir ?? params.workspaceDir,
      extraParamsOverride: overrides.extraParamsOverride ?? params.extraParamsOverride,
      thinkingLevel: asThinkLevel(overrides.thinkingLevel ?? params.thinkingLevel),
      agentId: overrides.agentId ?? params.agentId,
      model: asProviderRuntimeModel(overrides.model) ?? model,
      resolvedTransport: overrides.resolvedTransport ?? transport,
    });

  return {
    resolvedRef,
    auth,
    prompt: {
      provider: params.provider,
      modelId: params.modelId,
      resolveSystemPromptContribution(context) {
        const providerContribution = resolveProviderSystemPromptContribution({
          provider: params.provider,
          config,
          workspaceDir: context.workspaceDir ?? params.workspaceDir,
          context: {
            ...context,
            config: asOpenClawConfig(context.config),
          },
        });
        const profileContribution = resolveRuntimePromptProfileContribution(
          context.promptProfile ?? params.promptProfile,
        );
        return mergeSystemPromptContributions(profileContribution, providerContribution);
      },
    },
    tools: {
      normalize<TSchemaType extends TSchema = TSchema, TResult = unknown>(
        tools: AgentTool<TSchemaType, TResult>[],
        overrides?: {
          workspaceDir?: string;
          modelApi?: string;
          model?: BuildAgentRuntimePlanParams["model"];
        },
      ): AgentTool<TSchemaType, TResult>[] {
        return normalizeProviderToolSchemas({
          ...resolveToolContext(overrides),
          tools,
        });
      },
      logDiagnostics(
        tools: AgentTool[],
        overrides?: {
          workspaceDir?: string;
          modelApi?: string;
          model?: BuildAgentRuntimePlanParams["model"];
        },
      ): void {
        logProviderToolSchemaDiagnostics({
          ...resolveToolContext(overrides),
          tools,
        });
      },
    },
    transcript: {
      policy: resolveTranscriptRuntimePolicy(),
      resolvePolicy: resolveTranscriptRuntimePolicy,
    },
    delivery: buildAgentRuntimeDeliveryPlan(params),
    outcome: buildAgentRuntimeOutcomePlan(),
    transport: {
      extraParams: resolveTransportExtraParams(),
      resolveExtraParams: resolveTransportExtraParams,
    },
    observability: {
      resolvedRef: formatResolvedRef({
        provider: params.provider,
        modelId: params.modelId,
      }),
      provider: params.provider,
      modelId: params.modelId,
      ...(modelApi ? { modelApi } : {}),
      ...(params.harnessId ? { harnessId: params.harnessId } : {}),
      ...(auth.forwardedAuthProfileId ? { authProfileId: auth.forwardedAuthProfileId } : {}),
      ...(transport ? { transport } : {}),
    },
  };
}
