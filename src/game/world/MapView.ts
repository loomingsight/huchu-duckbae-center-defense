import Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';

export class MapView {
  readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.image = scene.add
      .image(0, 0, AssetKeys.map)
      .setOrigin(0)
      .setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)
      .setDepth(-1000);
  }
}
