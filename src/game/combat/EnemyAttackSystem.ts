import { TIME_EPSILON_MS } from '../constants';
import { attackImpactMs } from '../data/balance';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { EnemyKind, EnemyState } from '../types/GameTypes';
import type { Point } from '../world/Geometry';

export type EnemyProjectileKind = 'poop' | 'net' | 'electric';

interface AttackBalance {
  readonly damage: number;
  readonly attackIntervalMs: number;
  readonly range: number;
  readonly attackTiming: Parameters<typeof attackImpactMs>[0];
}

interface ShelterCircle {
  readonly center: Point;
  readonly radius: number;
}

export interface ShelterDamageRequest {
  readonly type: 'shelterDamageRequested';
  readonly castId: string;
  readonly sourceEnemyId: number;
  readonly sourceEnemyKind: EnemyKind;
  readonly amount: number;
  readonly position: Point;
  readonly impactDirection: Point;
  readonly strength: 'medium' | 'heavy';
}

export type EnemyCombatEvent =
  | {
    readonly type: 'attackStarted' | 'attackCancelled' | 'attackHolding';
    readonly castId: string;
    readonly enemyId: number;
    readonly kind: EnemyKind;
  }
  | {
    readonly type: 'projectileRequested';
    readonly castId: string;
    readonly enemyId: number;
    readonly kind: EnemyKind;
    readonly projectileKind: EnemyProjectileKind;
    readonly from: Point;
    readonly to: Point;
    readonly speed: number;
    readonly damage: number;
    readonly lifeMs: 1200;
  }
  | {
    readonly type: 'projectileHit';
    readonly castId: string;
    readonly projectileId: number;
    readonly projectileKind: EnemyProjectileKind;
    readonly sourceEnemyId: number;
    readonly sourceEnemyKind: EnemyKind;
    readonly position: Point;
  }
  | ShelterDamageRequest;

export type EnemyAttackEvent = Extract<
  EnemyCombatEvent,
  { readonly type: 'attackStarted' | 'attackCancelled' | 'attackHolding' | 'projectileRequested' }
> | ShelterDamageRequest;

export type AttackOriginResolver = (enemy: EnemySnapshot) => Point;

interface AttackTrack {
  phase: Extract<EnemyState, 'moving' | 'windup' | 'holding'>;
  cycleMs: number;
  windupMs: number;
  pathProgress: number;
  castSequence: number;
  castId: string | null;
}

export const distanceToShelterBoundary = (
  feet: Point,
  center: Point,
  radius: number,
): number => Math.max(0, Math.hypot(feet.x - center.x, feet.y - center.y) - radius);

export const normalizedImpactDirection = (from: Point, to: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: -1 } : { x: dx / length, y: dy / length };
};

export class EnemyAttackSystem {
  private readonly tracks = new Map<number, AttackTrack>();

  constructor(private readonly config: {
    readonly kind: EnemyKind;
    readonly balance: AttackBalance;
    readonly shelter: ShelterCircle;
    readonly projectileOrigin?: AttackOriginResolver;
  }) {}

  step(stepMs: number, enemy: EnemySnapshot): readonly EnemyAttackEvent[] {
    assertFiniteNonNegative(stepMs, 'Enemy attack stepMs');
    const track = this.tracks.get(enemy.id) ?? {
      phase: 'moving',
      cycleMs: 0,
      windupMs: 0,
      pathProgress: enemy.pathProgress,
      castSequence: 0,
      castId: null,
    } satisfies AttackTrack;
    this.tracks.set(enemy.id, track);
    track.pathProgress = enemy.pathProgress;

    const inRange = distanceToShelterBoundary(
      enemy.position,
      this.config.shelter.center,
      this.config.shelter.radius,
    ) <= this.config.balance.range + 1e-9;
    const events: EnemyAttackEvent[] = [];

    if ((track.phase === 'windup' || track.phase === 'holding') && !inRange) {
      const castId = requireCastId(track);
      track.phase = 'moving';
      track.cycleMs = 0;
      track.windupMs = 0;
      track.castId = null;
      return [{
        type: 'attackCancelled',
        castId,
        enemyId: enemy.id,
        kind: this.config.kind,
      }];
    }

    if (track.phase === 'moving') {
      if (!inRange) return [];
      events.push(this.startWindup(track, enemy.id));
    }

    let remainingMs = stepMs;
    const releaseMs = attackImpactMs(this.config.balance.attackTiming);
    while (track.phase === 'windup' || track.phase === 'holding') {
      if (track.phase === 'windup') {
        const untilRelease = Math.max(0, releaseMs - track.windupMs);
        if (remainingMs + TIME_EPSILON_MS < untilRelease) {
          track.windupMs += remainingMs;
          track.cycleMs += remainingMs;
          break;
        }
        track.windupMs = releaseMs;
        track.cycleMs += untilRelease;
        remainingMs = Math.max(0, remainingMs - untilRelease);
        events.push(this.releaseEvent(enemy, requireCastId(track)));
        track.phase = 'holding';
        events.push({
          type: 'attackHolding',
          castId: requireCastId(track),
          enemyId: enemy.id,
          kind: this.config.kind,
        });
        continue;
      }

      const untilNextAttack = Math.max(
        0,
        this.config.balance.attackIntervalMs - track.cycleMs,
      );
      if (remainingMs + TIME_EPSILON_MS < untilNextAttack) {
        track.cycleMs += remainingMs;
        break;
      }
      remainingMs = Math.max(0, remainingMs - untilNextAttack);
      events.push(this.startWindup(track, enemy.id));
      if (remainingMs <= TIME_EPSILON_MS) break;
    }
    return events;
  }

