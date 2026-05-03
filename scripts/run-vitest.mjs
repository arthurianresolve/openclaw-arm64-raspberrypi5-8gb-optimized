import {
  forwardVitestOutput,
  installVitestNoOutputWatchdog,
  resolveDirectNodeVitestArgs,
  resolveVitestCliEntry,
  resolveVitestNodeArgs,
  resolveVitestNoOutputTimeoutMs,
  resolveVitestSpawnParams,
  runVitestInPty,
  shouldSuppressVitestOutputLine,
  shouldSuppressVitestStderrLine,
  shouldUseVitestPty,
  spawnWatchedVitestProcess,
  waitForVitestChildCompletion,
  waitForVitestPtyCompletion,
} from "./lib/vitest-runtime.mjs";

export {
  forwardVitestOutput,
  installVitestNoOutputWatchdog,
  resolveDirectNodeVitestArgs,
  resolveVitestCliEntry,
  resolveVitestNodeArgs,
  resolveVitestNoOutputTimeoutMs,
  resolveVitestSpawnParams,
  shouldSuppressVitestOutputLine,
  shouldSuppressVitestStderrLine,
  shouldUseVitestPty,
  spawnWatchedVitestProcess,
  waitForVitestChildCompletion,
  waitForVitestPtyCompletion,
};

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
