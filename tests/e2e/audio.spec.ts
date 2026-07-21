import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('Title의 locked probe와 Game bridge는 같은 running singleton을 본다', async ({ page }) => {
  await page.goto('/?e2e=1&seed=424242&clock=manual');
  await page.waitForFunction(() => window.__HUCHU_AUDIO_TEST__ !== undefined);
  await page.evaluate(() => window.__HUCHU_AUDIO_TEST__!.ready);
  expect(await page.evaluate(() => window.__HUCHU_AUDIO_TEST__!.snapshot().state)).toBe('locked');
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await page.waitForFunction(() => window.__HUCHU_TEST__ !== undefined);
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  expect((await snapshot(page)).audio.state).toBe('running');
  await page.getByRole('button', { name: '음소거' }).click();
  expect((await snapshot(page)).audio.muted).toBe(true);
  expect(await page.evaluate(() => window.__HUCHU_AUDIO_TEST__!.snapshot().muted)).toBe(true);
});

test('Scene restart는 같은 audio singleton의 fractional phase와 live mute를 이어 쓴다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.setAcceleratedAudio(true));
  await advance(page, 333);
  const beforeRestart = await page.evaluate(() => {
    type RestartWitnessWindow = typeof window & {
      __OLD_HUCHU_TEST__?: NonNullable<typeof window.__HUCHU_TEST__>;
      __OLD_HUCHU_AUDIO_TEST__?: NonNullable<typeof window.__HUCHU_AUDIO_TEST__>;
    };
    const witnessed = window as RestartWitnessWindow;
    witnessed.__OLD_HUCHU_TEST__ = window.__HUCHU_TEST__!;
    witnessed.__OLD_HUCHU_AUDIO_TEST__ = window.__HUCHU_AUDIO_TEST__!;
    return {
      bridge: window.__HUCHU_TEST__!.snapshot().audio,
      titleProbe: window.__HUCHU_AUDIO_TEST__!.snapshot(),
    };
  });
  expect(beforeRestart.bridge.state).toBe('running');
  expect(beforeRestart.bridge.transportPhaseSteps).toBeGreaterThan(0);
  expect(Math.abs(
    beforeRestart.bridge.transportPhaseSteps
      - Math.round(beforeRestart.bridge.transportPhaseSteps),
  )).toBeGreaterThan(1e-6);
  expect(beforeRestart.titleProbe).toEqual(beforeRestart.bridge);

  await page.evaluate(() => window.__HUCHU_TEST__!.restartScene());
  await page.waitForFunction(() => {
    type RestartWitnessWindow = typeof window & {
      __OLD_HUCHU_TEST__?: NonNullable<typeof window.__HUCHU_TEST__>;
    };
    const oldBridge = (window as RestartWitnessWindow).__OLD_HUCHU_TEST__;
    return window.__HUCHU_TEST__ !== undefined && window.__HUCHU_TEST__ !== oldBridge;
  });
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);

  const afterRestart = await page.evaluate(() => {
    type RestartWitnessWindow = typeof window & {
      __OLD_HUCHU_TEST__?: NonNullable<typeof window.__HUCHU_TEST__>;
      __OLD_HUCHU_AUDIO_TEST__?: NonNullable<typeof window.__HUCHU_AUDIO_TEST__>;
    };
    const witnessed = window as RestartWitnessWindow;
    return {
      bridgeChanged: window.__HUCHU_TEST__ !== witnessed.__OLD_HUCHU_TEST__,
      titleProbeUnchanged: window.__HUCHU_AUDIO_TEST__ === witnessed.__OLD_HUCHU_AUDIO_TEST__,
      bridge: window.__HUCHU_TEST__!.snapshot().audio,
      retainedTitleProbe: witnessed.__OLD_HUCHU_AUDIO_TEST__!.snapshot(),
    };
  });
  expect(afterRestart.bridgeChanged).toBe(true);
  expect(afterRestart.titleProbeUnchanged).toBe(true);
  expect(afterRestart.bridge.state).toBe('running');
  expect(afterRestart.bridge.transportPhaseSteps).toBeCloseTo(
    beforeRestart.bridge.transportPhaseSteps,
    8,
  );
  expect(afterRestart.retainedTitleProbe).toEqual(afterRestart.bridge);

  await page.getByRole('button', { name: '음소거' }).click();
  const afterNewHudMute = await page.evaluate(() => {
    type RestartWitnessWindow = typeof window & {
      __OLD_HUCHU_AUDIO_TEST__?: NonNullable<typeof window.__HUCHU_AUDIO_TEST__>;
    };
    return {
      bridge: window.__HUCHU_TEST__!.snapshot(),
      retainedTitleProbe: (window as RestartWitnessWindow).__OLD_HUCHU_AUDIO_TEST__!.snapshot(),
    };
  });
  expect(afterNewHudMute.bridge.audio.muted).toBe(true);
  expect(afterNewHudMute.bridge.hud.muted).toBe(true);
  expect(afterNewHudMute.retainedTitleProbe.muted).toBe(true);
  expect(afterNewHudMute.retainedTitleProbe.transportPhaseSteps).toBeCloseTo(
    beforeRestart.bridge.transportPhaseSteps,
    8,
  );
  expect(await page.evaluate(() => localStorage.getItem('huchu-defense:muted'))).toBe('true');
  await expect(page.getByRole('button', { name: '소리 켜기' })).toHaveAttribute('aria-pressed', 'true');
});

