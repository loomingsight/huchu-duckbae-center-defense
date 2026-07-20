import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

type RecoverableMode = 'playing' | 'countdown' | 'skillSelection';

async function prepareMode(page: Page, mode: RecoverableMode): Promise<void> {
  if (mode === 'playing') {
    await openScenario(page, 'empty-run');
    return;
  }
  await openScenario(page, 'skill-selection');
  if (mode === 'countdown') {
    const cardTitle = (await snapshot(page)).cards.at(0)!.title;
    await page.getByRole('button', { name: cardTitle }).click();
  }
  expect((await snapshot(page)).mode).toBe(mode);
}

async function loseContext(page: Page): Promise<void> {
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl!.getExtension('WEBGL_lose_context')!;
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension = extension;
    extension.loseContext();
  });
}

async function restoreContext(page: Page): Promise<void> {
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension!.restoreContext();
  });
}

async function joystickDragWithoutRelease(page: Page): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('Canvas is not visible');
  const start = {
    x: box.x + box.width * 78 / 540,
    y: box.y + box.height * 862 / 960,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + box.width * 48 / 540, start.y);
}

async function restartSceneAndWait(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Window & { __TASK13_WEBGL_BRIDGE__?: unknown }).__TASK13_WEBGL_BRIDGE__
      = window.__HUCHU_TEST__;
    window.__HUCHU_TEST__!.restartScene();
  });
  await page.waitForFunction(() => (
    window.__HUCHU_TEST__ !== undefined
    && window.__HUCHU_TEST__ !== (window as Window & { __TASK13_WEBGL_BRIDGE__?: unknown })
      .__TASK13_WEBGL_BRIDGE__
  ));
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
}

