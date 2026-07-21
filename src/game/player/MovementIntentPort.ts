import type { MovementIntent } from './InputVector';

const IDLE: MovementIntent = { x: 0, y: 0, magnitude: 0 };

export interface MovementIntentReader {
  read(): MovementIntent;
}

export interface MovementIntentPort extends MovementIntentReader {
  reset(): void;
}

export class KeyboardJoystickMovementIntentPort implements MovementIntentPort {
  constructor(
    private readonly keyboard: MovementIntentReader,
    private readonly joystick: MovementIntentReader,
  ) {}

  read(): MovementIntent {
    const keyboard = this.keyboard.read();
    return keyboard.magnitude > 0 ? keyboard : this.joystick.read();
  }

  reset(): void {}
}

export class MutableMovementIntentPort implements MovementIntentPort {
  private intent: MovementIntent = { ...IDLE };

  read(): MovementIntent {
    return { ...this.intent };
  }

  write(input: Readonly<{ x: number; y: number }>): void {
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
      throw new RangeError('Movement input must be finite');
    }
    const length = Math.hypot(input.x, input.y);
    if (length === 0) {
      this.reset();
      return;
    }
    const magnitude = Math.min(1, length);
    this.intent = {
      x: input.x / length * magnitude,
      y: input.y / length * magnitude,
      magnitude,
    };
  }

  reset(): void {
    this.intent = { ...IDLE };
  }
}
