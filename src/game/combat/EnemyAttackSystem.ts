import { TIME_EPSILON_MS, subtractDuration } from '../constants';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { EnemyKind, EnemyState } from '../types/GameTypes';
import type { Point } from '../world/Geometry';

export type EnemyProjectileKind = 'poop' | 'net' | 'electric';

interface AttackBalance {
  readonly damage: number;
  readonly attackIntervalMs: number;
  readonly range: number;
}

interface ShelterCircle {
  readonly center: Point;
  readonly radius: number;
}

export type EnemyAttackEvent =
  | {
    readonly type: 'attackStarted' | 'attackCancelled' | 'attackHolding';
    readonly enemyId: number;
  }
  | {
    readonly type: 'shelterDamageRequested';
    readonly enemyId: number;
    readonly damage: number;
  }
  | {
    readonly type: 'projectileRequested';
    readonly enemyId: number;
    readonly projectileKind: EnemyProjectileKind;
    readonly from: Point;
    readonly to: Point;
    readonly speed: number;
    readonly damage: number;
    readonly lifeMs: 1200;
  };

interface AttackTrack {
  phase: Extract<EnemyState, 'moving' | 'windup' | 'holding' | 'stunned'>;
  cycleMs: number;
  windupMs: number;
  stunMs: number;
  pathProgress: number;
}

const ATTACK_RELEASE_MS = 250;

export const distanceToShelterBoundary = (
  feet: Point,
  center: Point,
  radius: number,
): number => Math.max(0, Math.hypot(feet.x - center.x, feet.y - center.y) - radius);

export class EnemyAttackSystem {
  private readonly tracks = new Map<number, AttackTrack>();

  constructor(private readonly config: {
    readonly kind: EnemyKind;
    readonly balance: AttackBalance;
    readonly shelter: ShelterCircle;
  }) {}

  step(stepMs: number, enemy: EnemySnapshot): readonly EnemyAttackEvent[] {
    assertFiniteNonNegative(stepMs, 'Enemy attack stepMs');
    const track = this.tracks.get(enemy.id) ?? {
      phase: 'moving',
      cycleMs: 0,
      windupMs: 0,
      stunMs: 0,
      pathProgress: enemy.pathProgress,
    } satisfies AttackTrack;
    this.tracks.set(enemy.id, track);
    track.pathProgress = enemy.pathProgress;

    let remainingMs = stepMs;
    if (track.phase === 'stunned') {
      const frozenMs = Math.min(track.stunMs, remainingMs);
      track.stunMs = subtractDuration(track.stunMs, frozenMs);
      remainingMs -= frozenMs;
      if (track.stunMs > 0) return [];
      track.phase = 'moving';
      track.cycleMs = 0;
      track.windupMs = 0;
      if (remainingMs <= TIME_EPSILON_MS) return [];
    }

    const inRange = distanceToShelterBoundary(
      enemy.position,
      this.config.shelter.center,
      this.config.shelter.radius,
    ) <= this.config.balance.range + 1e-9;
    const events: EnemyAttackEvent[] = [];

    if ((track.phase === 'windup' || track.phase === 'holding') && !inRange) {
      track.phase = 'moving';
      track.cycleMs = 0;
      track.windupMs = 0;
      return [{ type: 'attackCancelled', enemyId: enemy.id }];
    }

    if (track.phase === 'moving') {
      if (!inRange) return [];
      track.phase = 'windup';
      track.cycleMs = 0;
      track.windupMs = 0;
      events.push({ type: 'attackStarted', enemyId: enemy.id });
    }

    while (track.phase === 'windup' || track.phase === 'holding') {
      if (track.phase === 'windup') {
        const untilRelease = Math.max(0, ATTACK_RELEASE_MS - track.windupMs);
        if (remainingMs + TIME_EPSILON_MS < untilRelease) {
          track.windupMs += remainingMs;
          track.cycleMs += remainingMs;
          break;
        }
        track.windupMs = ATTACK_RELEASE_MS;
        track.cycleMs += untilRelease;
        remainingMs = Math.max(0, remainingMs - untilRelease);
        events.push(this.releaseEvent(enemy));
        track.phase = 'holding';
        events.push({ type: 'attackHolding', enemyId: enemy.id });
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
      track.phase = 'windup';
      track.cycleMs = 0;
      track.windupMs = 0;
      events.push({ type: 'attackStarted', enemyId: enemy.id });
      if (remainingMs <= TIME_EPSILON_MS) break;
    }
    return events;
  }

  stun(enemyId: number, durationMs: number, pathProgress = 0): void {
    assertFiniteNonNegative(durationMs, 'Enemy attack stun durationMs');
    if (durationMs === 0) return;
    const track = this.tracks.get(enemyId) ?? {
      phase: 'moving',
      cycleMs: 0,
      windupMs: 0,
      stunMs: 0,
      pathProgress,
    } satisfies AttackTrack;
    this.tracks.set(enemyId, track);
    track.phase = 'stunned';
    track.stunMs = durationMs;
    track.cycleMs = 0;
    track.windupMs = 0;
  }

  interrupt(enemyId: number): void {
    const track = this.tracks.get(enemyId);
    if (track === undefined) return;
    track.phase = 'moving';
    track.stunMs = 0;
    track.cycleMs = 0;
    track.windupMs = 0;
  }

  snapshot(enemyId: number): {
    readonly state: AttackTrack['phase'];
    readonly cooldownMs: number;
    readonly pathProgress: number;
  } {
    const track = this.tracks.get(enemyId);
    if (track === undefined) throw new RangeError(`Unknown attack enemy ${enemyId}`);
    return {
      state: track.phase,
      cooldownMs: track.phase === 'stunned' || track.phase === 'moving'
        ? this.config.balance.attackIntervalMs
        : Math.max(0, this.config.balance.attackIntervalMs - track.cycleMs),
      pathProgress: track.pathProgress,
    };
  }

  remove(enemyId: number): void {
    this.tracks.delete(enemyId);
  }

  clear(): void {
    this.tracks.clear();
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

  private releaseEvent(enemy: EnemySnapshot): EnemyAttackEvent {
    if (this.config.kind === 'offLeashGuardian') {
      return {
        type: 'shelterDamageRequested',
        enemyId: enemy.id,
        damage: this.config.balance.damage,
      };
    }
    const projectile = this.projectileFor(this.config.kind);
    return {
      type: 'projectileRequested',
      enemyId: enemy.id,
      projectileKind: projectile.kind,
      from: enemy.position,
      to: this.config.shelter.center,
      speed: projectile.speed,
      damage: this.config.balance.damage,
      lifeMs: 1200,
    };
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
