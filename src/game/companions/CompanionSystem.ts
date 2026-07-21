import { TIME_EPSILON_MS } from '../constants';
import { BALANCE, attackImpactMs } from '../data/balance';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { Point } from '../world/Geometry';
import { selectThreatTarget } from '../combat/TargetingSystem';

const ATTACK_RANGE = BALANCE.player.opaqueHeightLogical * 3;
const ATTACK_IMPACT_MS = attackImpactMs('normal');
const ATTACK_CADENCE_MS = 1000;

export interface CompanionContext {
  readonly player: Point;
  readonly enemies: readonly EnemySnapshot[];
}

export interface CompanionSnapshot {
  readonly companion: 'deokbae';
  readonly active: true;
  readonly cooldownRemainingMs: number;
}

export type CompanionEvent =
  | {
    readonly type: 'companionAttackStarted';
    readonly castId: string;
    readonly companion: 'deokbae';
    readonly targetId: number;
  }
  | {
    readonly type: 'companionAttack';
    readonly castId: string;
    readonly companion: 'deokbae';
    readonly origin: Point;
    readonly targetId: number;
    readonly targetPosition: Point;
  };

interface PendingAttack {
  readonly castId: string;
  readonly targetId: number;
  remainingMs: number;
}

export class CompanionSystem {
  private cooldownRemainingMs = 0;
  private sequence = 1;
  private pending: PendingAttack | null = null;

  step(stepMs: number, context: CompanionContext): readonly CompanionEvent[] {
    assertFiniteNonNegative(stepMs, 'Companion stepMs');
    const events: CompanionEvent[] = [];
    if (this.pending === null && this.cooldownRemainingMs === 0) {
      if (!this.start(
        selectThreatTarget(context.player, context.enemies, ATTACK_RANGE),
        events,
      )) return events;
    }

    let remainingMs = stepMs;
    while (remainingMs > TIME_EPSILON_MS) {
      const pendingBoundary = this.pending?.remainingMs ?? Number.POSITIVE_INFINITY;
      const cooldownBoundary = this.cooldownRemainingMs > 0
        ? this.cooldownRemainingMs
        : Number.POSITIVE_INFINITY;
      const boundaryMs = Math.min(pendingBoundary, cooldownBoundary);
      if (boundaryMs === Number.POSITIVE_INFINITY) break;

      if (remainingMs + TIME_EPSILON_MS < boundaryMs) {
        this.advanceTimers(remainingMs);
        break;
      }
      this.advanceTimers(boundaryMs);
      remainingMs = subtractBoundary(remainingMs, boundaryMs);

      if (this.pending !== null && this.pending.remainingMs === 0) {
        const event = this.impact(context);
        if (event !== undefined) events.push(event);
        this.pending = null;
      }
      if (this.pending === null && this.cooldownRemainingMs === 0) {
        const target = selectThreatTarget(context.player, context.enemies, ATTACK_RANGE);
        if (!this.start(target, events)) break;
      }
      if (remainingMs === 0) break;
    }
    return events;
  }

  snapshot(): CompanionSnapshot {
    return {
      companion: 'deokbae',
      active: true,
      cooldownRemainingMs: this.cooldownRemainingMs,
    };
  }

  reset(): void {
    this.cooldownRemainingMs = 0;
    this.sequence = 1;
    this.pending = null;
  }

  private start(target: EnemySnapshot | undefined, events: CompanionEvent[]): boolean {
    if (target === undefined) return false;
    const castId = `deokbae:${this.sequence}`;
    this.sequence += 1;
    this.pending = { castId, targetId: target.id, remainingMs: ATTACK_IMPACT_MS };
    this.cooldownRemainingMs = ATTACK_CADENCE_MS;
    events.push({
      type: 'companionAttackStarted',
      castId,
      companion: 'deokbae',
      targetId: target.id,
    });
    return true;
  }

  private impact(context: CompanionContext): CompanionEvent | undefined {
    if (this.pending === null) throw new Error('Companion impact requires a pending attack');
    const target = context.enemies.find((enemy) => (
      enemy.id === this.pending!.targetId && enemy.state !== 'dead'
    )) ?? selectThreatTarget(context.player, context.enemies, ATTACK_RANGE);
    if (target === undefined) return undefined;
    return {
      type: 'companionAttack',
      castId: this.pending.castId,
      companion: 'deokbae',
      origin: { ...context.player },
      targetId: target.id,
      targetPosition: { ...target.position },
    };
  }

  private advanceTimers(stepMs: number): void {
    this.cooldownRemainingMs = subtractBoundary(this.cooldownRemainingMs, stepMs);
    if (this.pending !== null) {
      this.pending.remainingMs = subtractBoundary(this.pending.remainingMs, stepMs);
    }
  }
}

function subtractBoundary(remainingMs: number, stepMs: number): number {
  const next = remainingMs - stepMs;
  return next <= TIME_EPSILON_MS ? 0 : next;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
