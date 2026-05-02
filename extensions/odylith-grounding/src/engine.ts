import fs from "node:fs/promises";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
  buildMemorySystemPromptAddition,
  type ContextEngine,
  delegateCompactionToRuntime,
  type PluginLogger,
} from "../api.js";
import type { OdylithGroundingConfig } from "./config.js";

type GovernanceCatalog = {
  version: number;
  components: GovernanceComponent[];
};

type GovernanceComponent = {
  id: string;
  label: string;
  summary: string;
  dossier: string;
  paths: string[];
  keywords: string[];
  docs: string[];
  tests: string[];
  invariants: string[];
  validation: string[];
};

type CandidateMatch = {
  component: GovernanceComponent;
  score: number;
  matchedKeywords: string[];
  matchedAnchors: string[];
};

type GroundingPacket = {
  quality: "explicit" | "inferred" | "ambiguous";
  source: "direct-anchor" | "keyword-inference" | "inherited-subagent" | "ambiguous";
  components: GovernanceComponent[];
  matchedAnchors: string[];
  scopedGuides: string[];
  dossierExcerpt?: string;
  matchedKeywords: string[];
  systemPromptAddition: string;
};

function renderSubagentHandoff(packet: GroundingPacket): string {
  const lines: string[] = [];
  if (packet.components.length > 0) {
    lines.push(
      `Focus on ${packet.components
        .slice(0, 2)
        .map((component) => component.id)
        .join(", ")}.`,
    );
  }
  if (packet.matchedAnchors.length > 0) {
    lines.push(`Anchors: ${packet.matchedAnchors.slice(0, 4).join(", ")}`);
  }
  if (packet.scopedGuides.length > 0) {
    lines.push(`Guides: ${packet.scopedGuides.slice(0, 2).join(", ")}`);
  }
  lines.push("Stay within the grounded slice unless you can explain why widening is necessary.");
  return lines.join("\n");
}

type ContextEngineFactoryParams = {
  config: OdylithGroundingConfig;
  logger: PluginLogger;
};

const CATALOG_FILE = "component-catalog.json";
const MAX_PATH_ANCHORS = 8;
const MAX_SCOPED_GUIDES = 4;
const MAX_DOCS = 4;
const MAX_TESTS = 4;
const PATH_TOKEN_PATTERN =
  /`?([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\/?(?:[A-Za-z0-9._-]+(?:\.[A-Za-z0-9._-]+)?)?)`?/g;

const catalogCache = new Map<string, GovernanceCatalog>();

export function createOdylithGroundingContextEngine(
  params: ContextEngineFactoryParams,
): ContextEngine {
  const packetCache = new Map<string, GroundingPacket>();

  return {
    info: {
      id: "odylith-grounding",
      name: "Odylith Grounding",
      ownsCompaction: false,
    },

    async bootstrap() {
      return { bootstrapped: true, reason: "stateless engine" };
    },

    async ingest() {
      return { ingested: true };
    },

    async assemble(assembleParams) {
      const packet = await resolveGroundingPacket({
        config: params.config,
        logger: params.logger,
        packetCache,
        sessionId: assembleParams.sessionId,
        sessionKey: assembleParams.sessionKey,
        prompt: assembleParams.prompt,
        messages: assembleParams.messages,
        availableTools: assembleParams.availableTools ?? new Set<string>(),
        citationsMode: assembleParams.citationsMode,
      });
      const messages = selectRecentMessages(
        assembleParams.messages,
        params.config.historyWindowMessages,
      );
      const estimatedTokens =
        estimateMessageTokens(messages) + estimateTextTokens(packet.systemPromptAddition);
      return {
        messages,
        estimatedTokens,
        systemPromptAddition: packet.systemPromptAddition,
      };
    },

    async compact(compactParams) {
      return delegateCompactionToRuntime(compactParams);
    },

    async prepareSubagentSpawn(spawnParams) {
      const parentPacket = packetCache.get(
        resolveSessionCacheKey(spawnParams.parentSessionId, spawnParams.parentSessionKey),
      );
      if (!parentPacket) {
        return undefined;
      }
      const childKey = resolveSessionCacheKey(
        spawnParams.childSessionId,
        spawnParams.childSessionKey,
      );
      packetCache.set(childKey, {
        ...parentPacket,
        source: "inherited-subagent",
        systemPromptAddition: renderGroundingPacket(parentPacket, {
          inherited: true,
          availableTools: new Set(),
          citationsMode: undefined,
        }),
      });
      return {
        systemPromptAddition: renderGroundingPacket(parentPacket, {
          inherited: true,
          availableTools: new Set(),
          citationsMode: undefined,
        }),
        initialUserMessageAddition: renderSubagentHandoff(parentPacket),
        rollback: () => {
          packetCache.delete(childKey);
        },
      };
    },

    async onSubagentEnded(params) {
      packetCache.delete(resolveSessionCacheKey(undefined, params.childSessionKey));
    },
  };
}

