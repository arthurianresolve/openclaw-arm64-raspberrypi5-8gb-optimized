function sanitizeNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function sanitizeHostInfo(hostInfo) {
  if (!hostInfo) {
    return null;
  }
  return {
    cpuCount: sanitizeNumber(hostInfo.cpuCount),
    loadAverage1m: Number.isFinite(hostInfo.loadAverage1m)
      ? Number(hostInfo.loadAverage1m.toFixed(2))
      : null,
    totalMemoryBytes: sanitizeNumber(hostInfo.totalMemoryBytes),
    freeMemoryBytes: sanitizeNumber(hostInfo.freeMemoryBytes),
  };
}

export function buildVitestBenchmarkJson(params) {
  const records = params.records ?? [];
  return {
    status: params.status,
    args: params.args,
    profile: params.baseEnv.OPENCLAW_TEST_PROFILE ?? null,
    fullSuite: params.isFullSuiteRun,
    parallelShardRun: params.isParallelShardRun,
    concurrency: params.concurrency,
    durationMs: sanitizeNumber(params.durationMs),
    shardCount: records.length,
    failures: records.filter((record) => record.exitCode !== 0).length,
    timeoutRetries: records.reduce(
      (total, record) => total + (record.noOutputTimeoutRetries ?? 0),
      0,
    ),
    workers: {
      OPENCLAW_TEST_PROJECTS_SERIAL: params.baseEnv.OPENCLAW_TEST_PROJECTS_SERIAL ?? null,
      OPENCLAW_TEST_WORKERS: params.baseEnv.OPENCLAW_TEST_WORKERS ?? null,
      OPENCLAW_VITEST_MAX_WORKERS: params.baseEnv.OPENCLAW_VITEST_MAX_WORKERS ?? null,
    },
    host: sanitizeHostInfo(params.hostInfo),
    specs: records.map((record) => ({
      config: record.config,
      durationMs: sanitizeNumber(record.durationMs),
      exitCode: record.exitCode,
      noOutputTimeoutRetries: record.noOutputTimeoutRetries ?? 0,
      retriedAfterNoOutputTimeout: record.retriedAfterNoOutputTimeout === true,
    })),
  };
}
