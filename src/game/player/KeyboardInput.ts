import Phaser from 'phaser';
import { keyboardVector, type MovementIntent } from './InputVector';

type WasdKeys = Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class KeyboardInput {
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: WasdKeys;

  constructor(scene: Phaser.Scene) {
    if (scene.input.keyboard === null) throw new Error('Keyboard input is unavailable');
    this.keyboard = scene.input.keyboard;
    this.cursors = this.keyboard.createCursorKeys();
    this.wasd = this.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
    }) as WasdKeys;
  }

  read(): MovementIntent {
    return keyboardVector({
      left: this.cursors.left.isDown || this.wasd.a.isDown,
      right: this.cursors.right.isDown || this.wasd.d.isDown,
      up: this.cursors.up.isDown || this.wasd.w.isDown,
      down: this.cursors.down.isDown || this.wasd.s.isDown,
    });
  }

  destroy(): void {
    [...Object.values(this.wasd), ...Object.values(this.cursors)].forEach((key) => {
      if (key !== undefined) this.keyboard.removeKey(key.keyCode, false);
    });
  }
}
