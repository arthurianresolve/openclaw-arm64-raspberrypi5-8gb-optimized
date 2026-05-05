export const OPENCLAW_UPDATE_GITHUB_REPO =
  "arthurianresolve/openclaw-arm64-raspberrypi5-8gb-optimized";
export const OPENCLAW_UPDATE_GITHUB_BRANCH = "master";
export const OPENCLAW_UPDATE_GITHUB_REPO_URL = `https://github.com/${OPENCLAW_UPDATE_GITHUB_REPO}.git`;
export const OPENCLAW_UPDATE_GITHUB_PACKAGE_SPEC = `github:${OPENCLAW_UPDATE_GITHUB_REPO}#${OPENCLAW_UPDATE_GITHUB_BRANCH}`;
export const OPENCLAW_UPDATE_SOURCE_LABEL = `github ${OPENCLAW_UPDATE_GITHUB_REPO}#${OPENCLAW_UPDATE_GITHUB_BRANCH}`;
export const OPENCLAW_UPDATE_SOURCE_VERSION_URL = `https://raw.githubusercontent.com/${OPENCLAW_UPDATE_GITHUB_REPO}/${OPENCLAW_UPDATE_GITHUB_BRANCH}/package.json`;

const DEFAULT_BRANCH_ALIASES = new Set(["main", OPENCLAW_UPDATE_GITHUB_BRANCH]);

export function isDefaultBranchAlias(value: string): boolean {
  return DEFAULT_BRANCH_ALIASES.has(value.trim().toLowerCase());
}
