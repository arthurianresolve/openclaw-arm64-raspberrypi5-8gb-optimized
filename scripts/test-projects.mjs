import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { formatMs } from "./lib/check-timing-summary.mjs";
import { acquireLocalHeavyCheckLockSync } from "./lib/local-heavy-check-runtime.mjs";
import { buildVitestBenchmarkJson } from "./lib/vitest-benchmark-json.mjs";
import {
  detectVitestHostInfo,
  isCiLikeEnv,
  resolveLocalFullSuiteProfile,
  resolveLocalVitestEnv,
} from "./lib/vitest-local-scheduling.mjs";
import { buildVitestPlanJson } from "./lib/vitest-plan-json.mjs";
import {
  createVitestRunSpecsFromPlans,
  VITEST_NO_OUTPUT_TIMEOUT_ENV_KEY,
} from "./lib/vitest-run-specs.mjs";
import {
  createShardTimingSample,
  readShardTimings,
  writeShardTimings,
} from "./lib/vitest-shard-timings.mjs";
import {
  resolveVitestSpawnParams,
  spawnWatchedVitestProcess,
  waitForVitestChildCompletion,
} from "./run-vitest.mjs";
import {
  applyDefaultMultiSpecVitestCachePaths,
  applyDefaultVitestNoOutputTimeout,
  applyParallelVitestCachePaths,
  buildFullSuiteVitestRunPlans,
  createVitestRunSpecs,
  listFullExtensionVitestProjectConfigs,
  parseTestProjectsArgs,
  resolveParallelFullSuiteConcurrency,
  resolveChangedTargetArgs,
  shouldAcquireLocalHeavyCheckLock,
  shouldRetryVitestNoOutputTimeout,
  writeVitestIncludeFile,
} from "./test-projects.test-support.mjs";

// Keep this shim so `pnpm test -- src/foo.test.ts` still forwards filters
// cleanly instead of leaking pnpm's passthrough sentinel to Vitest.
let releaseLock = () => {};
let lockReleased = false;

