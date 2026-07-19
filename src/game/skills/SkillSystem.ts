import { TIME_EPSILON_MS } from '../constants';
import { rankThreatTargets, selectThreatTarget } from '../combat/TargetingSystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import { distance, type Point } from '../world/Geometry';
import { chooseHowlCenter } from './SpatialBucketTargeting';
import { SKILL_DEFINITIONS } from './skillDefinitions';
import type { SkillLevels } from './SkillTypes';

export type AutoSkillId = Exclude<SkillId, 'bark'>;

export const AUTO_SKILL_IDS: readonly AutoSkillId[] = [
  'scold',
  'aquaBeam',
  'deokbaeHowl',
  'safetyReport',
];

export interface SkillContext {
  readonly player: Point;
  readonly enemies: readonly EnemySnapshot[];
}

export interface SkillSnapshot {
  readonly level: SkillLevel;
  readonly cooldownRemainingMs: number;
  readonly ready: boolean;
  readonly progress: number;
}

export interface SkillHit {
  readonly targetId: number;
  readonly damage: number;
  readonly nextPathProgress?: number;
  readonly stunMs?: number;
}

export interface SkillTargetPosition {
  readonly targetId: number;
  readonly position: Point;
}

export type SkillCastVisual =
  | {
    readonly kind: 'scold';
    readonly origin: Point;
    readonly direction: Point;
    readonly length: number;
    readonly angleDeg: number;
    readonly targetPositions: readonly SkillTargetPosition[];
  }
  | {
    readonly kind: 'aquaBeam';
    readonly origin: Point;
    readonly direction: Point;
    readonly length: number;
    readonly width: number;
    readonly targetPositions: readonly SkillTargetPosition[];
  }
  | {
    readonly kind: 'deokbaeHowl';
    readonly center: Point;
    readonly radius: number;
    readonly targetPositions: readonly SkillTargetPosition[];
  }
  | {
    readonly kind: 'safetyReport';
    readonly origin: Point;
    readonly targetPosition: Point;
    readonly targetId: number;
  };

export interface SkillCastCommand {
  readonly type: 'skillCast';
  readonly skillId: AutoSkillId;
  readonly targetIds: readonly number[];
  readonly hits: readonly SkillHit[];
  readonly visual: SkillCastVisual;
}

export interface ResolvedSkillStats {
  readonly damage: number;
  readonly cooldownMs: number;
  readonly angleDeg?: number;
  readonly distance?: number;
  readonly knockback?: number;
  readonly length?: number;
  readonly width?: number;
  readonly radius?: number;
  readonly bucketSize?: number;
  readonly regularStunMs?: number;
  readonly bossStunMs?: number;
}

export function resolveSkillStats(
  id: AutoSkillId,
  level: SkillLevel,
): ResolvedSkillStats {
  assertAutoSkillId(id);
  if (!Number.isSafeInteger(level) || level < 1 || level > 3) {
    throw new RangeError(`${id} level must be an integer from 1 to 3`);
  }
  const common = SKILL_DEFINITIONS[id];
  const damage = Math.round(common.damage * (level >= 2 ? 1.25 : 1));
  const cooldownMs = Math.round(common.cooldownMs * (level >= 3 ? 0.8 : 1));
  if (id === 'scold') {
    const base = SKILL_DEFINITIONS.scold;
    return {
      damage,
      cooldownMs,
      angleDeg: base.angleDeg,
      distance: level >= 3 ? 138 : base.distance,
      knockback: level >= 3 ? 34 : base.knockback,
    };
  }
  if (id === 'aquaBeam') {
    const base = SKILL_DEFINITIONS.aquaBeam;
    return {
      damage,
      cooldownMs,
      length: level >= 3 ? 300 : base.length,
      width: level >= 3 ? 26.4 : base.width,
    };
  }
  if (id === 'deokbaeHowl') {
    const base = SKILL_DEFINITIONS.deokbaeHowl;
    return {
      damage,
      cooldownMs,
      radius: level >= 3 ? 96 : base.radius,
      bucketSize: base.bucketSize,
    };
  }
  const base = SKILL_DEFINITIONS.safetyReport;
  return {
    damage,
    cooldownMs,
    regularStunMs: level >= 3 ? 3600 : base.regularStunMs,
    bossStunMs: level >= 3 ? 1800 : base.bossStunMs,
  };
}

