import type Phaser from 'phaser';
import { AssetKeys } from './AssetKeys';

const ICON_SIZE = 28;

type IconKey = typeof SKILL_ICON_KEYS[number];

export const SKILL_ICON_KEYS = [
  AssetKeys.skillBark,
  AssetKeys.skillScold,
  AssetKeys.skillAquaBeam,
  AssetKeys.skillDeokbaeHowl,
  AssetKeys.skillSafetyReport,
] as const;

export function ensureSkillIconTextures(scene: Phaser.Scene): number {
  let generated = 0;
  for (const key of SKILL_ICON_KEYS) {
    if (scene.textures.exists(key)) continue;
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    drawIcon(graphics, key);
    graphics.generateTexture(key, ICON_SIZE, ICON_SIZE);
    graphics.destroy();
    generated += 1;
  }
  return generated;
}

function drawIcon(graphics: Phaser.GameObjects.Graphics, key: IconKey): void {
  graphics.clear();
  if (key === AssetKeys.skillBark) {
    graphics
      .fillStyle(0xffef9a, 1)
      .fillCircle(9, 14, 5)
      .fillTriangle(13, 10, 24, 5, 24, 11)
      .fillTriangle(13, 14, 26, 12, 26, 18)
      .fillTriangle(13, 18, 24, 19, 24, 25);
    return;
  }
  if (key === AssetKeys.skillScold) {
    graphics
      .lineStyle(3, 0xffc96b, 1)
      .beginPath()
      .moveTo(5, 14)
      .lineTo(23, 5)
      .moveTo(5, 14)
      .lineTo(25, 14)
      .moveTo(5, 14)
      .lineTo(23, 23)
      .strokePath();
    return;
  }
  if (key === AssetKeys.skillAquaBeam) {
    graphics
      .fillStyle(0x54e4e6, 1)
      .fillRoundedRect(3, 11, 22, 6, 3)
      .fillStyle(0xc7ffff, 0.9)
      .fillRect(7, 12, 15, 2);
    return;
  }
  if (key === AssetKeys.skillDeokbaeHowl) {
    graphics
      .fillStyle(0xd5a068, 1)
      .fillCircle(14, 15, 8)
      .fillTriangle(7, 9, 4, 2, 11, 7)
      .fillTriangle(21, 9, 24, 2, 17, 7)
      .fillStyle(0x3c2c23, 1)
      .fillCircle(11, 14, 1.5)
      .fillCircle(17, 14, 1.5)
      .fillCircle(14, 18, 2);
    return;
  }
  graphics
    .fillStyle(0xffffff, 1)
    .fillRoundedRect(6, 3, 16, 22, 2)
    .lineStyle(2, 0xe75d55, 1)
    .strokeRoundedRect(6, 3, 16, 22, 2)
    .beginPath()
    .moveTo(10, 10)
    .lineTo(18, 10)
    .moveTo(10, 15)
    .lineTo(18, 15)
    .moveTo(10, 20)
    .lineTo(16, 20)
    .strokePath();
}
