import { execFileSync } from 'node:child_process';
import { expect, type Page, test } from '@playwright/test';
import type { AudioSnapshot } from '../../src/game/audio/AudioTypes';
import { FIXED_STEP_MS } from '../../src/game/constants';
import type { GameDebugSnapshot } from '../../src/game/debug/TestContract';
import type { PoolSnapshot } from '../../src/game/pooling/ObjectPool';
import { loadScenario, openScenario, snapshot } from '../e2e/helpers';
import {
  capturePerformanceEnvironment,
  type PerformanceEnvironment,
  type PerformancePowerState,
} from './PerformanceEnvironment';
import {
  analyzePerformanceWindow,
  medianPerformanceRun,
  observeTelemetryBoundary,
  passesPerformanceBudget,
  PERFORMANCE_WINDOW_MS,
  type FrameSample,
  type PerformanceWindowStats,
} from './PerformanceWindow';

const RUN_COUNT = 3;
const CPU_THROTTLING_RATE = 4;
const TELEMETRY_INTERVAL_MS = 1_000;
const MAX_TELEMETRY_OBSERVATION_DELAY_MS = 50;
const PERF_TIMEOUT_MS = 220_000;
const EXPECTED_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const EXPECTED_DEVICE_SCALE_FACTOR = 2;

type PoolName = keyof GameDebugSnapshot['pools'];
type PoolIdentity = Readonly<Record<PoolName, Readonly<{
  instanceId: number;
  created: number;
}>>>;

interface PerformanceTelemetrySample {
  readonly scheduledAtMs: number;
  readonly observedAtMs: number;
  readonly simulationMs: number;
  readonly pools: GameDebugSnapshot['pools'];
  readonly audio: AudioSnapshot;
  readonly audioStress: GameDebugSnapshot['audioStress'];
  readonly presentationStress: GameDebugSnapshot['presentationStress'];
  readonly renderedVisibleEnemyLabels: number;
  readonly listenerCount: number;
}

interface PresentationPoolIdentity {
  readonly effects: number;
  readonly projectileLogic: number;
  readonly projectileView: number;
  readonly damageNumbers: number;
}

interface BrowserMeasurement {
  readonly samples: readonly FrameSample[];
  readonly telemetry: readonly PerformanceTelemetrySample[];
  readonly missedTelemetryBoundaryCount: number;
  readonly maxTelemetryObservationDelayMs: number;
}

interface MobileRuntimeSnapshot {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly devicePixelRatio: number;
  readonly maxTouchPoints: number;
}

interface MutableRunEvidence {
  readonly run: number;
  started: PerformanceTelemetrySample | null;
  measurement: BrowserMeasurement | null;
  ended: PerformanceTelemetrySample | null;
  stats: PerformanceWindowStats | null;
  error: string | null;
}

interface CompletedRunEvidence extends MutableRunEvidence {
  started: PerformanceTelemetrySample;
  measurement: BrowserMeasurement;
  ended: PerformanceTelemetrySample;
  stats: PerformanceWindowStats;
  error: null;
}

const EXPECTED_ACTIVE: Readonly<Record<PoolName, number>> = {
  enemies: 60,
  labels: 60,
  projectiles: 80,
  effects: 120,
  damageNumbers: 64,
};

test.setTimeout(PERF_TIMEOUT_MS);

