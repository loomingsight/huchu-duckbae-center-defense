import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REQUIRED_REVIEW_SECTIONS = [
  'actors-at-390px',
  'walk-and-attack-frames',
  'tail-swipe-event-frame',
  'trader-directions-and-mirrors',
  'trader-event-sockets',
  'labels-hp-and-damage-numbers',
] as const;

test('asset review 문서에 모든 캐릭터와 전투 가독성 표본이 있다', async ({ page }) => {
  test.skip(
    !existsSync('assets/source/generated/v2/huchu-walk.png'),
    'V2 character candidates are missing; visual approval is deferred',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const manifest = JSON.parse(
    await readFile('src/game/assets/character-animations.json', 'utf8'),
  ) as readonly Readonly<{ key: string; frameCount: number }>[];
  await page.setContent(await readFile('.cache/asset-review/sprite-animation-review.html', 'utf8'));
  expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(390);
  await expect(page.locator('[data-review-section]')).toHaveCount(REQUIRED_REVIEW_SECTIONS.length);
  for (const id of REQUIRED_REVIEW_SECTIONS) {
    const section = page.locator(`[data-review-section="${id}"]`);
    await expect(section).toHaveCount(1);
    await expect(section).toBeVisible();
  }
  await expect(page.locator('[data-sheet]')).toHaveCount(41);
  await expect(page.locator('[data-kind="animation"]')).toHaveCount(41);
  await expect(page.locator('[data-primary-animation-frame]')).toHaveCount(250);
  await expect(page.locator('[data-primary-review-frame]')).toHaveCount(250);
  await expect(page.locator('[data-primary-review-frame] [data-frame-meta]')).toHaveCount(250);
  expect((await page.locator('[data-kind="animation"]').evaluateAll((articles) =>
    articles.map((article) => (article as HTMLElement).dataset.sheet))).sort()).toEqual(
    manifest.map(({ key }) => key).sort(),
  );
  expect(await page.locator('[data-primary-review-frame]').evaluateAll((frames) => frames.every((frame) => {
    const element = frame as HTMLElement;
    return Boolean(
      element.dataset.manifestKey &&
      element.dataset.frameIndex &&
      element.dataset.footAnchor &&
      element.dataset.alphaBounds &&
      element.dataset.cssSize,
    );
  }))).toBe(true);
  await expect(page.locator('[data-asset-group="generic"]')).toHaveCount(17);
  await expect(page.locator('[data-asset-group="dog-trader"]')).toHaveCount(24);
  await expect(page.locator('[data-virtual-mirror="true"]')).toHaveCount(9);
  await expect(page.locator('[data-review-section="tail-swipe-event-frame"] [data-event-frame="3"]')).toHaveCount(1);
  await expect(page.locator('[data-review-section="trader-directions-and-mirrors"] [data-direction]')).toHaveCount(16);
  await expect(page.locator('[data-review-section="trader-event-sockets"] [data-event-socket]')).toHaveCount(8);
  await expect(page.locator('[data-review-section="labels-hp-and-damage-numbers"] [data-enemy-label]')).toHaveCount(4);
  await expect(page.locator('[data-review-section="labels-hp-and-damage-numbers"] [data-hp-color]')).toHaveCount(3);
  await expect(page.locator('[data-review-section="labels-hp-and-damage-numbers"] [data-damage-strength]')).toHaveCount(3);
  const frameIndexes = await page.locator('[data-kind="animation"]').evaluateAll((articles) =>
    articles.map((article) => ({
      key: (article as HTMLElement).dataset.sheet,
      indexes: [...article.querySelectorAll<HTMLElement>('[data-primary-animation-frame]')]
        .map((frame) => Number(frame.dataset.primaryAnimationFrame)),
    })));
  expect(frameIndexes.sort((left, right) => (left.key ?? '').localeCompare(right.key ?? ''))).toEqual(
    manifest.map(({ key, frameCount }) => ({
      key,
      indexes: Array.from({ length: frameCount }, (_, index) => index),
    })).sort((left, right) => left.key.localeCompare(right.key)),
  );
  await expect(page.locator('canvas')).toHaveCount(260);
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')]
    .every((canvas) => canvas.dataset.ready === 'true'));
  await expect(page).toHaveScreenshot('asset-review.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
