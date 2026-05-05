export type RuntimeDependencySpecRecord = {
  spec: string;
  pluginIds: string[];
  conflicts: Array<{ pluginId: string; spec: string }>;
};

export type RootRuntimeMirrorRecord = {
  importers: Set<string>;
  pluginIds: string[];
  spec: string;
};

export function collectRuntimeDependencySpecs(packageJson?: {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}): Map<string, string>;
export function packageNameFromSpecifier(specifier: string): string | null;
export function collectBundledPluginRuntimeDependencySpecs(
  bundledPluginsDir: string,
): Map<string, RuntimeDependencySpecRecord>;
export function collectBuiltBundledPluginStagedRuntimeDependencyErrors(params: {
  bundledPluginsDir: string;
}): string[];
export function collectRootDistBundledRuntimeMirrors(params: {
  distDir: string;
  bundledRuntimeDependencySpecs: Map<string, RuntimeDependencySpecRecord>;
}): Map<string, RootRuntimeMirrorRecord>;
export function collectBundledPluginRootRuntimeMirrorErrors(params: {
  rootPackageJson?: {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  bundledRuntimeDependencySpecs: Map<string, RuntimeDependencySpecRecord>;
  requiredRootMirrors: Map<string, RootRuntimeMirrorRecord>;
}): string[];