  interruptWindup(enemyId: number): boolean {
    const track = this.tracks.get(enemyId);
    if (track?.phase !== 'windup') return false;
    track.phase = 'moving';
    track.cycleMs = 0;
    track.windupMs = 0;
    track.castId = null;
    return true;
  }

  snapshot(enemyId: number): {
    readonly state: AttackTrack['phase'];
    readonly cooldownMs: number;
    readonly pathProgress: number;
    readonly animationElapsedMs: number;
  } {
    const track = this.tracks.get(enemyId);
    if (track === undefined) throw new RangeError(`Unknown attack enemy ${enemyId}`);
    return {
      state: track.phase,
      cooldownMs: track.phase === 'moving'
        ? this.config.balance.attackIntervalMs
        : Math.max(0, this.config.balance.attackIntervalMs - track.cycleMs),
      pathProgress: track.pathProgress,
      animationElapsedMs: track.phase === 'windup'
        ? track.windupMs
        : track.phase === 'holding'
          ? track.cycleMs
          : 0,
    };
  }

  remove(enemyId: number): void {
    this.tracks.delete(enemyId);
  }

  clear(): void {
    this.tracks.clear();
  }

  private startWindup(track: AttackTrack, enemyId: number): EnemyAttackEvent {
    track.phase = 'windup';
    track.cycleMs = 0;
    track.windupMs = 0;
    track.castSequence += 1;
    track.castId = `enemy:${enemyId}:${track.castSequence}`;
    return {
      type: 'attackStarted',
      castId: track.castId,
      enemyId,
      kind: this.config.kind,
    };
  }

  private projectileFor(kind: EnemyKind): {
    readonly kind: EnemyProjectileKind;
    readonly speed: number;
  } {
    if (kind === 'poopGuardian') return { kind: 'poop', speed: 220 };
    if (kind === 'dogTrader') return { kind: 'net', speed: 240 };
    if (kind === 'illegalBreeder') return { kind: 'electric', speed: 260 };
    throw new Error('Off-leash attacks are immediate and have no projectile');
  }

  private releaseEvent(enemy: EnemySnapshot, castId: string): EnemyAttackEvent {
    const origin = this.config.projectileOrigin?.(enemy) ?? enemy.position;
    assertFinitePoint(origin, 'Enemy attack origin');
    const impactDirection = normalizedImpactDirection(origin, this.config.shelter.center);
    const strength = this.config.balance.attackTiming === 'boss' ? 'heavy' : 'medium';
    if (this.config.kind === 'offLeashGuardian') {
      return {
        type: 'shelterDamageRequested',
        castId,
        sourceEnemyId: enemy.id,
        sourceEnemyKind: this.config.kind,
        amount: this.config.balance.damage,
        position: { ...this.config.shelter.center },
        impactDirection,
        strength,
      };
    }
    const projectile = this.projectileFor(this.config.kind);
    return {
      type: 'projectileRequested',
      castId,
      enemyId: enemy.id,
      kind: this.config.kind,
      projectileKind: projectile.kind,
      from: { ...origin },
      to: { ...this.config.shelter.center },
      speed: projectile.speed,
      damage: this.config.balance.damage,
      lifeMs: 1200,
    };
  }
}

function requireCastId(track: AttackTrack): string {
  if (track.castId === null) throw new Error('Enemy attack track is missing a castId');
  return track.castId;
}

function assertFinitePoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