const FULL_SUITE_CONFIG_WEIGHT = new Map([
  ["test/vitest/vitest.full-extensions.config.ts", 240],
  ["test/vitest/vitest.full-core-runtime.config.ts", 230],
  ["test/vitest/vitest.full-core-support-boundary.config.ts", 225],
  ["test/vitest/vitest.full-agentic.config.ts", 220],
  ["test/vitest/vitest.full-core-unit-fast.config.ts", 215],
  ["test/vitest/vitest.full-auto-reply.config.ts", 210],
  ["test/vitest/vitest.full-bundled.config.ts", 170],
  ["test/vitest/vitest.full-gateway.config.ts", 170],
  ["test/vitest/vitest.full-contracts.config.ts", 90],
  ["test/vitest/vitest.full-ui.config.ts", 65],
  ["test/vitest/vitest.full-tooling.config.ts", 40],
  ["test/vitest/vitest.full-daemon.config.ts", 36],
  ["test/vitest/vitest.gateway.config.ts", 180],
  ["test/vitest/vitest.gateway-server.config.ts", 180],
  ["test/vitest/vitest.gateway-core.config.ts", 179],
  ["test/vitest/vitest.gateway-client.config.ts", 178],
  ["test/vitest/vitest.gateway-methods.config.ts", 177],
  ["test/vitest/vitest.commands.config.ts", 175],
  ["test/vitest/vitest.agents.config.ts", 170],
  ["test/vitest/vitest.extension-voice-call.config.ts", 169],
  ["test/vitest/vitest.extensions.config.ts", 168],
  ["test/vitest/vitest.extension-provider-openai.config.ts", 167],
  ["test/vitest/vitest.runtime-config.config.ts", 166],
  ["test/vitest/vitest.contracts-channel-config.config.ts", 85],
  ["test/vitest/vitest.contracts-channel-surface.config.ts", 60],
  ["test/vitest/vitest.contracts-channel-session.config.ts", 50],
  ["test/vitest/vitest.contracts-channel-registry.config.ts", 35],
  ["test/vitest/vitest.contracts-plugin.config.ts", 20],
  ["test/vitest/vitest.tasks.config.ts", 165],
  ["test/vitest/vitest.channels.config.ts", 164],
  ["test/vitest/vitest.unit-fast.config.ts", 160],
  ["test/vitest/vitest.auto-reply-reply.config.ts", 155],
  ["test/vitest/vitest.infra.config.ts", 145],
  ["test/vitest/vitest.secrets.config.ts", 140],
  ["test/vitest/vitest.cron.config.ts", 135],
  ["test/vitest/vitest.wizard.config.ts", 130],
  ["test/vitest/vitest.unit-src.config.ts", 125],
  ["test/vitest/vitest.extension-matrix.config.ts", 100],
  ["test/vitest/vitest.extension-discord.config.ts", 98],
  ["test/vitest/vitest.extension-providers.config.ts", 96],
  ["test/vitest/vitest.extension-telegram.config.ts", 94],
  ["test/vitest/vitest.extension-whatsapp.config.ts", 92],
  ["test/vitest/vitest.auto-reply-core.config.ts", 90],
  ["test/vitest/vitest.cli.config.ts", 86],
  ["test/vitest/vitest.media.config.ts", 84],
  ["test/vitest/vitest.plugins.config.ts", 82],
  ["test/vitest/vitest.bundled.config.ts", 80],
  ["test/vitest/vitest.extension-slack.config.ts", 78],
  ["test/vitest/vitest.commands-light.config.ts", 48],
  ["test/vitest/vitest.plugin-sdk.config.ts", 46],
  ["test/vitest/vitest.auto-reply-top-level.config.ts", 45],
  ["test/vitest/vitest.unit-ui.config.ts", 40],
  ["test/vitest/vitest.plugin-sdk-light.config.ts", 38],
  ["test/vitest/vitest.daemon.config.ts", 36],
  ["test/vitest/vitest.boundary.config.ts", 34],
  ["test/vitest/vitest.tooling.config.ts", 32],
  ["test/vitest/vitest.unit-security.config.ts", 30],
  ["test/vitest/vitest.unit-support.config.ts", 28],
  ["test/vitest/vitest.extension-zalo.config.ts", 24],
  ["test/vitest/vitest.extension-bluebubbles.config.ts", 22],
  ["test/vitest/vitest.extension-irc.config.ts", 20],
  ["test/vitest/vitest.extension-feishu.config.ts", 18],
  ["test/vitest/vitest.extension-mattermost.config.ts", 16],
  ["test/vitest/vitest.extension-messaging.config.ts", 14],
  ["test/vitest/vitest.extension-imessage.config.ts", 13],
  ["test/vitest/vitest.extension-line.config.ts", 12],
  ["test/vitest/vitest.extension-signal.config.ts", 11],
  ["test/vitest/vitest.extension-acpx.config.ts", 10],
  ["test/vitest/vitest.extension-diffs.config.ts", 8],
  ["test/vitest/vitest.extension-memory.config.ts", 6],
  ["test/vitest/vitest.extension-msteams.config.ts", 4],
]);
const PLAN_JSON_ARG = "--plan-json";
const BENCHMARK_JSON_ARG = "--benchmark-json";
// Raspberry Pi 5 8 GB full-suite runs need longer quiet windows than the shared
// 3 minute default, especially once the largest shards are serialized.
const FULL_SUITE_VITEST_NO_OUTPUT_TIMEOUT_MS = "420000";

const releaseLockOnce = () => {
  if (lockReleased) {
    return;
  }
  lockReleased = true;
  releaseLock();
};

function cleanupVitestRunSpec(spec) {
  if (!spec.includeFilePath) {
    return;
  }
  try {
    fs.rmSync(spec.includeFilePath, { force: true });
  } catch {
    // Best-effort cleanup for temp include lists.
  }
}

function runVitestSpec(spec) {
  if (spec.includeFilePath && spec.includePatterns) {
    writeVitestIncludeFile(spec.includeFilePath, spec.includePatterns);
  }
  let noOutputTimedOut = false;
  return new Promise((resolve, reject) => {
    const { child, teardown } = spawnWatchedVitestProcess({
      pnpmArgs: spec.pnpmArgs,
      env: spec.env,
      label: spec.config,
      onNoOutputTimeout: () => {
        noOutputTimedOut = true;
      },
      spawnParams: {
        cwd: process.cwd(),
        ...resolveVitestSpawnParams(spec.env),
      },
    });

    waitForVitestChildCompletion(child)
      .then(({ code, signal }) => {
        teardown();
        cleanupVitestRunSpec(spec);
        resolve({ code: code ?? (signal ? 143 : 1), noOutputTimedOut, signal });
      })
      .catch((error) => {
        teardown();
        cleanupVitestRunSpec(spec);
        reject(error);
      });
  });
}

