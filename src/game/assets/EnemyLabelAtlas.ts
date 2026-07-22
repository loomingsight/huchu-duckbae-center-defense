import type Phaser from 'phaser';
import {
  ENEMY_HP_BAR_BACKGROUND_ALPHA,
  ENEMY_HP_BAR_BACKGROUND_COLOR,
  ENEMY_HP_BAR_HEIGHT,
  ENEMY_HP_BAR_WIDTH,
  enemyHpStepColor,
} from '../enemies/EnemyHpBar';
import { AssetKeys } from './AssetKeys';

export const ENEMY_LABEL_FONT_PX = 14;
export const ENEMY_LABEL_STROKE_PX = 1;
export const ENEMY_LABEL_BACKGROUND = '#f7edcf';
export const ENEMY_LABEL_ATLAS_MAX_WIDTH = 2048;

export const ENEMY_LABEL_NAMES = [
  '똥 방치러',
  '오프리시 빌런',
  '개장수',
  '불법번식업자',
] as const;

export type EnemyLabelName = typeof ENEMY_LABEL_NAMES[number];

export const ENEMY_LABEL_ATLAS_FRAMES: readonly string[] = Object.freeze(
  ENEMY_LABEL_NAMES.flatMap((displayName) => (
    Array.from({ length: ENEMY_HP_BAR_WIDTH + 1 }, (_, hpStep) => (
      enemyLabelAtlasFrame(displayName, hpStep)
    ))
  )),
);

export const ENEMY_LABEL_TEXT_STYLE = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: `${ENEMY_LABEL_FONT_PX}px`,
  color: '#2f251f',
  stroke: '#17120f',
  strokeThickness: ENEMY_LABEL_STROKE_PX,
  backgroundColor: ENEMY_LABEL_BACKGROUND,
  padding: { x: 3, y: 1 },
} as const;

export interface EnemyLabelCombinedFrameData {
  readonly displayName: EnemyLabelName;
  readonly hpStep: number;
  readonly nameWidth: number;
  readonly nameHeight: number;
  readonly combinedWidth: number;
  readonly combinedHeight: number;
  readonly nameOffsetX: number;
  readonly nameOffsetY: number;
  readonly hpOffsetX: number;
  readonly hpOffsetY: 0;
}

const FRAME_GUTTER_PX = 1;
const NAME_CENTER_FROM_HP_TOP = 14;

interface RasterizedLabel {
  readonly displayName: EnemyLabelName;
  readonly text: Phaser.GameObjects.Text;
  readonly width: number;
  readonly height: number;
}

interface CombinedFramePlacement {
  readonly frameName: string;
  readonly x: number;
  readonly y: number;
  readonly data: EnemyLabelCombinedFrameData;
  readonly label: RasterizedLabel;
}

export function enemyLabelAtlasFrame(displayName: string, hpStep = 0): string {
  const name = ENEMY_LABEL_NAMES.find((candidate) => candidate === displayName);
  if (name === undefined) throw new RangeError(`Unknown enemy label frame ${displayName}`);
  if (!Number.isSafeInteger(hpStep) || hpStep < 0 || hpStep > ENEMY_HP_BAR_WIDTH) {
    throw new RangeError('Enemy label HP step must be a safe integer from 0 to 30');
  }
  return `${name}::hp-${hpStep}`;
}

export function enemyLabelCombinedFrameData(
  frame: Phaser.Textures.Frame,
  expectedName?: string,
  expectedHpStep?: number,
): EnemyLabelCombinedFrameData {
  const data = frame.customData as Partial<EnemyLabelCombinedFrameData> | null;
  if (
    data === null
    || !ENEMY_LABEL_NAMES.some((name) => name === data.displayName)
    || !Number.isSafeInteger(data.hpStep)
    || data.hpStep! < 0
    || data.hpStep! > ENEMY_HP_BAR_WIDTH
    || !positiveFinite(data.nameWidth)
    || !positiveFinite(data.nameHeight)
    || !positiveFinite(data.combinedWidth)
    || !positiveFinite(data.combinedHeight)
    || !nonNegativeFinite(data.nameOffsetX)
    || !nonNegativeFinite(data.nameOffsetY)
    || !nonNegativeFinite(data.hpOffsetX)
    || data.hpOffsetY !== 0
    || frame.width !== data.combinedWidth
    || frame.height !== data.combinedHeight
    || (expectedName !== undefined && data.displayName !== expectedName)
    || (expectedHpStep !== undefined && data.hpStep !== expectedHpStep)
  ) {
    throw new Error(`Enemy label combined frame ${frame.name} has invalid metadata`);
  }
  return data as EnemyLabelCombinedFrameData;
}

