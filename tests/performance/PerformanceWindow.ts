export interface FrameSample {
  readonly offsetMs: number;
  readonly deltaMs: number;
}

export interface PerformanceWindowStats {
  readonly averageFps: number;
  readonly medianFps: number;
  readonly maxLowStreakSeconds: number;
  readonly frameCount: number;
  readonly sampledMs: number;
  readonly evaluatedBucketCount: number;
  readonly oneSecondBuckets: readonly number[];
  readonly longestFrameMs: number;
  readonly framesOver50Ms: number;
}

export const PERFORMANCE_WINDOW_MS = 30_000;

export interface PerformanceRun {
  readonly medianFps: number;
  readonly maxLowStreakSeconds: number;
}

export interface TelemetryBoundaryObservation {
  readonly scheduledAtMs: number;
  readonly observedAtMs: number;
  readonly delayMs: number;
  readonly missedBoundaryCount: number;
  readonly nextScheduledAtMs: number;
}

export function observeTelemetryBoundary(
  nextScheduledAtMs: number,
  observedAtMs: number,
  intervalMs: number,
): TelemetryBoundaryObservation | null {
  if (
    !Number.isFinite(nextScheduledAtMs)
    || !Number.isFinite(observedAtMs)
    || !Number.isFinite(intervalMs)
    || nextScheduledAtMs < 0
    || observedAtMs < 0
    || intervalMs <= 0
  ) {
    throw new RangeError('Telemetry boundary values must be finite and non-negative with a positive interval');
  }
  if (observedAtMs < nextScheduledAtMs) return null;
  const crossedBoundaryCount = Math.floor(
    (observedAtMs - nextScheduledAtMs) / intervalMs,
  ) + 1;
  return {
    scheduledAtMs: nextScheduledAtMs,
    observedAtMs,
    delayMs: observedAtMs - nextScheduledAtMs,
    missedBoundaryCount: crossedBoundaryCount - 1,
    nextScheduledAtMs: nextScheduledAtMs + crossedBoundaryCount * intervalMs,
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('Median requires at least one value');
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Median values must be finite');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

export function medianPerformanceRun(runs: readonly PerformanceRun[]): PerformanceRun {
  if (runs.length !== 3) {
    throw new RangeError('Exactly three performance runs are required');
  }
  if (runs.some(({ medianFps, maxLowStreakSeconds }) => (
    !Number.isFinite(medianFps)
    || !Number.isFinite(maxLowStreakSeconds)
    || medianFps < 0
    || maxLowStreakSeconds < 0
  ))) {
    throw new RangeError('Performance run values must be finite and non-negative');
  }
  return {
    medianFps: median(runs.map(({ medianFps }) => medianFps)),
    maxLowStreakSeconds: Math.max(...runs.map(({ maxLowStreakSeconds }) => maxLowStreakSeconds)),
  };
}

export function passesPerformanceBudget(run: PerformanceRun): boolean {
  return Number.isFinite(run.medianFps)
    && Number.isFinite(run.maxLowStreakSeconds)
    && run.medianFps >= 55
    && run.maxLowStreakSeconds >= 0
    && run.maxLowStreakSeconds < 3;
}

export function analyzePerformanceWindow(
  samples: readonly FrameSample[],
): PerformanceWindowStats {
  if (samples.length === 0) {
    throw new RangeError('Performance analysis requires at least one frame sample');
  }
  if (samples.some(({ offsetMs, deltaMs }) => (
    !Number.isFinite(offsetMs)
    || !Number.isFinite(deltaMs)
    || offsetMs < 0
    || deltaMs < 0
  ))) {
    throw new RangeError('Frame samples must contain finite non-negative values');
  }
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    if (index > 0 && sample.offsetMs <= samples[index - 1]!.offsetMs) {
      throw new RangeError('Frame sample offsets must be strictly increasing');
    }
    const isAllowedZeroSentinel = index === 0 && sample.offsetMs === 0 && sample.deltaMs === 0;
    if ((sample.offsetMs === 0 || sample.deltaMs === 0) && !isAllowedZeroSentinel) {
      throw new RangeError('Only the first frame sample may have a zero offset and delta');
    }
  }
  const sampledMs = samples.at(-1)?.offsetMs ?? 0;
  const evaluatedBucketCount = PERFORMANCE_WINDOW_MS / 1000;
  const windowSamples = samples.filter(({ offsetMs }) => (
    offsetMs >= 0 && offsetMs <= PERFORMANCE_WINDOW_MS
  ));
  if (windowSamples.length === 0) {
    throw new RangeError('Performance analysis requires a sample inside the 30-second window');
  }
  const oneSecondBuckets = Array.from({ length: evaluatedBucketCount }, () => 0);
  for (const { offsetMs } of windowSamples) {
    const index = offsetMs === 0
      ? 0
      : Math.min(evaluatedBucketCount - 1, Math.ceil(offsetMs / 1000) - 1);
    oneSecondBuckets[index] = (oneSecondBuckets[index] ?? 0) + 1;
  }
  let lowStreakMs = 0;
  let maxLowStreakMs = 0;
  for (const { offsetMs, deltaMs } of samples) {
    const intervalStartMs = offsetMs - deltaMs;
    const overlapMs = Math.max(
      0,
      Math.min(offsetMs, PERFORMANCE_WINDOW_MS) - Math.max(intervalStartMs, 0),
    );
    lowStreakMs = deltaMs > 20 && overlapMs > 0 ? lowStreakMs + overlapMs : 0;
    maxLowStreakMs = Math.max(maxLowStreakMs, lowStreakMs);
  }
  return {
    averageFps: windowSamples.length * 1000 / PERFORMANCE_WINDOW_MS,
    medianFps: median(oneSecondBuckets),
    maxLowStreakSeconds: Number((maxLowStreakMs / 1_000).toFixed(12)),
    frameCount: windowSamples.length,
    sampledMs,
    evaluatedBucketCount,
    oneSecondBuckets,
    longestFrameMs: Math.max(...windowSamples.map(({ deltaMs }) => deltaMs)),
    framesOver50Ms: windowSamples.filter(({ deltaMs }) => deltaMs > 50).length,
  };
}