test('필수 에셋 실패는 unique 파일 수와 retry를 표시한다', async ({ page }) => {
  await page.route('**/map-background.webp', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('필수 그림 1개를 불러오지 못했어요')).toBeVisible();
  await page.unroute('**/map-background.webp');
  await page.getByText('필수 그림 1개를 불러오지 못했어요').click();
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('button', { name: '보호소 지키기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
});

test('WebGL 미지원이면 canvas 없이 지원 안내를 표시한다', async ({ page }) => {
  await page.goto('/?e2e=1&forceWebglUnsupported=1');
  await expect(page.getByText('이 브라우저에서는 WebGL을 사용할 수 없어요')).toBeVisible();
  await expect(page.getByText('Chrome, Safari, Firefox 최신 버전을 사용해 주세요')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('잘못된 P1 데이터는 retry 뒤에도 전투를 막고 path id를 표시한다', async ({ page }) => {
  await page.goto('/?e2e=1&invalidPath=P1');
  await expect(page.getByText(/P1/)).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-scene', 'Game');

  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByText(/P1/)).toBeVisible();
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-scene', 'Game');
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
});

test('실제 WebGL context lost/restored 뒤 확인 전에는 world가 멈춘다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await loseContext(page);
  await expect(page.getByText('화면을 다시 준비하고 있어요')).toBeVisible();
  const frozen = await snapshot(page);
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(frozen.simulationMs);

  await restoreContext(page);
  await page.getByText('화면을 다시 준비했어요').click();
  expect((await snapshot(page)).mode).toBe('visibilityPause');
  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(0);
});

test('반복 context loss는 이전 restore prompt를 폐기하고 최신 복구만 확인한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await loseContext(page);
  await restoreContext(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);

  await loseContext(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(0);
  expect((await snapshot(page)).mode).toBe('visibilityPause');

  await restoreContext(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});

test('restore 확인 전 joystick gesture는 confirm 뒤 입력으로 남지 않는다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await loseContext(page);
  await restoreContext(page);
  await joystickDragWithoutRelease(page);

  await page.getByRole('button', { name: '다시 그리기' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
  await advance(page, 1000);
  expect((await snapshot(page)).player.x).toBe(270);
  await page.mouse.up();

  await joystickDragWithoutRelease(page);
  await advance(page, 1000);
  expect((await snapshot(page)).player.x).toBeGreaterThan(270);
  await page.mouse.up();
});

test('scene restart는 lost context truth를 유지하고 최신 restore 확인까지 새 run을 멈춘다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await loseContext(page);
  await restartSceneAndWait(page);

  expect((await snapshot(page)).mode).toBe('visibilityPause');
  const frozen = await snapshot(page);
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(frozen.simulationMs);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(0);

  await restoreContext(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(frozen.simulationMs);
  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});

test('restore confirmation 대기는 scene restart 뒤에도 prompt와 pause를 복원한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await loseContext(page);
  await restoreContext(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await restartSceneAndWait(page);

  expect((await snapshot(page)).mode).toBe('visibilityPause');
  const frozen = await snapshot(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCSS('pointer-events', 'none');
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(frozen.simulationMs);

  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
  await expect(page.locator('canvas')).not.toHaveCSS('pointer-events', 'none');
});

test('confirmed recovery는 scene restart 뒤 prompt 없이 playing을 유지한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await loseContext(page);
  await restoreContext(page);
  await page.getByRole('button', { name: '다시 그리기' }).click();
  await restartSceneAndWait(page);

  expect((await snapshot(page)).mode).toBe('playing');
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(0);
  await expect(page.locator('canvas')).not.toHaveCSS('pointer-events', 'none');
});

test('반복 loss의 최신 restore confirmation만 scene restart 뒤 prompt로 복원한다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await loseContext(page);
  await restoreContext(page);
  await loseContext(page);
  await restoreContext(page);
  await restartSceneAndWait(page);

  expect((await snapshot(page)).mode).toBe('visibilityPause');
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});

for (const mode of ['playing', 'countdown', 'skillSelection'] as const) {
  test(`WebGL→visibility 중첩은 ${mode}에서 마지막 reason 뒤에만 재개한다`, async ({ page }) => {
    await prepareMode(page, mode);
    await loseContext(page);
    await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
    await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
    await restoreContext(page);

    if (mode !== 'skillSelection') {
      await expect(page.locator('canvas')).toHaveCSS('pointer-events', 'none');
      await page.getByRole('button', { name: '다시 그리기' }).click();
      expect((await snapshot(page)).mode).toBe('visibilityPause');
      await expect(page.locator('canvas')).toHaveCSS('pointer-events', 'none');
      await page.getByRole('button', { name: '계속하기' }).click();
      await expect(page.locator('canvas')).not.toHaveCSS('pointer-events', 'none');
    }
    expect((await snapshot(page)).mode).toBe(mode);
  });

  test(`visibility→WebGL 중첩은 ${mode}에서 마지막 reason 뒤에만 재개한다`, async ({ page }) => {
    await prepareMode(page, mode);
    await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
    await loseContext(page);
    await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));

    if (mode !== 'skillSelection') {
      await page.getByRole('button', { name: '계속하기' }).click();
      expect((await snapshot(page)).mode).toBe('visibilityPause');
    }
    await restoreContext(page);
    if (mode !== 'skillSelection') {
      await expect(page.locator('canvas')).toHaveCSS('pointer-events', 'none');
      await page.getByRole('button', { name: '다시 그리기' }).click();
      await expect(page.locator('canvas')).not.toHaveCSS('pointer-events', 'none');
    }
    expect((await snapshot(page)).mode).toBe(mode);
  });
}

test('Result에서 context를 잃은 채 재시작하면 restore 확인 전 새 run이 진행되지 않는다', async ({ page }) => {
  await openScenario(page, 'shelter-defeat');
  await advance(page, 1200);
  await loseContext(page);

  await page.getByRole('button', { name: '다시 시작' }).click();
  expect((await snapshot(page)).mode).toBe('visibilityPause');
  const frozen = await snapshot(page);
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(frozen.simulationMs);

  await restoreContext(page);
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(1);
  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});
