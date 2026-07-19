import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    const root = document.querySelector('#game-root');
    root?.setAttribute('data-scene', 'Game');
    root?.setAttribute('data-renderer', this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'other');
  }
}
