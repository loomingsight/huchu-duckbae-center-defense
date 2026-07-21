import type { ImpactFeedbackTarget } from '../enemies/ImpactFeedbackTarget';
import { BALANCE } from '../data/balance';
import type { GameEvent } from '../events/GameEvents';
import type { Point } from '../world/Geometry';
import type { DamageAppliedEvent } from './CombatTypes';
import {
  DamageFeedbackPool,
  IMPACT_STYLE,
} from './DamageFeedbackPool';

export { IMPACT_STYLE };

const CAST_DEDUPE_CAP = 256;
const DEFAULT_CENTER_OUTWARD_DIRECTION: Point = { x: 0, y: -1 };

type ShelterDamagedEvent = Extract<GameEvent, { readonly type: 'shelterDamaged' }>;
type ImpactEvent = DamageAppliedEvent | ShelterDamagedEvent;

export interface CameraFeedbackPort {
  shake(durationMs: number, intensity: number): void;
}

export interface ImpactFeedbackSystemOptions {
  readonly enemyTarget: (targetId: number) => ImpactFeedbackTarget | undefined;
  readonly enemyDamageAnchor?: (targetId: number) => Point | undefined;
  readonly shelterTarget: ImpactFeedbackTarget;
  readonly damageNumbers?: DamageFeedbackPool;
  readonly camera?: CameraFeedbackPort;
  readonly reducedMotion?: () => boolean;
  readonly compositeBurst?: (event: ImpactEvent) => void;
  readonly removeLethalTarget?: (targetId: number) => void;
}

export class ImpactFeedbackSystem {
  private readonly seenCameraCasts = new BoundedCastSet(CAST_DEDUPE_CAP);
  private readonly seenCompositeCasts = new BoundedCastSet(CAST_DEDUPE_CAP);

  constructor(private readonly options: ImpactFeedbackSystemOptions) {}

  handle(event: ImpactEvent): void {
    if (event.effectiveAmount <= 0) return;
    if (event.type === 'shelterDamaged') {
      this.handleShelter(event);
      return;
    }
    this.handleEnemy(event);
  }

  step(stepMs: number): void {
    this.options.damageNumbers?.step(stepMs);
  }

  render(): void {
    this.options.damageNumbers?.render();
  }

  reset(): void {
    this.resetDedupe();
    this.options.damageNumbers?.reset();
  }

  resetDedupe(): void {
    this.seenCameraCasts.clear();
    this.seenCompositeCasts.clear();
  }

  private handleEnemy(event: DamageAppliedEvent): void {
    const target = this.options.enemyTarget(event.targetId);
    const damageAnchor = this.options.enemyDamageAnchor?.(event.targetId);
    if (target !== undefined) this.applyTargetFeedback(target, event);
    this.options.damageNumbers?.show(
      damageAnchor === undefined ? event : { ...event, position: damageAnchor },
    );
    this.emitCompositeOnce(event);
    this.shakeOnce(event);
    if (!event.lethal) return;
    target?.beginDeath(160);
    this.options.removeLethalTarget?.(event.targetId);
  }

  private handleShelter(event: ShelterDamagedEvent): void {
    this.applyTargetFeedback(this.options.shelterTarget, event);
    this.options.damageNumbers?.showShelter(event);
    this.emitCompositeOnce(event);
    this.shakeOnce(event);
  }

  private applyTargetFeedback(target: ImpactFeedbackTarget, event: ImpactEvent): void {
    const style = IMPACT_STYLE[event.strength];
    const reduced = this.options.reducedMotion?.() ?? false;
    target.flash(style.flashMs);
    target.recoil({
      direction: event.type === 'damageApplied' && event.source === 'tailSwipe'
        ? centerOutwardDirection(event.position)
        : inverse(event.impactDirection),
      distancePx: reduced ? style.recoilPx / 2 : style.recoilPx,
      popScale: reduced ? 1 + (style.popScale - 1) / 2 : style.popScale,
      durationMs: style.flashMs,
    });
  }

  private emitCompositeOnce(event: ImpactEvent): void {
    if (!this.seenCompositeCasts.add(event.castId)) return;
    this.options.compositeBurst?.(event);
  }

  private shakeOnce(event: ImpactEvent): void {
    if (this.options.reducedMotion?.() ?? false) return;
    if (event.type === 'damageApplied' && (event.source === 'bark' || event.source === 'deokbae')) {
      return;
    }
    if (!this.seenCameraCasts.add(event.castId)) return;
    const feedback = cameraFeedback(event.strength);
    this.options.camera?.shake(feedback.durationMs, feedback.intensity);
  }
}

class BoundedCastSet {
  private readonly values = new Set<string>();

  constructor(private readonly capacity: number) {}

  add(castId: string): boolean {
    if (this.values.has(castId)) return false;
    this.values.add(castId);
    if (this.values.size > this.capacity) {
      const oldest = this.values.values().next().value as string | undefined;
      if (oldest !== undefined) this.values.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.values.clear();
  }
}

function inverse(direction: Point): Point {
  return { x: -direction.x, y: -direction.y };
}

function centerOutwardDirection(position: Point): Point {
  const dx = position.x - BALANCE.shelter.x;
  const dy = position.y - BALANCE.shelter.y;
  const length = Math.hypot(dx, dy);
  return length === 0
    ? { ...DEFAULT_CENTER_OUTWARD_DIRECTION }
    : { x: dx / length, y: dy / length };
}

function cameraFeedback(strength: ImpactEvent['strength']): {
  readonly durationMs: number;
  readonly intensity: number;
} {
  switch (strength) {
    case 'light': return { durationMs: 45, intensity: 0.0015 };
    case 'medium': return { durationMs: 60, intensity: 0.0025 };
    case 'heavy': return { durationMs: 90, intensity: 0.0035 };
  }
}
