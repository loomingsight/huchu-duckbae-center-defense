import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import {
  ENEMY_LABEL_BACKGROUND,
  ENEMY_LABEL_FONT_PX,
  ENEMY_LABEL_STROKE_PX,
  enemyLabelAtlasFrame,
  enemyLabelCombinedFrameData,
} from '../assets/EnemyLabelAtlas';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import type { Point } from '../world/Geometry';
import {
  ENEMY_HP_BAR_HEIGHT,
  ENEMY_HP_BAR_WIDTH,
  enemyHpPresentation,
  type EnemyHpBarSnapshot,
  type EnemyHpPresentation,
} from './EnemyHpBar';

export {
  ENEMY_LABEL_BACKGROUND,
  ENEMY_LABEL_FONT_PX,
  ENEMY_LABEL_STROKE_PX,
} from '../assets/EnemyLabelAtlas';
export const ENEMY_LABEL_DEPTH = {
  name: 1,
  hp: 2,
  damage: 3,
} as const;

const NAME_HEIGHT = ENEMY_LABEL_FONT_PX + ENEMY_LABEL_STROKE_PX * 2;
const NAME_CENTER_ABOVE_HEAD = 11;
const HP_CENTER_ABOVE_HEAD = 23;
const DAMAGE_GAP_ABOVE_HP = 8;

export interface EnemyLabelRenderInput {
  readonly position: Point;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly opaqueHeightLogical: number;
  readonly visible: boolean;
}

export interface LabelBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface EnemyLabelLayout {
  readonly name: LabelBounds;
  readonly hp: LabelBounds;
  readonly damageAnchor: Point;
}

export interface EnemyLabelFrameSize {
  readonly width: number;
  readonly height: number;
}

export interface EnemyLabelSnapshot {
  readonly displayName: string | null;
  readonly fontPx: 14;
  readonly strokePx: 1;
  readonly background: string;
  readonly hpAboveName: true;
  readonly damageLayerAbove: true;
  readonly damageAnchor: Point;
  readonly visible: boolean;
  readonly hp: EnemyHpBarSnapshot | null;
}

export function enemyLabelLayout(
  position: Point,
  opaqueHeightLogical: number,
  displayName: string,
  frameSize?: EnemyLabelFrameSize,
): EnemyLabelLayout {
  assertPoint(position);
  if (!Number.isFinite(opaqueHeightLogical) || opaqueHeightLogical <= 0) {
    throw new RangeError('Enemy label opaque height must be finite and positive');
  }
  if (displayName.length === 0) throw new RangeError('Enemy display name must not be empty');
  const headTop = position.y - opaqueHeightLogical;
  const nameCenterY = headTop - NAME_CENTER_ABOVE_HEAD;
  const nameWidth = frameSize?.width ?? displayName.length * ENEMY_LABEL_FONT_PX + 6;
  const nameHeight = frameSize?.height ?? NAME_HEIGHT;
  if (
    !Number.isFinite(nameWidth)
    || !Number.isFinite(nameHeight)
    || nameWidth <= 0
    || nameHeight <= 0
  ) {
    throw new RangeError('Enemy label frame size must be finite and positive');
  }
  const hpCenterY = headTop - HP_CENTER_ABOVE_HEAD;
  const hpTop = hpCenterY - ENEMY_HP_BAR_HEIGHT / 2;
  const layout: EnemyLabelLayout = {
    name: {
      left: position.x - nameWidth / 2,
      right: position.x + nameWidth / 2,
      top: nameCenterY - nameHeight / 2,
      bottom: nameCenterY + nameHeight / 2,
    },
    hp: {
      left: position.x - ENEMY_HP_BAR_WIDTH / 2,
      right: position.x + ENEMY_HP_BAR_WIDTH / 2,
      top: hpTop,
      bottom: hpCenterY + ENEMY_HP_BAR_HEIGHT / 2,
    },
    damageAnchor: {
      x: position.x,
      y: hpTop - DAMAGE_GAP_ABOVE_HP,
    },
  };
  return clampLabelLayout(layout);
}

