import {
  analyzePerformanceWindow,
  median,
  medianPerformanceRun,
  observeTelemetryBoundary,
  passesPerformanceBudget,
} from '../performance/PerformanceWindow';

describe('performance run aggregation', () => {
  it('computes deterministic odd and even medians and rejects an empty input', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([9, 1, 5, 3])).toBe(4);
    expect(() => median([])).toThrow(new RangeError('Median requires at least one value'));
    expect(() => median([60, Number.NaN])).toThrow(
      new RangeError('Median values must be finite'),
    );
    expect(() => median([60, Number.POSITIVE_INFINITY])).toThrow(
      new RangeError('Median values must be finite'),
    );
  });

  it('rejects non-finite or negative run statistics', () => {
    expect(() => medianPerformanceRun([
      { medianFps: Number.NaN, maxLowStreakSeconds: 0 },
      { medianFps: 60, maxLowStreakSeconds: 0 },
      { medianFps: 60, maxLowStreakSeconds: 0 },
    ])).toThrow(new RangeError('Performance run values must be finite and non-negative'));
    expect(() => medianPerformanceRun([
      { medianFps: 60, maxLowStreakSeconds: -1 },
      { medianFps: 60, maxLowStreakSeconds: 0 },
      { medianFps: 60, maxLowStreakSeconds: 0 },
    ])).toThrow(new RangeError('Performance run values must be finite and non-negative'));
  });

  it('requires exactly three runs, takes the FPS median, and preserves the worst low streak', () => {
    expect(medianPerformanceRun([
      { medianFps: 54, maxLowStreakSeconds: 1.5 },
      { medianFps: 58, maxLowStreakSeconds: 2.9 },
      { medianFps: 56, maxLowStreakSeconds: 2.2 },
    ])).toEqual({ medianFps: 56, maxLowStreakSeconds: 2.9 });

    expect(() => medianPerformanceRun([])).toThrow(
      new RangeError('Exactly three performance runs are required'),
    );
    expect(() => medianPerformanceRun([
      { medianFps: 60, maxLowStreakSeconds: 0 },
      { medianFps: 60, maxLowStreakSeconds: 0 },
    ])).toThrow(new RangeError('Exactly three performance runs are required'));
  });

  it('accepts the 55 FPS boundary but requires the low streak to be strictly below three seconds', () => {
    expect(passesPerformanceBudget({ medianFps: 55, maxLowStreakSeconds: 2.999 })).toBe(true);
    expect(passesPerformanceBudget({ medianFps: 55, maxLowStreakSeconds: 3 })).toBe(false);
    expect(passesPerformanceBudget({ medianFps: 54.999, maxLowStreakSeconds: 0 })).toBe(false);
    expect(passesPerformanceBudget({ medianFps: 60, maxLowStreakSeconds: -1 })).toBe(false);
    expect(passesPerformanceBudget({ medianFps: Number.POSITIVE_INFINITY, maxLowStreakSeconds: 0 })).toBe(false);
  });
});

describe('telemetry boundary observation', () => {
  it('waits before a boundary and records the scheduled and actual observation times', () => {
    expect(observeTelemetryBoundary(1_000, 999, 1_000)).toBeNull();
    expect(observeTelemetryBoundary(1_000, 1_016, 1_000)).toEqual({
      scheduledAtMs: 1_000,
      observedAtMs: 1_016,
      delayMs: 16,
      missedBoundaryCount: 0,
      nextScheduledAtMs: 2_000,
    });
  });

  it('flags skipped boundaries once without synthesizing duplicate observations', () => {
    expect(observeTelemetryBoundary(1_000, 2_250, 1_000)).toEqual({
      scheduledAtMs: 1_000,
      observedAtMs: 2_250,
      delayMs: 1_250,
      missedBoundaryCount: 1,
      nextScheduledAtMs: 3_000,
    });
  });
});

it('assigns exact window edges deterministically and excludes samples after 30 seconds', () => {
  const stats = analyzePerformanceWindow([
    { offsetMs: 0, deltaMs: 0 },
    { offsetMs: 1_000, deltaMs: 10 },
    { offsetMs: 1_000.001, deltaMs: 10 },
    { offsetMs: 30_000, deltaMs: 10 },
    { offsetMs: 30_000.001, deltaMs: 10 },
  ]);

  expect(stats.frameCount).toBe(4);
  expect(stats.oneSecondBuckets[0]).toBe(2);
  expect(stats.oneSecondBuckets[1]).toBe(1);
  expect(stats.oneSecondBuckets[29]).toBe(1);
});

it('treats exactly 50 FPS as a boundary that breaks an under-50 streak', () => {
  const samples = Array.from({ length: 30 }, (_, second) => {
    const fps = second === 0 || second === 2 ? 49 : 50;
    return Array.from({ length: fps }, (_, frame) => ({
      offsetMs: second * 1_000 + (frame + 1) * 999 / fps,
      deltaMs: 1_000 / fps,
    }));
  }).flat();

  const stats = analyzePerformanceWindow(samples);

  expect(stats.oneSecondBuckets.slice(0, 3)).toEqual([49, 50, 49]);
  expect(stats.maxLowStreakSeconds).toBe(1);
});

