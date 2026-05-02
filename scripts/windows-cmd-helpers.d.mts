export function resolvePathEnvKey(env: Record<string, string | undefined>): string;
export function escapeForCmdExe(arg: string): string;
export function buildCmdExeCommandLine(command: string, args: string[]): string;
