import type Phaser from 'phaser';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import {
  CombatEffectPool,
  type EffectPayload,
} from '../combat/CombatEffectPool';

const EFFECT_LIFETIME_MS = 120;
const EFFECT_COLUMNS = 12;

export class E2eCombatEffectPool extends CombatEffectPool {
  private nextProjectileId = 1_000_000;
  private nextPositionIndex = 0;

  constructor(scene: Phaser.Scene) {
    super(scene);
  }

  seedEffects(active: number): void {
    assertActiveCount(active);
    this.releaseAll();
    this.nextPositionIndex = 0;
    for (let index = 0; index < active; index += 1) {
      this.activateStressImpact(index, index * EFFECT_LIFETIME_MS / active);
    }
  }

  maintainEffects(active: number): void {
    assertActiveCount(active);
    while (this.snapshot().active < active) {
      this.activateStressImpact(this.nextPositionIndex, 0);
      this.nextPositionIndex = (this.nextPositionIndex + 1) % active;
    }
  }

  private activateStressImpact(index: number, initialAgeMs: number): void {
    const payload: EffectPayload = {
      type: 'projectileImpact',
      projectileId: this.nextProjectileId,
      projectileKind: 'poop',
      position: effectPosition(index),
    };
    this.nextProjectileId += 1;
    if (!this.activate(payload, initialAgeMs)) {
      throw new Error('Combat effect pool exhausted during workload refill');
    }
  }
}

function effectPosition(index: number): { readonly x: number; readonly y: number } {
  const column = index % EFFECT_COLUMNS;
  const row = Math.floor(index / EFFECT_COLUMNS);
  return {
    x: 30 + column * ((WORLD_WIDTH - 60) / (EFFECT_COLUMNS - 1)),
    y: 60 + row * ((WORLD_HEIGHT - 120) / 9),
  };
}

function assertActiveCount(active: number): void {
  if (!Number.isSafeInteger(active) || active < 0 || active > 120) {
    throw new RangeError('Effect workload count exceeds the pool capacity');
  }
}
