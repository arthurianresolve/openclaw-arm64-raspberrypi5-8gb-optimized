import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import { resolveLocalVitestEnv } from "./lib/vitest-local-scheduling.mjs";
import { spawnPnpmRunner } from "./pnpm-runner.mjs";
import {
  forwardSignalToVitestProcessGroup,
  installVitestProcessGroupCleanup,
  shouldUseDetachedVitestProcessGroup,
} from "./vitest-process-group.mjs";

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSY_ENV_VALUES = new Set(["0", "false", "no", "off"]);
const SUPPRESSED_VITEST_OUTPUT_PATTERNS = ["[PLUGIN_TIMINGS] Warning:"];
const require = createRequire(import.meta.url);

function isTruthyEnvValue(value) {
  return TRUTHY_ENV_VALUES.has(value?.trim().toLowerCase() ?? "");
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toStringEnv(env = process.env) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = String(value);
    }
  }
  return result;
}

export function resolveVitestNodeArgs(env = process.env) {
  if (isTruthyEnvValue(env.OPENCLAW_VITEST_ENABLE_MAGLEV)) {
    return [];
  }

  return ["--no-maglev"];
}

export function resolveVitestCliEntry() {
  const vitestPackageJson = require.resolve("vitest/package.json");
  return path.join(path.dirname(vitestPackageJson), "vitest.mjs");
}

export function resolveVitestNoOutputTimeoutMs(env = process.env) {
  return parsePositiveInt(env.OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS);
}

export function shouldUseVitestPty(
  env = process.env,
  platform = process.platform,
  stdioIsTty = process.stdout.isTTY === true && process.stderr.isTTY === true,
) {
  const explicit = env.OPENCLAW_VITEST_PTY?.trim().toLowerCase();
  if (explicit) {
    return !FALSY_ENV_VALUES.has(explicit);
  }
  return platform !== "win32" && stdioIsTty;
}

export function resolveVitestSpawnParams(env = process.env, platform = process.platform) {
  return {
    env: resolveVitestSpawnEnv(env),
    detached: shouldUseDetachedVitestProcessGroup(platform),
    stdio: ["inherit", "pipe", "pipe"],
  };
}

export function resolveVitestSpawnEnv(env = process.env) {
  const nextEnv = resolveLocalVitestEnv(env);
  if (!shouldApplyNativeWorkerBudget(nextEnv)) {
    return nextEnv;
  }

  const nativeWorkerCount = String(resolveNativeWorkerCount(nextEnv));
  return {
    ...nextEnv,
    RAYON_NUM_THREADS: nextEnv.RAYON_NUM_THREADS?.trim() || nativeWorkerCount,
    TOKIO_WORKER_THREADS: nextEnv.TOKIO_WORKER_THREADS?.trim() || nativeWorkerCount,
  };
}

function shouldApplyNativeWorkerBudget(env) {
  if (env.RAYON_NUM_THREADS?.trim() && env.TOKIO_WORKER_THREADS?.trim()) {
    return false;
  }
  return (
    env.OPENCLAW_TEST_PROJECTS_SERIAL === "1" || resolveExplicitVitestWorkerBudget(env) !== null
  );
}

function resolveNativeWorkerCount(env) {
  return Math.min(resolveExplicitVitestWorkerBudget(env) ?? 1, 4);
}

function resolveExplicitVitestWorkerBudget(env) {
  return parsePositiveInt(env.OPENCLAW_VITEST_MAX_WORKERS ?? env.OPENCLAW_TEST_WORKERS);
}

export function shouldSuppressVitestOutputLine(line) {
  return SUPPRESSED_VITEST_OUTPUT_PATTERNS.some((pattern) => line.includes(pattern));
}

export function shouldSuppressVitestStderrLine(line) {
  return shouldSuppressVitestOutputLine(line);
}

