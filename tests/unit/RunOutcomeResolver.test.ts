import { expect, it } from 'vitest';
import { resolvePostStep, RunOutcomeResolver } from '../../src/game/session/RunOutcomeResolver';

it('같은 스텝에 모두 참이면 패배를 한 번만 확정한다', () => {
  const resolver = new RunOutcomeResolver();
  const input = { shelterHp: 0, wave: 5, active: 0, pending: 0, skillDue: true };

  expect(resolver.resolve(input)).toEqual({ mode: 'lost' });
  expect(resolver.resolve(input)).toEqual({ mode: 'lost' });
  expect(resolver.transitionCount).toBe(1);
});

it('5웨이브를 모두 정리하면 승리를 확정한다', () => {
  expect(resolvePostStep({ shelterHp: 1, wave: 5, active: 0, pending: 0, skillDue: false }))
    .toEqual({ mode: 'won' });
});

it('마지막 전 웨이브 정리는 skillDue 없이 다음 웨이브 카운트다운으로 전환한다', () => {
  expect(resolvePostStep({ shelterHp: 1, wave: 2, active: 0, pending: 0, skillDue: false }))
    .toEqual({ mode: 'countdown', nextWave: 3, countdownKind: 'nextWave' });
});

it('마지막 전 웨이브 정리와 skillDue는 스킬 선택을 우선한다', () => {
  expect(resolvePostStep({ shelterHp: 1, wave: 2, active: 0, pending: 0, skillDue: true }))
    .toEqual({ mode: 'skillSelection', nextWave: 3, countdownKind: 'nextWave' });
});

it('전투 중 skillDue는 다음 웨이브 전환 없이 스킬 선택으로 전환한다', () => {
  expect(resolvePostStep({ shelterHp: 1, wave: 2, active: 1, pending: 0, skillDue: true }))
    .toEqual({ mode: 'skillSelection' });
});

it('패배는 웨이브 승리와 스킬 선택보다 우선한다', () => {
  expect(resolvePostStep({ shelterHp: 0, wave: 5, active: 0, pending: 0, skillDue: true }))
    .toEqual({ mode: 'lost' });
});

it('reset은 종료 고정과 전환 수를 초기화한다', () => {
  const resolver = new RunOutcomeResolver();
  const win = { shelterHp: 1, wave: 5, active: 0, pending: 0, skillDue: false };
  const loss = { shelterHp: 0, wave: 5, active: 0, pending: 0, skillDue: false };

  expect(resolver.resolve(win)).toEqual({ mode: 'won' });
  expect(resolver.resolve(loss)).toEqual({ mode: 'won' });
  expect(resolver.transitionCount).toBe(1);

  resolver.reset();

  expect(resolver.resolve(loss)).toEqual({ mode: 'lost' });
  expect(resolver.transitionCount).toBe(1);
});