async function resolveGroundingPacket(params: {
  config: OdylithGroundingConfig;
  logger: PluginLogger;
  packetCache: Map<string, GroundingPacket>;
  sessionId: string;
  sessionKey?: string;
  prompt?: string;
  messages: AgentMessage[];
  availableTools: Set<string>;
  citationsMode: unknown;
}): Promise<GroundingPacket> {
  const cacheKey = resolveSessionCacheKey(params.sessionId, params.sessionKey);
  const inheritedPacket = params.packetCache.get(cacheKey);
  const catalog = await loadGovernanceCatalog(params.config, params.logger);
  const textPool = [params.prompt ?? "", ...params.messages.slice(-6).map(extractMessageText)].join(
    "\n",
  );
  const explicitAnchors = await extractExplicitAnchors(textPool, params.config.repoRoot);
  const candidateMatches = rankComponents(catalog.components, textPool, explicitAnchors);
  const groundedPacket = await buildPacketFromCandidates({
    config: params.config,
    availableTools: params.availableTools,
    citationsMode: params.citationsMode,
    repoRoot: params.config.repoRoot,
    explicitAnchors,
    candidateMatches,
    inheritedPacket,
  });
  params.packetCache.set(cacheKey, groundedPacket);
  return groundedPacket;
}

async function buildPacketFromCandidates(params: {
  config: OdylithGroundingConfig;
  availableTools: Set<string>;
  citationsMode: unknown;
  repoRoot: string;
  explicitAnchors: string[];
  candidateMatches: CandidateMatch[];
  inheritedPacket?: GroundingPacket;
}): Promise<GroundingPacket> {
  const topMatch = params.candidateMatches[0];
  const secondMatch = params.candidateMatches[1];
  const explicitWinner = Boolean(topMatch) && topMatch.matchedAnchors.length > 0;
  const inferredWinner =
    Boolean(topMatch) &&
    topMatch.score >= 6 &&
    (!secondMatch || topMatch.score - secondMatch.score >= 2);

  if (!explicitWinner && !inferredWinner && params.inheritedPacket) {
    return {
      ...params.inheritedPacket,
      source: "inherited-subagent",
      systemPromptAddition: renderGroundingPacket(params.inheritedPacket, {
        inherited: true,
        availableTools: params.availableTools,
        citationsMode: params.citationsMode,
      }),
    };
  }

  if (!explicitWinner && !inferredWinner) {
    const packet: GroundingPacket = {
      quality: "ambiguous",
      source: "ambiguous",
      components: params.candidateMatches
        .slice(0, params.config.maxCandidateComponents)
        .map((match) => match.component),
      matchedAnchors: params.explicitAnchors,
      scopedGuides: [],
      matchedKeywords: params.candidateMatches
        .slice(0, params.config.maxCandidateComponents)
        .flatMap((match) => match.matchedKeywords)
        .slice(0, params.config.maxCandidateComponents * 2),
      systemPromptAddition: "",
    };
    packet.systemPromptAddition = renderGroundingPacket(packet, {
      inherited: false,
      availableTools: params.availableTools,
      citationsMode: params.citationsMode,
    });
    return packet;
  }

  const selectedMatches = params.candidateMatches.slice(
    0,
    Math.min(2, params.config.maxCandidateComponents),
  );
  const scopedGuides = await collectScopedGuides({
    repoRoot: params.repoRoot,
    anchors:
      params.explicitAnchors.length > 0
        ? params.explicitAnchors
        : selectedMatches.flatMap((match) => match.component.paths),
  });
  const dossierExcerpt = await loadDossierExcerpt({
    governanceRoot: params.config.governanceRoot,
    component: topMatch.component,
    maxChars: params.config.dossierCharBudget,
  });
  const packet: GroundingPacket = {
    quality: explicitWinner ? "explicit" : "inferred",
    source: explicitWinner ? "direct-anchor" : "keyword-inference",
    components: selectedMatches.map((match) => match.component),
    matchedAnchors: topMatch.matchedAnchors,
    scopedGuides,
    dossierExcerpt,
    matchedKeywords: topMatch.matchedKeywords,
    systemPromptAddition: "",
  };
  packet.systemPromptAddition = renderGroundingPacket(packet, {
    inherited: false,
    availableTools: params.availableTools,
    citationsMode: params.citationsMode,
  });
  return packet;
}

