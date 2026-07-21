import type Phaser from 'phaser';
import { AssetKeys } from './AssetKeys';
import type { ProjectileKind } from '../combat/ProjectileSystem';

export const COMBAT_SHAPE_FRAME_SIZE = 40;
export const IMPACT_SHAPE_FRAME_SIZE = 56;
export const SAFETY_REPORT_FRAME_WIDTH = 80;
export const SAFETY_REPORT_FRAME_HEIGHT = IMPACT_SHAPE_FRAME_SIZE;
export const SAFETY_REPORT_FRAME = 'safety-report' as const;
export const COMBAT_SHAPE_ATLAS_WIDTH = COMBAT_SHAPE_FRAME_SIZE * 3
  + IMPACT_SHAPE_FRAME_SIZE * 12
  + SAFETY_REPORT_FRAME_WIDTH;
export const COMBAT_SHAPE_ATLAS_HEIGHT = IMPACT_SHAPE_FRAME_SIZE;

export const IMPACT_SHAPE_PHASES = [0, 1, 2, 3] as const;
export type ImpactShapePhase = typeof IMPACT_SHAPE_PHASES[number];

export const COMBAT_SHAPE_FRAMES = [
  'projectile-poop',
  'projectile-net',
  'projectile-electric',
  'impact-poop-0',
  'impact-poop-1',
  'impact-poop-2',
  'impact-poop-3',
  'impact-net-0',
  'impact-net-1',
  'impact-net-2',
  'impact-net-3',
  'impact-electric-0',
  'impact-electric-1',
  'impact-electric-2',
  'impact-electric-3',
  SAFETY_REPORT_FRAME,
] as const;

export type CombatShapeFrame = typeof COMBAT_SHAPE_FRAMES[number];

const PROJECTILE_FRAME_BY_KIND = {
  poop: 'projectile-poop',
  net: 'projectile-net',
  electric: 'projectile-electric',
} as const satisfies Record<ProjectileKind, CombatShapeFrame>;

const IMPACT_FRAME_BY_KIND = {
  poop: ['impact-poop-0', 'impact-poop-1', 'impact-poop-2', 'impact-poop-3'],
  net: ['impact-net-0', 'impact-net-1', 'impact-net-2', 'impact-net-3'],
  electric: ['impact-electric-0', 'impact-electric-1', 'impact-electric-2', 'impact-electric-3'],
} as const satisfies Record<ProjectileKind, readonly CombatShapeFrame[]>;

export function projectileShapeFrame(kind: ProjectileKind): CombatShapeFrame {
  return PROJECTILE_FRAME_BY_KIND[kind];
}

export function impactShapeFrame(
  kind: ProjectileKind,
  phase: ImpactShapePhase = 0,
): CombatShapeFrame {
  return IMPACT_FRAME_BY_KIND[kind][phase];
}

export function ensureCombatShapeAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(AssetKeys.combatShapes)) {
    assertCompleteAtlas(scene);
    return;
  }

  const graphics = scene.make.graphics(
    { add: false } as Phaser.Types.GameObjects.Graphics.Options,
  );
  try {
    drawProjectileShapes(graphics);
    drawImpactShapes(graphics);
    drawSafetyReportGlyph(graphics);
    graphics.generateTexture(
      AssetKeys.combatShapes,
      COMBAT_SHAPE_ATLAS_WIDTH,
      COMBAT_SHAPE_ATLAS_HEIGHT,
    );
    const texture = scene.textures.get(AssetKeys.combatShapes);
    COMBAT_SHAPE_FRAMES.forEach((name, index) => {
      const impactIndex = index - 3;
      const isImpact = impactIndex >= 0 && impactIndex < 12;
      const isSafetyReport = name === SAFETY_REPORT_FRAME;
      const frame = texture.add(
        name,
        0,
        isSafetyReport
          ? COMBAT_SHAPE_FRAME_SIZE * 3 + IMPACT_SHAPE_FRAME_SIZE * 12
          : isImpact
          ? COMBAT_SHAPE_FRAME_SIZE * 3 + impactIndex * IMPACT_SHAPE_FRAME_SIZE
          : index * COMBAT_SHAPE_FRAME_SIZE,
        0,
        isSafetyReport
          ? SAFETY_REPORT_FRAME_WIDTH
          : isImpact ? IMPACT_SHAPE_FRAME_SIZE : COMBAT_SHAPE_FRAME_SIZE,
        isSafetyReport
          ? SAFETY_REPORT_FRAME_HEIGHT
          : isImpact ? IMPACT_SHAPE_FRAME_SIZE : COMBAT_SHAPE_FRAME_SIZE,
      );
      if (frame === null) throw new Error(`Combat shape atlas could not add frame ${name}`);
    });
    assertCompleteAtlas(scene);
  } catch (error) {
    if (scene.textures.exists(AssetKeys.combatShapes)) {
      scene.textures.remove(AssetKeys.combatShapes);
    }
    throw error;
  } finally {
    graphics.destroy();
  }
}

