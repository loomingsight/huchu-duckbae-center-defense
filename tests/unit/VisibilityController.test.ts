import { VisibilityController } from '../../src/game/lifecycle/VisibilityController';
import { WebGlRecoveryController } from '../../src/game/lifecycle/WebGlRecoveryController';
import { LifecyclePauseCoordinator } from '../../src/game/lifecycle/LifecyclePauseCoordinator';
import { GameSession } from '../../src/game/session/GameSession';

function createRuntime() {
  const worldPaused: boolean[] = [];
  const prompts: boolean[] = [];
  return {
    runtime: {
      setWorldPaused: (paused: boolean) => worldPaused.push(paused),
      setResumePromptVisible: (visible: boolean) => prompts.push(visible),
    },
    worldPaused,
    prompts,
  };
}

it('playing에서 숨기면 실제 사용자 확인 전까지 멈췄다가 같은 mode로 돌아간다', () => {
  const session = GameSession.create({ seed: 1 });
  const { runtime, worldPaused, prompts } = createRuntime();
  const controller = new VisibilityController(session, runtime);

  controller.hidden();
  controller.visible();

  expect(session.currentMode()).toBe('visibilityPause');
  expect(controller.needsConfirmation).toBe(true);
  expect(prompts.at(-1)).toBe(true);
  controller.confirmResume();
  expect(session.currentMode()).toBe('playing');
  expect(worldPaused.at(-1)).toBe(false);
  expect(prompts.at(-1)).toBe(false);
});

it('countdown은 숨김 전 mode를 보존하고 확인 뒤 world만 멈춘다', () => {
  const session = GameSession.create({ seed: 1 });
  session.forceModeForTest('countdown');
  const { runtime, worldPaused } = createRuntime();
  const controller = new VisibilityController(session, runtime);

  controller.hidden();
  controller.visible();
  controller.confirmResume();

  expect(session.currentMode()).toBe('countdown');
  expect(worldPaused.at(-1)).toBe(true);
});

it('skill selection 중 복귀하면 확인 prompt 없이 같은 modal mode에서 즉시 계속한다', () => {
  const session = GameSession.create({ seed: 1 });
  session.forceModeForTest('skillSelection');
  const { runtime, worldPaused, prompts } = createRuntime();
  const controller = new VisibilityController(session, runtime);

  controller.hidden();
  controller.visible();

  expect(session.currentMode()).toBe('skillSelection');
  expect(controller.needsConfirmation).toBe(false);
  expect(prompts.at(-1)).toBe(false);
  expect(worldPaused.at(-1)).toBe(true);
});

it('visibility pause 중 잃은 WebGL context가 복구되기 전에는 확인해도 재개하지 않는다', () => {
  const target = new EventTarget();
  const session = GameSession.create({ seed: 1 });
  const { runtime, prompts } = createRuntime();
  const coordinator = new LifecyclePauseCoordinator(session, runtime);
  const webgl = new WebGlRecoveryController(target, session, {
    setWorldPaused: runtime.setWorldPaused,
    setRestorePromptVisible: () => undefined,
    resyncView: () => undefined,
  }, coordinator);
  const visibility = new VisibilityController(
    session,
    runtime,
    () => webgl.contextAvailable,
    coordinator,
  );
  webgl.attach();

  visibility.hidden();
  target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  visibility.visible();
  visibility.confirmResume();

  expect(session.currentMode()).toBe('visibilityPause');
  expect(prompts.at(-1)).toBe(false);

  target.dispatchEvent(new Event('webglcontextrestored'));
  webgl.confirmRestore();
  expect(session.currentMode()).toBe('playing');
});

type RecoverableMode = 'playing' | 'countdown' | 'skillSelection';

function createCoordinatedHarness(mode: RecoverableMode) {
  const target = new EventTarget();
  const session = GameSession.create({ seed: 1 });
  session.forceModeForTest(mode);
  const worldPaused: boolean[] = [];
  const resumePrompts: boolean[] = [];
  const restorePrompts: boolean[] = [];
  const coordinator = new LifecyclePauseCoordinator(session, {
    setWorldPaused: (paused) => worldPaused.push(paused),
  });
  const visibility = new VisibilityController(session, {
    setWorldPaused: (paused) => worldPaused.push(paused),
    setResumePromptVisible: (visible) => resumePrompts.push(visible),
  }, () => true, coordinator);
  const webgl = new WebGlRecoveryController(target, session, {
    setWorldPaused: (paused) => worldPaused.push(paused),
    setRestorePromptVisible: (visible) => restorePrompts.push(visible),
    resyncView: () => undefined,
  }, coordinator);
  webgl.attach();
  return {
    coordinator,
    restorePrompts,
    resumePrompts,
    session,
    target,
    visibility,
    webgl,
    worldPaused,
  };
}

it.each<RecoverableMode>(['playing', 'countdown', 'skillSelection'])(
  'WebGL→visibility 순서에서 %s는 두 reason이 모두 해제된 뒤 복귀한다',
  (mode) => {
    const { session, target, visibility, webgl, worldPaused } = createCoordinatedHarness(mode);

    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    visibility.hidden();
    target.dispatchEvent(new Event('webglcontextrestored'));
    if (mode !== 'skillSelection') webgl.confirmRestore();

    expect(session.currentMode()).toBe('visibilityPause');
    visibility.visible();
    if (mode !== 'skillSelection') visibility.confirmResume();

    expect(session.currentMode()).toBe(mode);
    expect(worldPaused.at(-1)).toBe(mode !== 'playing');
  },
);

it.each<RecoverableMode>(['playing', 'countdown', 'skillSelection'])(
  'visibility→WebGL 순서에서 %s는 두 reason이 모두 해제된 뒤 복귀한다',
  (mode) => {
    const { session, target, visibility, webgl, worldPaused } = createCoordinatedHarness(mode);

    visibility.hidden();
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    visibility.visible();
    if (mode !== 'skillSelection') visibility.confirmResume();

    expect(session.currentMode()).toBe('visibilityPause');
    target.dispatchEvent(new Event('webglcontextrestored'));
    if (mode !== 'skillSelection') webgl.confirmRestore();

    expect(session.currentMode()).toBe(mode);
    expect(worldPaused.at(-1)).toBe(mode !== 'playing');
  },
);