it('rejects empty, non-finite, and negative frame samples', () => {
  expect(() => analyzePerformanceWindow([])).toThrow(
    new RangeError('Performance analysis requires at least one frame sample'),
  );
  expect(() => analyzePerformanceWindow([{ offsetMs: Number.NaN, deltaMs: 16 }])).toThrow(
    new RangeError('Frame samples must contain finite non-negative values'),
  );
  expect(() => analyzePerformanceWindow([{ offsetMs: 16, deltaMs: -1 }])).toThrow(
    new RangeError('Frame samples must contain finite non-negative values'),
  );
  expect(() => analyzePerformanceWindow([{ offsetMs: 30_000.001, deltaMs: 16 }])).toThrow(
    new RangeError('Performance analysis requires a sample inside the 30-second window'),
  );
});

it('requires strictly increasing offsets', () => {
  expect(() => analyzePerformanceWindow([
    { offsetMs: 16, deltaMs: 16 },
    { offsetMs: 16, deltaMs: 16 },
  ])).toThrow(new RangeError('Frame sample offsets must be strictly increasing'));
  expect(() => analyzePerformanceWindow([
    { offsetMs: 16, deltaMs: 16 },
    { offsetMs: 15, deltaMs: 16 },
  ])).toThrow(new RangeError('Frame sample offsets must be strictly increasing'));
});

it('only permits a zero delta for the first sample at offset zero', () => {
  expect(() => analyzePerformanceWindow([{ offsetMs: 0, deltaMs: 0 }])).not.toThrow();
  expect(() => analyzePerformanceWindow([{ offsetMs: 0, deltaMs: 16 }])).toThrow(
    new RangeError('Only the first frame sample may have a zero offset and delta'),
  );
  expect(() => analyzePerformanceWindow([{ offsetMs: 1, deltaMs: 0 }])).toThrow(
    new RangeError('Only the first frame sample may have a zero offset and delta'),
  );
  expect(() => analyzePerformanceWindow([
    { offsetMs: 0, deltaMs: 0 },
    { offsetMs: 16, deltaMs: 0 },
  ])).toThrow(new RangeError('Only the first frame sample may have a zero offset and delta'));
});

it('29,998ms 샘플도 30개 full bucket과 마지막 4초 저하 streak를 평가한다', () => {
  const samples = Array.from({ length: 30 }, (_, second) => {
    const fps = second >= 26 ? 49 : 60;
    return Array.from({ length: fps }, (_, frame) => ({
      offsetMs: second * 1000 + (frame + 1) * 998 / fps,
      deltaMs: 1000 / fps,
    }));
  }).flat();

  const stats = analyzePerformanceWindow(samples);

  expect(stats.sampledMs).toBe(29_998);
  expect(stats.evaluatedBucketCount).toBe(30);
  expect(stats.oneSecondBuckets.slice(26)).toEqual([49, 49, 49, 49]);
  expect(stats.medianFps).toBe(60);
  expect(stats.maxLowStreakSeconds).toBe(4);
});

it('counts an exact three-bucket under-50 streak instead of smoothing it into the median', () => {
  const samples = Array.from({ length: 30 }, (_, second) => {
    const fps = second >= 12 && second <= 14 ? 49 : 60;
    return Array.from({ length: fps }, (_, frame) => ({
      offsetMs: second * 1000 + (frame + 1) * 999 / fps,
      deltaMs: 1000 / fps,
    }));
  }).flat();

  const stats = analyzePerformanceWindow(samples);

  expect(stats.oneSecondBuckets.slice(12, 15)).toEqual([49, 49, 49]);
  expect(stats.medianFps).toBe(60);
  expect(stats.maxLowStreakSeconds).toBe(3);
  expect(passesPerformanceBudget(stats)).toBe(false);
});

it('counts a 0.5s-3.5s 49fps sequence as an exact three-second low streak', () => {
  const samples = [
    ...constantFpsSamples(0, 500, 60),
    ...constantFpsSamples(500, 3_000, 49),
    ...constantFpsSamples(3_500, 26_500, 60),
  ];

  const stats = analyzePerformanceWindow(samples);

  expect(stats.oneSecondBuckets.slice(0, 4)).toEqual([54, 49, 49, 55]);
  expect(stats.medianFps).toBe(60);
  expect(stats.maxLowStreakSeconds).toBeCloseTo(3, 10);
  expect(passesPerformanceBudget(stats)).toBe(false);
});

it('counts the in-window part of a slow frame that ends after 30 seconds', () => {
  const slowFrames = Array.from({ length: 29 }, (_, frame) => ({
    offsetMs: 27_000 + (frame + 1) * 100,
    deltaMs: 100,
  }));
  const samples = [
    ...constantFpsSamples(0, 26_000, 60),
    ...constantFpsSamples(26_000, 1_000, 50),
    ...slowFrames,
    { offsetMs: 30_050, deltaMs: 150 },
  ];

  const stats = analyzePerformanceWindow(samples);

  expect(stats.medianFps).toBe(60);
  expect(stats.maxLowStreakSeconds).toBe(3);
  expect(passesPerformanceBudget(stats)).toBe(false);
});

function constantFpsSamples(
  startMs: number,
  durationMs: number,
  fps: number,
): Array<{ readonly offsetMs: number; readonly deltaMs: number }> {
  const frameCount = durationMs * fps / 1_000;
  if (!Number.isSafeInteger(frameCount)) throw new RangeError('Test segment must contain whole frames');
  const deltaMs = 1_000 / fps;
  return Array.from({ length: frameCount }, (_, frame) => ({
    offsetMs: startMs + (frame + 1) * deltaMs,
    deltaMs,
  }));
}
