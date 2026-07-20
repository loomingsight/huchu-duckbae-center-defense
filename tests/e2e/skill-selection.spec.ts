import { expect, test } from '@playwright/test';
import {
  advance,
  events,
  loadScenario,
  openScenario,
  snapshot,
} from './helpers';

const SKILL_SELECTION_SEED = 7;
const LAYOUT_TOLERANCE_PX = 1;

test('modal DOM overlay는 canvas와 같은 rect에서 제목과 카드 3장을 완전히 표시한다', async ({
  page,
}, testInfo) => {
  await openScenario(page, 'skill-selection', SKILL_SELECTION_SEED);
  const canvas = page.locator('#game-root canvas');
  const overlay = page.locator('#game-root > div:has(button)');
  const title = page.getByRole('heading', { name: '간식으로 스킬 배우기' });
  const buttons = page.getByRole('button');
  await expect(overlay).toHaveCount(1);
  await expect(title).toBeVisible();
  await expect(buttons).toHaveCount(3);

  const canvasRect = requiredRect(await canvas.boundingBox(), 'canvas');
  const overlayRect = requiredRect(await overlay.boundingBox(), 'DOM overlay');
  const titleRect = requiredRect(await title.boundingBox(), 'modal title');
  const buttonRects = await Promise.all(
    [0, 1, 2].map(async (index) => requiredRect(
      await buttons.nth(index).boundingBox(),
      `modal button ${index + 1}`,
    )),
  );
  const layoutStyles = await page.evaluate(() => {
    const read = (element: Element | null): Record<string, string> => {
      if (element === null) throw new Error('modal layout element is missing');
      const computed = window.getComputedStyle(element);
      return {
        inline: element.getAttribute('style') ?? '',
        display: computed.display,
        position: computed.position,
        inset: `${computed.top} ${computed.right} ${computed.bottom} ${computed.left}`,
        margin: computed.margin,
        transform: computed.transform,
        transformOrigin: computed.transformOrigin,
      };
    };
    return {
      root: read(document.querySelector('#game-root')),
      canvas: read(document.querySelector('#game-root canvas')),
      overlay: read(document.querySelector('#game-root > div:has(button)')),
    };
  });
  await testInfo.attach('skill-selection-modal-layout', {
    body: JSON.stringify({
      canvasRect,
      overlayRect,
      titleRect,
      buttonRects,
      layoutStyles,
    }, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach('skill-selection-modal', {
    body: await page.locator('#game-root').screenshot(),
    contentType: 'image/png',
  });

  expectRectClose(overlayRect, canvasRect);
  expectContained(titleRect, canvasRect);
  expectHorizontalCenter(titleRect, canvasRect);
  for (const rect of buttonRects) {
    expectContained(rect, canvasRect);
    expectHorizontalCenter(rect, canvasRect);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  expect(titleRect.y + titleRect.height).toBeLessThan(buttonRects[0]!.y);
  expect(buttonRects[0]!.y + buttonRects[0]!.height).toBeLessThan(buttonRects[1]!.y);
  expect(buttonRects[1]!.y + buttonRects[1]!.height).toBeLessThan(buttonRects[2]!.y);
});

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
  await page.getByRole('button', { name: '계속하기' }).click();
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

test('실제 카드 경로로 배운 네 자동 스킬이 cast되고 실제 HUD display list가 32px/noninteractive다', async ({ page }) => {
  await openScenario(page, 'all-skills');
  const learnedOrder: string[] = [];

  for (let selection = 0; selection < 4; selection += 1) {
    const choosing = await snapshot(page);
    expect(choosing.mode).toBe('skillSelection');
    const unlock = selection < 3
      ? choosing.cards.find(({ kind, skillId }) => (
        kind === 'unlock' && skillId !== 'bark' && skillId !== 'scold'
      ))
      : choosing.cards.find(({ kind, skillId }) => kind === 'unlock' && skillId === 'scold');
    expect(unlock).toBeDefined();
    learnedOrder.push(unlock!.skillId);

    await page.getByRole('button', { name: unlock!.title }).click();
    const selected = await snapshot(page);
    expect(selected).toMatchObject({
      mode: 'countdown',
      skills: { [unlock!.skillId]: 1 },
      cooldownProgress: { [unlock!.skillId]: 0 },
    });
    await advance(page, 3000);
    if (selection < 3) {
      await advance(page, 8000);
      expect((await snapshot(page)).mode).toBe('skillSelection');
    }
  }

  expect(new Set(learnedOrder)).toEqual(new Set([
    'scold',
    'aquaBeam',
    'deokbaeHowl',
    'safetyReport',
  ]));
  await advance(page, 20_000);

  const castTypes = (await events(page))
    .filter((event) => event.type === 'skillCast')
    .map((event) => event.skillId);
  expect(new Set(castTypes)).toEqual(new Set(learnedOrder));
  const final = await snapshot(page);
  expect(final.shelterHp).toBe(100);
  expect(final.enemies.filter(({ maxHp }) => maxHp === 10_000)).toHaveLength(5);
  expect(final.hud.skillSlots.map(({ id }) => id)).toEqual(['bark', ...learnedOrder]);
  expect(final.hud.skillSlots).toHaveLength(5);
  expect(final.hud.skillSlots.every((slot) => (
    slot.x === 12
    && slot.width === 32
    && slot.height === 32
    && slot.iconWidth <= 28
    && slot.iconHeight <= 28
    && slot.fontPx === 9
    && slot.interactive === false
  ))).toBe(true);
  expect(final.hud.skillSlots.map(({ y }) => y)).toEqual([92, 128, 164, 200, 236]);
  expect(final.hud.top.text).toBe(`보호소 HP 100/100   WAVE ${final.wave}/5   간식 ${final.snacks}`);
  expect(final.hud.top.text).not.toContain('\n');
  expect(final.hud.top.interactive).toBe(false);
  expect(final.hud.top.y + final.hud.top.height).toBeLessThanOrEqual(92);
  expect(final.combatEffectPool).toMatchObject({ created: 120 });
  expect(final.combatEffectPool.active).toBeLessThanOrEqual(120);
});

interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function requiredRect(rect: LayoutRect | null, label: string): LayoutRect {
  if (rect === null) throw new Error(`${label} has no bounding rect`);
  return rect;
}

function expectRectClose(actual: LayoutRect, expected: LayoutRect): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
}

function expectContained(inner: LayoutRect, outer: LayoutRect): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - LAYOUT_TOLERANCE_PX);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - LAYOUT_TOLERANCE_PX);
  expect(inner.x + inner.width).toBeLessThanOrEqual(
    outer.x + outer.width + LAYOUT_TOLERANCE_PX,
  );
  expect(inner.y + inner.height).toBeLessThanOrEqual(
    outer.y + outer.height + LAYOUT_TOLERANCE_PX,
  );
}

function expectHorizontalCenter(inner: LayoutRect, outer: LayoutRect): void {
  const innerCenter = inner.x + inner.width / 2;
  const outerCenter = outer.x + outer.width / 2;
  expect(Math.abs(innerCenter - outerCenter)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
}