function drawProjectileShapes(graphics: Phaser.GameObjects.Graphics): void {
  graphics
    .fillStyle(0x75421f, 1)
    .fillCircle(17, 22, 5)
    .fillCircle(22, 20, 5)
    .fillStyle(0xd39b5d, 0.8)
    .fillCircle(21, 18, 1.5);

  graphics
    .lineStyle(2, 0xf1d57a, 1)
    .strokeCircle(60, 20, 10)
    .beginPath()
    .moveTo(53, 13)
    .lineTo(67, 27)
    .moveTo(67, 13)
    .lineTo(53, 27)
    .strokePath();

  graphics
    .lineStyle(4, 0x55f4ef, 1)
    .beginPath()
    .moveTo(90, 16)
    .lineTo(97, 19)
    .lineTo(94, 28)
    .lineTo(110, 15)
    .lineTo(103, 19)
    .lineTo(106, 12)
    .strokePath();
}

function drawImpactShapes(graphics: Phaser.GameObjects.Graphics): void {
  const scales = [0.75, 1, 1.2, 1.4] as const;
  const kinds = ['poop', 'net', 'electric'] as const satisfies readonly ProjectileKind[];
  for (const [kindIndex, kind] of kinds.entries()) {
    for (const [phase, scale] of scales.entries()) {
      const impactIndex = kindIndex * scales.length + phase;
      const centerX = COMBAT_SHAPE_FRAME_SIZE * 3
        + impactIndex * IMPACT_SHAPE_FRAME_SIZE
        + IMPACT_SHAPE_FRAME_SIZE / 2;
      const centerY = IMPACT_SHAPE_FRAME_SIZE / 2;
      if (kind === 'poop') {
        graphics
          .fillStyle(0x75421f, 1)
          .fillEllipse(centerX, centerY, 18 * scale, 8 * scale);
      } else if (kind === 'net') {
        graphics
          .lineStyle(3 * scale, 0xf1d57a, 1)
          .strokeCircle(centerX, centerY, 16 * scale);
      } else {
        graphics
          .lineStyle(4 * scale, 0x55f4ef, 1)
          .strokeCircle(centerX, centerY, 14 * scale);
      }
    }
  }
}

function drawSafetyReportGlyph(graphics: Phaser.GameObjects.Graphics): void {
  const x = COMBAT_SHAPE_FRAME_SIZE * 3 + IMPACT_SHAPE_FRAME_SIZE * 12;
  const orange = 0xff6b35;
  graphics.fillStyle(orange, 1);

  // 신: ㅅ + ㅣ + 받침 ㄴ
  for (const [left, top] of [[12, 5], [9, 10], [6, 15], [3, 20]] as const) {
    graphics.fillRect(x + left, top, 6, 6);
  }
  for (const [left, top] of [[15, 10], [18, 15], [21, 20]] as const) {
    graphics.fillRect(x + left, top, 6, 6);
  }
  graphics
    .fillRect(x + 26, 5, 6, 21)
    .fillRect(x + 6, 29, 6, 18)
    .fillRect(x + 6, 41, 27, 6);

  // 고: ㄱ + ㅗ
  graphics
    .fillRect(x + 36, 7, 22, 6)
    .fillRect(x + 52, 7, 6, 20)
    .fillRect(x + 45, 26, 6, 18)
    .fillRect(x + 35, 38, 29, 6);

  // 느낌표
  graphics
    .fillRect(x + 68, 8, 7, 30)
    .fillRect(x + 68, 43, 7, 7);
}

function assertCompleteAtlas(scene: Phaser.Scene): void {
  const texture = scene.textures.get(AssetKeys.combatShapes);
  for (const frame of COMBAT_SHAPE_FRAMES) {
    if (!texture.has(frame)) throw new Error(`Combat shape atlas is missing frame ${frame}`);
  }
}
