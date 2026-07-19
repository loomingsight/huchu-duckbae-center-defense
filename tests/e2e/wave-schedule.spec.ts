import { expect, test } from '@playwright/test';
import { advance, events, openScenario, snapshot } from './helpers';

test('wave-schedule 9초 진행은 W1 spawn 요청·생성을 exact 순서로 기록한다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  expect(await snapshot(page)).toMatchObject({
    simulationMs: 0,
    wave: 1,
    pendingSpawns: 10,
    activeEnemyCount: 0,
  });

  await advance(page, 9000);

  const eventLog = await events(page);
  const spawnEvents = eventLog.filter((event) => (
    event.type === 'enemySpawnRequested'
  ));
  expect(eventLog.at(0)).toMatchObject({ sequence: 1, type: 'waveStarted', wave: 1 });
  expect(spawnEvents.map(({ sequence }) => sequence)).toEqual(
    Array.from({ length: 10 }, (_, index) => 2 + index * 2),
  );
  expect(spawnEvents.map((event) => event.request)).toEqual(
    Array.from({ length: 10 }, (_, index) => ({
      atMs: index * 1000,
      pathId: index % 2 === 0 ? 'P1' : 'P2',
      kind: 'poopGuardian',
      variant: index % 2 === 0 ? 'male' : 'female',
      spawnSequence: index,
    })),
  );
  expect(await snapshot(page)).toMatchObject({
    simulationMs: 9000,
    wave: 1,
    pendingSpawns: 0,
    activeEnemyCount: 0,
    shelterHp: 100,
    snacks: 0,
  });
});
