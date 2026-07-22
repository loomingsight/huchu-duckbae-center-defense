import type { DamageCommand } from '../combat/CombatTypes';
import {
  selectHighestHpTarget,
  validateTargetingCandidates,
} from '../combat/TargetingSystem';
import { TIME_EPSILON_MS } from '../constants';
import { BALANCE } from '../data/balance';
import type { TailEffect } from '../enemies/EnemySystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { PurchasableSkillId } from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import { impactStrengthFor, SKILL_DEFINITIONS } from './skillDefinitions';
import type {
  SkillCastStartedEvent,
  CastRequestResult,
  SkillImpactEvent,
  SkillSnapshot,
  SkillTargetChangedEvent,
  SkillTargetSnapshot,
  SkillTimelineEvent,
} from './SkillTypes';

export type {
  SkillCastStartedEvent,
  CastRequestResult,
  SkillImpactEvent,
  SkillSnapshot,
  SkillTargetChangedEvent,
  SkillTargetSnapshot,
  SkillTimelineEvent,
} from './SkillTypes';

export const PLAYER_SKILL_IDS = [
  'tailSwipe',
  'aquaBeam',
  'safetyReport',
] as const satisfies readonly PurchasableSkillId[];

export const INITIAL_SKILL_COOLDOWN_MS = 1000;
export const TAIL_SWIPE_KNOCKBACK_PX = 175;

export interface SkillContext {
  readonly player: Point;
  readonly enemies: readonly EnemySnapshot[];
}

interface PendingBase {
  readonly castId: string;
  readonly origin: Point;
  readonly impactAtMs: number;
  readonly startSequence: number;
}

interface PendingTailSwipe extends PendingBase {
  readonly skillId: 'tailSwipe';
}

interface PendingAquaBeam extends PendingBase {
  readonly skillId: 'aquaBeam';
  targetId: number;
  retargeted: boolean;
}

interface PendingSafetyReport extends PendingBase {
  readonly skillId: 'safetyReport';
  readonly snapshotTargetIds: readonly number[];
}

type PendingCast = PendingTailSwipe | PendingAquaBeam | PendingSafetyReport;

interface StartedCast {
  readonly pending: PendingCast;
  readonly started: SkillCastStartedEvent;
}

const TAIL_RADIUS = BALANCE.player.opaqueHeightLogical * 2.2;
const GEOMETRY_EPSILON = 1e-9;
const DEFAULT_DIRECTION: Point = { x: 0, y: -1 };
const MAX_SCHEDULABLE_TIMESTAMP_MS = Number.MAX_SAFE_INTEGER
  - SKILL_DEFINITIONS.safetyReport.cooldownMs;

export class SkillSystem {
  private readonly learned = new Set<PurchasableSkillId>();
  private readonly readyAt: Record<PurchasableSkillId, number> = {
    tailSwipe: 0,
    aquaBeam: 0,
    safetyReport: 0,
  };
  private readonly cooldownWindowMs: Record<PurchasableSkillId, number> = {
    tailSwipe: SKILL_DEFINITIONS.tailSwipe.cooldownMs,
    aquaBeam: SKILL_DEFINITIONS.aquaBeam.cooldownMs,
    safetyReport: SKILL_DEFINITIONS.safetyReport.cooldownMs,
  };
  private readonly castSequence: Record<PurchasableSkillId, number> = {
    tailSwipe: 1,
    aquaBeam: 1,
    safetyReport: 1,
  };
  private pending: PendingCast[] = [];
  private lastNowMs = 0;
  private nextStartSequence = 1;

  learn(skillId: PurchasableSkillId, learnedAtMs: number): void {
    assertSkillId(skillId);
    assertTimestamp(learnedAtMs, 'Skill learnedAtMs');
    if (this.learned.has(skillId)) return;
    const readyAtMs = learnedAtMs + INITIAL_SKILL_COOLDOWN_MS;
    if (!Number.isFinite(readyAtMs)) {
      throw new RangeError('Skill ready timestamp must be finite');
    }
    this.learned.add(skillId);
    this.readyAt[skillId] = readyAtMs;
    this.cooldownWindowMs[skillId] = INITIAL_SKILL_COOLDOWN_MS;
  }

  step(nowMs: number, context: SkillContext): readonly SkillTimelineEvent[] {
    assertTimestamp(nowMs, 'Skill nowMs');
    validateContext(context);
    if (nowMs < this.lastNowMs) {
      throw new RangeError('Skill nowMs must be monotonic');
    }

    this.lastNowMs = nowMs;
    return this.advancePending(nowMs, context);
  }

