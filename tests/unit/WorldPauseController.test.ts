import { GameStateMachine } from '../../src/game/core/GameStateMachine';
import { WorldPauseController } from '../../src/game/lifecycle/WorldPauseController';

describe('WorldPauseController', () => {
  it('playing 외 네 mode는 world runtime을 멈춘다', () => {
    const calls: boolean[] = [];
    const state = new GameStateMachine('playing');
    const controller = new WorldPauseController(
      state,
      { setPaused: (value) => calls.push(value) },
    );

    for (const mode of ['countdown', 'visibilityPause', 'won', 'lost'] as const) {
      state.reset(mode);
      controller.sync();
      state.reset('playing');
      controller.sync();
    }
    expect(calls).toEqual([true, false, true, false, true, false, true, false]);
  });

  it('playing에서 countdown으로 바로 들어가도 world를 멈춘다', () => {
    const calls: boolean[] = [];
    const state = new GameStateMachine('playing');
    const controller = new WorldPauseController(
      state,
      { setPaused: (value) => calls.push(value) },
    );

    state.transition('countdown');
    controller.sync();

    expect(calls).toEqual([true]);
  });

  it('reset은 runtime을 unpause하고 내부 idempotence 상태도 playing과 정렬한다', () => {
    const state = new GameStateMachine('playing');
    const calls: boolean[] = [];
    const controller = new WorldPauseController(state, {
      setPaused: (value) => calls.push(value),
    });
    state.transition('countdown');
    controller.sync();

    controller.reset();
    state.transition('countdown');
    controller.sync();

    expect(state.current()).toBe('countdown');
    expect(calls).toEqual([true, false, true]);
  });

  it('session visibility transaction 결과를 sync해 원래 mode의 pause 상태로 복귀한다', () => {
    const state = new GameStateMachine('countdown');
    const calls: boolean[] = [];
    const controller = new WorldPauseController(state, {
      setPaused: (value) => calls.push(value),
    });
    controller.sync();
    state.hide();
    controller.sync();
    state.resume();
    controller.sync();
    expect(calls).toEqual([true]);

    state.reset('playing');
    controller.sync();
    state.hide();
    controller.sync();
    state.resume();
    controller.sync();

    expect(calls).toEqual([true, false, true, false]);
  });
});
