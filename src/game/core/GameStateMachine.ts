import type { GameMode } from './GameMode';

const WORLD_MODES = new Set<GameMode>(['playing']);

export class GameStateMachine {
  private resumeState: GameMode | null = null;

  constructor(private mode: GameMode = 'playing') {}

  current(): GameMode {
    return this.mode;
  }

  canStepWorld(): boolean {
    return WORLD_MODES.has(this.mode);
  }

  transition(next: GameMode): void {
    if (this.mode === 'won' || this.mode === 'lost') return;
    this.mode = next;
  }

  hide(): void {
    this.resumeState = this.mode;
    this.mode = 'visibilityPause';
  }

  resume(): GameMode {
    this.mode = this.resumeState ?? 'playing';
    this.resumeState = null;
    return this.mode;
  }

  reset(mode: GameMode = 'playing'): void {
    this.mode = mode;
    this.resumeState = null;
  }
}
