import {
  resolvePostStep,
  RunOutcomeResolver,
} from '../../src/game/session/RunOutcomeResolver';

describe('RunOutcomeResolver V2 terminal priority', () => {
  it('같은 step loss와 final clear면 loss를 한 번만 확정한다', () => {
    const resolver = new RunOutcomeResolver();

    expect(resolver.resolve({ shelterHp: 0, wave: 5, active: 0, pending: 0 }))
      .toEqual({ mode: 'lost' });
    expect(resolver.resolve({ shelterHp: 1000, wave: 5, active: 0, pending: 0 }))
      .toEqual({ mode: 'lost' });
    expect(resolver.transitionCount).toBe(1);
  });

  it('final clear는 won이고 그 전 wave clear만 next-wave countdown이다', () => {
    expect(resolvePostStep({ shelterHp: 1, wave: 5, active: 0, pending: 0 }))
      .toEqual({ mode: 'won' });
    expect(resolvePostStep({ shelterHp: 1, wave: 2, active: 0, pending: 0 }))
      .toEqual({ mode: 'countdown', nextWave: 3, countdownKind: 'nextWave' });
  });

  it('active 또는 pending이 남으면 playing을 유지한다', () => {
    expect(resolvePostStep({ shelterHp: 1, wave: 4, active: 1, pending: 0 }))
      .toEqual({ mode: 'playing' });
    expect(resolvePostStep({ shelterHp: 1, wave: 4, active: 0, pending: 1 }))
      .toEqual({ mode: 'playing' });
  });

  it('reset은 terminal 고정과 transition count를 초기화한다', () => {
    const resolver = new RunOutcomeResolver();
    resolver.resolve({ shelterHp: 1, wave: 5, active: 0, pending: 0 });

    resolver.reset();

    expect(resolver.resolve({ shelterHp: 0, wave: 5, active: 0, pending: 0 }))
      .toEqual({ mode: 'lost' });
    expect(resolver.transitionCount).toBe(1);
  });
});
