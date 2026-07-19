import Phaser from 'phaser';
import { keyboardVector, type MovementIntent } from './InputVector';
import {
  destroyOwnedKeys,
  MOVEMENT_KEY_CODES,
} from './KeyboardInputLifecycle';

type MovementKeyName = keyof typeof MOVEMENT_KEY_CODES;
type MovementKeys = Record<MovementKeyName, Phaser.Input.Keyboard.Key>;

export class KeyboardInput {
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin;
  private readonly keys: MovementKeys;

  constructor(scene: Phaser.Scene) {
    if (scene.input.keyboard === null) throw new Error('Keyboard input is unavailable');
    this.keyboard = scene.input.keyboard;
    this.keys = this.keyboard.addKeys(MOVEMENT_KEY_CODES, true, false) as MovementKeys;
  }

  read(): MovementIntent {
    return keyboardVector({
      left: this.keys.left.isDown || this.keys.a.isDown,
      right: this.keys.right.isDown || this.keys.d.isDown,
      up: this.keys.up.isDown || this.keys.w.isDown,
      down: this.keys.down.isDown || this.keys.s.isDown,
    });
  }

  destroy(): void {
    destroyOwnedKeys(this.keyboard, Object.values(this.keys));
  }
}
