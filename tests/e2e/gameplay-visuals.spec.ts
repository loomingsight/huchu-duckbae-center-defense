import { expect, test } from '@playwright/test';
import type { TestScenarioId } from '../../src/game/debug/TestContract';
import { advance, openScenario } from './helpers';

const cases: readonly Readonly<{ name: string; scenario: TestScenarioId }>[] = [
  { name: 'health-bar-colors', scenario: 'health-bar-colors' },
  { name: 'all-skills', scenario: 'skill-dock' },
  { name: 'boss', scenario: 'boss-rig-attack-p2' },
  { name: 'shelter-defeat', scenario: 'impact-feedback' },
];

for (const entry of cases) {
  test(`${entry.name} 게임 루트 시각 후보`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openScenario(page, entry.scenario);
    if (entry.name === 'all-skills') {
      for (const skillId of ['tailSwipe', 'aquaBeam', 'safetyReport'] as const) {
        await page.evaluate((id) => window.__HUCHU_TEST__!.purchaseSkill(id), skillId);
        await advance(page, 1000 / 60);
      }
    }
    if (entry.name === 'shelter-defeat') await advance(page, 300);
    else await advance(page, 0);
    if (entry.name === 'boss') {
      const rig = await page.evaluate(() => window.__HUCHU_TEST__!.snapshot().traderRig.active);
      expect(rig).not.toBeNull();
      expect(rig!.human.x).toBeGreaterThanOrEqual(0);
      expect(rig!.human.x).toBeLessThanOrEqual(540);
      expect(rig!.human.y).toBeGreaterThanOrEqual(0);
      expect(rig!.human.y).toBeLessThanOrEqual(960);
      expect(rig!.truck.x).toBeGreaterThanOrEqual(0);
      expect(rig!.truck.x).toBeLessThanOrEqual(540);
      expect(rig!.truck.y).toBeGreaterThanOrEqual(0);
      expect(rig!.truck.y).toBeLessThanOrEqual(960);
    }
    if (entry.name === 'shelter-defeat') {
      const feedback = await page.evaluate(() => window.__HUCHU_TEST__!.snapshot().pools);
      expect(feedback.damageNumbers.active).toBeGreaterThan(0);
      expect(feedback.effects.active).toBeGreaterThan(0);
    }
    await expect(page.locator('.auto-skill-hud')).toBeVisible();
    await expect(page.locator('.skill-dock')).toBeVisible();
    await expect(page.locator('.virtual-joystick')).toBeVisible();
    const before = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
    await expect(page.locator('#game-root')).toHaveScreenshot(`${entry.name}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    });
  });
}
