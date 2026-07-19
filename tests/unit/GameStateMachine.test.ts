import { expect, it } from 'vitest';
import { GameStateMachine } from '../../src/game/core/GameStateMachine';

it.each(['skillSelection', 'countdown', 'visibilityPause', 'won', 'lost'] as const)(
  '%s에서는 월드가 진행되지 않는다',
  (mode) => expect(new GameStateMachine(mode).canStepWorld()).toBe(false),
);

it.each(['won', 'lost'] as const)('%s 종료 상태는 hide로 덮어쓸 수 없다', (mode) => {
  const machine = new GameStateMachine(mode);

  machine.hide();

  expect(machine.current()).toBe(mode);
});

it('반복 hide는 최초 복귀 상태를 덮어쓰지 않는다', () => {
  const machine = new GameStateMachine('playing');

  machine.hide();
  machine.hide();

  expect(machine.resume()).toBe('playing');
});

it('visibilityPause 밖의 resume은 현재 상태를 유지한다', () => {
  const machine = new GameStateMachine('countdown');

  expect(machine.resume()).toBe('countdown');
  expect(machine.current()).toBe('countdown');
});

it('playing 상태는 hide와 resume을 거쳐 다시 복귀한다', () => {
  const machine = new GameStateMachine('playing');

  machine.hide();

  expect(machine.current()).toBe('visibilityPause');
  expect(machine.resume()).toBe('playing');
});