export function resolveScoldCommands(
  origin: Point,
  direction: Point,
  enemies: readonly EnemySnapshot[],
  level: SkillLevel,
): readonly SkillHit[] {
  const stats = resolveSkillStats('scold', level);
  const unit = normalized(direction);
  const minDot = Math.cos((stats.angleDeg! / 2) * Math.PI / 180);
  validateGeometryInput(origin, enemies);
  return aliveInStableOrder(enemies)
    .filter((enemy) => {
      const offset = {
        x: enemy.position.x - origin.x,
        y: enemy.position.y - origin.y,
      };
      const length = Math.hypot(offset.x, offset.y);
      if (length > stats.distance! + GEOMETRY_EPSILON) return false;
      if (length === 0) return true;
      return (offset.x * unit.x + offset.y * unit.y) / length
        >= minDot - GEOMETRY_EPSILON;
    })
    .map((enemy) => {
      const knockback = enemy.isBoss
        ? Math.round(stats.knockback! / 2)
        : stats.knockback!;
      return freezeHit({
        targetId: enemy.id,
        damage: stats.damage,
        nextPathProgress: Math.max(0, enemy.pathProgress - knockback),
      });
    });
}

export function resolveBeamCommands(
  origin: Point,
  direction: Point,
  enemies: readonly EnemySnapshot[],
  level: SkillLevel,
): readonly SkillHit[] {
  const stats = resolveSkillStats('aquaBeam', level);
  const unit = normalized(direction);
  validateGeometryInput(origin, enemies);
  return aliveInStableOrder(enemies)
    .filter((enemy) => {
      const dx = enemy.position.x - origin.x;
      const dy = enemy.position.y - origin.y;
      const along = dx * unit.x + dy * unit.y;
      const perpendicular = Math.abs(dx * unit.y - dy * unit.x);
      return along >= -GEOMETRY_EPSILON
        && along <= stats.length! + GEOMETRY_EPSILON
        && perpendicular <= stats.width! / 2 + GEOMETRY_EPSILON;
    })
    .map((enemy) => freezeHit({ targetId: enemy.id, damage: stats.damage }));
}

export function resolveHowlCommands(
  center: Point,
  enemies: readonly EnemySnapshot[],
  level: SkillLevel,
): readonly SkillHit[] {
  const stats = resolveSkillStats('deokbaeHowl', level);
  validateGeometryInput(center, enemies);
  return aliveInStableOrder(enemies)
    .filter((enemy) => distance(center, enemy.position) <= stats.radius! + GEOMETRY_EPSILON)
    .map((enemy) => freezeHit({ targetId: enemy.id, damage: stats.damage }));
}

export function resolveSafetyCommand(
  origin: Point,
  enemies: readonly EnemySnapshot[],
  level: SkillLevel,
): SkillHit | undefined {
  const target = rankThreatTargets(origin, enemies).at(0);
  if (target === undefined) return undefined;
  const stats = resolveSkillStats('safetyReport', level);
  return freezeHit({
    targetId: target.id,
    damage: stats.damage,
    stunMs: target.isBoss ? stats.bossStunMs! : stats.regularStunMs!,
  });
}

export class SkillSystem {
  private readonly initialLevels: Record<SkillId, SkillLevel>;
  private readonly levels: Record<SkillId, SkillLevel>;
  private readonly remaining = new Map<AutoSkillId, number>();
  private readonly learnedOrder: AutoSkillId[] = [];

  constructor(initialLevels: SkillLevels) {
    validateLevels(initialLevels);
    this.initialLevels = { ...initialLevels };
    this.levels = { ...initialLevels };
    this.initializeAutoSkillState();
  }

  step(stepMs: number, context: SkillContext): readonly SkillCastCommand[] {
    assertFiniteNonNegative(stepMs, 'Skill stepMs');
    validateGeometryInput(context.player, context.enemies);
    const commands: SkillCastCommand[] = [];
    for (const id of AUTO_SKILL_IDS) {
      const level = this.levels[id];
      if (level === 0) continue;
      this.stepSkill(id, level, stepMs, context, commands);
    }
    return commands;
  }

  levelUp(id: SkillId): Exclude<SkillLevel, 0> {
    assertSkillId(id);
    const current = this.levels[id];
    if (current >= 3) throw new RangeError(`${id} is already max level`);
    const next = (current + 1) as Exclude<SkillLevel, 0>;
    this.levels[id] = next;
    if (id === 'bark') return next;

    if (current === 0) {
      this.learnedOrder.push(id);
      this.remaining.set(id, resolveSkillStats(id, next).cooldownMs);
      return next;
    }
    const oldFull = resolveSkillStats(id, current).cooldownMs;
    const remainingRatio = (this.remaining.get(id) ?? 0) / oldFull;
    this.remaining.set(id, resolveSkillStats(id, next).cooldownMs * remainingRatio);
    return next;
  }

