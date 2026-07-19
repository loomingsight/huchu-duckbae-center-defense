import { expect, test } from '@playwright/test';
import {
  advance,
  loadScenario,
  openScenario,
  snapshot,
} from './helpers';

const SKILL_SELECTION_SEED = 7;

test('간식 8에서 월드가 멈추고 카드 선택 뒤 3초 후 bark Lv2로 재개한다', async ({ page }) => {
  await openScenario(page, 'skill-selection', SKILL_SELECTION_SEED);
  const frozen = await snapshot(page);
  expect(frozen.mode).toBe('skillSelection');
  expect(frozen.snacks).toBe(8);
  expect(new Set(frozen.cards.map((card) => card.id)).size).toBe(3);
  expect(frozen.cards.at(0)).toMatchObject({ skillId: 'bark', nextLevel: 2 });
  expect(frozen.projectiles.length).toBeGreaterThan(0);
  expect(frozen.projectileImpacts).toHaveLength(1);
  expect(frozen.worldClocks).toMatchObject({ worldPaused: true });
  expect(frozen.worldClocks.barkEffectAgesMs).toHaveLength(1);
  expect(frozen.worldClocks.projectileEffectAgesMs).toHaveLength(1);
  expect(frozen.worldClocks.shelterEffectAgeMs).not.toBeNull();
  expect(frozen.worldClocks.offLeashEffectAgeMs).not.toBeNull();
  await expect(page.getByText('간식으로 스킬 배우기')).toBeVisible();
  const buttons = page.getByRole('button');
  await expect(buttons).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  await page.keyboard.down('ArrowRight');
  await advance(page, 5000);
  await page.keyboard.up('ArrowRight');
  const stillFrozen = await snapshot(page);
  expect(stillFrozen).toMatchObject({
    mode: 'skillSelection',
    simulationMs: frozen.simulationMs,
    player: frozen.player,
    enemies: frozen.enemies,
    projectiles: frozen.projectiles,
    projectileImpacts: frozen.projectileImpacts,
    shelterShakeOffset: frozen.shelterShakeOffset,
    worldClocks: frozen.worldClocks,
  });

  const firstButton = page.getByRole('button', { name: frozen.cards.at(0)!.title });
  await firstButton.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  const selected = await snapshot(page);
  expect(selected).toMatchObject({
    mode: 'countdown',
    skills: { bark: 2 },
    cooldownProgress: { bark: 0 },
    countdown: { kind: 'resumeCombat', remainingMs: 3000 },
  });
  expect(selected.worldClocks.worldPaused).toBe(true);
  expect(selected.cards).toEqual([]);
  await expect(page.getByText('간식으로 스킬 배우기')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);

  await advance(page, 2999);
  expect(await snapshot(page)).toMatchObject({
    mode: 'countdown',
    player: frozen.player,
    enemies: frozen.enemies,
    projectiles: frozen.projectiles,
  });
  await advance(page, 1);
  expect(await snapshot(page)).toMatchObject({
    mode: 'playing',
    worldClocks: { worldPaused: false },
  });
  const hp = (await snapshot(page)).enemies.find(({ kind }) => kind === 'illegalBreeder')!.currentHp;
  await advance(page, 250);
  const attacked = await snapshot(page);
  expect(attacked.enemies.find(({ kind }) => kind === 'illegalBreeder')!.currentHp).toBe(hp - 13);
  expect(attacked.worldClocks.worldAnimationMs).toBeGreaterThan(frozen.worldClocks.worldAnimationMs);
  expect(attacked.worldClocks.offLeashEffectAgeMs).toBeNull();
});

test('visibility pause는 countdown과 world clock을 함께 보존한다', async ({ page }) => {
  await openScenario(page, 'skill-selection', SKILL_SELECTION_SEED);
  const card = (await snapshot(page)).cards.at(0)!;
  await page.getByRole('button', { name: card.title }).click();
  await advance(page, 1000);
  const beforeHidden = await snapshot(page);

  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 5000);
  const hidden = await snapshot(page);
  expect(hidden).toMatchObject({
    mode: 'visibilityPause',
    countdown: beforeHidden.countdown,
    worldClocks: beforeHidden.worldClocks,
    player: beforeHidden.player,
    enemies: beforeHidden.enemies,
    projectiles: beforeHidden.projectiles,
  });
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  expect((await snapshot(page)).mode).toBe('countdown');
  await advance(page, 1999);
  expect((await snapshot(page)).mode).toBe('countdown');
  await advance(page, 1);
  expect((await snapshot(page)).mode).toBe('playing');
});

test('scenario reset과 Scene shutdown은 modal DOM/listener를 남기지 않는다', async ({ page }) => {
  await openScenario(page, 'skill-selection', SKILL_SELECTION_SEED);
  await expect(page.getByRole('button')).toHaveCount(3);

  await loadScenario(page, 'empty-run');
  await expect(page.getByRole('button')).toHaveCount(0);
  await loadScenario(page, 'skill-selection');
  await expect(page.getByRole('button')).toHaveCount(3);

  await page.evaluate(() => window.__HUCHU_TEST__!.restartScene());
  await page.waitForFunction(() => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__!.snapshot().mode === 'playing'
  ));
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByText('간식으로 스킬 배우기')).toHaveCount(0);
});

test('wave clear와 selection이 겹치면 다음 웨이브 countdown 하나로 wave 2를 시작한다', async ({ page }) => {
  await openScenario(page, 'skill-selection-wave-clear', SKILL_SELECTION_SEED);
  const frozen = await snapshot(page);
  expect(frozen).toMatchObject({
    mode: 'skillSelection',
    wave: 1,
    snacks: 8,
    activeEnemyCount: 0,
  });
  expect(frozen.cards.at(0)).toMatchObject({ id: 'bark:2' });

  await page.getByRole('button', { name: frozen.cards.at(0)!.title }).click();
  expect(await snapshot(page)).toMatchObject({
    mode: 'countdown',
    wave: 1,
    countdown: { kind: 'nextWave', remainingMs: 3000 },
  });
  await advance(page, 2999);
  expect(await snapshot(page)).toMatchObject({ mode: 'countdown', wave: 1 });
  await advance(page, 1);
  expect(await snapshot(page)).toMatchObject({ mode: 'playing', wave: 2 });
  await advance(page, 1);
  expect(await snapshot(page)).toMatchObject({ mode: 'playing', wave: 2 });
});
