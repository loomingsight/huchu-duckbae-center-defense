import { expect, test } from '@playwright/test';

test('시작 버튼으로 GameScene에 진입한다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Game');
  await expect(page.locator('#game-root')).toHaveAttribute('data-renderer', 'webgl');
});
