import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

for (const scenario of ['health-bar-colors', 'all-skills', 'boss', 'shelter-defeat'] as const) {
  test(`${scenario} 캔버스 시각 회귀`, async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 960 });
    await openScenario(page, scenario);
    if (scenario === 'all-skills') await learnAllSkills(page);
    await advance(page, 0);
    const before = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => (
      canvas.toDataURL()
    ));
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => (
      canvas.toDataURL()
    ))).toBe(before);
    await expect(page.locator('canvas')).toHaveScreenshot(`${scenario}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    });
  });
}

async function learnAllSkills(page: Parameters<typeof snapshot>[0]): Promise<void> {
  for (let selection = 0; selection < 4; selection += 1) {
    const choosing = await snapshot(page);
    const card = selection < 3
      ? choosing.cards.find(({ kind, skillId }) => (
        kind === 'unlock' && skillId !== 'bark' && skillId !== 'scold'
      ))
      : choosing.cards.find(({ kind, skillId }) => kind === 'unlock' && skillId === 'scold');
    if (card === undefined) throw new Error('All-skills visual setup card is missing');
    await page.getByRole('button', { name: card.title }).click();
    await advance(page, 3000);
    if (selection < 3) await advance(page, 8000);
  }
  await advance(page, 20_000);
}
