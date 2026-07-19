import { TIME_EPSILON_MS } from '../constants';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { SkillLevel } from '../types/GameTypes';

const RELEASE_MS = 250;
const LEVEL_ONE_CADENCE_MS = 650;
const LEVEL_THREE_CADENCE_MS = 520;
const ENEMY_STATES = new Set<string>([
  'moving',
  'windup',
  'holding',
  'stunned',
  'dead',
]);

type BarkPhase = 'ready' | 'windup' | 'cooldown';

export type BarkEvent =
  | { readonly type: 'barkStarted'; readonly targetId: number }
  | { readonly type: 'barkReleased'; readonly targetId: number }
  | {
    readonly type: 'damageRequested';
    readonly targetId: number;
    readonly amount: number;
    readonly source: 'bark';
  };

export interface BarkSnapshot {
  readonly ready: boolean;
  readonly phase: BarkPhase;
  readonly elapsedMs: number;
  readonly lockedTargetId: number | null;
}

export function barkCadenceMs(level: SkillLevel): number {
  assertBarkLevel(level);
  return level >= 3 ? LEVEL_THREE_CADENCE_MS : LEVEL_ONE_CADENCE_MS;
}

export class BarkSystem {
  private phase: BarkPhase = 'ready';
  private cycleElapsedMs = 0;
  private lockedTargetId: number | null = null;

  constructor(private level: SkillLevel) {
    assertBarkLevel(level);
  }

  step(
    stepMs: number,
    target: EnemySnapshot | undefined,
    isAlive: (enemyId: number) => boolean = (enemyId) => (
      target?.id === enemyId && target.state !== 'dead'
    ),
  ): readonly BarkEvent[] {
    assertFiniteNonNegative(stepMs, 'Bark stepMs');
    if (target !== undefined) assertTarget(target);
    if (typeof isAlive !== 'function') throw new RangeError('Bark isAlive must be a function');

    const events: BarkEvent[] = [];
    if (this.phase === 'ready' && !this.start(target, isAlive, events)) return events;

    let remainingMs = stepMs;
    while (this.phase !== 'ready') {
      if (this.phase === 'windup') {
        const untilReleaseMs = RELEASE_MS - this.cycleElapsedMs;
        if (!crossesBoundary(remainingMs, untilReleaseMs)) {
          this.cycleElapsedMs += remainingMs;
          break;
        }

        this.cycleElapsedMs = RELEASE_MS;
        remainingMs = subtractBoundary(remainingMs, untilReleaseMs);
        const releasedTargetId = this.lockedTargetId;
        if (releasedTargetId === null) throw new Error('Bark windup requires a locked target');
        events.push({ type: 'barkReleased', targetId: releasedTargetId });
        if (isAlive(releasedTargetId)) {
          events.push({
            type: 'damageRequested',
            targetId: releasedTargetId,
            amount: this.damage,
            source: 'bark',
          });
        }
        this.phase = 'cooldown';
      }

      if (this.phase === 'cooldown') {
        const untilCadenceMs = Math.max(0, this.cadenceMs - this.cycleElapsedMs);
        if (!crossesBoundary(remainingMs, untilCadenceMs)) {
          this.cycleElapsedMs += remainingMs;
          break;
        }

        remainingMs = subtractBoundary(remainingMs, untilCadenceMs);
        this.phase = 'ready';
        this.cycleElapsedMs = 0;
        this.lockedTargetId = null;
        if (!this.start(target, isAlive, events)) break;
        if (remainingMs === 0) break;
      }
    }
    return events;
  }

  setLevel(level: SkillLevel): void {
    assertBarkLevel(level);
    this.level = level;
  }

  cadenceDurationMs(): number {
    return barkCadenceMs(this.level);
  }

  reset(): void {
    this.phase = 'ready';
    this.cycleElapsedMs = 0;
    this.lockedTargetId = null;
  }

  snapshot(): BarkSnapshot {
    return {
      ready: this.phase === 'ready',
      phase: this.phase,
      elapsedMs: this.cycleElapsedMs,
      lockedTargetId: this.lockedTargetId,
    };
  }

  private start(
    target: EnemySnapshot | undefined,
    isAlive: (enemyId: number) => boolean,
    events: BarkEvent[],
  ): boolean {
    if (target === undefined || target.state === 'dead' || !isAlive(target.id)) return false;
    this.phase = 'windup';
    this.cycleElapsedMs = 0;
    this.lockedTargetId = target.id;
    events.push({ type: 'barkStarted', targetId: target.id });
    return true;
  }

  private get damage(): number {
    return this.level >= 2 ? 13 : 10;
  }

  private get cadenceMs(): number {
    return this.cadenceDurationMs();
  }
}

function crossesBoundary(remainingMs: number, untilBoundaryMs: number): boolean {
  return remainingMs + TIME_EPSILON_MS >= untilBoundaryMs;
}

function subtractBoundary(remainingMs: number, boundaryMs: number): number {
  const next = remainingMs - boundaryMs;
  return next <= TIME_EPSILON_MS ? 0 : next;
}

function assertBarkLevel(level: SkillLevel): void {
  if (!Number.isSafeInteger(level) || level < 1 || level > 3) {
    throw new RangeError('Bark level must be an integer from 1 to 3');
  }
}

function assertTarget(target: EnemySnapshot): void {
  if (!Number.isSafeInteger(target.id) || target.id < 0) {
    throw new RangeError('Bark target id must be a non-negative safe integer');
  }
  if (!ENEMY_STATES.has(target.state)) {
    throw new RangeError(`Unknown bark target state ${String(target.state)}`);
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
