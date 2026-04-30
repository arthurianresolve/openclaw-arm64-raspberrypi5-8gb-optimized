import { describe, expect, it } from "vitest";
import { formatCompletionSourceLine } from "./completion-runtime.js";

describe("completion-runtime", () => {
  it("guards bash completion sources so missing caches do not error", () => {
    expect(formatCompletionSourceLine("bash", "openclaw", "/tmp/openclaw.bash")).toBe(
      'if [ -f "/tmp/openclaw.bash" ]; then source "/tmp/openclaw.bash"; fi',
    );
  });

  it("guards fish completion sources so missing caches do not error", () => {
    expect(formatCompletionSourceLine("fish", "openclaw", "/tmp/openclaw.fish")).toBe(
      'if test -f "/tmp/openclaw.fish"; source "/tmp/openclaw.fish"; end',
    );
  });

  it("guards powershell completion sources so missing caches do not error", () => {
    expect(formatCompletionSourceLine("powershell", "openclaw", "C:/tmp/openclaw.ps1")).toBe(
      'if (Test-Path "C:/tmp/openclaw.ps1") { . "C:/tmp/openclaw.ps1" }',
    );
  });
});
