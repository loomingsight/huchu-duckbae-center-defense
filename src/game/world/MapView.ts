import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';

export class MapView {
  readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.image = scene.add
      .image(0, 0, AssetKeys.map)
      .setOrigin(0)
      .setDisplaySize(HUCHU_PRESENTATION.logicalWidth, HUCHU_PRESENTATION.logicalHeight)
      .setDepth(-1000);
  }
}
