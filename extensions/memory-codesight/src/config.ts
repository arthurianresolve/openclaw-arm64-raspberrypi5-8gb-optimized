import path from "node:path";

export type MemoryCodesightPluginConfig = {
  rootDir?: string;
  limits?: {
    maxResults?: number;
    maxSnippetChars?: number;
    maxFileBytes?: number;
    maxFilesPerQuery?: number;
  };
  staleAfterHours?: number;
};

export type ResolvedMemoryCodesightConfig = {
  rootDir: string;
  limits: {
    maxResults: number;
    maxSnippetChars: number;
    maxFileBytes: number;
    maxFilesPerQuery: number;
  };
  staleAfterHours: number;
};

const DEFAULT_ROOT_DIR = ".codesight";
const DEFAULT_MAX_RESULTS = 6;
const DEFAULT_MAX_SNIPPET_CHARS = 420;
const DEFAULT_MAX_FILE_BYTES = 1_500_000;
const DEFAULT_MAX_FILES_PER_QUERY = 32;
const DEFAULT_STALE_AFTER_HOURS = 24 * 7;

function clampInt(value: number | undefined, min: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.floor(value as number));
}

export function resolveMemoryCodesightConfig(
  rawConfig: MemoryCodesightPluginConfig | undefined,
): ResolvedMemoryCodesightConfig {
  const rootDirRaw = rawConfig?.rootDir?.trim() || DEFAULT_ROOT_DIR;
  const rootDir = path.isAbsolute(rootDirRaw) ? rootDirRaw : rootDirRaw.replace(/\\/g, "/");
  return {
    rootDir,
    limits: {
      maxResults: clampInt(rawConfig?.limits?.maxResults, 1, DEFAULT_MAX_RESULTS),
      maxSnippetChars: clampInt(rawConfig?.limits?.maxSnippetChars, 64, DEFAULT_MAX_SNIPPET_CHARS),
      maxFileBytes: clampInt(rawConfig?.limits?.maxFileBytes, 1024, DEFAULT_MAX_FILE_BYTES),
      maxFilesPerQuery: clampInt(
        rawConfig?.limits?.maxFilesPerQuery,
        1,
        DEFAULT_MAX_FILES_PER_QUERY,
      ),
    },
    staleAfterHours: clampInt(rawConfig?.staleAfterHours, 1, DEFAULT_STALE_AFTER_HOURS),
  };
}