test('@perf V2 stress budget', async ({ page, browser }, testInfo) => {
  expect(testInfo.project.name).toBe('mobile-chromium');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLING_RATE });
  await openScenario(page, 'empty-run');

  const mobileRuntime = await readMobileRuntime(page);
  const mobileProfile = {
    configured: {
      viewport: testInfo.project.use.viewport,
      deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
      hasTouch: testInfo.project.use.hasTouch,
      isMobile: testInfo.project.use.isMobile,
    },
    runtime: mobileRuntime,
  };
  await testInfo.attach('mobile-runtime.json', {
    body: JSON.stringify(mobileProfile, null, 2),
    contentType: 'application/json',
  });
  expect(testInfo.project.use.viewport).toEqual(EXPECTED_MOBILE_VIEWPORT);
  expect(testInfo.project.use.deviceScaleFactor).toBe(EXPECTED_DEVICE_SCALE_FACTOR);
  expect(testInfo.project.use.hasTouch).toBe(true);
  expect(testInfo.project.use.isMobile).toBe(true);
  expect(mobileRuntime.innerWidth).toBe(EXPECTED_MOBILE_VIEWPORT.width);
  expect(mobileRuntime.innerHeight).toBe(EXPECTED_MOBILE_VIEWPORT.height);
  expect(mobileRuntime.devicePixelRatio).toBe(EXPECTED_DEVICE_SCALE_FACTOR);
  expect(mobileRuntime.maxTouchPoints).toBeGreaterThan(0);

  const workspaceRoot = process.cwd();
  const requireClean = process.env.PERF_REQUIRE_CLEAN === '1';
  const expectedHead = process.env.PERF_EXPECTED_HEAD;
  const environmentBefore = capturePerformanceEnvironment({
    workspaceRoot,
    browserVersion: browser.version(),
    powerState: await readPowerState(page),
  });
  await testInfo.attach('environment-before.json', {
    body: JSON.stringify(environmentBefore, null, 2),
    contentType: 'application/json',
  });

  const runEvidence: MutableRunEvidence[] = [];
  let measurementError: unknown = null;
  let environmentAfter: PerformanceEnvironment | null = null;
  let environmentCaptureError: unknown = null;

  try {
    for (let runIndex = 0; runIndex < RUN_COUNT; runIndex += 1) {
      const evidence: MutableRunEvidence = {
        run: runIndex + 1,
        started: null,
        measurement: null,
        ended: null,
        stats: null,
        error: null,
      };
      runEvidence.push(evidence);
      try {
        await loadScenario(page, 'stress');
        const started = await snapshot(page);
        evidence.started = telemetryFromSnapshot(started, 0, 0);
        evidence.measurement = await measurePerformanceRun(page, PERFORMANCE_WINDOW_MS);
        const ended = await snapshot(page);
        evidence.stats = analyzePerformanceWindow(evidence.measurement.samples);
        evidence.ended = telemetryFromSnapshot(
          ended,
          PERFORMANCE_WINDOW_MS,
          evidence.stats.sampledMs,
        );
      } catch (error) {
        evidence.error = serializeError(error);
        throw error;
      }
    }
  } catch (error) {
    measurementError = error;
  } finally {
    try {
      environmentAfter = capturePerformanceEnvironment({
        workspaceRoot,
        browserVersion: browser.version(),
        powerState: await readPowerState(page),
      });
    } catch (error) {
      environmentCaptureError = error;
    }
    const aggregate = previewAggregate(runEvidence);
    console.log(`${testInfo.project.name} performance precheck ${JSON.stringify({
      aggregate,
      runs: runEvidence.map(({ run, measurement, stats, error }) => ({
        run,
        stats,
        maxTelemetryObservationDelayMs: measurement?.maxTelemetryObservationDelayMs ?? null,
        missedTelemetryBoundaryCount: measurement?.missedTelemetryBoundaryCount ?? null,
        error,
      })),
    })}`);
    await testInfo.attach('environment.json', {
      body: JSON.stringify({
        cpuThrottlingRate: CPU_THROTTLING_RATE,
        mobileProfile,
        maxTelemetryObservationDelayMs: MAX_TELEMETRY_OBSERVATION_DELAY_MS,
        repositoryContract: { requireClean, expectedHead: expectedHead ?? null },
        before: environmentBefore,
        after: environmentAfter,
        captureError: environmentCaptureError === null
          ? null
          : serializeError(environmentCaptureError),
      }, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('fps-runs.json', {
      body: JSON.stringify({ aggregate, runs: runEvidence }, null, 2),
      contentType: 'application/json',
    });
  }

  if (measurementError !== null) throw measurementError;
  if (environmentCaptureError !== null) throw environmentCaptureError;
  if (environmentAfter === null) throw new Error('Missing performance environment after measurement');

  const completedRuns = runEvidence.map(requireCompletedRun);
  const baselinePools = poolIdentity(completedRuns[0]!.started.pools);
  const baselinePresentationPools = presentationPoolIdentity(completedRuns[0]!.started);
  const baselineListenerCount = completedRuns[0]!.started.listenerCount;
  const generations: number[] = [];
  const presentationGenerations: number[] = [];

  for (const evidence of completedRuns) {
    const { started, measurement, ended, stats } = evidence;
    assertStressTelemetry(started);
    expect(poolIdentity(started.pools)).toEqual(baselinePools);
    expect(started.listenerCount).toBe(baselineListenerCount);
    const generation = started.audioStress!.generation;
    const presentationGeneration = started.presentationStress!.generation;
    expect(generation).toBeGreaterThan(0);
    expect(presentationGeneration).toBeGreaterThan(0);
    generations.push(generation);
    presentationGenerations.push(presentationGeneration);
    expect(presentationPoolIdentity(started)).toEqual(baselinePresentationPools);

    expect(measurement.telemetry).toHaveLength(
      PERFORMANCE_WINDOW_MS / TELEMETRY_INTERVAL_MS + 1,
    );
    expect(measurement.missedTelemetryBoundaryCount).toBe(0);
    expect(measurement.maxTelemetryObservationDelayMs)
      .toBeLessThanOrEqual(MAX_TELEMETRY_OBSERVATION_DELAY_MS);
    expect(measurement.maxTelemetryObservationDelayMs).toBe(Math.max(
      ...measurement.telemetry.map(({ scheduledAtMs, observedAtMs }) => (
        observedAtMs - scheduledAtMs
      )),
    ));
    assertTelemetrySchedule(measurement.telemetry);
    for (const sample of measurement.telemetry) {
      assertStressTelemetry(sample);
      expect(poolIdentity(sample.pools)).toEqual(baselinePools);
      expect(sample.listenerCount).toBe(baselineListenerCount);
      expect(sample.audioStress!.generation).toBe(generation);
      expect(sample.presentationStress!.generation).toBe(presentationGeneration);
      expect(presentationPoolIdentity(sample)).toEqual(baselinePresentationPools);
    }
    assertPresentationProgress([started, ...measurement.telemetry, ended]);

    assertStressTelemetry(ended);
    expect(poolIdentity(ended.pools)).toEqual(baselinePools);
    expect(ended.listenerCount).toBe(baselineListenerCount);
    expect(ended.audioStress).toEqual({
      generation,
      peakSfxVoices: 12,
      peakBgmVoices: 6,
      peakTotalVoices: 18,
    });
    expect(ended.presentationStress!.generation).toBe(presentationGeneration);
    expect(presentationPoolIdentity(ended)).toEqual(baselinePresentationPools);
    expect(ended.presentationStress!.effects.refillAccepted)
      .toBeGreaterThan(started.presentationStress!.effects.refillAccepted);
    const afterEffectLifetime = measurement.telemetry.find(({ simulationMs }) => (
      simulationMs >= 120
    ));
    expect(afterEffectLifetime).toBeDefined();
    expect(afterEffectLifetime!.presentationStress!.effects.refillAccepted).toBeGreaterThan(0);
    expect(stats.sampledMs).toBeGreaterThanOrEqual(PERFORMANCE_WINDOW_MS);
    expect(stats.evaluatedBucketCount).toBe(30);
  }

  expect(new Set(generations).size).toBe(RUN_COUNT);
  expect(new Set(presentationGenerations).size).toBe(RUN_COUNT);
  const aggregate = medianPerformanceRun(completedRuns.map(({ stats }) => stats));
  const fpsEvidence = { aggregate, runs: completedRuns };
  const environment = {
    cpuThrottlingRate: CPU_THROTTLING_RATE,
    mobileProfile,
    maxTelemetryObservationDelayMs: MAX_TELEMETRY_OBSERVATION_DELAY_MS,
    repositoryContract: { requireClean, expectedHead: expectedHead ?? null },
    before: environmentBefore,
    after: environmentAfter,
  };
  console.log(`${testInfo.project.name} performance ${JSON.stringify({
    aggregate,
    runs: completedRuns.map(({ run, started, stats }) => ({
      run,
      generation: started.audioStress!.generation,
      stats,
    })),
    environment,
  })}`);

  expect(environmentAfter.headCommit).toBe(environmentBefore.headCommit);
  expect(environmentAfter.workspaceTreeSha256).toBe(environmentBefore.workspaceTreeSha256);
  const currentHead = requireClean || expectedHead !== undefined
    ? execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim()
    : null;
  if (requireClean) {
    expect(environmentBefore.workingTreeDirty).toBe(false);
    expect(environmentAfter.workingTreeDirty).toBe(false);
    expect(environmentBefore.headCommit).toBe(currentHead);
    expect(environmentAfter.headCommit).toBe(currentHead);
  }
  if (expectedHead !== undefined) {
    expect(expectedHead, 'PERF_EXPECTED_HEAD must not be empty').not.toBe('');
    expect(environmentBefore.headCommit).toBe(expectedHead);
    expect(environmentAfter.headCommit).toBe(expectedHead);
    expect(currentHead).toBe(expectedHead);
  }
  expect(passesPerformanceBudget(aggregate), JSON.stringify(fpsEvidence, null, 2)).toBe(true);
});

async function measurePerformanceRun(page: Page, windowMs: number): Promise<BrowserMeasurement> {
  return page.evaluate(async ({ durationMs, telemetryIntervalMs }) => {
    const bridge = window.__HUCHU_TEST__!;
    const samples: FrameSample[] = [];
    const telemetry: PerformanceTelemetrySample[] = [];
    const started = performance.now();
    let previous = started;
    let nextTelemetryMs = 0;
    let missedTelemetryBoundaryCount = 0;
    let maxTelemetryObservationDelayMs = 0;
    const capture = (scheduledAtMs: number, observedAtMs: number): void => {
      const state = bridge.snapshot();
      telemetry.push({
        scheduledAtMs,
        observedAtMs,
        simulationMs: state.run.simulationMs,
        pools: state.pools,
        audio: state.audio,
        audioStress: state.audioStress,
        presentationStress: state.presentationStress,
        renderedVisibleEnemyLabels: state.renderedVisibleEnemyLabels,
        listenerCount: state.listenerCount,
      });
      maxTelemetryObservationDelayMs = Math.max(
        maxTelemetryObservationDelayMs,
        observedAtMs - scheduledAtMs,
      );
    };
    capture(nextTelemetryMs, 0);
    nextTelemetryMs += telemetryIntervalMs;

    while ((samples.at(-1)?.offsetMs ?? 0) < durationMs) {
      await new Promise<void>((resolve) => requestAnimationFrame((now) => {
        const deltaMs = Math.max(0, now - previous);
        const offsetMs = Math.max(0, now - started);
        samples.push({ offsetMs, deltaMs });
        bridge.advanceWithoutFlush(deltaMs);
        if (nextTelemetryMs <= durationMs && offsetMs >= nextTelemetryMs) {
          const crossedBoundaryCount = Math.floor(
            (offsetMs - nextTelemetryMs) / telemetryIntervalMs,
          ) + 1;
          capture(nextTelemetryMs, offsetMs);
          missedTelemetryBoundaryCount += crossedBoundaryCount - 1;
          nextTelemetryMs += crossedBoundaryCount * telemetryIntervalMs;
        }
        previous = now;
        resolve();
      }));
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      samples,
      telemetry,
      missedTelemetryBoundaryCount,
      maxTelemetryObservationDelayMs,
    };
  }, { durationMs: windowMs, telemetryIntervalMs: TELEMETRY_INTERVAL_MS });
}

async function readMobileRuntime(page: Page): Promise<MobileRuntimeSnapshot> {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
}

async function readPowerState(page: Page): Promise<PerformancePowerState> {
  return page.evaluate(async () => {
    const batteryNavigator = navigator as Navigator & {
      getBattery?: () => Promise<{ charging: boolean; level: number }>;
    };
    if (batteryNavigator.getBattery === undefined) return 'unavailable';
    try {
      const battery = await batteryNavigator.getBattery();
      return { charging: battery.charging, level: battery.level };
    } catch {
      return 'unavailable';
    }
  });
}

function telemetryFromSnapshot(
  state: GameDebugSnapshot,
  scheduledAtMs: number,
  observedAtMs: number,
): PerformanceTelemetrySample {
  return {
    scheduledAtMs,
    observedAtMs,
    simulationMs: state.run.simulationMs,
    pools: state.pools,
    audio: state.audio,
    audioStress: state.audioStress,
    presentationStress: state.presentationStress,
    renderedVisibleEnemyLabels: state.renderedVisibleEnemyLabels,
    listenerCount: state.listenerCount,
  };
}

function assertStressTelemetry(state: PerformanceTelemetrySample): void {
  for (const poolName of Object.keys(EXPECTED_ACTIVE) as PoolName[]) {
    const pool = state.pools[poolName];
    expect(pool.created).toBe(EXPECTED_ACTIVE[poolName]);
    expect(pool.active).toBe(EXPECTED_ACTIVE[poolName]);
    expect(pool.available).toBe(0);
    expect(pool.active + pool.available).toBe(pool.created);
  }
  expect(state.renderedVisibleEnemyLabels).toBe(60);
  expect(state.audio.sfxVoices).toBeLessThanOrEqual(12);
  expect(state.audio.bgmVoices).toBeLessThanOrEqual(6);
  expect(state.audio.totalVoices).toBeLessThanOrEqual(18);
  expect(state.audioStress).not.toBeNull();
  expect(state.audioStress!.generation).toBeGreaterThan(0);
  expect(state.audioStress!.peakSfxVoices).toBeLessThanOrEqual(12);
  expect(state.audioStress!.peakBgmVoices).toBeLessThanOrEqual(6);
  expect(state.audioStress!.peakTotalVoices).toBeLessThanOrEqual(18);
  assertPresentationStressTelemetry(state);
}

function assertPresentationStressTelemetry(state: PerformanceTelemetrySample): void {
  const stress = state.presentationStress;
  expect(stress).not.toBeNull();
  expect(stress!.generation).toBeGreaterThan(0);
  expect(stress!.armed).toBe(true);
  const fixedSteps = Math.round(state.simulationMs / FIXED_STEP_MS);
  expect(stress!.observedFixedSteps).toBe(fixedSteps);

  expect(stress!.effects).toMatchObject({
    topology: 'effects/blitter-120-bobs+lazy-graphics@1',
    poolInstanceId: state.pools.effects.instanceId,
    allocatedRoots: 1,
    allocatedChildren: 120,
    graphicsAllocated: 0,
    graphicsVisible: 0,
    active: 120,
    visible: 120,
    minActive: 120,
    minVisible: 120,
    stepPasses: fixedSteps,
    activeActorVisits: fixedSteps * 120,
    visibleDrawableVisits: fixedSteps * 120,
  });
  expect(stress!.projectiles).toMatchObject({
    topology: 'projectiles/image@2',
    viewPoolInstanceId: state.pools.projectiles.instanceId,
    allocatedRoots: 80,
    allocatedChildren: 0,
    active: 80,
    visible: 80,
    minActive: 80,
    minVisible: 80,
    logicalStepPasses: fixedSteps,
    logicalActorVisits: fixedSteps * 80,
    seedAccepted: 80,
    refillAccepted: 0,
  });
  expect(stress!.projectiles.logicalPoolInstanceId).toBeGreaterThan(0);
  expect(new Set(Object.values(presentationPoolIdentity(state))).size).toBe(4);
  expect(stress!.projectiles.visibleRootVisits)
    .toBe(stress!.projectiles.renderPasses * 80);
  expect(stress!.damageNumbers).toMatchObject({
    topology: 'damage/bitmap-text@1',
    poolInstanceId: state.pools.damageNumbers.instanceId,
    allocatedRoots: 64,
    allocatedChildren: 0,
    active: 64,
    visible: 64,
    minActive: 64,
    minVisible: 64,
    stepPasses: fixedSteps,
    activeActorVisits: fixedSteps * 64,
    visibleDrawableVisits: fixedSteps * 64,
  });
  expect(stress!.damageNumbers.refillCycles).toBeGreaterThanOrEqual(1);
  expect(stress!.damageNumbers.refillAccepted)
    .toBe(stress!.damageNumbers.refillCycles * 64);
}

function assertPresentationProgress(samples: readonly PerformanceTelemetrySample[]): void {
  expect(samples.at(-1)!.presentationStress!.projectiles.renderPasses).toBeGreaterThan(
    samples[0]!.presentationStress!.projectiles.renderPasses,
  );
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!.presentationStress!;
    const current = samples[index]!.presentationStress!;
    expect(current.observedFixedSteps).toBeGreaterThanOrEqual(previous.observedFixedSteps);
    expect(current.effects.refillAccepted).toBeGreaterThanOrEqual(previous.effects.refillAccepted);
    expect(current.damageNumbers.refillCycles).toBeGreaterThanOrEqual(
      previous.damageNumbers.refillCycles,
    );
    expect(current.projectiles.renderPasses).toBeGreaterThanOrEqual(
      previous.projectiles.renderPasses,
    );
    if (current.observedFixedSteps === previous.observedFixedSteps) continue;
    expect(current.effects.stateVersion).toBeGreaterThan(previous.effects.stateVersion);
    expect(current.projectiles.stateVersion).toBeGreaterThan(previous.projectiles.stateVersion);
    expect(current.damageNumbers.stateVersion).toBeGreaterThan(
      previous.damageNumbers.stateVersion,
    );
  }
}

