import { expect, test } from '@playwright/test';
import { loadScenario, openScenario, snapshot } from './helpers';

test('full·half·low HP actor는 각자 이름표/HP slot을 가진다', async ({ page }) => {
  await openScenario(page, 'health-bar-colors');
  const loaded = await snapshot(page);
  expect(loaded.run.enemies.map(({ id, kind, currentHp, maxHp, position }) => ({ id, kind, currentHp, maxHp, position }))).toEqual([
    { id: 0, kind: 'poopGuardian', currentHp: 60, maxHp: 60, position: { x: 170, y: 445 } },
    { id: 1, kind: 'offLeashGuardian', currentHp: 55, maxHp: 110, position: { x: 370, y: 445 } },
    { id: 2, kind: 'illegalBreeder', currentHp: 150, maxHp: 1500, position: { x: 270, y: 625 } },
  ]);
  expect(loaded.labelBindings).toEqual([
    { enemyId: 0, displayName: '똥 방치러', currentHp: 60, maxHp: 60, hpRatio: 1, hpColor: 0x39a852 },
    { enemyId: 1, displayName: '오프리시 빌런', currentHp: 55, maxHp: 110, hpRatio: 0.5, hpColor: 0xf2ca45 },
    { enemyId: 2, displayName: '불법번식업자', currentHp: 150, maxHp: 1500, hpRatio: 0.1, hpColor: 0xd94b43 },
  ]);
  expect(loaded.pools.enemies).toMatchObject({ created: 60, active: 3, available: 57 });
  expect(loaded.pools.labels).toMatchObject({ created: 60, active: 3, available: 57 });
});

test('scenario reset은 enemy/label pool identity를 유지해 재사용한다', async ({ page }) => {
  await openScenario(page, 'health-bar-colors');
  const initial = (await snapshot(page)).pools;
  await loadScenario(page, 'empty-run');
  const cleared = (await snapshot(page)).pools;
  await loadScenario(page, 'health-bar-colors');
  const reloaded = (await snapshot(page)).pools;
  expect(cleared.enemies).toEqual({ ...initial.enemies, active: 0, available: 60 });
  expect(cleared.labels).toEqual({ ...initial.labels, active: 0, available: 60 });
  expect(reloaded.enemies).toEqual(initial.enemies);
  expect(reloaded.labels).toEqual(initial.labels);
});
