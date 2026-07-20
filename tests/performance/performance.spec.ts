import { expect, test } from '@playwright/test';
import { openScenario, snapshot } from '../e2e/helpers';

test.setTimeout(60_000);

test('@perf stress 장면은 평균 55fps와 저하 지속 기준을 지킨다', async ({ page }, testInfo) => {
  await openScenario(page, 'stress');
  const expectedActive = {
    enemies: { active: 60 },
    projectiles: { active: 80 },
    effects: { active: 120 },
  };
  expect((await snapshot(page)).pools).toMatchObject(expectedActive);
  const stats = await page.evaluate(async () => {
    const frameTimes: number[] = [];
    const frameOffsets: number[] = [];
    const started = performance.now();
    let previous = started;
    while (performance.now() - started < 30_000) {
      await new Promise<void>((resolve) => requestAnimationFrame((now) => {
        const frameDeltaMs = Math.max(0, now - previous);
        frameTimes.push(frameDeltaMs);
        frameOffsets.push(Math.max(0, now - started));
        window.__HUCHU_TEST__!.advanceWithoutFlush(frameDeltaMs);
        previous = now;
        resolve();
      }));
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const sampledMs = frameOffsets.at(-1) ?? 0;
    const averageFps = frameTimes.length * 1000 / sampledMs;
    const fullBucketCount = Math.floor(sampledMs / 1000);
    const oneSecondBuckets = Array.from({ length: fullBucketCount }, () => 0);
    for (const offset of frameOffsets) {
      const index = Math.floor(offset / 1000);
      if (index < oneSecondBuckets.length) {
        oneSecondBuckets[index] = (oneSecondBuckets[index] ?? 0) + 1;
      }
    }
    let lowStreak = 0;
    let maxLowStreak = 0;
    for (const fps of oneSecondBuckets) {
      lowStreak = fps < 50 ? lowStreak + 1 : 0;
      maxLowStreak = Math.max(maxLowStreak, lowStreak);
    }
    return {
      averageFps,
      maxLowStreakSeconds: maxLowStreak,
      frameCount: frameTimes.length,
      sampledMs,
      oneSecondBuckets,
      longestFrameMs: Math.max(...frameTimes),
      framesOver50Ms: frameTimes.filter((frame) => frame > 50).length,
    };
  });
  await testInfo.attach('fps.json', {
    body: JSON.stringify(stats, null, 2),
    contentType: 'application/json',
  });
  console.log(`${testInfo.project.name} FPS ${JSON.stringify(stats)}`);
  expect((await snapshot(page)).pools).toMatchObject(expectedActive);
  expect(stats.averageFps).toBeGreaterThanOrEqual(55);
  expect(stats.maxLowStreakSeconds).toBeLessThanOrEqual(3);
});
