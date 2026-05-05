export const STATIC_EXTENSION_ASSETS: Array<{ src: string; dest: string }>;

export function listStaticExtensionAssetOutputs(params?: {
  assets?: Array<{ src: string; dest: string }>;
}): string[];
export function copyStaticExtensionAssets(params?: {
  rootDir?: string;
  assets?: Array<{ src: string; dest: string }>;
  fs?: typeof import("node:fs");
  warn?: (...args: unknown[]) => void;
}): void;
export function writeStableRootRuntimeAliases(params?: {
  rootDir?: string;
  fs?: typeof import("node:fs");
}): void;
export function runRuntimePostBuild(params?: Record<string, unknown>): void;
