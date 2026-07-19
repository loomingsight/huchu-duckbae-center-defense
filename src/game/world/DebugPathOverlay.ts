import Phaser from 'phaser';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';

export class DebugPathOverlay {
  readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(-900);
    this.graphics.lineStyle(2, 0x2563eb, 0.35);
    Object.values(PATH_DEFINITIONS).forEach((points) => {
      const first = points[0];
      if (first === undefined) return;
      this.graphics.beginPath();
      this.graphics.moveTo(first[0], first[1]);
      points.slice(1).forEach(([x, y]) => this.graphics.lineTo(x, y));
      this.graphics.strokePath();
    });
  }
}
