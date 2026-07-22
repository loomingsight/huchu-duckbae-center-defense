import { expect, test } from '@playwright/test';
import { advance, events, openScenario, snapshot } from './helpers';

test('wave-schedule 20초는 W1 요청·spawn을 canonical 순서로 기록한다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  expect((await snapshot(page)).run).toMatchObject({
    simulationMs: 0, wave: 1, pendingSpawns: 10, activeEnemyCount: 0,
  });
  await advance(page, 20_000 + 1000 / 60);
  const log = await events(page);
  const requests = log.filter((event) => event.type === 'enemySpawnRequested');
  expect(log.at(0)).toMatchObject({ sequence: 1, atSimulationMs: 1000 / 60, type: 'waveStarted', wave: 1 });
  expect(requests.map(({ request }) => request)).toEqual(
    [0, 0, 5_000, 5_000, 10_000, 10_000, 15_000, 15_000, 20_000, 20_000]
      .map((atMs, index) => expect.objectContaining({ atMs, spawnSequence: index })),
  );
  expect((await snapshot(page)).run).toMatchObject({
    simulationMs: 20_000 + 1000 / 60,
    wave: 1, mode: 'countdown', pendingSpawns: 0, activeEnemyCount: 0,
    playerHp: 1000, snacks: 0,
  });
});
