import { expect, test } from '@playwright/test';
import { openScenario, snapshot } from '../e2e/helpers';
import {
  analyzePerformanceWindow,
  PERFORMANCE_WINDOW_MS,
} from './PerformanceWindow';

test.setTimeout(60_000);

test('@perf stress 장면은 평균 55fps와 저하 지속 기준을 지킨다', async ({ page }, testInfo) => {
  await openScenario(page, 'stress');
  const expectedActive = {
    enemies: { active: 60 },
    projectiles: { active: 80 },
    effects: { active: 120 },
  };
  const startedSnapshot = await snapshot(page);
  const startedPools = startedSnapshot.pools;
  expect(startedPools).toMatchObject(expectedActive);
  const stressImpacts = (startedSnapshot as unknown as {
    combatEffectImpacts: readonly { x: number; y: number; frame: number }[];
  }).combatEffectImpacts;
  expect(stressImpacts).toHaveLength(120);
  expect(stressImpacts.every(({ x, y }) => x >= 0 && x <= 540 && y >= 0 && y <= 960)).toBe(true);
  expect(new Set(stressImpacts.map(({ frame }) => frame)).size).toBeGreaterThan(1);
  const samples = await page.evaluate(async (windowMs) => {
    const measured: Array<{ offsetMs: number; deltaMs: number }> = [];
    const started = performance.now();
    let previous = started;
    while ((measured.at(-1)?.offsetMs ?? 0) < windowMs) {
      await new Promise<void>((resolve) => requestAnimationFrame((now) => {
        const frameDeltaMs = Math.max(0, now - previous);
        measured.push({
          offsetMs: Math.max(0, now - started),
          deltaMs: frameDeltaMs,
        });
        window.__HUCHU_TEST__!.advanceWithoutFlush(frameDeltaMs);
        previous = now;
        resolve();
      }));
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return measured;
  }, PERFORMANCE_WINDOW_MS);
  const stats = analyzePerformanceWindow(samples);
  await testInfo.attach('fps.json', {
    body: JSON.stringify(stats, null, 2),
    contentType: 'application/json',
  });
  console.log(`${testInfo.project.name} FPS ${JSON.stringify(stats)}`);
  expect((await snapshot(page)).pools).toEqual(startedPools);
  expect(stats.sampledMs).toBeGreaterThanOrEqual(PERFORMANCE_WINDOW_MS);
  expect(stats.evaluatedBucketCount).toBe(30);
  expect(stats.averageFps).toBeGreaterThanOrEqual(55);
  expect(stats.maxLowStreakSeconds).toBeLessThanOrEqual(3);
});