function applyDefaultParallelVitestWorkerBudget(specs, env) {
  if (env.OPENCLAW_VITEST_MAX_WORKERS || env.OPENCLAW_TEST_WORKERS || isCiLikeEnv(env)) {
    return specs;
  }
  const { vitestMaxWorkers } = resolveLocalFullSuiteProfile(env);
  return specs.map((spec) => ({
    ...spec,
    env: {
      ...spec.env,
      OPENCLAW_VITEST_MAX_WORKERS: String(vitestMaxWorkers),
    },
  }));
}

function applyFullSuiteVitestNoOutputTimeout(specs) {
  return specs.map((spec) => {
    if (spec.watchMode || Object.hasOwn(spec.env ?? {}, VITEST_NO_OUTPUT_TIMEOUT_ENV_KEY)) {
      return spec;
    }
    return {
      ...spec,
      env: {
        ...spec.env,
        [VITEST_NO_OUTPUT_TIMEOUT_ENV_KEY]: FULL_SUITE_VITEST_NO_OUTPUT_TIMEOUT_MS,
      },
    };
  });
}

async function runLoggedVitestSpec(spec) {
  console.error(`[test] starting ${spec.config}`);
  const startedAt = performance.now();
  let noOutputTimeoutRetries = 0;
  let retriedAfterNoOutputTimeout = false;
  let result = await runVitestSpec(spec);
  if (result.noOutputTimedOut && !spec.watchMode && shouldRetryVitestNoOutputTimeout(spec.env)) {
    console.error(`[test] retrying ${spec.config} after no-output timeout`);
    noOutputTimeoutRetries += 1;
    retriedAfterNoOutputTimeout = true;
    result = await runVitestSpec(spec);
  }
  const durationMs = performance.now() - startedAt;
  if (result.noOutputTimedOut && result.signal) {
    console.error(`[test] ${spec.config} exceeded no-output timeout`);
    return {
      ...result,
      code: result.code || 143,
      signal: null,
      timing: null,
      durationMs,
      noOutputTimeoutRetries,
      retriedAfterNoOutputTimeout,
    };
  }
  if (result.signal) {
    console.error(`[test] ${spec.config} exited by signal ${result.signal}`);
    releaseLockOnce();
    process.kill(process.pid, result.signal);
    return null;
  }
  return {
    ...result,
    durationMs,
    noOutputTimeoutRetries,
    retriedAfterNoOutputTimeout,
    timing: createShardTimingSample(spec, durationMs),
  };
}

function resolveConfigSortWeight(config, shardTimings) {
  return shardTimings.get(config) ?? (FULL_SUITE_CONFIG_WEIGHT.get(config) ?? 0) * 1000;
}

function interleaveSlowAndFastSpecs(sortedSpecs) {
  const ordered = [];
  let slowIndex = 0;
  let fastIndex = sortedSpecs.length - 1;
  while (slowIndex <= fastIndex) {
    ordered.push(sortedSpecs[slowIndex]);
    slowIndex += 1;
    if (slowIndex <= fastIndex) {
      ordered.push(sortedSpecs[fastIndex]);
      fastIndex -= 1;
    }
  }
  return ordered;
}

function orderFullSuiteSpecsForParallelRun(specs, shardTimings = new Map()) {
  const sortedSpecs = specs.toSorted((a, b) => {
    const weightDelta =
      resolveConfigSortWeight(b.config, shardTimings) -
      resolveConfigSortWeight(a.config, shardTimings);
    if (weightDelta !== 0) {
      return weightDelta;
    }
    return a.config.localeCompare(b.config);
  });
  const hasMatchingShardTiming = specs.some((spec) => shardTimings.has(spec.config));
  return hasMatchingShardTiming ? interleaveSlowAndFastSpecs(sortedSpecs) : sortedSpecs;
}

function orderFullSuiteSpecsForSequentialRun(specs, shardTimings = new Map()) {
  return specs.toSorted((a, b) => {
    const weightDelta =
      resolveConfigSortWeight(b.config, shardTimings) -
      resolveConfigSortWeight(a.config, shardTimings);
    if (weightDelta !== 0) {
      return weightDelta;
    }
    return a.config.localeCompare(b.config);
  });
}

function createBenchmarkRecord(spec, result) {
  return {
    config: spec.config,
    durationMs: result.durationMs,
    exitCode: result.code,
    noOutputTimeoutRetries: result.noOutputTimeoutRetries,
    retriedAfterNoOutputTimeout: result.retriedAfterNoOutputTimeout,
  };
}

function isFullExtensionsProjectRun(specs) {
  const fullExtensionProjectConfigs = new Set(listFullExtensionVitestProjectConfigs());
  return (
    specs.length > 1 &&
    specs.every(
      (spec) =>
        spec.watchMode === false &&
        spec.includePatterns === null &&
        fullExtensionProjectConfigs.has(spec.config),
    )
  );
}

