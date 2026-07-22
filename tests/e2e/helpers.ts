import type { Page } from '@playwright/test';
import type {
  GameDebugEvent,
  GameDebugSnapshot,
  TestScenarioId,
} from '../../src/game/debug/TestContract';
import type { PurchasableSkillId } from '../../src/game/types/GameTypes';

export async function openScenario(
  page: Page,
  scenario: TestScenarioId,
  seed = 424242,
): Promise<void> {
  await page.goto(`/?e2e=1&seed=${seed}&clock=manual`);
  await page.getByRole('button', { name: '함께 출발하기' }).click();
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

export const events = (page: Page, sequence = 0): Promise<readonly GameDebugEvent[]> =>
  page.evaluate((value) => window.__HUCHU_TEST__!.eventsSince(value), sequence);

export interface FullRunResult {
  readonly seed: number;
  readonly outcome: 'won' | 'lost';
  readonly durationMs: number;
  readonly simulationMs: number;
  readonly playerMaxHp: 1000;
  readonly finalPlayerHp: number;
  readonly spawnCount: number;
  readonly purchaseCount: number;
  readonly countdowns: readonly number[];
  readonly bossKinds: readonly string[];
  readonly waveDurationsMs: readonly number[];
}

export async function runFullGame(
  page: Page,
  input: { readonly seed: number; readonly policy: 'threat-orbit-v2' },
): Promise<FullRunResult> {
  await openScenario(page, 'full-run', input.seed);
  return page.evaluate(async ({ seed }) => {
    const bridge = window.__HUCHU_TEST__!;
    const FIXED = 1000 / 60;
    const BATCH_STEPS = 30;
    const BATCH_MS = FIXED * BATCH_STEPS;
    const LIMIT_MS = 540_000;
    const order: PurchasableSkillId[] = ['safetyReport', 'aquaBeam', 'tailSwipe'];
    let sequence = 0;
    let spawnCount = 0;
    let purchaseCount = 0;
    let elapsedMs = 0;
    const countdowns: number[] = [];
    const bossKinds = new Set<string>();
    const playerDamageByKind = new Map<string, { hits: number; total: number }>();
    const waveDurationsMs: number[] = [];
    let waveStartedAtMs: number | null = null;
    const normalize = (x: number, y: number): { x: number; y: number } => {
      const length = Math.hypot(x, y);
      return length < 1e-9 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
    };

    while (elapsedMs < LIMIT_MS) {
      const state = bridge.snapshot();
      const run = state.run;
      if (run.mode === 'won' || run.mode === 'lost') {
        return {
          seed,
          outcome: run.mode,
          durationMs: elapsedMs,
          simulationMs: run.simulationMs,
          playerMaxHp: run.playerMaxHp,
          finalPlayerHp: run.playerHp,
          spawnCount,
          purchaseCount,
          countdowns,
          bossKinds: [...bossKinds],
          waveDurationsMs,
        };
      }

      const next = order.find((id) => !run.learnedSkills[id]);
      if (
        run.mode === 'playing'
        && next !== undefined
        && run.nextSkillCost !== null
        && run.snacks >= run.nextSkillCost
      ) {
        await bridge.purchaseSkill(next);
      }
      const threats = [...run.enemies]
        .filter(({ state: enemyState }) => enemyState !== 'dead')
        .sort((left, right) => left.etaMs - right.etaMs
          || Number(right.state === 'windup' || right.state === 'holding')
            - Number(left.state === 'windup' || left.state === 'holding')
          || Number(right.isBoss) - Number(left.isBoss)
          || left.spawnSequence - right.spawnSequence);
      for (const enemy of threats) if (enemy.isBoss) bossKinds.add(enemy.kind);

      let move = { x: 0, y: 0 };
      const target = threats[0];
      if (run.mode === 'playing' && target !== undefined) {
        const outward = normalize(target.position.x - 270, target.position.y - 480);
        const desired = {
          x: target.position.x + outward.x * 96,
          y: target.position.y + outward.y * 96,
        };
        const toward = normalize(desired.x - state.player.x, desired.y - state.player.y);
        const distance = Math.hypot(desired.x - state.player.x, desired.y - state.player.y);
        move = distance > 24
          ? toward
          : {
            x: -outward.y * (seed % 2 === 0 ? 1 : -1),
            y: outward.x * (seed % 2 === 0 ? 1 : -1),
          };
      }

      await bridge.advanceSimulationBatch(BATCH_STEPS, move);
      elapsedMs += BATCH_MS;
      const nextEvents = bridge.eventsSince(sequence);
      for (const event of nextEvents) {
        sequence = Math.max(sequence, event.sequence);
        if (event.type === 'enemySpawned') spawnCount += 1;
        if (event.type === 'skillPurchaseResolved' && event.result.status === 'learned') {
          purchaseCount += 1;
        }
        if (event.type === 'waveStarted') waveStartedAtMs = event.atSimulationMs;
        if (event.type === 'waveTransition') {
          if (waveStartedAtMs === null) throw new Error(`Missing wave start before ${event.fromWave}`);
          waveDurationsMs.push(event.atSimulationMs - waveStartedAtMs);
          waveStartedAtMs = null;
          countdowns.push(event.countdownMs);
        }
        if (event.type === 'runEnded' && event.outcome === 'won') {
          if (waveStartedAtMs === null) throw new Error('Missing wave start before won');
          waveDurationsMs.push(event.atSimulationMs - waveStartedAtMs);
          waveStartedAtMs = null;
        }
        if (event.type === 'playerDamaged') {
          const previous = playerDamageByKind.get(event.sourceEnemyKind) ?? { hits: 0, total: 0 };
          playerDamageByKind.set(event.sourceEnemyKind, {
            hits: previous.hits + 1,
            total: previous.total + event.amount,
          });
        }
      }
    }
    throw new Error('threat-orbit-v2 exceeded 540000 simulation ms');
  }, { seed: input.seed });
}
