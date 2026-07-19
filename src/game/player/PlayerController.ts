import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import type { MovementIntent } from './InputVector';
import type { PlayerSnapshot } from './PlayerTypes';

const PLAYER_SPEED_PX_PER_SECOND = 150;

export class PlayerController {
  constructor(private position: { x: number; y: number }) {
    assertFinite(position.x, 'player x');
    assertFinite(position.y, 'player y');
  }

  step(stepMs: number, intent: MovementIntent): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('player step must be finite and non-negative');
    }
    assertFinite(intent.x, 'movement intent x');
    assertFinite(intent.y, 'movement intent y');
    assertFinite(intent.magnitude, 'movement intent magnitude');
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

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}
