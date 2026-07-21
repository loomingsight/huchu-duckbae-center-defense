import { expect, it } from 'vitest';
import type { GameMode } from '../../src/game/core/GameMode';
import { GameStateMachine } from '../../src/game/core/GameStateMachine';
import { WebGlRecoveryController } from '../../src/game/lifecycle/WebGlRecoveryController';

function createHarness(mode: GameMode = 'playing') {
  const target = new EventTarget();
  const state = new GameStateMachine(mode);
  const session = {
    currentMode: () => state.current(),
    requestVisibilityPause: () => state.hide(),
    requestVisibilityResume: () => { state.resume(); },
  };
  const prompts: boolean[] = [];
  const sequence: string[] = [];
  const controller = new WebGlRecoveryController(target, session, {
    setWorldPaused: () => undefined,
    setRestorePromptVisible: (visible) => prompts.push(visible),
    resyncView: () => sequence.push(`resync:${session.currentMode()}`),
  });
  controller.attach();
  return { controller, prompts, sequence, session, target };
}

it.each(['playing', 'countdown'] as const)(
  '%s WebGL 복귀는 명시적 확인 뒤 원래 mode로 돌아간다',
  (mode) => {
    const h = createHarness(mode);
    const lost = new Event('webglcontextlost', { cancelable: true });
    h.target.dispatchEvent(lost);
    h.target.dispatchEvent(new Event('webglcontextrestored'));
    expect(lost.defaultPrevented).toBe(true);
    expect(h.controller.needsConfirmation).toBe(true);
    expect(h.session.currentMode()).toBe('visibilityPause');
    h.controller.confirmRestore();
    expect(h.sequence).toEqual(['resync:visibilityPause']);
    expect(h.session.currentMode()).toBe(mode);
  },
);

it.each(['won', 'lost'] as const)('%s에서는 context loss가 lifecycle mode를 바꾸지 않는다', (mode) => {
  const h = createHarness(mode);
  h.target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  h.target.dispatchEvent(new Event('webglcontextrestored'));
  expect(h.session.currentMode()).toBe(mode);
  expect(h.controller.needsConfirmation).toBe(false);
});

it('반복 loss 뒤 이전 confirmation generation은 현재 pause를 해제하지 않는다', () => {
  const h = createHarness();
  h.target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  h.target.dispatchEvent(new Event('webglcontextrestored'));
  const stale = h.controller.confirmationGeneration;
  h.target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  h.target.dispatchEvent(new Event('webglcontextrestored'));
  h.controller.confirmRestore(stale);
  expect(h.session.currentMode()).toBe('visibilityPause');
  h.controller.confirmRestore();
  expect(h.session.currentMode()).toBe('playing');
});