function renderGroundingPacket(
  packet: GroundingPacket,
  options: { inherited: boolean; availableTools: Set<string>; citationsMode: unknown },
): string {
  const memoryAddition = buildMemorySystemPromptAddition({
    availableTools: options.availableTools,
    citationsMode: options.citationsMode as never,
  });
  const lines: string[] = [
    "Odylith grounding packet:",
    `packet_quality: ${packet.quality}`,
    `packet_source: ${options.inherited ? "inherited-subagent" : packet.source}`,
  ];

  if (packet.components.length > 0 && packet.quality !== "ambiguous") {
    const target = packet.components[0];
    lines.push(`target_component: ${target.id} (${target.label})`);
    lines.push(`target_summary: ${target.summary}`);
    appendList(lines, "target_paths", target.paths);
    appendList(lines, "relevant_docs", target.docs.slice(0, MAX_DOCS));
    appendList(lines, "validation_targets", target.validation.slice(0, MAX_TESTS));
    appendList(lines, "tests", target.tests.slice(0, MAX_TESTS));
    appendList(lines, "working_invariants", target.invariants);
    if (packet.matchedAnchors.length > 0) {
      appendList(lines, "matched_anchors", packet.matchedAnchors);
    }
    if (packet.scopedGuides.length > 0) {
      appendList(lines, "scoped_guides", packet.scopedGuides.slice(0, MAX_SCOPED_GUIDES));
    }
    if (packet.matchedKeywords.length > 0) {
      appendList(lines, "matched_keywords", packet.matchedKeywords);
    }
    lines.push("packet_guidance:");
    lines.push("- Stay inside the listed target paths unless new evidence forces a widening step.");
    lines.push("- Prefer the listed docs, tests, and scoped guides before broad repo search.");
    lines.push(
      "- If the task escapes this slice, say what is widening and why before reading broadly.",
    );
    if (packet.dossierExcerpt) {
      lines.push("dossier_excerpt:");
      lines.push(packet.dossierExcerpt);
    }
  } else {
    appendList(
      lines,
      "candidate_components",
      packet.components.map((component) => `${component.id} (${component.label})`),
    );
    if (packet.matchedAnchors.length > 0) {
      appendList(lines, "matched_anchors", packet.matchedAnchors);
    }
    if (packet.matchedKeywords.length > 0) {
      appendList(lines, "matched_keywords", packet.matchedKeywords);
    }
    lines.push("packet_guidance:");
    lines.push("- The request is not grounded enough for a broad repo scan.");
    lines.push(
      "- Ask for an explicit path, component, failing contract, or validation target before editing.",
    );
    lines.push(
      "- If you must proceed, start with the smallest candidate slice and explain the uncertainty.",
    );
  }

  return [memoryAddition, lines.join("\n")].filter(Boolean).join("\n\n");
}

async function loadGovernanceCatalog(
  config: OdylithGroundingConfig,
  logger: PluginLogger,
): Promise<GovernanceCatalog> {
  const cacheKey = path.join(config.governanceRoot, CATALOG_FILE);
  const cached = catalogCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const catalogPath = path.join(config.governanceRoot, CATALOG_FILE);
  const raw = await fs.readFile(catalogPath, "utf8");
  const parsed = JSON.parse(raw) as GovernanceCatalog;
  if (!Array.isArray(parsed.components)) {
    logger.warn(`odylith-grounding: invalid catalog at ${catalogPath}; expected components array`);
    return { version: 1, components: [] };
  }
  catalogCache.set(cacheKey, parsed);
  return parsed;
}

