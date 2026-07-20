import { WebGlRecoveryController } from '../../src/game/lifecycle/WebGlRecoveryController';
import { GameSession } from '../../src/game/session/GameSession';

function createHarness(mode: 'playing' | 'countdown' | 'skillSelection' = 'playing') {
  const target = new EventTarget();
  const session = GameSession.create({ seed: 1 });
  session.forceModeForTest(mode);
  const prompts: boolean[] = [];
  const worldPaused: boolean[] = [];
  const contextLost: boolean[] = [];
  const canvasInput: boolean[] = [];
  const sequence: string[] = [];
  const controller = new WebGlRecoveryController(target, session, {
    setWorldPaused: (paused) => worldPaused.push(paused),
    setRestorePromptVisible: (visible) => prompts.push(visible),
    setContextLostVisible: (visible) => contextLost.push(visible),
    setCanvasInputEnabled: (enabled) => canvasInput.push(enabled),
    resyncView: () => sequence.push(`resync:${session.currentMode()}`),
  });
  return { canvasInput, contextLost, controller, prompts, sequence, session, target, worldPaused };
}

it('context lost를 preventDefault하고 restore 확인 때 snapshot view를 먼저 동기화한다', () => {
  const { canvasInput, contextLost, controller, prompts, sequence, session, target, worldPaused } = createHarness();
  controller.attach();

  const lost = new Event('webglcontextlost', { cancelable: true });
  target.dispatchEvent(lost);

  expect(lost.defaultPrevented).toBe(true);
  expect(session.currentMode()).toBe('visibilityPause');
  expect(worldPaused.at(-1)).toBe(true);
  expect(canvasInput.at(-1)).toBe(false);
  expect(contextLost.at(-1)).toBe(true);
  target.dispatchEvent(new Event('webglcontextrestored'));
  expect(contextLost.at(-1)).toBe(false);
  expect(canvasInput.at(-1)).toBe(false);
  expect(controller.needsConfirmation).toBe(true);
  expect(prompts.at(-1)).toBe(true);

  controller.confirmRestore();

  expect(sequence).toEqual(['resync:visibilityPause']);
  expect(session.currentMode()).toBe('playing');
  expect(worldPaused.at(-1)).toBe(false);
  expect(canvasInput.at(-1)).toBe(true);
  expect(prompts.at(-1)).toBe(false);
});

it('countdown은 확인 뒤 UI clock mode로 돌아가고 world는 계속 멈춘다', () => {
  const { controller, session, target, worldPaused } = createHarness('countdown');
  controller.attach();

  target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  target.dispatchEvent(new Event('webglcontextrestored'));
  controller.confirmRestore();

  expect(session.currentMode()).toBe('countdown');
  expect(worldPaused.at(-1)).toBe(true);
});

it('skill selection은 context 복구 즉시 기존 modal mode로 돌아간다', () => {
  const { controller, prompts, sequence, session, target, worldPaused } = createHarness('skillSelection');
  controller.attach();

  target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  target.dispatchEvent(new Event('webglcontextrestored'));

  expect(controller.needsConfirmation).toBe(false);
  expect(session.currentMode()).toBe('skillSelection');
  expect(sequence).toEqual(['resync:visibilityPause']);
  expect(prompts.at(-1)).toBe(false);
  expect(worldPaused.at(-1)).toBe(true);
});

it('detach 뒤에는 context event를 처리하지 않는다', () => {
  const { controller, session, target } = createHarness();
  controller.attach();
  controller.detach();

  const lost = new Event('webglcontextlost', { cancelable: true });
  target.dispatchEvent(lost);

  expect(lost.defaultPrevented).toBe(false);
  expect(session.currentMode()).toBe('playing');
});

it('context가 아직 lost인 reset은 canvas input을 다시 켜지 않는다', () => {
  const { canvasInput, controller, target } = createHarness();
  controller.attach();
  target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));

  controller.reset();

  expect(controller.contextAvailable).toBe(false);
  expect(canvasInput.at(-1)).toBe(false);
});

it('반복 loss 뒤 이전 restore 확인은 현재 recovery generation을 해제하지 않는다', () => {
  const { canvasInput, controller, prompts, session, target } = createHarness();
  controller.attach();

  target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  target.dispatchEvent(new Event('webglcontextrestored'));
  expect(controller.needsConfirmation).toBe(true);
  const staleGeneration = controller.confirmationGeneration;

  target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  expect(controller.needsConfirmation).toBe(false);
  expect(prompts.at(-1)).toBe(false);

  controller.confirmRestore(staleGeneration);
  expect(controller.contextAvailable).toBe(false);
  expect(session.currentMode()).toBe('visibilityPause');
  expect(canvasInput.at(-1)).toBe(false);

  target.dispatchEvent(new Event('webglcontextrestored'));
  expect(controller.needsConfirmation).toBe(true);
  controller.confirmRestore(staleGeneration);
  expect(session.currentMode()).toBe('visibilityPause');
  controller.confirmRestore();
  expect(session.currentMode()).toBe('playing');
});

it('terminal mode에서 잃은 context는 새 session을 즉시 pause하고 복구 확인 뒤 시작한다', () => {
  const { canvasInput, controller, session, target, worldPaused } = createHarness();
  controller.attach();
  session.forceModeForTest('lost');

  target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  controller.reset();
  session.reset(2);
  controller.beginSession();

  expect(controller.contextAvailable).toBe(false);
  expect(session.currentMode()).toBe('visibilityPause');
  expect(worldPaused.at(-1)).toBe(true);
  expect(canvasInput.at(-1)).toBe(false);

  target.dispatchEvent(new Event('webglcontextrestored'));
  expect(controller.needsConfirmation).toBe(true);
  controller.confirmRestore();
  expect(session.currentMode()).toBe('playing');
  expect(worldPaused.at(-1)).toBe(false);
});

it('같은 canvas의 context availability는 controller 재생성 뒤에도 유지한다', () => {
  const first = createHarness();
  first.controller.attach();
  first.target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  first.controller.detach();
  first.controller.reset();

  const session = GameSession.create({ seed: 2 });
  const prompts: boolean[] = [];
  const second = new WebGlRecoveryController(first.target, session, {
    setWorldPaused: () => undefined,
    setRestorePromptVisible: (visible) => prompts.push(visible),
    setCanvasInputEnabled: () => undefined,
    resyncView: () => undefined,
  });
  second.attach();
  second.beginSession();

  expect(second.contextAvailable).toBe(false);
  expect(session.currentMode()).toBe('visibilityPause');
  first.target.dispatchEvent(new Event('webglcontextrestored'));
  expect(prompts.at(-1)).toBe(true);
  second.confirmRestore();
  expect(session.currentMode()).toBe('playing');
});
