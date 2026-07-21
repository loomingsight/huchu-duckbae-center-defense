import { expect, test, type Locator } from '@playwright/test';
import sharp from 'sharp';
import { advance, openScenario } from './helpers';

test('390x844 Title primary button은 실제 44px touch target을 제공한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto('/');

  const root = await requiredBox(page.locator('#game-root'));
  const button = await requiredBox(page.getByRole('button', { name: '보호소 지키기' }));

  expect(button.height).toBeGreaterThanOrEqual(44);
  expectWithin(button, root);
});

test('390x844 dock 기술명 3개와 icon은 잘리지 않고 root 안에 머문다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'skill-dock');

  const root = await requiredBox(page.locator('#game-root'));
  const button = page.locator('[data-skill="safetyReport"]');
  const labels = page.locator('.skill-dock button > span:nth-of-type(2)');
  await expect(labels).toHaveText(['꼬리치기', '아쿠아빔', '안전신문고'], { useInnerText: true });
  const labelLayouts = await labels.evaluateAll((elements) => elements.map((element) => ({
    text: element.textContent,
    whiteSpace: getComputedStyle(element).whiteSpace,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  })));
  labelLayouts.forEach((layout) => {
    expect(layout.whiteSpace, layout.text ?? '').toBe('nowrap');
    expect(layout.scrollWidth, layout.text ?? '').toBeLessThanOrEqual(layout.clientWidth);
  });

  const icon = await requiredBox(button.locator('svg'));
  expect(icon.width).toBeCloseTo(22, 1);
  expect(icon.height).toBeCloseTo(22, 1);

  const buttonBox = await requiredBox(button);
  expect(buttonBox.width).toBeGreaterThanOrEqual(88);
  expect(buttonBox.height).toBeGreaterThanOrEqual(56);
  expectWithin(buttonBox, root);
});

test('390x844 canvas는 보호소 foot 아래에 HP bar를 그린다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'skill-dock');

  const screenshot = await page.locator('canvas').screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const region = {
    left: Math.floor(info.width * 240 / 540),
    right: Math.ceil(info.width * 300 / 540),
    top: Math.floor(info.height * 493 / 960),
    bottom: Math.ceil(info.height * 498 / 960),
  };
  let healthyBarPixels = 0;
  let sampledPixels = 0;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset]!;
      const green = data[offset + 1]!;
      const blue = data[offset + 2]!;
      sampledPixels += 1;
      if (Math.abs(red - 0x5f) <= 16
        && Math.abs(green - 0x9f) <= 16
        && Math.abs(blue - 0x55) <= 16) {
        healthyBarPixels += 1;
      }
    }
  }

  expect(region.top / info.height * 960).toBeGreaterThan(480);
  expect(healthyBarPixels / sampledPixels).toBeGreaterThan(0.7);
});

test('47px safe-area의 자동 기술 5개는 3열 2행으로 canvas 위에서 끝난다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'skill-dock');
  for (const skillId of ['tailSwipe', 'aquaBeam', 'safetyReport'] as const) {
    await page.evaluate((id) => window.__HUCHU_TEST__!.purchaseSkill(id), skillId);
    await advance(page, 1000 / 60);
  }

  const overlay = page.locator('.hud-overlay');
  await overlay.evaluate((element) => element.style.setProperty('--hud-safe-top', '47px'));
  const visibleRows = page.locator('.auto-skill-row[data-visible="true"]');
  await expect(visibleRows).toHaveCount(5);
  await expect(visibleRows).toHaveText([
    '짖기·자동',
    '덕배·자동',
    /꼬리·/,
    /아쿠아·/,
    /신고·/,
  ]);
  const labelLayouts = await visibleRows.locator('span:last-child').evaluateAll((labels) => (
    labels.map((label) => ({
      text: label.textContent,
      scrollWidth: label.scrollWidth,
      clientWidth: label.clientWidth,
      textOverflow: getComputedStyle(label).textOverflow,
    }))
  ));
  labelLayouts.forEach((layout) => {
    expect(layout.textOverflow).toBe('clip');
    expect(layout.scrollWidth, layout.text ?? '').toBeLessThanOrEqual(layout.clientWidth);
  });
  await expect(visibleRows.nth(4)).toHaveAttribute('aria-label', /안전신문고 · /);

  const autoHud = await requiredBox(page.locator('.auto-skill-hud'));
  const topHud = await requiredBox(page.locator('.top-hud'));
  const canvas = await requiredBox(page.locator('canvas'));
  expect(autoHud.y).toBeCloseTo(47, 1);
  expect(autoHud.height).toBeLessThanOrEqual(28);
  expect(autoHud.y + autoHud.height).toBeLessThanOrEqual(canvas.y + 0.01);
  expect(
    autoHud.x + autoHud.width <= topHud.x
      || topHud.x + topHud.width <= autoHud.x,
    JSON.stringify({ autoHud, topHud }),
  ).toBe(true);
});

test('390x844 Result primary button은 실제 44px touch target을 제공한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'full-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.prepareTerminalTieForTest());
  await advance(page, 250);
  await advance(page, 1200);
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Result');

  const root = await requiredBox(page.locator('#game-root'));
  const button = await requiredBox(page.getByRole('button', { name: '보호소 지키기' }));
  expect(button.height).toBeGreaterThanOrEqual(44);
  expectWithin(button, root);
});

async function requiredBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`Missing visible layout box for ${locator}`);
  return box;
}

function expectWithin(
  inner: Readonly<{ x: number; y: number; width: number; height: number }>,
  outer: Readonly<{ x: number; y: number; width: number; height: number }>,
): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
}
