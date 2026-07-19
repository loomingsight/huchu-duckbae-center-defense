import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      throw new Error('WebGL renderer is required.');
    }
    this.scene.start('Preload');
  }
}
