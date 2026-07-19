import type { Page } from '@playwright/test';
import type {
  GameDebugSnapshot,
  TestScenarioId,
} from '../../src/game/debug/TestContract';

export async function openScenario(
  page: Page,
  scenario: TestScenarioId,
  seed = 424242,
): Promise<void> {
  await page.goto(`/?e2e=1&seed=${seed}&clock=manual`);
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await page.waitForFunction(() => window.__HUCHU_TEST__ !== undefined);
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  await loadScenario(page, scenario);
}

export const loadScenario = (page: Page, scenario: TestScenarioId): Promise<void> =>
  page.evaluate((id) => window.__HUCHU_TEST__!.loadScenario(id), scenario);

export const advance = (page: Page, ms: number): Promise<void> =>
  page.evaluate((value) => window.__HUCHU_TEST__!.advance(value), ms);

export const snapshot = (page: Page): Promise<GameDebugSnapshot> =>
  page.evaluate(() => window.__HUCHU_TEST__!.snapshot());

export const events = (page: Page, sequence = 0) =>
  page.evaluate((value) => window.__HUCHU_TEST__!.eventsSince(value), sequence);
