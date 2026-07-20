import Phaser from 'phaser';
import {
  imageAssets,
  requiredAssetFailureCount,
  requiredTextureKeys,
  spriteSheetAssets,
} from '../assets/assetManifest';
import { RuntimeErrorOverlay } from '../ui/RuntimeErrorOverlay';

export class PreloadScene extends Phaser.Scene {
  private readonly failedFiles = new Set<string>();
  private errorOverlay: RuntimeErrorOverlay | undefined;

  constructor() {
    super('Preload');
  }

  init(): void {
    this.failedFiles.clear();
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupRuntime, this);
    imageAssets.forEach((asset) => {
      if (!this.textures.exists(asset.key)) this.load.image(asset.key, asset.url);
    });
    spriteSheetAssets.forEach(({ key, url, frameWidth, frameHeight }) => {
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, url, { frameWidth, frameHeight });
      }
    });
  }

  create(): void {
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    const failedFiles = requiredAssetFailureCount(
      requiredTextureKeys,
      (key) => this.textures.exists(key),
      this.failedFiles,
    );
    if (failedFiles === 0) {
      this.scene.start('Title');
      return;
    }
    this.errorOverlay = new RuntimeErrorOverlay(this);
    this.errorOverlay.show(
      `필수 그림 ${failedFiles}개를 불러오지 못했어요`,
      '네트워크 연결을 확인한 뒤 다시 시도해 주세요',
      { label: '다시 시도', onSelect: () => this.scene.restart() },
    );
  }

  private onLoadError(file: Phaser.Loader.File): void {
    this.failedFiles.add(file.key);
  }

  private cleanupRuntime(): void {
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    this.errorOverlay?.destroy();
    this.errorOverlay = undefined;
  }
}