export function ensureEnemyLabelAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(AssetKeys.enemyLabels)) {
    assertCompleteAtlas(scene);
    return;
  }

  const labels: RasterizedLabel[] = [];
  const createdTexts: Phaser.GameObjects.Text[] = [];
  let createdAtlas = false;
  try {
    for (const displayName of ENEMY_LABEL_NAMES) {
      const text = scene.make.text({
        x: 0,
        y: 0,
        text: displayName,
        style: ENEMY_LABEL_TEXT_STYLE,
        add: false,
      }, false);
      createdTexts.push(text);
      const width = Math.ceil(text.width);
      const height = Math.ceil(text.height);
      if (width <= 0 || height <= 0) {
        throw new Error(`Enemy label frame ${displayName} has invalid raster dimensions`);
      }
      labels.push({ displayName, text, width, height });
    }

    const packed = packCombinedFrames(labels);
    const atlas = scene.textures.createCanvas(
      AssetKeys.enemyLabels,
      packed.width,
      packed.height,
    );
    if (atlas === null) throw new Error('Enemy label atlas canvas could not be created');
    createdAtlas = true;

    for (const placement of packed.placements) {
      drawCombinedFrame(atlas.context, placement);
      const frame = atlas.add(
        placement.frameName,
        0,
        placement.x,
        placement.y,
        placement.data.combinedWidth,
        placement.data.combinedHeight,
      );
      if (frame === null) {
        throw new Error(`Enemy label atlas could not add frame ${placement.frameName}`);
      }
      frame.customData = placement.data;
    }
    atlas.refresh();
    assertCompleteAtlas(scene);
  } catch (error) {
    if (createdAtlas) scene.textures.remove(AssetKeys.enemyLabels);
    throw error;
  } finally {
    createdTexts.forEach((text) => text.destroy());
  }
}

function packCombinedFrames(labels: readonly RasterizedLabel[]): {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly CombinedFramePlacement[];
} {
  const placements: CombinedFramePlacement[] = [];
  let x = FRAME_GUTTER_PX;
  let y = FRAME_GUTTER_PX;
  let rowHeight = 0;
  let atlasWidth = 0;

  for (const label of labels) {
    for (let hpStep = 0; hpStep <= ENEMY_HP_BAR_WIDTH; hpStep += 1) {
      const data = combinedFrameData(label, hpStep);
      if (data.combinedWidth + FRAME_GUTTER_PX * 2 > ENEMY_LABEL_ATLAS_MAX_WIDTH) {
        throw new Error(`Enemy label frame ${label.displayName} exceeds atlas row width`);
      }
      if (
        x > FRAME_GUTTER_PX
        && x + data.combinedWidth + FRAME_GUTTER_PX > ENEMY_LABEL_ATLAS_MAX_WIDTH
      ) {
        x = FRAME_GUTTER_PX;
        y += rowHeight + FRAME_GUTTER_PX;
        rowHeight = 0;
      }
      placements.push({
        frameName: enemyLabelAtlasFrame(label.displayName, hpStep),
        x,
        y,
        data,
        label,
      });
      x += data.combinedWidth + FRAME_GUTTER_PX;
      rowHeight = Math.max(rowHeight, data.combinedHeight);
      atlasWidth = Math.max(atlasWidth, x);
    }
  }

  return {
    width: atlasWidth,
    height: y + rowHeight + FRAME_GUTTER_PX,
    placements,
  };
}

function combinedFrameData(
  label: RasterizedLabel,
  hpStep: number,
): EnemyLabelCombinedFrameData {
  const combinedWidth = Math.max(label.width, ENEMY_HP_BAR_WIDTH);
  const nameOffsetY = NAME_CENTER_FROM_HP_TOP - label.height / 2;
  const combinedHeight = Math.ceil(Math.max(
    ENEMY_HP_BAR_HEIGHT,
    nameOffsetY + label.height,
  ));
  return {
    displayName: label.displayName,
    hpStep,
    nameWidth: label.width,
    nameHeight: label.height,
    combinedWidth,
    combinedHeight,
    nameOffsetX: (combinedWidth - label.width) / 2,
    nameOffsetY,
    hpOffsetX: (combinedWidth - ENEMY_HP_BAR_WIDTH) / 2,
    hpOffsetY: 0,
  };
}

function drawCombinedFrame(
  context: CanvasRenderingContext2D,
  placement: CombinedFramePlacement,
): void {
  const { data, label, x, y } = placement;
  context.drawImage(
    label.text.canvas,
    x + data.nameOffsetX,
    y + data.nameOffsetY,
  );

  const previousAlpha = context.globalAlpha;
  const previousFill = context.fillStyle;
  context.globalAlpha = ENEMY_HP_BAR_BACKGROUND_ALPHA;
  context.fillStyle = cssColor(ENEMY_HP_BAR_BACKGROUND_COLOR);
  context.fillRect(
    x + data.hpOffsetX,
    y + data.hpOffsetY,
    ENEMY_HP_BAR_WIDTH,
    ENEMY_HP_BAR_HEIGHT,
  );
  context.globalAlpha = 1;
  if (data.hpStep > 0) {
    context.fillStyle = cssColor(enemyHpStepColor(data.hpStep));
    context.fillRect(
      x + data.hpOffsetX,
      y + data.hpOffsetY,
      data.hpStep,
      ENEMY_HP_BAR_HEIGHT,
    );
  }
  context.globalAlpha = previousAlpha;
  context.fillStyle = previousFill;
}

function assertCompleteAtlas(scene: Phaser.Scene): void {
  const texture = scene.textures.get(AssetKeys.enemyLabels);
  for (const displayName of ENEMY_LABEL_NAMES) {
    for (let hpStep = 0; hpStep <= ENEMY_HP_BAR_WIDTH; hpStep += 1) {
      const frameName = enemyLabelAtlasFrame(displayName, hpStep);
      if (!texture.has(frameName)) {
        throw new Error(`Enemy label atlas is missing frame ${frameName}`);
      }
      enemyLabelCombinedFrameData(texture.get(frameName), displayName, hpStep);
    }
  }
  const frameNames = texture.getFrameNames(false);
  if (frameNames.length !== ENEMY_LABEL_ATLAS_FRAMES.length) {
    throw new Error(
      `Enemy label atlas expected exactly 124 frames, received ${frameNames.length}`,
    );
  }
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