test('visibility pause 중 Scene restart는 이전 lifecycle lease를 반환해 audio suspend를 남기지 않는다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await expect.poll(async () => (await snapshot(page)).audio.state).toBe('suspended');

  await page.evaluate(() => {
    type RestartWitnessWindow = typeof window & {
      __OLD_LIFECYCLE_BRIDGE__?: NonNullable<typeof window.__HUCHU_TEST__>;
    };
    (window as RestartWitnessWindow).__OLD_LIFECYCLE_BRIDGE__ = window.__HUCHU_TEST__!;
    window.__HUCHU_TEST__!.restartScene();
  });
  await page.waitForFunction(() => {
    type RestartWitnessWindow = typeof window & {
      __OLD_LIFECYCLE_BRIDGE__?: NonNullable<typeof window.__HUCHU_TEST__>;
    };
    return window.__HUCHU_TEST__ !== undefined
      && window.__HUCHU_TEST__ !== (window as RestartWitnessWindow).__OLD_LIFECYCLE_BRIDGE__;
  });
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);

  await expect.poll(async () => (await snapshot(page)).audio.state).toBe('running');
  expect((await snapshot(page)).run.mode).toBe('playing');
});

test('boss layer는 gameplay entity 하나에 공유되고 BGM 6 voice cap을 지킨다', async ({ page }) => {
  await openScenario(page, 'boss-rig-p2');
  await advance(page, 1000 / 60);
  await expect.poll(async () => (await snapshot(page)).audio.bossLayerActive).toBe(true);
  const state = await snapshot(page);
  expect(state.traderRig.active).toMatchObject({ gameplayEntityCount: 1, parts: 2 });
  expect(state.audio.bgmVoices).toBeLessThanOrEqual(6);
  expect(state.audio.totalVoices).toBeLessThanOrEqual(18);
});

test('fractional visibility resume과 x64 76.8초 loop는 transport phase를 보존한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.setAcceleratedAudio(true));
  await advance(page, 333);
  const beforePause = (await snapshot(page)).audio.transportPhaseSteps;
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await expect.poll(async () => (await snapshot(page)).audio.state).toBe('suspended');
  await advance(page, 1000);
  expect((await snapshot(page)).audio.transportPhaseSteps).toBeCloseTo(beforePause, 8);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  await expect.poll(async () => (await snapshot(page)).audio.state).toBe('running');
  await advance(page, 1000 / 60);
  expect((await snapshot(page)).audio.transportPhaseSteps).not.toBeCloseTo(beforePause, 8);

  const loopStart = (await snapshot(page)).audio.transportPhaseSteps;
  await advance(page, 1200);
  expect((await snapshot(page)).audio.transportPhaseSteps).toBeCloseTo(loopStart, 8);
});

test('stress는 실제 realtime sink의 12/6/18 high-water와 cap을 노출한다', async ({ page }) => {
  await openScenario(page, 'stress');
  expect((await snapshot(page)).audioStress).toEqual({
    generation: 1,
    peakSfxVoices: 12,
    peakBgmVoices: 6,
    peakTotalVoices: 18,
  });
  await page.evaluate(() => window.__HUCHU_TEST__!.advanceWithoutFlush(3000));
  const state = await snapshot(page);
  expect(state.audio.sfxVoices).toBeLessThanOrEqual(12);
  expect(state.audio.bgmVoices).toBeLessThanOrEqual(6);
  expect(state.audio.totalVoices).toBeLessThanOrEqual(18);
  expect(state.audioStress).toEqual({
    generation: 1,
    peakSfxVoices: 12,
    peakBgmVoices: 6,
    peakTotalVoices: 18,
  });
});