  requestCast(
    skillId: PurchasableSkillId,
    nowMs: number,
    context: SkillContext,
  ): CastRequestResult {
    assertSkillId(skillId);
    assertTimestamp(nowMs, 'Skill nowMs');
    validateContext(context);
    if (nowMs < this.lastNowMs) {
      throw new RangeError('Skill nowMs must be monotonic');
    }
    this.lastNowMs = nowMs;
    if (!this.learned.has(skillId)) return { status: 'notLearned', events: [] };
    if (this.readyAt[skillId] > nowMs + TIME_EPSILON_MS) {
      return { status: 'notReady', events: [] };
    }
    const cast = this.startIfTargetExists(skillId, nowMs, context);
    if (cast === undefined) return { status: 'noTarget', events: [] };
    this.pending.push(cast.pending);
    this.readyAt[skillId] = nowMs + SKILL_DEFINITIONS[skillId].cooldownMs;
    this.cooldownWindowMs[skillId] = SKILL_DEFINITIONS[skillId].cooldownMs;
    return { status: 'started', events: [cast.started] };
  }

  snapshot(skillId: PurchasableSkillId): SkillSnapshot {
    assertSkillId(skillId);
    const learned = this.learned.has(skillId);
    if (!learned) {
      return {
        learned: false,
        cooldownRemainingMs: 0,
        ready: false,
        progress: 0,
        activeCastId: null,
      };
    }
    const cooldownRemainingMs = Math.max(0, this.readyAt[skillId] - this.lastNowMs);
    return {
      learned: true,
      cooldownRemainingMs,
      ready: cooldownRemainingMs <= TIME_EPSILON_MS,
      progress: clampUnit(1 - cooldownRemainingMs / this.cooldownWindowMs[skillId]),
      activeCastId: this.pending.find((cast) => cast.skillId === skillId)?.castId ?? null,
    };
  }

  learnedSnapshot(): Readonly<Record<PurchasableSkillId, boolean>> {
    return {
      tailSwipe: this.learned.has('tailSwipe'),
      aquaBeam: this.learned.has('aquaBeam'),
      safetyReport: this.learned.has('safetyReport'),
    };
  }

  reset(): void {
    this.learned.clear();
    for (const skillId of PLAYER_SKILL_IDS) {
      this.readyAt[skillId] = 0;
      this.cooldownWindowMs[skillId] = SKILL_DEFINITIONS[skillId].cooldownMs;
      this.castSequence[skillId] = 1;
    }
    this.pending = [];
    this.lastNowMs = 0;
    this.nextStartSequence = 1;
  }

  private advancePending(nowMs: number, context: SkillContext): SkillTimelineEvent[] {
    const events: SkillTimelineEvent[] = [];
    const ordered = this.pending.slice().sort((left, right) => (
      left.impactAtMs - right.impactAtMs || left.startSequence - right.startSequence
    ));
    const resolved = new Set<PendingCast>();

    for (const cast of ordered) {
      if (cast.skillId === 'aquaBeam') {
        const currentTarget = activeEnemyById(context.enemies, cast.targetId);
        if (currentTarget === undefined && !cast.retargeted) {
          const replacement = selectHighestHpTarget(context.player, context.enemies);
          if (replacement !== undefined) {
            const previousTargetId = cast.targetId;
            cast.targetId = replacement.id;
            cast.retargeted = true;
            events.push({
              type: 'skillTargetChanged',
              castId: cast.castId,
              skillId: 'aquaBeam',
              previousTargetId,
              targetId: replacement.id,
              targetPosition: copyPoint(replacement.position),
            });
          }
        }
      }

      if (cast.impactAtMs > nowMs + TIME_EPSILON_MS) continue;
      events.push(this.impact(cast, context));
      resolved.add(cast);
    }

    if (resolved.size > 0) {
      this.pending = this.pending.filter((cast) => !resolved.has(cast));
    }
    return events;
  }

  private impact(cast: PendingCast, context: SkillContext): SkillImpactEvent {
    let targets: readonly SkillTargetSnapshot[];
    if (cast.skillId === 'tailSwipe') {
      targets = stableAlive(context.enemies)
        .filter((enemy) => distanceBetween(cast.origin, enemy.position) <= TAIL_RADIUS + GEOMETRY_EPSILON)
        .map(targetSnapshot);
    } else if (cast.skillId === 'aquaBeam') {
      const target = activeEnemyById(context.enemies, cast.targetId);
      targets = target === undefined ? [] : [targetSnapshot(target)];
    } else {
      const activeById = new Map(
        context.enemies
          .filter(({ state }) => state !== 'dead')
          .map((enemy) => [enemy.id, enemy]),
      );
      targets = cast.snapshotTargetIds.flatMap((targetId) => {
        const target = activeById.get(targetId);
        return target === undefined ? [] : [targetSnapshot(target)];
      });
    }
    return {
      type: 'skillImpact',
      castId: cast.castId,
      skillId: cast.skillId,
      origin: copyPoint(cast.origin),
      targets,
    };
  }

