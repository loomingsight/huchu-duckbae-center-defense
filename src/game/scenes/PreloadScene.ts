import Phaser from 'phaser';
import { imageAssets, spriteSheetAssets } from '../assets/assetManifest';

export class PreloadScene extends Phaser.Scene {
  private failedFiles = 0;

  constructor() {
    super('Preload');
  }

  init(): void {
    this.failedFiles = 0;
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    imageAssets.forEach((asset) => this.load.image(asset.key, asset.url));
    spriteSheetAssets.forEach(({ key, url, frameWidth, frameHeight }) => {
      this.load.spritesheet(key, url, { frameWidth, frameHeight });
    });
  }

  create(): void {
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    if (this.failedFiles === 0) {
      this.scene.start('Title');
      return;
    }
    this.add
      .text(270, 390, `필수 그림 ${this.failedFiles}개를 불러오지 못했어요`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#5b2117',
        align: 'center',
        wordWrap: { width: 440 },
      })
      .setOrigin(0.5);
    const retry = this.add
      .dom(270, 530)
      .createFromHTML('<button type="button" class="primary-game-button">다시 시도</button>');
    retry.addListener('click').once('click', () => this.scene.restart());
  }

  private onLoadError(): void {
    this.failedFiles += 1;
  }
}
