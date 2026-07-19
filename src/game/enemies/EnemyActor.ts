import type Phaser from 'phaser';
import { AssetKeys } from '../assets/AssetKeys';
import type {
  EnemyKind,
  EnemyState,
  EnemyVariant,
} from '../types/GameTypes';
import { loopFrame, oneShotFrame } from '../world/AnimationFrameResolver';
import { ENEMY_HP_BAR_HEIGHT, EnemyHpBar } from './EnemyHpBar';
import type { EnemySnapshot } from './EnemyTypes';

export const ENEMY_FRAME_WIDTH = 192;
export const ENEMY_FRAME_HEIGHT = 256;
const DEFAULT_TEXTURE = AssetKeys.poopMale;
const DEFAULT_DISPLAY_HEIGHT = 82;

export function enemyWalkFrameAt(elapsedMs: number): number {
  return loopFrame(elapsedMs, 6, 0, 4);
}

export function enemyAttackFrameAt(elapsedMs: number): number {
  return oneShotFrame(elapsedMs, 8, 4, 4);
}

export function enemyFrameAt(state: EnemyState, elapsedMs: number): number {
  switch (state) {
    case 'moving':
      return enemyWalkFrameAt(elapsedMs);
    case 'stunned':
      validateElapsed(elapsedMs);
      return 0;
    case 'windup':
    case 'holding':
      return enemyAttackFrameAt(elapsedMs);
    case 'dead':
      validateElapsed(elapsedMs);
      return 7;
    default:
      throw new RangeError(`Unknown enemy state ${String(state)}`);
  }
}

export function enemyDisplayHeight(kind: EnemyKind): number {
  switch (kind) {
    case 'poopGuardian':
    case 'offLeashGuardian':
      return 82;
    case 'dogTrader':
      return 102;
    case 'illegalBreeder':
      return 106;
    default:
      throw new RangeError(`Unknown enemy kind ${String(kind)}`);
  }
}

export function enemyTextureKey(kind: EnemyKind, variant: EnemyVariant): string {
  if (variant !== 'male' && variant !== 'female') {
    throw new RangeError(`Unknown enemy variant ${String(variant)}`);
  }
  switch (kind) {
    case 'poopGuardian':
      return variant === 'male' ? AssetKeys.poopMale : AssetKeys.poopFemale;
    case 'offLeashGuardian':
      return variant === 'male' ? AssetKeys.offLeashMale : AssetKeys.offLeashFemale;
    case 'dogTrader':
      return AssetKeys.trader;
    case 'illegalBreeder':
      return variant === 'male' ? AssetKeys.breederMale : AssetKeys.breederFemale;
    default:
      throw new RangeError(`Unknown enemy kind ${String(kind)}`);
  }
}

export class EnemyActor {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly hpGraphics: Phaser.GameObjects.Graphics;
  private readonly hpBar: EnemyHpBar;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.sprite(0, 0, DEFAULT_TEXTURE, 0);
    this.hpGraphics = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.sprite, this.hpGraphics]);
    this.hpBar = new EnemyHpBar(this.hpGraphics);
    this.reset();
  }

  render(snapshot: EnemySnapshot): void {
    const displayHeight = enemyDisplayHeight(snapshot.kind);
    const texture = enemyTextureKey(snapshot.kind, snapshot.variant);
    const frame = enemyFrameAt(snapshot.state, snapshot.animationElapsedMs);
    this.sprite
      .setTexture(texture)
      .setFrame(frame)
      .setOrigin(0.5, 1)
      .setDisplaySize(ENEMY_FRAME_WIDTH * displayHeight / ENEMY_FRAME_HEIGHT, displayHeight)
      .setPosition(0, 0)
      .setActive(true)
      .setVisible(true);
    this.hpGraphics.setPosition(0, -displayHeight - 4 - ENEMY_HP_BAR_HEIGHT / 2);
    this.hpBar.render(snapshot.currentHp, snapshot.maxHp);
    this.container
      .setPosition(snapshot.position.x, snapshot.position.y)
      .setDepth(snapshot.position.y)
      .setActive(true)
      .setVisible(true);
  }

  reset(): void {
    this.container.removeAllListeners();
    this.sprite.removeAllListeners();
    this.hpGraphics.removeAllListeners();
    this.sprite.anims.stop();
    this.sprite
      .setTexture(DEFAULT_TEXTURE)
      .setFrame(0)
      .setOrigin(0.5, 1)
      .setDisplaySize(
        ENEMY_FRAME_WIDTH * DEFAULT_DISPLAY_HEIGHT / ENEMY_FRAME_HEIGHT,
        DEFAULT_DISPLAY_HEIGHT,
      )
      .setPosition(0, 0)
      .setAlpha(1)
      .clearTint()
      .setFlip(false, false)
      .setAngle(0)
      .setActive(false)
      .setVisible(false);
    this.hpGraphics.setPosition(0, 0);
    this.hpBar.reset();
    this.container
      .setPosition(0, 0)
      .setDepth(0)
      .setAlpha(1)
      .setAngle(0)
      .setScale(1)
      .setActive(false)
      .setVisible(false);
  }
}

function validateElapsed(elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Enemy animation elapsed time must be finite and non-negative');
  }
}
