import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  forwardVitestOutput,
  installVitestNoOutputWatchdog,
  resolveDirectNodeVitestArgs,
  resolveVitestNodeArgs,
  resolveVitestNoOutputTimeoutMs,
  resolveVitestSpawnParams,
  shouldUseVitestPty,
  shouldSuppressVitestOutputLine,
  shouldSuppressVitestStderrLine,
  waitForVitestChildCompletion,
  waitForVitestPtyCompletion,
} from "../../scripts/run-vitest.mjs";

describe("scripts/run-vitest", () => {
  it("adds --no-maglev to vitest child processes by default", () => {
    expect(resolveVitestNodeArgs({ PATH: "/usr/bin" })).toEqual(["--no-maglev"]);
  });

  it("detects pnpm exec node wrappers that can be spawned directly", () => {
    expect(
      resolveDirectNodeVitestArgs([
        "exec",
        "node",
        "--no-maglev",
        "node_modules/vitest/vitest.mjs",
      ]),
    ).toEqual(["--no-maglev", "node_modules/vitest/vitest.mjs"]);
    expect(resolveDirectNodeVitestArgs(["exec", "vitest", "run"])).toBeNull();
  });

  it("allows opting back into Maglev explicitly", () => {
    expect(
      resolveVitestNodeArgs({
        OPENCLAW_VITEST_ENABLE_MAGLEV: "1",
        PATH: "/usr/bin",
      }),
    ).toEqual([]);
  });

  it("parses the optional no-output timeout env", () => {
    expect(resolveVitestNoOutputTimeoutMs({})).toBeNull();
    expect(resolveVitestNoOutputTimeoutMs({ OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS: "2500" })).toBe(
      2500,
    );
    expect(
      resolveVitestNoOutputTimeoutMs({ OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS: "0" }),
    ).toBeNull();
  });

  it("uses a PTY for direct vitest runs by default on non-Windows", () => {
    expect(shouldUseVitestPty({}, "linux", true)).toBe(true);
    expect(shouldUseVitestPty({}, "darwin", true)).toBe(true);
    expect(shouldUseVitestPty({}, "linux", false)).toBe(false);
    expect(shouldUseVitestPty({}, "win32", true)).toBe(false);
  });

  it("allows disabling the PTY path explicitly", () => {
    expect(shouldUseVitestPty({ OPENCLAW_VITEST_PTY: "0" }, "linux")).toBe(false);
    expect(shouldUseVitestPty({ OPENCLAW_VITEST_PTY: "false" }, "linux")).toBe(false);
    expect(shouldUseVitestPty({ OPENCLAW_VITEST_PTY: "1" }, "win32")).toBe(true);
  });

  it("spawns vitest in a detached process group on Unix hosts", () => {
    expect(resolveVitestSpawnParams({ PATH: "/usr/bin" }, "darwin")).toEqual({
      env: { PATH: "/usr/bin" },
      detached: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    expect(resolveVitestSpawnParams({ PATH: "/usr/bin" }, "win32")).toEqual({
      env: { PATH: "/usr/bin" },
      detached: false,
      stdio: ["inherit", "pipe", "pipe"],
    });
  });

  it("reenables local check policy for local Vitest children", () => {
    expect(
      resolveVitestSpawnParams(
        {
          OPENCLAW_LOCAL_CHECK: "0",
          PATH: "/usr/bin",
        },
        "darwin",
      ).env,
    ).toMatchObject({
      OPENCLAW_LOCAL_CHECK: "1",
      PATH: "/usr/bin",
    });
  });

  it("preserves explicit local-check disablement in CI", () => {
    expect(
      resolveVitestSpawnParams(
        {
          CI: "true",
          OPENCLAW_LOCAL_CHECK: "0",
          PATH: "/usr/bin",
        },
        "linux",
      ).env,
    ).toMatchObject({
      CI: "true",
      OPENCLAW_LOCAL_CHECK: "0",
      PATH: "/usr/bin",
    });
  });

  it("caps native Rust worker pools for serial Vitest runs", () => {
    expect(
      resolveVitestSpawnParams(
        {
          OPENCLAW_TEST_PROJECTS_SERIAL: "1",
          PATH: "/usr/bin",
        },
        "darwin",
      ).env,
    ).toMatchObject({
      OPENCLAW_TEST_PROJECTS_SERIAL: "1",
      RAYON_NUM_THREADS: "1",
      TOKIO_WORKER_THREADS: "1",
    });
  });

  it("keeps explicit native Rust worker pool settings", () => {
    expect(
      resolveVitestSpawnParams(
        {
          OPENCLAW_VITEST_MAX_WORKERS: "2",
          PATH: "/usr/bin",
          RAYON_NUM_THREADS: "8",
          TOKIO_WORKER_THREADS: "6",
        },
        "darwin",
      ).env,
    ).toMatchObject({
      OPENCLAW_VITEST_MAX_WORKERS: "2",
      RAYON_NUM_THREADS: "8",
      TOKIO_WORKER_THREADS: "6",
    });
  });

  it("suppresses rolldown plugin timing noise while keeping other stderr intact", () => {
    expect(
      shouldSuppressVitestStderrLine(
        "\u001b[33m[PLUGIN_TIMINGS] Warning:\u001b[0m plugin `foo` was slow\n",
      ),
    ).toBe(true);
    expect(shouldSuppressVitestOutputLine("[PLUGIN_TIMINGS] Warning: noisy line\n")).toBe(true);
    expect(shouldSuppressVitestStderrLine("real failure output\n")).toBe(false);
  });

  it("kills silent vitest runs after the configured idle timeout", () => {
    vi.useFakeTimers();
    try {
      const stdout = new EventEmitter();
      const timeoutSpy = vi.fn();
      const forceKillSpy = vi.fn();
      const logSpy = vi.fn();

      const teardown = installVitestNoOutputWatchdog({
        monitoredStreams: [{ stream: stdout }],
        timeoutMs: 1000,
        forceKillAfterMs: 5000,
        log: logSpy,
        onTimeout: timeoutSpy,
        onForceKill: forceKillSpy,
        setTimeoutFn: setTimeout,
        clearTimeoutFn: clearTimeout,
      });

      vi.advanceTimersByTime(900);
      expect(timeoutSpy).not.toHaveBeenCalled();

      stdout.emit("data", "still alive");
      vi.advanceTimersByTime(900);
      expect(timeoutSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        "[vitest] no output for 1000ms; terminating stalled Vitest process group.",
      );

      vi.advanceTimersByTime(5000);
      expect(forceKillSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        "[vitest] process group still alive after 5000ms; sending SIGKILL.",
      );

      teardown();
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes the runner label in watchdog logs when provided", () => {
    vi.useFakeTimers();
    try {
      const stdout = new EventEmitter();
      const logSpy = vi.fn();

      installVitestNoOutputWatchdog({
        monitoredStreams: [{ stream: stdout }],
        timeoutMs: 1000,
        forceKillAfterMs: 0,
        label: "run --config test/vitest/vitest.secrets.config.ts",
        log: logSpy,
        onTimeout: () => {},
      });

      vi.advanceTimersByTime(1000);
      expect(logSpy).toHaveBeenCalledWith(
        "[vitest] no output for 1000ms; terminating stalled Vitest process group (run --config test/vitest/vitest.secrets.config.ts).",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores suppressed output when determining watchdog activity", () => {
    vi.useFakeTimers();
    try {
      const stdout = new EventEmitter();
      const timeoutSpy = vi.fn();

      installVitestNoOutputWatchdog({
        monitoredStreams: [{ stream: stdout, shouldSuppressLine: shouldSuppressVitestOutputLine }],
        timeoutMs: 1000,
        forceKillAfterMs: 0,
        onTimeout: timeoutSpy,
      });

      stdout.emit("data", "[PLUGIN_TIMINGS] Warning: still noisy\n");
      vi.advanceTimersByTime(1000);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats carriage-return reporter updates as watchdog activity", () => {
    vi.useFakeTimers();
    try {
      const stdout = new EventEmitter();
      const timeoutSpy = vi.fn();

      installVitestNoOutputWatchdog({
        monitoredStreams: [{ stream: stdout }],
        timeoutMs: 1000,
        forceKillAfterMs: 0,
        onTimeout: timeoutSpy,
      });

      vi.advanceTimersByTime(900);
      stdout.emit("data", "\r RUN  v4.1.5 /tmp/openclaw");
      vi.advanceTimersByTime(900);
      expect(timeoutSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards carriage-return reporter updates immediately", () => {
    const stdout = new EventEmitter();
    stdout.setEncoding = vi.fn();
    const target = {
      isTTY: false,
      write: vi.fn(),
    };

    forwardVitestOutput(stdout, target);
    stdout.emit("data", "\r RUN  v4.1.5 /tmp/openclaw");

    expect(target.write).toHaveBeenNthCalledWith(1, "\n");
    expect(target.write).toHaveBeenNthCalledWith(2, " RUN  v4.1.5 /tmp/openclaw\n");
  });

  it("waits for close so piped stdio can drain after exit", async () => {
    const child = new EventEmitter();
    child.off = child.removeListener.bind(child);

    const completion = waitForVitestChildCompletion(child);
    child.emit("exit", 0, null);

    let settled = false;
    completion.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    child.emit("close", 0, null);
    await expect(completion).resolves.toEqual({ code: 0, signal: null });
  });

  it("rejects when the vitest child errors before closing", async () => {
    const child = new EventEmitter();
    child.off = child.removeListener.bind(child);
    const error = new Error("spawn failed");

    const completion = waitForVitestChildCompletion(child);
    child.emit("error", error);

    await expect(completion).rejects.toBe(error);
  });

  it("waits for PTY exit events", async () => {
    let exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined;
    const dispose = vi.fn();
    const pty = {
      onExit: vi.fn((listener: (event: { exitCode: number; signal?: number }) => void) => {
        exitListener = listener;
        return { dispose };
      }),
    };

    const completion = waitForVitestPtyCompletion(pty);
    exitListener?.({ exitCode: 3, signal: 15 });

    await expect(completion).resolves.toEqual({ code: 3, signal: 15 });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
