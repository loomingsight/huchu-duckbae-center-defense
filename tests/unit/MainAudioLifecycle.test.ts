import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  let destroyHandler: (() => void) | undefined;
  const audio = { destroy: vi.fn(async () => undefined) };
  const game = {
    events: {
      once: vi.fn((_event: string, handler: () => void) => {
        destroyHandler = handler;
      }),
    },
    registry: { get: vi.fn(() => audio) },
  };
  return {
    audio,
    game,
    createGame: vi.fn(() => game),
    destroyHandler: () => destroyHandler,
    reset: () => { destroyHandler = undefined; },
  };
});

vi.mock('phaser', () => ({
  default: { Core: { Events: { DESTROY: 'destroy' } } },
}));

vi.mock('../../src/game/createGame', () => ({
  createGame: harness.createGame,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  harness.reset();
  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({
      getContext: vi.fn(() => ({})),
    })),
  });
});

afterEach(() => vi.unstubAllGlobals());

it('actual Phaser Game DESTROY event에서 registry audio singleton을 정확히 한 번 destroy한다', async () => {
  await import('../../src/main');

  expect(harness.createGame).toHaveBeenCalledTimes(1);
  expect(harness.game.events.once).toHaveBeenCalledWith('destroy', expect.any(Function));
  const destroy = harness.destroyHandler();
  expect(destroy).toBeDefined();
  destroy?.();
  destroy?.();

  expect(harness.game.registry.get).toHaveBeenCalledWith('huchu-defense:audio');
  expect(harness.audio.destroy).toHaveBeenCalledTimes(1);
});