  snapshot(id: SkillId): SkillSnapshot {
    assertSkillId(id);
    const level = this.levels[id];
    if (id === 'bark') {
      return { level, cooldownRemainingMs: 0, ready: level > 0, progress: level > 0 ? 1 : 0 };
    }
    const cooldownRemainingMs = this.remaining.get(id) ?? 0;
    const full = level === 0 ? 0 : resolveSkillStats(id, level).cooldownMs;
    return {
      level,
      cooldownRemainingMs,
      ready: level > 0 && cooldownRemainingMs <= TIME_EPSILON_MS,
      progress: level === 0 ? 0 : clampUnit(1 - cooldownRemainingMs / full),
    };
  }

  levelsSnapshot(): SkillLevels {
    return { ...this.levels };
  }

  learnedOrderSnapshot(): readonly AutoSkillId[] {
    return [...this.learnedOrder];
  }

  cooldownProgressSnapshot(): Readonly<Record<SkillId, number>> {
    return {
      bark: 0,
      scold: this.snapshot('scold').progress,
      aquaBeam: this.snapshot('aquaBeam').progress,
      deokbaeHowl: this.snapshot('deokbaeHowl').progress,
      safetyReport: this.snapshot('safetyReport').progress,
    };
  }

  reset(): void {
    for (const id of Object.keys(this.initialLevels) as SkillId[]) {
      this.levels[id] = this.initialLevels[id];
    }
    this.initializeAutoSkillState();
  }

  private initializeAutoSkillState(): void {
    this.remaining.clear();
    this.learnedOrder.length = 0;
    for (const id of AUTO_SKILL_IDS) {
      const level = this.levels[id];
      if (level === 0) continue;
      this.learnedOrder.push(id);
      this.remaining.set(id, resolveSkillStats(id, level).cooldownMs);
    }
  }

  private stepSkill(
    id: AutoSkillId,
    level: Exclude<SkillLevel, 0>,
    stepMs: number,
    context: SkillContext,
    commands: SkillCastCommand[],
  ): void {
    let unconsumedMs = stepMs;
    while (true) {
      const remainingMs = this.remaining.get(id) ?? 0;
      if (remainingMs > TIME_EPSILON_MS) {
        if (unconsumedMs + TIME_EPSILON_MS < remainingMs) {
          this.remaining.set(id, remainingMs - unconsumedMs);
          return;
        }
        unconsumedMs = subtractBoundary(unconsumedMs, remainingMs);
        this.remaining.set(id, 0);
      }

      const command = resolveCast(id, level, context);
      if (command === undefined) return;
      commands.push(command);
      this.remaining.set(id, resolveSkillStats(id, level).cooldownMs);
      if (unconsumedMs <= TIME_EPSILON_MS) return;
    }
  }
}

function resolveCast(
  id: AutoSkillId,
  level: Exclude<SkillLevel, 0>,
  context: SkillContext,
): SkillCastCommand | undefined {
  if (id === 'scold') {
    const stats = resolveSkillStats(id, level);
    const target = selectThreatTarget(context.player, context.enemies, stats.distance);
    if (target === undefined) return undefined;
    const direction = normalized(directionTo(context.player, target.position));
    const hits = resolveScoldCommands(context.player, direction, context.enemies, level);
    return commandFor(id, hits, {
      kind: id,
      origin: copyPoint(context.player),
      direction: copyPoint(direction),
      length: stats.distance!,
      angleDeg: stats.angleDeg!,
      targetPositions: targetPositions(hits, context.enemies),
    });
  }
  if (id === 'aquaBeam') {
    const stats = resolveSkillStats(id, level);
    const target = selectThreatTarget(context.player, context.enemies, stats.length);
    if (target === undefined) return undefined;
    const direction = normalized(directionTo(context.player, target.position));
    const hits = resolveBeamCommands(context.player, direction, context.enemies, level);
    return commandFor(id, hits, {
      kind: id,
      origin: copyPoint(context.player),
      direction: copyPoint(direction),
      length: stats.length!,
      width: stats.width!,
      targetPositions: targetPositions(hits, context.enemies),
    });
  }
  if (id === 'deokbaeHowl') {
    const stats = resolveSkillStats(id, level);
    const center = chooseHowlCenter(context.enemies, stats.bucketSize!, {
      width: 540,
      height: 960,
    });
    if (center === undefined) return undefined;
    const hits = resolveHowlCommands(center, context.enemies, level);
    if (hits.length === 0) return undefined;
    return commandFor(id, hits, {
      kind: id,
      center: copyPoint(center),
      radius: stats.radius!,
      targetPositions: targetPositions(hits, context.enemies),
    });
  }
  const hit = resolveSafetyCommand(context.player, context.enemies, level);
  if (hit === undefined) return undefined;
  const target = context.enemies.find(({ id: targetId }) => targetId === hit.targetId);
  if (target === undefined) throw new Error('Safety target disappeared during resolution');
  return commandFor(id, [hit], {
    kind: id,
    origin: copyPoint(context.player),
    targetPosition: copyPoint(target.position),
    targetId: target.id,
  });
}

