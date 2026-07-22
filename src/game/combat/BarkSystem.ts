import { TIME_EPSILON_MS } from '../constants';
import { attackImpactMs } from '../data/balance';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { Point } from '../world/Geometry';
import { BARK_CONE_DEGREES, BARK_RANGE_LOGICAL } from './BarkRules';
import { inCone, selectThreatTarget } from './TargetingSystem';

const WINDUP_MS = attackImpactMs('normal');
const CADENCE_MS = 800;
const DEFAULT_DIRECTION: Point = { x: 0, y: -1 };

type BarkPhase = 'ready' | 'windup' | 'cooldown';

export interface BarkContext {
  readonly origin: Point;
  readonly enemies: readonly EnemySnapshot[];
}

export interface BarkStartedEvent {
  readonly type: 'barkStarted';
  readonly castId: string;
  readonly targetId: number;
}

export interface BarkImpactEvent {
  readonly type: 'barkImpact';
  readonly castId: string;
  readonly origin: Point;
  readonly direction: Point;
  readonly targetIds: readonly number[];
}

export type BarkEvent = BarkStartedEvent | BarkImpactEvent;

export type BarkCastRequestResult =
  | { readonly status: 'started'; readonly events: readonly [BarkStartedEvent] }
  | { readonly status: 'noTarget' | 'notReady'; readonly events: readonly [] };

export interface BarkSnapshot {
  readonly learned: true;
  readonly ready: boolean;
  readonly cooldownRemainingMs: number;
  readonly progress: number;
  readonly activeCastId: string | null;
  readonly phase: BarkPhase;
  readonly elapsedMs: number;
  readonly lockedTargetId: number | null;
}

export class BarkSystem {
  private phase: BarkPhase = 'ready';
  private cycleElapsedMs = 0;
  private lockedTargetId: number | null = null;
  private castId: string | null = null;
  private lastDirection: Point = DEFAULT_DIRECTION;
  private sequence = 1;

  step(stepMs: number, context: BarkContext): readonly BarkEvent[] {
    assertFiniteNonNegative(stepMs, 'Bark stepMs');
    const events: BarkEvent[] = [];
    if (this.phase === 'ready') return events;

    let remainingMs = stepMs;
    while (true) {
      if (this.phase === 'windup') {
        const untilImpactMs = WINDUP_MS - this.cycleElapsedMs;
        if (!crossesBoundary(remainingMs, untilImpactMs)) {
          this.cycleElapsedMs += remainingMs;
          break;
        }

        this.cycleElapsedMs = WINDUP_MS;
        remainingMs = subtractBoundary(remainingMs, untilImpactMs);
        events.push(this.impact(context));
        this.phase = 'cooldown';
      }

      if (this.phase === 'cooldown') {
        const untilCadenceMs = Math.max(0, CADENCE_MS - this.cycleElapsedMs);
        if (!crossesBoundary(remainingMs, untilCadenceMs)) {
          this.cycleElapsedMs += remainingMs;
          break;
        }

        remainingMs = subtractBoundary(remainingMs, untilCadenceMs);
        this.phase = 'ready';
        this.cycleElapsedMs = 0;
        this.lockedTargetId = null;
        this.castId = null;
        break;
      }
    }
    return events;
  }

  requestCast(context: BarkContext): BarkCastRequestResult {
    if (this.phase !== 'ready') return { status: 'notReady', events: [] };
    const target = selectThreatTarget(context.origin, context.enemies, BARK_RANGE_LOGICAL);
    if (target === undefined) return { status: 'noTarget', events: [] };
    const events: BarkStartedEvent[] = [];
    this.start(target, context.origin, events);
    return { status: 'started', events: [events[0]!] };
  }

  reset(): void {
    this.phase = 'ready';
    this.cycleElapsedMs = 0;
    this.lockedTargetId = null;
    this.castId = null;
    this.lastDirection = DEFAULT_DIRECTION;
    this.sequence = 1;
  }

  snapshot(): BarkSnapshot {
    return {
      learned: true,
      ready: this.phase === 'ready',
      cooldownRemainingMs: this.phase === 'ready' ? 0 : Math.max(0, CADENCE_MS - this.cycleElapsedMs),
      progress: this.phase === 'ready' ? 1 : Math.max(0, Math.min(1, this.cycleElapsedMs / CADENCE_MS)),
      activeCastId: this.castId,
      phase: this.phase,
      elapsedMs: this.cycleElapsedMs,
      lockedTargetId: this.lockedTargetId,
    };
  }

  private start(
    target: EnemySnapshot | undefined,
    origin: Point,
    events: BarkStartedEvent[],
  ): boolean {
    if (target === undefined) return false;
    this.phase = 'windup';
    this.cycleElapsedMs = 0;
    this.lockedTargetId = target.id;
    this.castId = `bark:${this.sequence}`;
    this.sequence += 1;
    this.lastDirection = normalizedDirection(origin, target.position, this.lastDirection);
    events.push({ type: 'barkStarted', castId: this.castId, targetId: target.id });
    return true;
  }

  private impact(context: BarkContext): BarkImpactEvent {
    if (this.castId === null || this.lockedTargetId === null) {
      throw new Error('Bark impact requires an active cast');
    }
    const locked = context.enemies.find((enemy) => (
      enemy.id === this.lockedTargetId && enemy.state !== 'dead'
    ));
    if (locked !== undefined) {
      this.lastDirection = normalizedDirection(
        context.origin,
        locked.position,
        this.lastDirection,
      );
    }
    const targetIds = context.enemies
      .filter((enemy) => (
        enemy.state !== 'dead'
        && inCone(
          context.origin,
          this.lastDirection,
          enemy.position,
          BARK_RANGE_LOGICAL,
          BARK_CONE_DEGREES,
        )
      ))
      .slice()
      .sort((left, right) => (
        left.spawnSequence - right.spawnSequence || left.id - right.id
      ))
      .map(({ id }) => id);
    return {
      type: 'barkImpact',
      castId: this.castId,
      origin: { ...context.origin },
      direction: { ...this.lastDirection },
      targetIds,
    };
  }
}

function normalizedDirection(origin: Point, target: Point, fallback: Point): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? fallback : { x: dx / length, y: dy / length };
}

function crossesBoundary(remainingMs: number, untilBoundaryMs: number): boolean {
  return remainingMs + TIME_EPSILON_MS >= untilBoundaryMs;
}

function subtractBoundary(remainingMs: number, boundaryMs: number): number {
  const next = remainingMs - boundaryMs;
  return next <= TIME_EPSILON_MS ? 0 : next;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
