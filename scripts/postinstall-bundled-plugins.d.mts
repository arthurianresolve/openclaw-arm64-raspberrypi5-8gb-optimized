export const BUNDLED_PLUGIN_INSTALL_TARGETS: string[];

export function pruneInstalledPackageDist(params?: Record<string, unknown>): void;
export function discoverBundledPluginRuntimeDeps(params?: {
  extensionsDir: string;
}): Array<{
  name: string;
  version: string;
  pluginIds: string[];
  sentinelPath: string;
}>;
export function createNestedNpmInstallEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function createBundledRuntimeDependencyInstallEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function createBundledRuntimeDependencyInstallArgs(missingSpecs: string[]): string[];
export function applyBaileysEncryptedStreamFinishHotfix(params?: Record<string, unknown>): boolean;
export function runPluginRegistryPostinstallMigration(params?: Record<string, unknown>): Promise<void>;
export function isSourceCheckoutRoot(params: { cwd: string }): boolean;
export function pruneBundledPluginSourceNodeModules(params?: Record<string, unknown>): void;
export function runBundledPluginPostinstall(params?: Record<string, unknown>): void;
export function isDirectPostinstallInvocation(params: { argv: string[] }): boolean;
