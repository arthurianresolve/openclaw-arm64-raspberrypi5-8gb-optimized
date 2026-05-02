export type ParsedReleaseVersion = {
  version: string;
  baseVersion: string;
  channel: "stable" | "beta";
  year: number;
  month: number;
  day: number;
  betaNumber?: number;
  correctionNumber?: number;
  date: Date;
};

export type NpmPublishPlan = {
  channel: "stable" | "beta";
  publishTag: "latest" | "beta";
  mirrorDistTags: Array<"latest" | "beta">;
};

export type NpmDistTagMirrorAuth = {
  hasAuth: boolean;
  source: "node-auth-token" | "npm-token" | "none";
};

export type NpmPublishMode = "--dry-run" | "--publish";

export function parseReleaseVersion(version: string): ParsedReleaseVersion | null;
export function compareReleaseVersions(left: string, right: string): number | null;
export function resolveNpmPublishPlan(version: string, currentBetaVersion?: string | null): NpmPublishPlan;
export function resolveNpmDistTagMirrorAuth(params?: {
  nodeAuthToken?: string | null | undefined;
  npmToken?: string | null | undefined;
}): NpmDistTagMirrorAuth;
export function shouldRequireNpmDistTagMirrorAuth(params: {
  mode: NpmPublishMode;
  mirrorDistTags: string[] | readonly string[];
  hasAuth: boolean;
}): boolean;
