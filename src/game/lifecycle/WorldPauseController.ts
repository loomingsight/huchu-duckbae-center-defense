import { GameStateMachine } from '../core/GameStateMachine';

export interface WorldRuntimePort {
  setPaused(paused: boolean): void;
}

export class WorldPauseController {
  private paused = false;

  constructor(
    private readonly state: GameStateMachine,
    private readonly runtime: WorldRuntimePort,
  ) {}

  sync(): void {
    this.setPaused(!this.state.canStepWorld());
  }

  reset(): void {
    this.state.reset('playing');
    this.paused = false;
    this.runtime.setPaused(false);
  }

  private setPaused(value: boolean): void {
    if (this.paused === value) return;
    this.paused = value;
    this.runtime.setPaused(value);
  }
}
