import Phaser from 'phaser';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import { validateGameData } from '../data/validateGameData';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      throw new Error('WebGL renderer is required.');
    }

    const errors = validateGameData({ paths: PATH_DEFINITIONS, waves: WAVE_DEFINITIONS });
    if (errors.length > 0) {
      this.add
        .text(270, 480, `잘못된 게임 데이터: ${errors[0]}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '20px',
          color: '#5b2117',
          align: 'center',
          wordWrap: { width: 440 },
        })
        .setOrigin(0.5);
      return;
    }

    this.scene.start('Preload');
  }
}
