import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const LIVE_DOCKER_AUTH_SCRIPT = path.join(REPO_ROOT, "scripts/lib/live-docker-auth.sh");
const CI_HYDRATE_SCRIPT = path.join(REPO_ROOT, "scripts/ci-hydrate-live-auth.sh");

function runBash(script: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync("bash", ["-lc", script], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
    },
  });
}

describe("live auth scripts", () => {
  it("resolves Gemini auth dirs and files for provider-filtered Docker runs", () => {
    const result = runBash(
      [
        `source "${LIVE_DOCKER_AUTH_SCRIPT}"`,
        'printf "dirs:%s\\n" "$(openclaw_live_collect_auth_dirs_from_csv "google-gemini-cli" | paste -sd, -)"',
        'printf "files:%s\\n" "$(openclaw_live_collect_auth_files_from_csv "google-gemini-cli" | paste -sd, -)"',
      ].join("\n"),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("dirs:.gemini");
    expect(result.stdout).toContain("files:.gemini/oauth_creds.json,.gemini/settings.json");
  });

  it("hydrates Gemini OAuth creds into the expected home-relative file", () => {
    const tempHome = mkdtempSync(path.join(tmpdir(), "openclaw-gemini-auth-"));
    const profilePath = path.join(tempHome, "generated.profile");
    try {
      const result = runBash(`"${CI_HYDRATE_SCRIPT}" "${profilePath}"`, {
        HOME: tempHome,
        RUNNER_TEMP: tempHome,
        OPENCLAW_GEMINI_OAUTH_CREDENTIALS_JSON: '{"refresh_token":"test-token"}',
      });

      expect(result.status).toBe(0);
      expect(readFileSync(path.join(tempHome, ".gemini", "oauth_creds.json"), "utf8")).toBe(
        '{"refresh_token":"test-token"}',
      );
      expect(readFileSync(profilePath, "utf8")).toBe("");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
