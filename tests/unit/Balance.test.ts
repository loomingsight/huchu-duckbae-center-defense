import { expectTypeOf } from 'vitest';
import { ACTION_TIMINGS, attackImpactMs, BALANCE } from '../../src/game/data/balance';
import type {
  DamageSource,
  EnemyState,
  ImpactStrength,
  PurchasableSkillId,
  SkillCost,
} from '../../src/game/types/GameTypes';

it('V2 canonical ID와 값 타입을 고정한다', () => {
  expectTypeOf<EnemyState>().toEqualTypeOf<'moving' | 'windup' | 'holding' | 'dead'>();
  expectTypeOf<PurchasableSkillId>()
    .toEqualTypeOf<'tailSwipe' | 'aquaBeam' | 'safetyReport'>();
  expectTypeOf<SkillCost>().toEqualTypeOf<15 | 20 | 25 | 30 | 40 | 45>();
  expectTypeOf<DamageSource>()
    .toEqualTypeOf<'bark' | 'deokbae' | PurchasableSkillId>();
  expectTypeOf<ImpactStrength>().toEqualTypeOf<'light' | 'medium' | 'heavy'>();
});

it('V2 balance와 eventFrame 기반 판정 시간을 한 곳에 고정한다', () => {
  expect(BALANCE).toMatchObject({
    player: { speed: 150, opaqueHeightLogical: 72, maxHp: 1000, hitRadius: 24 },
    enemies: {
      poopGuardian: {
        displayName: '똥 방치러',
        hp: 60,
        speed: 44,
        damage: 25,
        attackIntervalMs: 1800,
        snack: 2,
        isBoss: false,
        attackTiming: 'normal',
      },
      offLeashGuardian: {
        displayName: '오프리시 빌런',
        hp: 110,
        speed: 42,
        damage: 50,
        attackIntervalMs: 1800,
        snack: 4,
        isBoss: false,
        attackTiming: 'normal',
      },
      dogTrader: {
        displayName: '개장수',
        hp: 900,
        speed: 35,
        damage: 120,
        attackIntervalMs: 2400,
        snack: 20,
        isBoss: true,
        attackTiming: 'boss',
      },
      illegalBreeder: {
        displayName: '불법번식업자',
        hp: 1500,
        speed: 64.4,
        damage: 160,
        attackIntervalMs: 2100,
        snack: 35,
        isBoss: true,
        attackTiming: 'boss',
      },
    },
  });
  expect(ACTION_TIMINGS).toEqual({
    normal: { frameCount: 6, eventFrame: 3, fps: 12 },
    boss: { frameCount: 8, eventFrame: 5, fps: 10 },
  });
  expect(attackImpactMs('normal')).toBe(250);
  expect(attackImpactMs('boss')).toBe(500);
});