function formatVitestOutputForTarget(segment, target) {
  if (target?.isTTY === true) {
    return segment;
  }
  return segment.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractDelimitedOutputSegment(buffered) {
  for (let index = 0; index < buffered.length; index += 1) {
    const char = buffered[index];
    if (char === "\n") {
      return {
        segment: buffered.slice(0, index + 1),
        rest: buffered.slice(index + 1),
      };
    }
    if (char === "\r") {
      const nextIndex = buffered[index + 1] === "\n" ? index + 2 : index + 1;
      return {
        segment: buffered.slice(0, nextIndex),
        rest: buffered.slice(nextIndex),
      };
    }
  }
  return null;
}

function installVitestOutputActivityMonitor({ stream, shouldSuppressLine, onActivity }) {
  if (!stream) {
    return () => {};
  }

  let buffered = "";
  const handleData = (chunk) => {
    buffered += String(chunk);
    while (true) {
      const extracted = extractDelimitedOutputSegment(buffered);
      if (!extracted) {
        break;
      }
      buffered = extracted.rest;
      if (!shouldSuppressLine(extracted.segment)) {
        onActivity();
      }
    }
    if (buffered.length > 0) {
      if (!shouldSuppressLine(buffered)) {
        onActivity();
      }
      buffered = "";
    }
  };

  stream.on("data", handleData);
  const handleEnd = () => {
    if (buffered.length > 0 && !shouldSuppressLine(buffered)) {
      onActivity();
    }
  };
  stream.on("end", handleEnd);

  return () => {
    stream.off("data", handleData);
    stream.off("end", handleEnd);
  };
}

export function resolveDirectNodeVitestArgs(pnpmArgs) {
  return pnpmArgs[0] === "exec" && pnpmArgs[1] === "node" ? pnpmArgs.slice(2) : null;
}

function spawnVitestProcess({ pnpmArgs, spawnParams }) {
  const directNodeArgs = resolveDirectNodeVitestArgs(pnpmArgs);
  if (directNodeArgs) {
    return spawn(process.execPath, directNodeArgs, spawnParams);
  }
  return spawnPnpmRunner({
    pnpmArgs,
    ...spawnParams,
  });
}

export function waitForVitestChildCompletion(child) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      child.off("error", handleError);
      child.off("close", handleClose);
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const handleClose = (code, signal) => {
      cleanup();
      resolve({ code, signal });
    };

    child.on("error", handleError);
    child.on("close", handleClose);
  });
}

export function waitForVitestPtyCompletion(pty) {
  return new Promise((resolve) => {
    const dispose = pty.onExit((event) => {
      dispose?.dispose?.();
      resolve({
        code: event?.exitCode ?? null,
        signal: event?.signal ?? null,
      });
    });
  });
}

let ptyModulePromise = null;

async function loadVitestPtySpawn() {
  ptyModulePromise ??= import("@lydell/node-pty");
  const module = await ptyModulePromise;
  return module.spawn ?? module.default?.spawn ?? null;
}

async function runVitestInPty({ command, args, env, cwd, label, onNoOutputTimeout }) {
  const spawnPty = await loadVitestPtySpawn();
  if (!spawnPty) {
    throw new Error("PTY support is unavailable (node-pty spawn not found).");
  }

  const pty = spawnPty(command, args, {
    cwd,
    env: toStringEnv(env),
    name: process.env.TERM ?? "xterm-256color",
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 30,
  });
  const output = new EventEmitter();
  output.setEncoding = () => {};

  const dataSubscription = pty.onData((chunk) => {
    output.emit("data", chunk);
  });
  const exitSubscription = pty.onExit(() => {
    output.emit("end");
  });

  const teardownNoOutputWatchdog = installVitestNoOutputWatchdog({
    monitoredStreams: [{ stream: output, shouldSuppressLine: shouldSuppressVitestOutputLine }],
    timeoutMs: resolveVitestNoOutputTimeoutMs(env),
    label,
    log: (message) => {
      console.error(message);
    },
    onTimeout: () => {
      onNoOutputTimeout?.();
      try {
        pty.kill("SIGTERM");
      } catch {
        // ignore termination errors
      }
    },
    onForceKill: () => {
      try {
        pty.kill("SIGKILL");
      } catch {
        // ignore termination errors
      }
    },
  });
  forwardVitestOutput(output, process.stdout, shouldSuppressVitestOutputLine);

  const teardown = () => {
    teardownNoOutputWatchdog();
    dataSubscription?.dispose?.();
    exitSubscription?.dispose?.();
  };

  return {
    pty,
    teardown,
    completion: waitForVitestPtyCompletion(pty),
  };
}