  private startIfTargetExists(
    skillId: PurchasableSkillId,
    nowMs: number,
    context: SkillContext,
  ): StartedCast | undefined {
    const castId = `${skillId}:${this.castSequence[skillId]}`;
    const origin = copyPoint(context.player);
    const startSequence = this.nextStartSequence;
    let pending: PendingCast;
    let targets: readonly SkillTargetSnapshot[];

    if (skillId === 'tailSwipe') {
      const candidates = stableAlive(context.enemies)
        .filter((enemy) => distanceBetween(origin, enemy.position) <= TAIL_RADIUS + GEOMETRY_EPSILON);
      if (candidates.length === 0) return undefined;
      targets = candidates.map(targetSnapshot);
      pending = {
        castId,
        skillId,
        origin,
        impactAtMs: nowMs + SKILL_DEFINITIONS.tailSwipe.impactMs,
        startSequence,
      };
    } else if (skillId === 'aquaBeam') {
      const target = selectHighestHpTarget(origin, context.enemies);
      if (target === undefined) return undefined;
      targets = [targetSnapshot(target)];
      pending = {
        castId,
        skillId,
        origin,
        impactAtMs: nowMs + SKILL_DEFINITIONS.aquaBeam.impactMs,
        startSequence,
        targetId: target.id,
        retargeted: false,
      };
    } else {
      const candidates = stableAlive(context.enemies);
      if (candidates.length === 0) return undefined;
      targets = candidates.map(targetSnapshot);
      pending = {
        castId,
        skillId,
        origin,
        impactAtMs: nowMs + SKILL_DEFINITIONS.safetyReport.impactMs,
        startSequence,
        snapshotTargetIds: candidates.map(({ id }) => id),
      };
    }

    this.castSequence[skillId] += 1;
    this.nextStartSequence += 1;
    return {
      pending,
      started: {
        type: 'skillCastStarted',
        castId,
        skillId,
        origin: copyPoint(origin),
        targets,
        durationMs: impactMsFor(skillId),
      },
    };
  }
}

export function tailEffectFor(isBoss: boolean): TailEffect {
  return isBoss
    ? { knockbackPx: TAIL_SWIPE_KNOCKBACK_PX, multiplier: 0.8, durationMs: 1000 }
    : { knockbackPx: TAIL_SWIPE_KNOCKBACK_PX, multiplier: 0.6, durationMs: 1500 };
}

export function damageCommandsForSkillImpact(
  impact: SkillImpactEvent,
  enemies: readonly EnemySnapshot[],
): readonly DamageCommand[] {
  const activeById = new Map(
    enemies
      .filter(({ state }) => state !== 'dead')
      .map((enemy) => [enemy.id, enemy]),
  );
  const seen = new Set<number>();
  return impact.targets.flatMap((target): readonly DamageCommand[] => {
    if (seen.has(target.targetId)) return [];
    const enemy = activeById.get(target.targetId);
    if (enemy === undefined) return [];
    seen.add(target.targetId);
    return [{
      castId: impact.castId,
      targetId: target.targetId,
      amount: damageFor(impact.skillId, enemy.isBoss),
      impactDirection: normalizedDirection(impact.origin, target.position),
      source: impact.skillId,
      strength: impactStrengthFor(impact.skillId),
    }];
  });
}

function damageFor(skillId: PurchasableSkillId, isBoss: boolean): number {
  if (skillId === 'tailSwipe') return SKILL_DEFINITIONS.tailSwipe.damage;
  if (skillId === 'aquaBeam') return SKILL_DEFINITIONS.aquaBeam.damage;
  return isBoss
    ? SKILL_DEFINITIONS.safetyReport.bossDamage
    : SKILL_DEFINITIONS.safetyReport.regularDamage;
}

function impactMsFor(skillId: PurchasableSkillId): 125 | 300 | 600 {
  if (skillId === 'tailSwipe') return SKILL_DEFINITIONS.tailSwipe.impactMs;
  if (skillId === 'aquaBeam') return SKILL_DEFINITIONS.aquaBeam.impactMs;
  return SKILL_DEFINITIONS.safetyReport.impactMs;
}

function normalizedDirection(origin: Point, target: Point): Point {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { ...DEFAULT_DIRECTION } : { x: dx / length, y: dy / length };
}

function activeEnemyById(
  enemies: readonly EnemySnapshot[],
  targetId: number,
): EnemySnapshot | undefined {
  return enemies.find((enemy) => enemy.id === targetId && enemy.state !== 'dead');
}

function stableAlive(enemies: readonly EnemySnapshot[]): readonly EnemySnapshot[] {
  return enemies
    .filter(({ state }) => state !== 'dead')
    .slice()
    .sort((left, right) => left.spawnSequence - right.spawnSequence || left.id - right.id);
}

function targetSnapshot(enemy: EnemySnapshot): SkillTargetSnapshot {
  return { targetId: enemy.id, position: copyPoint(enemy.position) };
}

function validateContext(context: SkillContext): void {
  assertPoint(context.player, 'Skill player');
  validateTargetingCandidates(context.player, context.enemies);
}

function assertSkillId(skillId: PurchasableSkillId): void {
  if (!(PLAYER_SKILL_IDS as readonly string[]).includes(skillId)) {
    throw new RangeError(`Unknown player skill ${String(skillId)}`);
  }
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > MAX_SCHEDULABLE_TIMESTAMP_MS) {
    throw new RangeError(`${label} must be finite, non-negative, and safely schedulable`);
  }
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function copyPoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
