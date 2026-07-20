import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('asset review 문서에 모든 캐릭터와 보호소 overlay가 있다', async ({ page }) => {
  await page.setContent(await readFile('.cache/asset-review/sprite-animation-review.html', 'utf8'));
  await page.getByRole('button', { name: '프레임 정지' }).click();
  await expect(page.locator('[data-sheet]')).toHaveCount(9);
  await expect(page.locator('[data-animation="walk"]')).toHaveCount(9);
  await expect(page.locator('[data-animation="attack"]')).toHaveCount(9);
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')]
    .every((canvas) => canvas.dataset.ready === 'true'));
  await expect(page).toHaveScreenshot('asset-review.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
