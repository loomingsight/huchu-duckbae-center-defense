import { expect, test, type Locator } from '@playwright/test';
import sharp from 'sharp';
import { advance, openScenario } from './helpers';

test('390x844 Title primary button은 실제 44px touch target을 제공한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto('/');

  const root = await requiredBox(page.locator('#game-root'));
  const button = await requiredBox(page.getByRole('button', { name: '함께 출발하기' }));

  expect(button.height).toBeGreaterThanOrEqual(44);
  expectWithin(button, root);
});

test('390x844 수동 기술명 4개와 icon은 원형 버튼 안에 머문다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'skill-dock');

  const root = await requiredBox(page.locator('#game-root'));
  const button = page.locator('[data-action="safetyReport"]');
  const labels = page.locator('.action-button__name');
  await expect(labels).toHaveText(['짖기', '꼬리치기', '아쿠아빔', '안전신문고'], { useInnerText: true });
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
  expect(icon.width).toBeCloseTo(23, 1);
  expect(icon.height).toBeCloseTo(23, 1);

  const buttonBox = await requiredBox(button);
  expect(buttonBox.width).toBeCloseTo(56, 1);
  expect(buttonBox.height).toBeCloseTo(56, 1);
  expectWithin(buttonBox, root);
});

test('390x844 canvas는 후추 발밑에 HP bar를 그린다', async ({ page }, testInfo) => {
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
    top: Math.floor(info.height * 660 / 960),
    bottom: Math.ceil(info.height * 668 / 960),
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

  expect(region.top / info.height * 960).toBeGreaterThan(650);
  expect(healthyBarPixels / sampledPixels).toBeGreaterThan(0.7);
});

test('47px safe-area에서도 덕배 상태와 좌우 조작 영역이 겹치지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'skill-dock');
  for (const skillId of ['tailSwipe', 'aquaBeam', 'safetyReport'] as const) {
    await page.evaluate((id) => window.__HUCHU_TEST__!.purchaseSkill(id), skillId);
    await advance(page, 1000 / 60);
  }

  const overlay = page.locator('.hud-overlay');
  await overlay.evaluate((element) => element.style.setProperty('--hud-safe-top', '47px'));
  const companion = await requiredBox(page.locator('.companion-status'));
  const actions = await requiredBox(page.locator('.action-dock'));
  const joystick = await requiredBox(page.locator('.virtual-joystick'));
  expect(companion.y).toBeCloseTo(47, 1);
  expect(actions.x + actions.width).toBeLessThanOrEqual(joystick.x);
});

test('390x844 Result primary button은 실제 44px touch target을 제공한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'full-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.prepareTerminalTieForTest());
  await advance(page, 250);
  await advance(page, 1200);
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Result');

  const root = await requiredBox(page.locator('#game-root'));
  const button = await requiredBox(page.getByRole('button', { name: '다시 도전하기' }));
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
