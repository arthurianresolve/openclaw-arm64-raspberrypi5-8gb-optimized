export function listStaticImportSpecifiers(source: string): string[];
export function collectCliBootstrapExternalImportErrors(params?: {
  rootDir?: string;
  entrypoints?: string[];
  fs?: typeof import("node:fs");
  logger?: { error: (...args: any[]) => void };
}): string[];
export function checkCliBootstrapExternalImports(params?: {
  rootDir?: string;
  entrypoints?: string[];
  fs?: typeof import("node:fs");
  logger?: { error: (...args: any[]) => void };
}): void;
