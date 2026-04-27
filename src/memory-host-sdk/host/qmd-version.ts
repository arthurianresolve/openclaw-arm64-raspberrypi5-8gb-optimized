import { compareComparableSemver, parseComparableSemver } from "../../infra/semver-compare.js";

export const SUPPORTED_QMD_VERSION_RANGE = "2.1.x";
export const SUPPORTED_QMD_VERSION_FLOOR = "2.1.0";

export function isSupportedQmdVersion(version: string | null | undefined): boolean {
  const parsed = parseComparableSemver(version);
  const floor = parseComparableSemver(SUPPORTED_QMD_VERSION_FLOOR);
  return (
    compareComparableSemver(parsed, floor) != null && compareComparableSemver(parsed, floor)! >= 0
  );
}
