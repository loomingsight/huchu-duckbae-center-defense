export interface FrameSample {
  readonly offsetMs: number;
  readonly deltaMs: number;
}

export interface PerformanceWindowStats {
  readonly averageFps: number;
  readonly maxLowStreakSeconds: number;
  readonly frameCount: number;
  readonly sampledMs: number;
  readonly evaluatedBucketCount: number;
  readonly oneSecondBuckets: readonly number[];
  readonly longestFrameMs: number;
  readonly framesOver50Ms: number;
}

export const PERFORMANCE_WINDOW_MS = 30_000;

export function analyzePerformanceWindow(
  samples: readonly FrameSample[],
): PerformanceWindowStats {
  const sampledMs = samples.at(-1)?.offsetMs ?? 0;
  const evaluatedBucketCount = PERFORMANCE_WINDOW_MS / 1000;
  const windowSamples = samples.filter(({ offsetMs }) => (
    offsetMs >= 0 && offsetMs <= PERFORMANCE_WINDOW_MS
  ));
  const oneSecondBuckets = Array.from({ length: evaluatedBucketCount }, () => 0);
  for (const { offsetMs } of windowSamples) {
    const index = offsetMs === 0
      ? 0
      : Math.min(evaluatedBucketCount - 1, Math.ceil(offsetMs / 1000) - 1);
    oneSecondBuckets[index] = (oneSecondBuckets[index] ?? 0) + 1;
  }
  let lowStreak = 0;
  let maxLowStreak = 0;
  for (const fps of oneSecondBuckets) {
    lowStreak = fps < 50 ? lowStreak + 1 : 0;
    maxLowStreak = Math.max(maxLowStreak, lowStreak);
  }
  return {
    averageFps: windowSamples.length * 1000 / PERFORMANCE_WINDOW_MS,
    maxLowStreakSeconds: maxLowStreak,
    frameCount: windowSamples.length,
    sampledMs,
    evaluatedBucketCount,
    oneSecondBuckets,
    longestFrameMs: Math.max(...windowSamples.map(({ deltaMs }) => deltaMs)),
    framesOver50Ms: windowSamples.filter(({ deltaMs }) => deltaMs > 50).length,
  };
}