export function installVitestNoOutputWatchdog(params) {
  const timeoutMs = params.timeoutMs;
  if (!timeoutMs || timeoutMs <= 0) {
    return () => {};
  }

  const setTimeoutFn = params.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = params.clearTimeoutFn ?? clearTimeout;
  const forceKillAfterMs = params.forceKillAfterMs ?? 5_000;
  const monitoredStreams = params.monitoredStreams ?? [];
  const label = params.label?.trim();
  const suffix = label ? ` (${label})` : "";

  let active = true;
  let silenceTimer = null;
  let forceKillTimer = null;

  const clearForceKillTimer = () => {
    if (forceKillTimer !== null) {
      clearTimeoutFn(forceKillTimer);
      forceKillTimer = null;
    }
  };

  const clearSilenceTimer = () => {
    if (silenceTimer !== null) {
      clearTimeoutFn(silenceTimer);
      silenceTimer = null;
    }
  };

  const resetSilenceTimer = () => {
    if (!active) {
      return;
    }
    clearSilenceTimer();
    silenceTimer = setTimeoutFn(() => {
      if (!active) {
        return;
      }
      params.log?.(
        `[vitest] no output for ${timeoutMs}ms; terminating stalled Vitest process group${suffix}.`,
      );
      params.onTimeout?.();
      if (forceKillAfterMs > 0) {
        clearForceKillTimer();
        forceKillTimer = setTimeoutFn(() => {
          if (!active) {
            return;
          }
          params.log?.(
            `[vitest] process group still alive after ${forceKillAfterMs}ms; sending SIGKILL${suffix}.`,
          );
          params.onForceKill?.();
        }, forceKillAfterMs);
      }
    }, timeoutMs);
  };

  const handleActivity = () => {
    clearForceKillTimer();
    resetSilenceTimer();
  };

  const teardownMonitors = monitoredStreams.map((streamConfig) =>
    installVitestOutputActivityMonitor({
      stream: streamConfig.stream,
      shouldSuppressLine: streamConfig.shouldSuppressLine ?? (() => false),
      onActivity: handleActivity,
    }),
  );

  resetSilenceTimer();

  return () => {
    if (!active) {
      return;
    }
    active = false;
    clearSilenceTimer();
    clearForceKillTimer();
    for (const teardownMonitor of teardownMonitors) {
      teardownMonitor();
    }
  };
}

export function forwardVitestOutput(stream, target, shouldSuppressLine = () => false) {
  if (!stream) {
    return;
  }

  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const text = String(chunk);
    const sawCarriageReturn = text.includes("\r");
    buffered += text;
    while (true) {
      const extracted = extractDelimitedOutputSegment(buffered);
      if (!extracted) {
        break;
      }
      buffered = extracted.rest;
      if (!shouldSuppressLine(extracted.segment)) {
        target.write(formatVitestOutputForTarget(extracted.segment, target));
      }
    }
    if (buffered.length > 0) {
      if (!shouldSuppressLine(buffered)) {
        const trailing = sawCarriageReturn && target?.isTTY !== true ? `${buffered}\n` : buffered;
        target.write(formatVitestOutputForTarget(trailing, target));
      }
      buffered = "";
    }
  });
  stream.on("end", () => {
    if (buffered.length > 0 && !shouldSuppressLine(buffered)) {
      target.write(buffered);
    }
  });
}

