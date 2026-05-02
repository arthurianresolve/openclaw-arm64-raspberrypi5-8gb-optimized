export function listStaticImportSpecifiers(source: string): string[];
export function collectCliBootstrapExternalImportErrors(params?: {
  rootDir?: string;
  entrypoints?: string[];
  fs?: typeof import("node:fs");
  logger?: { error: (...args: unknown[]) => void };
}): string[];
export function checkCliBootstrapExternalImports(params?: {
  rootDir?: string;
  entrypoints?: string[];
  fs?: typeof import("node:fs");
  logger?: { error: (...args: unknown[]) => void };
}): void;
