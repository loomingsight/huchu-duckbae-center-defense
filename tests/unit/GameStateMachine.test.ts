import { expect, it } from 'vitest';
import { GameStateMachine } from '../../src/game/core/GameStateMachine';

it.each(['skillSelection', 'countdown', 'visibilityPause', 'won', 'lost'] as const)(
  '%s에서는 월드가 진행되지 않는다',
  (mode) => expect(new GameStateMachine(mode).canStepWorld()).toBe(false),
);