export function spawnWatchedVitestProcess({
  pnpmArgs,
  spawnParams,
  env,
  label,
  onNoOutputTimeout,
}) {
  const child = spawnVitestProcess({
    pnpmArgs,
    spawnParams,
  });
  const teardownChildCleanup = installVitestProcessGroupCleanup({ child });
  const usesPipedOutput = Boolean(child.stdout || child.stderr);
  const teardownNoOutputWatchdog = usesPipedOutput
    ? installVitestNoOutputWatchdog({
        monitoredStreams: [
          {
            stream: child.stdout,
            shouldSuppressLine: shouldSuppressVitestOutputLine,
          },
          {
            stream: child.stderr,
            shouldSuppressLine: shouldSuppressVitestOutputLine,
          },
        ],
        timeoutMs: resolveVitestNoOutputTimeoutMs(env),
        label,
        log: (message) => {
          console.error(message);
        },
        onTimeout: () => {
          onNoOutputTimeout?.();
          forwardSignalToVitestProcessGroup({
            child,
            signal: "SIGTERM",
            kill: process.kill.bind(process),
          });
        },
        onForceKill: () => {
          forwardSignalToVitestProcessGroup({
            child,
            signal: "SIGKILL",
            kill: process.kill.bind(process),
          });
        },
      })
    : () => {};
  if (usesPipedOutput) {
    forwardVitestOutput(child.stdout, process.stdout, shouldSuppressVitestOutputLine);
    forwardVitestOutput(child.stderr, process.stderr, shouldSuppressVitestOutputLine);
  }

  return {
    child,
    teardown: () => {
      teardownChildCleanup();
      teardownNoOutputWatchdog();
    },
  };
}

function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length === 0) {
    console.error("usage: node scripts/run-vitest.mjs <vitest args...>");
    process.exit(1);
  }

  const pnpmArgs = [
    "exec",
    "node",
    ...resolveVitestNodeArgs(env),
    resolveVitestCliEntry(),
    ...argv,
  ];
  const directNodeArgs = resolveDirectNodeVitestArgs(pnpmArgs);
  const label = argv.join(" ");

  if (shouldUseVitestPty(env, process.platform) && directNodeArgs) {
    runVitestInPty({
      command: process.execPath,
      args: directNodeArgs,
      env,
      cwd: process.cwd(),
      label,
    })
      .then(async ({ completion, teardown }) => {
        const { code, signal } = await completion;
        teardown();
        process.exitCode = code ?? (signal ? 128 + signal : 1);
      })
      .catch((error) => {
        console.error(
          `[vitest] PTY startup failed; falling back to inherited stdio: ${error instanceof Error ? error.message : String(error)}`,
        );
        const { child, teardown } = spawnWatchedVitestProcess({
          pnpmArgs,
          spawnParams: {
            ...resolveVitestSpawnParams(env),
            stdio: "inherit",
          },
          env,
          label,
        });
        waitForVitestChildCompletion(child)
          .then(({ code, signal }) => {
            teardown();
            if (signal) {
              process.kill(process.pid, signal);
              return;
            }
            process.exitCode = code ?? 1;
          })
          .catch((fallbackError) => {
            teardown();
            console.error(fallbackError);
            process.exitCode = 1;
          });
      });
    return;
  }

  const { child, teardown } = spawnWatchedVitestProcess({
    pnpmArgs,
    spawnParams: {
      ...resolveVitestSpawnParams(env),
      stdio: "inherit",
    },
    env,
    label,
  });

  waitForVitestChildCompletion(child)
    .then(({ code, signal }) => {
      teardown();
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exitCode = code ?? 1;
    })
    .catch((error) => {
      teardown();
      console.error(error);
      process.exitCode = 1;
    });
}

if (import.meta.main) {
  main();
}