function commandFor(
  skillId: AutoSkillId,
  hits: readonly SkillHit[],
  visual: SkillCastVisual,
): SkillCastCommand {
  const frozenHits = Object.freeze([...hits]);
  return Object.freeze({
    type: 'skillCast',
    skillId,
    targetIds: Object.freeze(frozenHits.map(({ targetId }) => targetId)),
    hits: frozenHits,
    visual: freezeVisual(visual),
  });
}

function targetPositions(
  hits: readonly SkillHit[],
  enemies: readonly EnemySnapshot[],
): readonly SkillTargetPosition[] {
  return Object.freeze(hits.map(({ targetId }) => {
    const enemy = enemies.find(({ id }) => id === targetId);
    if (enemy === undefined) throw new Error(`Skill target ${targetId} disappeared during resolution`);
    return Object.freeze({ targetId, position: Object.freeze(copyPoint(enemy.position)) });
  }));
}

function freezeVisual(visual: SkillCastVisual): SkillCastVisual {
  if (visual.kind === 'scold' || visual.kind === 'aquaBeam') {
    return Object.freeze({
      ...visual,
      origin: Object.freeze(copyPoint(visual.origin)),
      direction: Object.freeze(copyPoint(visual.direction)),
      targetPositions: visual.targetPositions,
    });
  }
  if (visual.kind === 'deokbaeHowl') {
    return Object.freeze({
      ...visual,
      center: Object.freeze(copyPoint(visual.center)),
      targetPositions: visual.targetPositions,
    });
  }
  return Object.freeze({
    ...visual,
    origin: Object.freeze(copyPoint(visual.origin)),
    targetPosition: Object.freeze(copyPoint(visual.targetPosition)),
  });
}

function freezeHit(hit: SkillHit): SkillHit {
  return Object.freeze({ ...hit });
}

function aliveInStableOrder(enemies: readonly EnemySnapshot[]): readonly EnemySnapshot[] {
  return enemies
    .filter(({ state }) => state !== 'dead')
    .slice()
    .sort((left, right) => (
      left.spawnSequence - right.spawnSequence
      || left.id - right.id
    ));
}

function normalized(vector: Point): Point {
  assertPoint(vector, 'Skill direction');
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) throw new RangeError('Skill direction must be non-zero');
  return { x: vector.x / length, y: vector.y / length };
}

function directionTo(origin: Point, target: Point): Point {
  const direction = { x: target.x - origin.x, y: target.y - origin.y };
  return direction.x === 0 && direction.y === 0 ? { x: 0, y: -1 } : direction;
}

function validateGeometryInput(origin: Point, enemies: readonly EnemySnapshot[]): void {
  rankThreatTargets(origin, enemies);
}

function validateLevels(levels: SkillLevels): void {
  for (const id of SKILL_IDS) {
    const level = levels[id];
    if (!Number.isSafeInteger(level) || level < 0 || level > 3) {
      throw new RangeError(`${id} level must be an integer from 0 to 3`);
    }
  }
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}

function assertAutoSkillId(id: AutoSkillId): void {
  if (!(AUTO_SKILL_IDS as readonly string[]).includes(id)) {
    throw new RangeError(`Unknown auto skill ${String(id)}`);
  }
}

function assertSkillId(id: SkillId): void {
  if (!(SKILL_IDS as readonly string[]).includes(id)) {
    throw new RangeError(`Unknown skill ${String(id)}`);
  }
}

function copyPoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function subtractBoundary(remainingMs: number, boundaryMs: number): number {
  const next = remainingMs - boundaryMs;
  return next <= TIME_EPSILON_MS ? 0 : next;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const GEOMETRY_EPSILON = 1e-9;
const SKILL_IDS: readonly SkillId[] = ['bark', ...AUTO_SKILL_IDS];