async function loadDossierExcerpt(params: {
  governanceRoot: string;
  component: GovernanceComponent;
  maxChars: number;
}): Promise<string | undefined> {
  const dossierPath = path.join(params.governanceRoot, params.component.dossier);
  const raw = await fs.readFile(dossierPath, "utf8");
  const normalized = raw.trim();
  if (normalized.length <= params.maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, params.maxChars)}\n[truncated ${normalized.length - params.maxChars} chars]`;
}

function rankComponents(
  components: GovernanceComponent[],
  textPool: string,
  explicitAnchors: string[],
): CandidateMatch[] {
  const haystack = textPool.toLowerCase();
  return components
    .map((component) => {
      let score = 0;
      const matchedKeywords: string[] = [];
      const matchedAnchors = explicitAnchors.filter((anchor) =>
        component.paths.some(
          (ownedPath) => anchor === ownedPath || anchor.startsWith(withTrailingSlash(ownedPath)),
        ),
      );
      if (matchedAnchors.length > 0) {
        score += matchedAnchors.length * 10;
      }
      if (
        haystack.includes(component.id.toLowerCase()) ||
        haystack.includes(component.label.toLowerCase())
      ) {
        score += 6;
        matchedKeywords.push(component.id);
      }
      for (const keyword of component.keywords) {
        if (haystack.includes(keyword.toLowerCase())) {
          score += 2;
          matchedKeywords.push(keyword);
        }
      }
      return {
        component,
        score,
        matchedKeywords: uniqueStrings(matchedKeywords),
        matchedAnchors,
      } satisfies CandidateMatch;
    })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.component.id.localeCompare(right.component.id),
    );
}

async function extractExplicitAnchors(text: string, repoRoot: string): Promise<string[]> {
  const matches = new Set<string>();
  for (const candidate of iteratePathTokens(text)) {
    const normalized = normalizeCandidatePath(candidate);
    if (!normalized) {
      continue;
    }
    const absolute = path.resolve(repoRoot, normalized);
    if (!isInsideRepo(repoRoot, absolute)) {
      continue;
    }
    try {
      await fs.stat(absolute);
      matches.add(toRepoRelative(repoRoot, absolute));
      if (matches.size >= MAX_PATH_ANCHORS) {
        break;
      }
    } catch {
      continue;
    }
  }
  return [...matches];
}

async function collectScopedGuides(params: {
  repoRoot: string;
  anchors: string[];
}): Promise<string[]> {
  const found = new Set<string>();
  for (const anchor of params.anchors) {
    let currentDir = path.resolve(params.repoRoot, anchor);
    try {
      const stat = await fs.stat(currentDir);
      if (!stat.isDirectory()) {
        currentDir = path.dirname(currentDir);
      }
    } catch {
      currentDir = path.dirname(currentDir);
    }
    while (isInsideRepo(params.repoRoot, currentDir)) {
      for (const guideName of ["AGENTS.md", "CLAUDE.md"]) {
        const candidate = path.join(currentDir, guideName);
        try {
          await fs.access(candidate);
          found.add(toRepoRelative(params.repoRoot, candidate));
          if (found.size >= MAX_SCOPED_GUIDES) {
            return [...found];
          }
        } catch {
          // continue climbing
        }
      }
      if (currentDir === params.repoRoot) {
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  }
  return [...found];
}

function selectRecentMessages(messages: AgentMessage[], limit: number): AgentMessage[] {
  if (messages.length <= limit) {
    return messages;
  }
  return messages.slice(-limit);
}

function estimateMessageTokens(messages: AgentMessage[]): number {
  return messages.reduce(
    (total, message) => total + estimateTextTokens(extractMessageText(message)),
    0,
  );
}

function estimateTextTokens(text: string | undefined): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractMessageText(message: AgentMessage): string {
  if (!("content" in message)) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .flatMap((part) => {
      if (!part || typeof part !== "object" || !("type" in part)) {
        return [];
      }
      const record = part as unknown as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string" ? [record.text] : [];
    })
    .join("\n");
}

function* iteratePathTokens(text: string): Iterable<string> {
  let match: RegExpExecArray | null;
  while ((match = PATH_TOKEN_PATTERN.exec(text)) !== null) {
    if (match[1]) {
      yield match[1];
    }
  }
}

function normalizeCandidatePath(candidate: string): string | undefined {
  const trimmed = candidate.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return undefined;
  }
  return trimmed.replace(/\\/g, "/");
}

function isInsideRepo(repoRoot: string, absolutePath: string): boolean {
  const relative = path.relative(repoRoot, absolutePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toRepoRelative(repoRoot: string, absolutePath: string): string {
  const relative = path.relative(repoRoot, absolutePath) || ".";
  return relative.replace(/\\/g, "/");
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function appendList(lines: string[], label: string, values: string[]): void {
  if (values.length === 0) {
    return;
  }
  lines.push(`${label}:`);
  for (const value of values) {
    lines.push(`- ${value}`);
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function resolveSessionCacheKey(
  sessionId: string | undefined,
  sessionKey: string | undefined,
): string {
  if (typeof sessionKey === "string" && sessionKey.length > 0) {
    return sessionKey;
  }
  return sessionId ?? "session:unknown";
}
