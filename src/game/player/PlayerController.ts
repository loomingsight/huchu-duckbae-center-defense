import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import type { MovementIntent } from './InputVector';
import type { PlayerSnapshot } from './PlayerTypes';

const PLAYER_SPEED_PX_PER_SECOND = 150;

export class PlayerController {
  constructor(private position: { x: number; y: number }) {}

  step(stepMs: number, intent: MovementIntent): void {
    const distance = PLAYER_SPEED_PX_PER_SECOND * (stepMs / 1000);
    this.position.x = clamp(this.position.x + intent.x * distance, 0, WORLD_WIDTH);
    this.position.y = clamp(this.position.y + intent.y * distance, 0, WORLD_HEIGHT);
  }

  snapshot(): PlayerSnapshot {
    return { ...this.position };
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
