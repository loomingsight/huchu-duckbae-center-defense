import type { GameMode } from '../core/GameMode';

export type GameEvent =
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'runEnded'; readonly outcome: 'won' | 'lost' };