export class EnemyLabelView {
  private readonly image: Phaser.GameObjects.Image;
  private displayName: string | null = null;
  private frameSize: EnemyLabelFrameSize | null = null;
  private hp: EnemyHpPresentation | null = null;
  private hpStep: number | null = null;
  private damagePosition: Point = { x: 0, y: 0 };
  private layout: EnemyLabelLayout | null = null;
  private lastRenderInput: EnemyLabelRenderInput | null = null;
  private visible = false;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    const image = scene.add.image(0, 0, AssetKeys.enemyLabels);
    try {
      image
        .setOrigin(0, 0)
        .setActive(false)
        .setVisible(false);
    } catch (error) {
      image.removeAllListeners();
      image.destroy();
      throw error;
    }
    this.image = image;
  }

  bind(displayName: string): void {
    if (displayName.length === 0) throw new RangeError('Enemy display name must not be empty');
    if (this.displayName !== null) throw new Error('Enemy label is already bound');
    const hpStep = 0;
    const frameName = enemyLabelAtlasFrame(displayName, hpStep);
    this.image.setFrame(frameName);
    const frameData = enemyLabelCombinedFrameData(this.image.frame, displayName, hpStep);
    const frameSize = { width: frameData.nameWidth, height: frameData.nameHeight };
    this.displayName = displayName;
    this.frameSize = frameSize;
    this.hpStep = hpStep;
  }

  render(input: EnemyLabelRenderInput): void {
    if (this.displayName === null) throw new Error('Enemy label must be bound before render');
    if (this.frameSize === null) throw new Error('Enemy label frame metrics are missing');
    if (sameRenderInput(this.lastRenderInput, input)) return;
    const frameSize = this.frameSize;
    const hp = enemyHpPresentation(input.currentHp, input.maxHp);
    if (this.hpStep !== hp.hpStep) {
      const frameName = enemyLabelAtlasFrame(this.displayName, hp.hpStep);
      this.image.setFrame(frameName);
      const frameData = enemyLabelCombinedFrameData(
        this.image.frame,
        this.displayName,
        hp.hpStep,
      );
      if (
        frameData.nameWidth !== frameSize.width
        || frameData.nameHeight !== frameSize.height
      ) {
        throw new Error(`Enemy label frame ${frameName} changed name metrics`);
      }
      this.hpStep = hp.hpStep;
    }
    const layout = enemyLabelLayout(
      input.position,
      input.opaqueHeightLogical,
      this.displayName,
      frameSize,
    );
    this.layout = layout;
    this.hp = hp;
    this.visible = input.visible;
    this.damagePosition = layout.damageAnchor;
    this.image
      .setPosition(
        Math.min(layout.name.left, layout.hp.left),
        Math.min(layout.name.top, layout.hp.top),
      )
      .setDepth(input.position.y + ENEMY_LABEL_DEPTH.hp)
      .setActive(input.visible)
      .setVisible(input.visible);
    this.lastRenderInput = { ...input, position: { ...input.position } };
  }

  damageAnchor(): Point {
    return { ...this.damagePosition };
  }

  renderedVisible(camera: Phaser.Cameras.Scene2D.Camera, viewport: LabelBounds): boolean {
    if (!this.visible || this.layout === null || this.hp?.fillVisible !== true) return false;
    if (
      !this.image.active
      || !this.image.visible
      || this.image.alpha <= 0
      || !this.image.willRender(camera)
    ) return false;
    return boundsIntersect(this.layout.name, viewport)
      && boundsIntersect(this.layout.hp, viewport);
  }

  snapshot(): EnemyLabelSnapshot {
    return {
      displayName: this.displayName,
      fontPx: ENEMY_LABEL_FONT_PX,
      strokePx: ENEMY_LABEL_STROKE_PX,
      background: ENEMY_LABEL_BACKGROUND,
      hpAboveName: true,
      damageLayerAbove: true,
      damageAnchor: this.damageAnchor(),
      visible: this.visible,
      hp: this.hp === null ? null : {
        currentHp: this.hp.currentHp,
        maxHp: this.hp.maxHp,
        hpRatio: this.hp.hpRatio,
        hpColor: this.hp.hpColor,
      },
    };
  }

  reset(): void {
    this.displayName = null;
    this.frameSize = null;
    this.hp = null;
    this.hpStep = null;
    this.damagePosition = { x: 0, y: 0 };
    this.layout = null;
    this.lastRenderInput = null;
    this.visible = false;
    this.image
      .removeAllListeners()
      .setOrigin(0, 0)
      .setPosition(0, 0)
      .setDepth(0)
      .setAlpha(1)
      .setActive(false)
      .setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.image.removeAllListeners();
    this.image.destroy();
  }
}

function sameRenderInput(
  previous: EnemyLabelRenderInput | null,
  next: EnemyLabelRenderInput,
): boolean {
  return previous !== null
    && previous.position.x === next.position.x
    && previous.position.y === next.position.y
    && previous.currentHp === next.currentHp
    && previous.maxHp === next.maxHp
    && previous.opaqueHeightLogical === next.opaqueHeightLogical
    && previous.visible === next.visible;
}

function boundsIntersect(left: LabelBounds, right: LabelBounds): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function clampLabelLayout(layout: EnemyLabelLayout): EnemyLabelLayout {
  const left = Math.min(layout.name.left, layout.hp.left, layout.damageAnchor.x);
  const right = Math.max(layout.name.right, layout.hp.right, layout.damageAnchor.x);
  const top = Math.min(layout.name.top, layout.hp.top, layout.damageAnchor.y);
  const bottom = Math.max(layout.name.bottom, layout.hp.bottom, layout.damageAnchor.y);
  const offsetX = viewportOffset(left, right, WORLD_WIDTH);
  const offsetY = viewportOffset(top, bottom, WORLD_HEIGHT);
  if (offsetX === 0 && offsetY === 0) return layout;
  return {
    name: translateBounds(layout.name, offsetX, offsetY),
    hp: translateBounds(layout.hp, offsetX, offsetY),
    damageAnchor: {
      x: layout.damageAnchor.x + offsetX,
      y: layout.damageAnchor.y + offsetY,
    },
  };
}

function viewportOffset(min: number, max: number, limit: number): number {
  if (min < 0) return -min;
  if (max > limit) return limit - max;
  return 0;
}

function translateBounds(bounds: LabelBounds, x: number, y: number): LabelBounds {
  return {
    left: bounds.left + x,
    right: bounds.right + x,
    top: bounds.top + y,
    bottom: bounds.bottom + y,
  };
}

function assertPoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Enemy label position must be finite');
  }
}
