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
  expect(canvasInput.at(-1)).toBe(true);
  expect(controller.needsConfirmation).toBe(true);
  expect(prompts.at(-1)).toBe(true);

  controller.confirmRestore();

  expect(sequence).toEqual(['resync:visibilityPause']);
  expect(session.currentMode()).toBe('playing');
  expect(worldPaused.at(-1)).toBe(false);
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
