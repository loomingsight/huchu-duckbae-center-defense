import { expect, test } from '@playwright/test';
import type { GameDebugEvent } from '../../src/game/debug/TestContract';
import { advance, events, openScenario, snapshot } from './helpers';

test('120도 bark 한 cast는 안쪽 세 적만 같은 step에서 18씩 피해를 준다', async ({ page }) => {
  await openScenario(page, 'bark-cone');
  await advance(page, 800);
  const before = await snapshot(page);
  const cursor = (await events(page)).at(-1)?.sequence ?? 0;
  await advance(page, 250);
  const after = await snapshot(page);
  const hpAfter = new Map(after.run.enemies.map(({ id, currentHp }) => [id, currentHp]));
  const seeded = before.run.enemies;
  expect(seeded).toHaveLength(4);
  seeded.slice(0, 3).forEach(({ id, currentHp }) => {
    expect(hpAfter.get(id)).toBe(currentHp - 18);
  });
  expect(hpAfter.get(seeded[3]!.id)).toBe(seeded[3]!.currentHp);

  const damage = (await events(page, cursor)).filter((event): event is Extract<
    GameDebugEvent,
    { type: 'damageApplied' }
  > => event.type === 'damageApplied' && event.source === 'bark');
  expect(damage).toHaveLength(3);
  expect(new Set(damage.map(({ castId }) => castId)).size).toBe(1);
  expect(new Set(damage.map(({ appliedAtStep }) => appliedAtStep)).size).toBe(1);
  expect(damage.map(({ effectiveAmount }) => effectiveAmount)).toEqual([18, 18, 18]);
});

test('impact feedback는 실제 damage-number/effect pool과 canonical death를 남긴다', async ({ page }) => {
  await openScenario(page, 'impact-feedback');
  await advance(page, 250);
  const impact = await snapshot(page);
  expect(impact.pools.labels).toMatchObject({ created: 60, active: 1 });
  expect(impact.pools.damageNumbers).toMatchObject({ created: 64, active: 1 });
  expect(impact.pools.effects.active).toBeGreaterThan(0);
  await advance(page, 200);
  const released = await snapshot(page);
  expect(released.pools.labels).toMatchObject({ created: 60, active: 0 });
  expect(released.pools.damageNumbers).toMatchObject({ created: 64, active: 1 });
  const log = await events(page);
  expect(log.some(({ type }) => type === 'enemyDied')).toBe(true);
});
