export function runCli(argv: string[]): Promise<void>;
export function shouldStartCrestodianForBareRoot(argv: string[]): boolean;
export function clearConfigCache(): void;

export type OpenClawConfig = {
  agents?: {
    defaults?: {
      workspace?: string;
      model?: unknown;
    };
    list?: Array<{
      id?: string;
      workspace?: string;
      model?: string;
    }>;
  };
  gateway?: {
    port?: number;
    auth?: {
      token?: unknown;
    };
  };
  plugins?: {
    allow?: string[];
  };
  [key: string]: unknown;
};

export type RuntimeEnv = {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => never;
};

export function runCrestodian(
  params: {
    message: string;
    interactive: boolean;
    yes?: boolean;
  },
  runtime: RuntimeEnv,
): Promise<void>;

export type CommandContext = {
  surface: string;
  channel: string;
  channelId: string;
  ownerList: string[];
  senderIsOwner: boolean;
  isAuthorizedSender: boolean;
  senderId: string;
  rawBodyNormalized: string;
  commandBodyNormalized: string;
  from: string;
  to: string;
};

export type CrestodianCommandDeps = Record<string, unknown>;

export type CrestodianCommandResult = {
  shouldContinue: boolean;
  reply?: { text?: string };
};

export function handleCrestodianCommand(
  params: {
    cfg: Record<string, unknown>;
    command: CommandContext;
    agentId: string;
    isGroup: boolean;
    deps?: CrestodianCommandDeps;
  },
  interactive: boolean,
): Promise<CrestodianCommandResult | undefined>;

export function runCrestodianRescueMessage(input: {
  cfg: Record<string, unknown>;
  command: CommandContext;
  commandBody: string;
  agentId?: string;
  isGroup: boolean;
  env?: NodeJS.ProcessEnv;
  deps?: Record<string, unknown>;
}): Promise<string | null>;

export const PROTOCOL_VERSION: string;
export function formatErrorMessage(error: unknown): string;
export function rawDataToString(data: unknown): string;
export function readStringValue(value: unknown): string | undefined;

export type ImageGenerationProvider = {
  generateImage: (req: unknown) => Promise<{
    images: Array<{
      buffer: Buffer;
      mimeType: string;
      fileName?: string;
      revisedPrompt?: string;
      metadata?: Record<string, unknown>;
    }>;
  }>;
};

export function buildOpenAIImageGenerationProvider(): ImageGenerationProvider;

export type MaterializedMcpTool = {
  name: string;
  execute: (...args: unknown[]) => Promise<{
    content: Array<{ type?: string; text?: string }>;
  }>;
};

export function materializeBundleMcpToolsForRun(params: {
  runtime: unknown;
}): Promise<{ tools: MaterializedMcpTool[] }>;
export function disposeAllSessionMcpRuntimes(): Promise<void>;
export function getOrCreateSessionMcpRuntime(...args: unknown[]): Promise<unknown>;

export function applyFinalEffectiveToolPolicy(params: {
  bundledTools: MaterializedMcpTool[];
  config: Record<string, unknown>;
  sessionKey: string;
  agentId: string;
  senderIsOwner: boolean;
  warn: (message: string) => void;
}): MaterializedMcpTool[];

export function getPluginToolMeta(tool: MaterializedMcpTool): { pluginId?: string } | undefined;

export function queueRuntimeContextForNextTurn(...args: unknown[]): Promise<void>;
export function resolveRuntimeContextPromptParts(params: {
  effectivePrompt: string;
  transcriptPrompt: string;
}): { prompt: string; runtimeContext?: string };
