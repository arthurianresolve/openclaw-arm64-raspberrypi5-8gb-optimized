export function buildVitestPlanJson(params) {
  const lockWouldBeAcquired = params.shouldAcquireLocalHeavyCheckLock(
    params.runSpecs,
    params.baseEnv,
  );
  const concurrency = params.isParallelShardRun
    ? params.resolveParallelFullSuiteConcurrency(params.runSpecs.length, params.baseEnv)
    : 1;
  return {
    status: params.runSpecs.length === 0 ? "skipped" : "planned",
    args: params.args,
    changedTargetArgs: params.changedTargetArgs,
    targetArgs: params.targetArgs,
    profile: params.baseEnv.OPENCLAW_TEST_PROFILE ?? null,
    fullSuite: params.isFullSuiteRun,
    parallelShardRun: params.isParallelShardRun,
    concurrency,
    heavyCheckLock: lockWouldBeAcquired,
    specs: params.runSpecs.map((spec) => ({
      config: spec.config,
      watchMode: spec.watchMode,
      continueOnFailure: spec.continueOnFailure === true,
      includePatterns: spec.includePatterns,
      includeFile: Boolean(spec.includeFilePath),
      pnpmArgs: spec.pnpmArgs,
      env: {
        OPENCLAW_VITEST_FS_MODULE_CACHE_PATH:
          spec.env?.OPENCLAW_VITEST_FS_MODULE_CACHE_PATH ?? null,
        OPENCLAW_VITEST_INCLUDE_FILE: spec.includeFilePath ? "<generated>" : null,
        OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS:
          spec.env?.OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS ?? null,
        OPENCLAW_VITEST_NO_OUTPUT_RETRY: spec.env?.OPENCLAW_VITEST_NO_OUTPUT_RETRY ?? null,
      },
    })),
  };
}
