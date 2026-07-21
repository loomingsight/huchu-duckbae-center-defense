import type Phaser from 'phaser';
import { animationEntry, animationFrameAt } from '../assets/AnimationManifest';
import { AssetKeys } from '../assets/AssetKeys';
import {
  BARK_WAVE_CONE_DEGREES,
  BARK_WAVE_DURATION_MS,
  barkWaveVisualAt,
  type BarkWaveVisual,
  CombatEffectPool,
} from '../combat/CombatEffectPool';
import { BALANCE } from '../data/balance';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { Point } from '../world/Geometry';
import { idleBreathScale } from '../world/AnimationFrameResolver';
import { HUCHU_PRESENTATION } from '../presentation/PresentationConfig';
import type { PlayerSnapshot } from './PlayerTypes';

const WALK_ENTRY = animationEntry(AssetKeys.huchuWalk);
const ATTACK_ENTRY = animationEntry(AssetKeys.huchuAttack);
const TAIL_ENTRY = animationEntry(AssetKeys.huchuTailSwipe);
const BASE_SCALE = HUCHU_PRESENTATION.dogOpaqueHeightLogical / WALK_ENTRY.opaqueHeightPx;
export const BARK_WAVE_POOL_CAPACITY = BALANCE.caps.particles;
export { BARK_WAVE_CONE_DEGREES, BARK_WAVE_DURATION_MS, barkWaveVisualAt };
export type { BarkWaveVisual };

export interface PlayerRenderSnapshot extends PlayerSnapshot {
  readonly worldAnimationMs: number;
  readonly moving: boolean;
  readonly barkElapsedMs?: number;
  readonly bodyAction?: {
    readonly kind: 'tailSwipe' | 'aquaBeam';
    readonly elapsedMs: number;
  };
}

export class PlayerView {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    initial: PlayerSnapshot,
    private readonly effects: CombatEffectPool,
  ) {
    this.sprite = scene.add
      .sprite(initial.x, initial.y, AssetKeys.huchuWalk, 0)
      .setOrigin(0.5, 1)
      .setScale(BASE_SCALE)
      .setDepth(initial.y);
  }

  render(snapshot: PlayerRenderSnapshot): void {
    const attacking = snapshot.bodyAction !== undefined || snapshot.barkElapsedMs !== undefined;
    const entry = snapshot.bodyAction?.kind === 'tailSwipe'
      ? TAIL_ENTRY
      : attacking ? ATTACK_ENTRY : WALK_ENTRY;
    const frame = animationFrameAt(
      entry,
      snapshot.bodyAction?.elapsedMs
        ?? (snapshot.barkElapsedMs !== undefined
          ? snapshot.barkElapsedMs
          : snapshot.moving ? snapshot.worldAnimationMs : 0),
    );
    const breathScale = snapshot.moving || attacking
      ? 1
      : idleBreathScale(snapshot.worldAnimationMs);
    this.sprite
      .setPosition(snapshot.x, snapshot.y)
      .setTexture(entry.key)
      .setFrame(frame)
      .setScale(BASE_SCALE * breathScale)
      .setDepth(snapshot.y);
  }

  showBarkWave(origin: Point, target: Point): boolean {
    return this.effects.showBarkWave(origin, target);
  }

  stepSimulation(stepMs: number): void {
    this.effects.step(stepMs);
  }

  resetCombatVisuals(): void {
    this.effects.releaseType('bark');
  }

  effectPoolSnapshot(): PoolSnapshot {
    return this.effects.snapshot();
  }

  effectAgesSnapshot(): readonly number[] {
    return this.effects.effectAges('bark');
  }

  destroy(): void {
    this.sprite.removeAllListeners();
  }
}