function assertTelemetrySchedule(samples: readonly PerformanceTelemetrySample[]): void {
  expect(samples[0]).toMatchObject({ scheduledAtMs: 0, observedAtMs: 0 });
  let nextScheduledAtMs = TELEMETRY_INTERVAL_MS;
  for (const sample of samples.slice(1)) {
    const observation = observeTelemetryBoundary(
      nextScheduledAtMs,
      sample.observedAtMs,
      TELEMETRY_INTERVAL_MS,
    );
    expect(observation).not.toBeNull();
    expect(sample.scheduledAtMs).toBe(observation!.scheduledAtMs);
    expect(observation!.missedBoundaryCount).toBe(0);
    expect(observation!.delayMs).toBeLessThanOrEqual(MAX_TELEMETRY_OBSERVATION_DELAY_MS);
    nextScheduledAtMs = observation!.nextScheduledAtMs;
  }
}

function poolIdentity(pools: GameDebugSnapshot['pools']): PoolIdentity {
  return {
    enemies: pickPool(pools.enemies),
    labels: pickPool(pools.labels),
    projectiles: pickPool(pools.projectiles),
    effects: pickPool(pools.effects),
    damageNumbers: pickPool(pools.damageNumbers),
  };
}

function presentationPoolIdentity(state: PerformanceTelemetrySample): PresentationPoolIdentity {
  const stress = state.presentationStress;
  if (stress === null) throw new Error('Missing presentation stress telemetry');
  return {
    effects: stress.effects.poolInstanceId,
    projectileLogic: stress.projectiles.logicalPoolInstanceId,
    projectileView: stress.projectiles.viewPoolInstanceId,
    damageNumbers: stress.damageNumbers.poolInstanceId,
  };
}

function pickPool(pool: PoolSnapshot): PoolIdentity[PoolName] {
  return { instanceId: pool.instanceId, created: pool.created };
}

function previewAggregate(
  runs: readonly MutableRunEvidence[],
): ReturnType<typeof medianPerformanceRun> | null {
  if (runs.length !== RUN_COUNT || runs.some(({ stats }) => stats === null)) return null;
  try {
    return medianPerformanceRun(runs.map(({ stats }) => stats!));
  } catch {
    return null;
  }
}

function requireCompletedRun(evidence: MutableRunEvidence): CompletedRunEvidence {
  if (
    evidence.started === null
    || evidence.measurement === null
    || evidence.ended === null
    || evidence.stats === null
    || evidence.error !== null
  ) {
    throw new Error(`Incomplete performance run evidence: ${JSON.stringify(evidence)}`);
  }
  return evidence as CompletedRunEvidence;
}

function serializeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
