import { expect, it } from 'vitest';
import type { GameMode } from '../../src/game/core/GameMode';
import { GameStateMachine } from '../../src/game/core/GameStateMachine';
import { LifecyclePauseCoordinator } from '../../src/game/lifecycle/LifecyclePauseCoordinator';
import { VisibilityController } from '../../src/game/lifecycle/VisibilityController';
import { WebGlRecoveryController } from '../../src/game/lifecycle/WebGlRecoveryController';

function sessionAt(mode: GameMode) {
  const state = new GameStateMachine(mode);
  return {
    currentMode: () => state.current(),
    requestVisibilityPause: () => state.hide(),
    requestVisibilityResume: () => { state.resume(); },
  };
}

it.each(['playing', 'countdown'] as const)(
  '%s visibility 복귀는 명시적 확인 뒤 원래 mode로 돌아간다',
  (mode) => {
    const session = sessionAt(mode);
    const prompts: boolean[] = [];
    const controller = new VisibilityController(session, {
      setWorldPaused: () => undefined,
      setResumePromptVisible: (visible) => prompts.push(visible),
    });
    controller.hidden();
    controller.visible();
    expect(controller.needsConfirmation).toBe(true);
    expect(session.currentMode()).toBe('visibilityPause');
    controller.confirmResume();
    expect(session.currentMode()).toBe(mode);
    expect(prompts.at(-1)).toBe(false);
  },
);

it.each(['won', 'lost'] as const)('%s에서는 visibility pause를 새로 얻지 않는다', (mode) => {
  const session = sessionAt(mode);
  const controller = new VisibilityController(session);
  controller.hidden();
  controller.visible();
  expect(session.currentMode()).toBe(mode);
  expect(controller.needsConfirmation).toBe(false);
});

it.each(['playing', 'countdown'] as const)(
  '%s는 visibility와 WebGL reason이 모두 해제된 뒤 복귀한다',
  (mode) => {
    const target = new EventTarget();
    const session = sessionAt(mode);
    const coordinator = new LifecyclePauseCoordinator(session, { setWorldPaused: () => undefined });
    const visibility = new VisibilityController(session, {
      setWorldPaused: () => undefined,
      setResumePromptVisible: () => undefined,
    }, () => true, coordinator);
    const webgl = new WebGlRecoveryController(target, session, {
      setWorldPaused: () => undefined,
      setRestorePromptVisible: () => undefined,
      resyncView: () => undefined,
    }, coordinator);
    webgl.attach();
    visibility.hidden();
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    visibility.visible();
    visibility.confirmResume();
    expect(session.currentMode()).toBe('visibilityPause');
    target.dispatchEvent(new Event('webglcontextrestored'));
    webgl.confirmRestore();
    expect(session.currentMode()).toBe(mode);
  },
);
