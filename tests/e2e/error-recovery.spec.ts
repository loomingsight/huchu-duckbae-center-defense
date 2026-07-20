import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('필수 에셋 실패는 unique 파일 수와 retry를 표시한다', async ({ page }) => {
  await page.route('**/map-background.webp', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('필수 그림 1개를 불러오지 못했어요')).toBeVisible();
  await page.unroute('**/map-background.webp');
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
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl!.getExtension('WEBGL_lose_context')!;
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension = extension;
    extension.loseContext();
  });
  await expect(page.getByText('화면을 다시 준비하고 있어요')).toBeVisible();
  const frozen = await snapshot(page);
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(frozen.simulationMs);

  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension!.restoreContext();
  });
  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
  await expect(page.getByRole('button', { name: '다시 그리기' })).toHaveCount(0);
});

test('visibility가 먼저 pause를 소유하면 WebGL 복구 전에는 재개하지 않는다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl!.getExtension('WEBGL_lose_context')!;
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension = extension;
    extension.loseContext();
  });
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  expect((await snapshot(page)).mode).toBe('visibilityPause');

  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension!.restoreContext();
  });
  await page.getByRole('button', { name: '계속하기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});