async function runVitestSpecsParallel(specs, concurrency) {
  let nextIndex = 0;
  let exitCode = 0;
  const timings = [];
  const benchmarkRecords = [];

  const runWorker = async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const spec = specs[index];
      if (!spec) {
        return;
      }
      const result = await runLoggedVitestSpec(spec);
      if (!result) {
        return;
      }
      if (result.code !== 0) {
        exitCode = exitCode || result.code;
      }
      benchmarkRecords.push(createBenchmarkRecord(spec, result));
      if (result.timing) {
        timings.push(result.timing);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return { exitCode, timings, benchmarkRecords };
}

async function main() {
  const suiteStartedAt = performance.now();
  const rawArgs = process.argv.slice(2);
  const planJson = rawArgs.includes(PLAN_JSON_ARG);
  const benchmarkJson = rawArgs.includes(BENCHMARK_JSON_ARG);
  const args = rawArgs.filter((arg) => arg !== PLAN_JSON_ARG && arg !== BENCHMARK_JSON_ARG);
  const baseEnv = resolveLocalVitestEnv(process.env);
  const hostInfo = detectVitestHostInfo();
  const { targetArgs } = parseTestProjectsArgs(args, process.cwd());
  const changedTargetArgs =
    targetArgs.length === 0
      ? resolveChangedTargetArgs(args, process.cwd(), undefined, { env: baseEnv })
      : null;
  const rawRunSpecs =
    targetArgs.length === 0 && changedTargetArgs === null
      ? createVitestRunSpecsFromPlans(buildFullSuiteVitestRunPlans(args, process.cwd()), {
          baseEnv,
        }).map((spec) => Object.assign({}, spec, { continueOnFailure: true }))
      : createVitestRunSpecs(args, {
          baseEnv,
          cwd: process.cwd(),
        });
  const isSequentialFullSuiteRun =
    targetArgs.length === 0 &&
    changedTargetArgs === null &&
    !rawRunSpecs.some((spec) => spec.watchMode);
  const adjustedRawRunSpecs = isSequentialFullSuiteRun
    ? applyFullSuiteVitestNoOutputTimeout(rawRunSpecs)
    : rawRunSpecs;
  const runSpecs = applyDefaultMultiSpecVitestCachePaths(
    applyDefaultVitestNoOutputTimeout(adjustedRawRunSpecs, { env: baseEnv }),
    { cwd: process.cwd(), env: baseEnv },
  );

  if (runSpecs.length === 0) {
    if (planJson) {
      printRunPlanJson({
        args,
        baseEnv,
        changedTargetArgs,
        isFullSuiteRun: false,
        isParallelShardRun: false,
        runSpecs,
        targetArgs,
      });
      return;
    }
    console.error("[test] no changed test targets; skipping Vitest.");
    printTestSummary("skipped", 0, performance.now() - suiteStartedAt);
    if (benchmarkJson) {
      printBenchmarkJson({
        args,
        baseEnv,
        concurrency: 1,
        durationMs: performance.now() - suiteStartedAt,
        hostInfo,
        isFullSuiteRun: false,
        isParallelShardRun: false,
        records: [],
        status: "skipped",
      });
    }
    return;
  }

  const isFullSuiteRun =
    targetArgs.length === 0 &&
    changedTargetArgs === null &&
    !runSpecs.some((spec) => spec.watchMode);
  const isExplicitParallelMultiConfigRun =
    Boolean(baseEnv.OPENCLAW_TEST_PROJECTS_PARALLEL) &&
    runSpecs.length > 1 &&
    !runSpecs.some((spec) => spec.watchMode);
  const isParallelShardRun =
    isFullSuiteRun || isFullExtensionsProjectRun(runSpecs) || isExplicitParallelMultiConfigRun;
  const concurrency = isParallelShardRun
    ? resolveParallelFullSuiteConcurrency(runSpecs.length, baseEnv)
    : 1;
  const shardTimings = isParallelShardRun ? readShardTimings(process.cwd(), baseEnv) : new Map();
  const sequentialSpecs =
    isParallelShardRun && concurrency === 1
      ? orderFullSuiteSpecsForSequentialRun(runSpecs, shardTimings)
      : runSpecs;
  if (planJson) {
    printRunPlanJson({
      args,
      baseEnv,
      changedTargetArgs,
      isFullSuiteRun,
      isParallelShardRun,
      runSpecs: sequentialSpecs,
      targetArgs,
    });
    return;
  }
  releaseLock = shouldAcquireLocalHeavyCheckLock(runSpecs, baseEnv)
    ? acquireLocalHeavyCheckLockSync({
        cwd: process.cwd(),
        env: baseEnv,
        toolName: "test",
      })
    : () => {};
  if (isParallelShardRun) {
    if (concurrency > 1) {
      const localFullSuiteProfile = resolveLocalFullSuiteProfile(baseEnv);
      const parallelSpecs = applyDefaultParallelVitestWorkerBudget(
        applyParallelVitestCachePaths(orderFullSuiteSpecsForParallelRun(runSpecs, shardTimings), {
          cwd: process.cwd(),
          env: baseEnv,
        }),
        baseEnv,
      );
      if (
        !isCiLikeEnv(baseEnv) &&
        !baseEnv.OPENCLAW_TEST_PROJECTS_PARALLEL &&
        !baseEnv.OPENCLAW_VITEST_MAX_WORKERS &&
        !baseEnv.OPENCLAW_TEST_WORKERS &&
        localFullSuiteProfile.shardParallelism === 10 &&
        localFullSuiteProfile.vitestMaxWorkers === 2
      ) {
        console.error("[test] using host-aware local full-suite profile: shards=10 workers=2");
      }
      console.error(
        `[test] running ${parallelSpecs.length} Vitest shards with parallelism ${concurrency}`,
      );
      const {
        benchmarkRecords,
        exitCode: parallelExitCode,
        timings,
      } = await runVitestSpecsParallel(parallelSpecs, concurrency);
      writeShardTimings(timings, process.cwd(), baseEnv);
      printTestSummary(
        parallelExitCode === 0 ? "passed" : "failed",
        parallelSpecs.length,
        performance.now() - suiteStartedAt,
        "Vitest summaries above are per-shard, not aggregate totals.",
      );
      releaseLockOnce();
      if (benchmarkJson) {
        printBenchmarkJson({
          args,
          baseEnv,
          concurrency,
          durationMs: performance.now() - suiteStartedAt,
          hostInfo,
          isFullSuiteRun,
          isParallelShardRun,
          records: benchmarkRecords,
          status: parallelExitCode === 0 ? "passed" : "failed",
        });
      }
      if (parallelExitCode !== 0) {
        process.exit(parallelExitCode);
      }
      return;
    }
  }

  let exitCode = 0;
  const timings = [];
  const benchmarkRecords = [];
  for (const spec of sequentialSpecs) {
    const result = await runLoggedVitestSpec(spec);
    if (!result) {
      return;
    }
    benchmarkRecords.push(createBenchmarkRecord(spec, result));
    if (result.timing) {
      timings.push(result.timing);
    }
    if (result.code !== 0) {
      exitCode = exitCode || result.code;
      if (spec.continueOnFailure !== true) {
        printTestSummary("failed", timings.length, performance.now() - suiteStartedAt);
        releaseLockOnce();
        if (benchmarkJson) {
          printBenchmarkJson({
            args,
            baseEnv,
            concurrency,
            durationMs: performance.now() - suiteStartedAt,
            hostInfo,
            isFullSuiteRun,
            isParallelShardRun,
            records: benchmarkRecords,
            status: "failed",
          });
        }
        process.exit(result.code);
      }
    }
  }
  writeShardTimings(timings, process.cwd(), baseEnv);
  printTestSummary(
    exitCode === 0 ? "passed" : "failed",
    timings.length,
    performance.now() - suiteStartedAt,
  );

  releaseLockOnce();
  if (benchmarkJson) {
    printBenchmarkJson({
      args,
      baseEnv,
      concurrency,
      durationMs: performance.now() - suiteStartedAt,
      hostInfo,
      isFullSuiteRun,
      isParallelShardRun,
      records: benchmarkRecords,
      status: exitCode === 0 ? "passed" : "failed",
    });
  }
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function printTestSummary(status, shardCount, durationMs, detail) {
  const suffix = detail ? `; ${detail}` : "";
  console.error(
    `[test] ${status} ${shardCount} Vitest shard${shardCount === 1 ? "" : "s"} in ${formatMs(durationMs)}${suffix}`,
  );
}

function printRunPlanJson(params) {
  const output = buildVitestPlanJson({
    ...params,
    resolveParallelFullSuiteConcurrency,
    shouldAcquireLocalHeavyCheckLock,
  });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function printBenchmarkJson(params) {
  const output = buildVitestBenchmarkJson(params);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  releaseLockOnce();
  console.error(error);
  process.exit(1);
});
