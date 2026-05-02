export const BUNDLED_PLUGIN_ROOT_DIR: string;
export const BUNDLED_PLUGIN_PATH_PREFIX: string;
export const BUNDLED_PLUGIN_TEST_GLOB: string;
export const BUNDLED_PLUGIN_E2E_TEST_GLOB: string;
export const BUNDLED_PLUGIN_LIVE_TEST_GLOB: string;

export function bundledPluginRoot(pluginId: string): string;
export function bundledPluginFile(pluginId: string, relativePath: string): string;
export function bundledDistPluginRoot(pluginId: string): string;
export function bundledDistPluginFile(pluginId: string, relativePath: string): string;
export function bundledPluginCallsite(pluginId: string, relativePath: string, line: number): string;
