import { expect, it } from 'vitest';
import { LifecyclePauseCoordinator } from '../../src/game/lifecycle/LifecyclePauseCoordinator';
import { GameSession } from '../../src/game/session/GameSession';

it('canvas input은 모든 lifecycle pause reason이 해제된 마지막 순간에만 연다', () => {
  const session = GameSession.create({ seed: 1 });
  const canvasInput: boolean[] = [];
  const coordinator = new LifecyclePauseCoordinator(session, {
    setWorldPaused: () => undefined,
    setCanvasInputEnabled: (enabled: boolean) => canvasInput.push(enabled),
  });

  coordinator.acquire('webgl');
  coordinator.acquire('visibility');
  coordinator.release('webgl');

  expect(session.currentMode()).toBe('visibilityPause');
  expect(canvasInput.at(-1)).toBe(false);

  coordinator.release('visibility');
  expect(session.currentMode()).toBe('playing');
  expect(canvasInput.at(-1)).toBe(true);
});

it('audio lifecycle은 첫 reason에서 한 번 pause하고 마지막 reason에서 한 번 resume한다', () => {
  const session = GameSession.create({ seed: 2 });
  const audioPaused: boolean[] = [];
  const coordinator = new LifecyclePauseCoordinator(session, {
    setWorldPaused: () => undefined,
    setAudioLifecyclePaused: (paused) => audioPaused.push(paused),
  });

  expect(coordinator.acquire('visibility')).toBe(true);
  expect(coordinator.acquire('visibility')).toBe(true);
  expect(coordinator.acquire('webgl')).toBe(true);
  expect(audioPaused).toEqual([true]);

  expect(coordinator.release('visibility')).toBe(false);
  expect(audioPaused).toEqual([true]);
  expect(coordinator.release('webgl')).toBe(true);
  expect(audioPaused).toEqual([true, false]);
});
