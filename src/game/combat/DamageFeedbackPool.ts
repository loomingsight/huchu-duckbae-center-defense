import type Phaser from 'phaser';
import {
  DAMAGE_NUMBER_FONT_STYLES,
  damageNumberFontKey,
} from '../assets/DamageNumberBitmapFont';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import {
  DAMAGE_WORKLOAD_TOPOLOGY,
  type DamageWorkloadCounters,
} from '../presentation/PresentationWorkloadTelemetry';
import type { ImpactStrength } from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import type { DamageAppliedEvent } from './CombatTypes';

export const DAMAGE_NUMBER_CAP = 64;
export const DAMAGE_MERGE_MS = 120;
export const DAMAGE_NUMBER_LIFETIME_MS = 350;

export const IMPACT_STYLE = {
  light: {
    flashMs: 45,
    recoilPx: 2,
    popScale: 1.03,
    fontPx: DAMAGE_NUMBER_FONT_STYLES.light.fontPx,
    risePx: 18,
    color: DAMAGE_NUMBER_FONT_STYLES.light.color,
  },
  medium: {
    flashMs: 60,
    recoilPx: 3,
    popScale: 1.06,
    fontPx: DAMAGE_NUMBER_FONT_STYLES.medium.fontPx,
    risePx: 24,
    color: DAMAGE_NUMBER_FONT_STYLES.medium.color,
  },
  heavy: {
    flashMs: 90,
    recoilPx: 5,
    popScale: 1.08,
    fontPx: DAMAGE_NUMBER_FONT_STYLES.heavy.fontPx,
    risePx: 32,
    color: DAMAGE_NUMBER_FONT_STYLES.heavy.color,
  },
} as const satisfies Record<ImpactStrength, {
  readonly flashMs: number;
  readonly recoilPx: number;
  readonly popScale: number;
  readonly fontPx: number;
  readonly risePx: number;
  readonly color: string;
}>;

export interface DamageNumberSnapshot {
  readonly actorId: number;
  readonly targetId: number | null;
  readonly targetKind: 'enemy' | 'player';
  readonly text: string;
  readonly amount: number;
  readonly strength: ImpactStrength;
  readonly lethal: boolean;
  readonly position: Point;
  readonly ageMs: number;
  readonly fontPx: number;
  readonly color: string;
}

interface DamageNumberInput {
  readonly targetId: number | null;
  readonly targetKind: 'enemy' | 'player';
  readonly effectiveAmount: number;
  readonly position: Point;
  readonly strength: ImpactStrength;
  readonly lethal: boolean;
}

interface DamageNumberCheckpoint {
  readonly input: DamageNumberInput;
  readonly startPosition: Point;
  readonly age: number;
  readonly amount: number;
  readonly order: number;
}

export interface PlayerDamageNumberEvent {
  readonly effectiveAmount: number;
  readonly position: Point;
  readonly strength: Extract<ImpactStrength, 'medium' | 'heavy'>;
}

export class DamageFeedbackPool {
  private readonly pool: ObjectPool<DamageNumberActor>;
  private readonly activeActors: DamageNumberActor[] = [];
  private readonly quarantinedActors = new Set<DamageNumberActor>();
  private readonly counters: Mutable<DamageWorkloadCounters>;
  private nextOrder = 0;

  constructor(scene: Phaser.Scene) {
    this.counters = {
      topology: DAMAGE_WORKLOAD_TOPOLOGY,
      poolInstanceId: 0,
      allocatedRoots: DAMAGE_NUMBER_CAP,
      allocatedChildren: 0,
      active: 0,
      renderEligibleTexts: 0,
      stepPasses: 0,
      activeActorVisits: 0,
      visibleDrawableVisits: 0,
      stateVersion: 0,
      activations: 0,
      merges: 0,
      evictions: 0,
      expirations: 0,
      rejected: 0,
    };
    this.pool = createDamageActorPool(scene, (visible) => {
      this.counters.renderEligibleTexts += visible ? 1 : -1;
    });
    this.counters.poolInstanceId = this.pool.snapshot().instanceId;
  }

  show(event: DamageAppliedEvent): boolean {
    assertDamageEvent(event);
    if (event.effectiveAmount <= 0) {
      this.counters.rejected += 1;
      return false;
    }
    return this.showInput({
      targetId: event.targetId,
      targetKind: 'enemy',
      effectiveAmount: event.effectiveAmount,
      position: event.position,
      strength: event.strength,
      lethal: event.lethal,
    });
  }

  showPlayer(event: PlayerDamageNumberEvent): boolean {
    assertEffectiveAmount(event.effectiveAmount);
    assertPoint(event.position, 'Player damage number position');
    if (event.effectiveAmount <= 0) {
      this.counters.rejected += 1;
      return false;
    }
    return this.showInput({
      targetId: null,
      targetKind: 'player',
      effectiveAmount: event.effectiveAmount,
      position: event.position,
      strength: event.strength,
      lethal: false,
    });
  }

  step(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Damage number stepMs');
    const activeAtStart = this.counters.active;
    const visibleAtStart = this.counters.renderEligibleTexts;
    for (const actor of [...this.activeActors]) {
      if (actor.step(stepMs)) {
        this.counters.stateVersion += 1;
        continue;
      }
      try {
        this.release(actor);
      } finally {
        this.counters.expirations += 1;
      }
    }
    this.counters.stepPasses += 1;
    this.counters.activeActorVisits += activeAtStart;
    this.counters.visibleDrawableVisits += visibleAtStart;
  }

  render(): void {
    let firstFailure: unknown;
    let failed = false;
    for (const actor of this.activeActors) {
      try {
        actor.render();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstFailure = error;
        }
      }
    }
    if (failed) throw firstFailure;
  }

  reset(): void {
    let firstFailure: unknown;
    let failed = false;
    const quarantinedAtStart = [...this.quarantinedActors];
    for (const actor of [...this.activeActors]) {
      try {
        this.release(actor);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstFailure = error;
        }
      }
    }
    for (const actor of quarantinedAtStart) {
      try {
        this.recoverQuarantined(actor);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstFailure = error;
        }
      }
    }
    this.nextOrder = 0;
    if (failed) throw firstFailure;
  }

  snapshot(): PoolSnapshot {
    return this.pool.snapshot();
  }

  workloadCounters(): Readonly<DamageWorkloadCounters> {
    return this.counters;
  }

  active(): readonly DamageNumberSnapshot[] {
    return this.activeActors.map((actor) => actor.snapshot());
  }

  private showInput(input: DamageNumberInput): boolean {
    const merge = this.activeActors.find((actor) => actor.canMerge(input));
    if (merge !== undefined) {
      const checkpoint = merge.checkpoint();
      try {
        merge.merge(input);
      } catch (error) {
        this.counters.rejected += 1;
        try {
          merge.restore(checkpoint);
          this.counters.stateVersion += 1;
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            'Damage number merge and rollback both failed',
          );
        }
        throw error;
      }
      this.counters.merges += 1;
      this.counters.stateVersion += 1;
      return true;
    }
    if (this.activeActors.length === DAMAGE_NUMBER_CAP) {
      const oldest = evictionCandidate(this.activeActors);
      if (oldest === undefined) {
        this.counters.rejected += 1;
        return false;
      }
      return this.replaceAtCapacity(oldest, input);
    }
    const actor = this.pool.acquire();
    if (actor === undefined) {
      this.counters.rejected += 1;
      return false;
    }
    try {
      actor.activate(input, this.nextOrder);
    } catch (activationError) {
      this.counters.rejected += 1;
      let rollbackFailure: unknown;
      try {
        const reset = this.resetForRelease(actor);
        this.finishRelease(actor, reset.safeForReuse);
        if (reset.failed) rollbackFailure = reset.error;
      } catch (error) {
        rollbackFailure = error;
      }
      if (rollbackFailure !== undefined) {
        throw new AggregateError(
          [activationError, rollbackFailure],
          'Damage number activation and rollback both failed',
        );
      }
      throw activationError;
    }
    this.nextOrder += 1;
    this.activeActors.push(actor);
    this.counters.active += 1;
    this.counters.stateVersion += 1;
    this.counters.activations += 1;
    return true;
  }

  private replaceAtCapacity(actor: DamageNumberActor, input: DamageNumberInput): boolean {
    const checkpoint = actor.checkpoint();
    let resetSucceeded = false;
    try {
      actor.reset();
      resetSucceeded = true;
      actor.activate(input, this.nextOrder);
    } catch (error) {
      this.counters.rejected += 1;
      if (resetSucceeded) this.counters.stateVersion += 1;
      try {
        actor.restore(checkpoint);
        this.counters.stateVersion += 1;
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Damage number replacement and rollback both failed',
        );
      }
      throw error;
    }
    this.nextOrder += 1;
    this.counters.stateVersion += 2;
    this.counters.activations += 1;
    this.counters.evictions += 1;
    return true;
  }

  private release(actor: DamageNumberActor): void {
    const index = this.activeActors.indexOf(actor);
    if (index < 0) return;
    this.activeActors.splice(index, 1);
    this.counters.active = this.activeActors.length;
    const reset = this.resetForRelease(actor);
    this.finishRelease(actor, reset.safeForReuse);
    if (reset.failed) throw reset.error;
  }

  private recoverQuarantined(actor: DamageNumberActor): void {
    if (!this.quarantinedActors.has(actor)) return;
    const reset = this.resetForRelease(actor);
    this.finishRelease(actor, reset.safeForReuse);
    if (reset.failed) throw reset.error;
  }

  private resetForRelease(actor: DamageNumberActor): ResetResult {
    let firstFailure: unknown;
    let failed = false;
    try {
      actor.reset();
    } catch (error) {
      failed = true;
      firstFailure = error;
    }
    if (failed && !actor.isResetSafeForReuse) {
      try {
        actor.reset();
      } catch (retryError) {
        firstFailure = new AggregateError(
          [firstFailure, retryError],
          'Damage number reset and retry both failed',
        );
      }
    }
    return {
      failed,
      error: firstFailure,
      safeForReuse: actor.isResetSafeForReuse,
    };
  }

  private finishRelease(actor: DamageNumberActor, safeForReuse: boolean): void {
    if (!safeForReuse) {
      this.quarantinedActors.add(actor);
      this.counters.stateVersion += 1;
      return;
    }
    this.quarantinedActors.delete(actor);
    if (!this.pool.release(actor)) {
      throw new Error('Damage number pool lost ownership of a released actor');
    }
    this.counters.stateVersion += 1;
  }
}

interface ResetResult {
  readonly failed: boolean;
  readonly error: unknown;
  readonly safeForReuse: boolean;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

class DamageNumberActor {
  private readonly textObject: Phaser.GameObjects.BitmapText;
  private input: DamageNumberInput | undefined;
  private startPosition: Point = { x: 0, y: 0 };
  private age = 0;
  private amount = 0;
  private order = -1;
  private active = false;
  private visible = false;
  private motionDirty = false;

  constructor(
    readonly actorId: number,
    scene: Phaser.Scene,
    private readonly visibilityChanged: (visible: boolean) => void,
  ) {
    const textObject = scene.add.bitmapText(
      0,
      0,
      damageNumberFontKey('light'),
      '',
      DAMAGE_NUMBER_FONT_STYLES.light.fontPx,
    );
    this.textObject = textObject;
    try {
      textObject
        .setOrigin(0.5, 1)
        .setDepth(2000);
      this.reset();
    } catch (initializationError) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError(
          [initializationError, cleanupError],
          'Damage number initialization and cleanup both failed',
        );
      }
      throw initializationError;
    }
  }

  activate(input: DamageNumberInput, order: number): void {
    this.input = copyInput(input);
    this.startPosition = { ...input.position };
    this.age = 0;
    this.amount = input.effectiveAmount;
    this.order = order;
    this.renderAppearance();
    this.setActive(true);
    this.setVisible(true);
    this.renderMotion();
  }

  canMerge(input: DamageNumberInput): boolean {
    return this.input !== undefined
      && this.input.targetKind === input.targetKind
      && this.input.targetId === input.targetId
      && this.age <= DAMAGE_MERGE_MS;
  }

  merge(input: DamageNumberInput): void {
    const current = this.requireInput();
    this.amount += input.effectiveAmount;
    this.input = {
      ...copyInput(input),
      strength: maximumStrength(current.strength, input.strength),
      lethal: current.lethal || input.lethal,
    };
    this.startPosition = { ...input.position };
    this.age = 0;
    this.renderAppearance();
    this.renderMotion();
  }

  step(stepMs: number): boolean {
    this.age += stepMs;
    if (this.age >= DAMAGE_NUMBER_LIFETIME_MS) return false;
    if (stepMs > 0) this.motionDirty = true;
    return true;
  }

  render(): void {
    if (!this.motionDirty) return;
    this.renderMotion();
  }

  snapshot(): DamageNumberSnapshot {
    const input = this.requireInput();
    const style = IMPACT_STYLE[input.strength];
    return {
      actorId: this.actorId,
      targetId: input.targetId,
      targetKind: input.targetKind,
      text: String(this.amount),
      amount: this.amount,
      strength: input.strength,
      lethal: input.lethal,
      position: this.position(),
      ageMs: this.age,
      fontPx: style.fontPx,
      color: style.color,
    };
  }

  checkpoint(): DamageNumberCheckpoint {
    return {
      input: copyInput(this.requireInput()),
      startPosition: { ...this.startPosition },
      age: this.age,
      amount: this.amount,
      order: this.order,
    };
  }

  restore(checkpoint: DamageNumberCheckpoint): void {
    this.input = copyInput(checkpoint.input);
    this.startPosition = { ...checkpoint.startPosition };
    this.age = checkpoint.age;
    this.amount = checkpoint.amount;
    this.order = checkpoint.order;
    this.renderAppearance();
    this.setActive(true);
    this.setVisible(true);
    this.renderMotion();
  }

  reset(): void {
    this.input = undefined;
    this.startPosition = { x: 0, y: 0 };
    this.age = 0;
    this.amount = 0;
    this.order = -1;
    this.motionDirty = false;
    runAllAttempts([
      () => { this.textObject.removeAllListeners(); },
      () => { this.textObject.setPosition(0, 0); },
      () => { this.textObject.setAlpha(1); },
      () => { this.textObject.setScale(1); },
      () => { this.setActive(false, true); },
      () => { this.setVisible(false, true); },
    ]);
  }

  destroy(): void {
    runAllAttempts([
      () => { this.textObject.removeAllListeners(); },
      () => { this.textObject.destroy(); },
    ]);
  }

  get isResetSafeForReuse(): boolean {
    return this.input === undefined
      && this.order === -1
      && this.amount === 0
      && !this.active
      && !this.visible;
  }

  get strength(): ImpactStrength | undefined {
    return this.input?.strength;
  }

  get activationOrder(): number {
    return this.order;
  }

  private renderAppearance(): void {
    const input = this.requireInput();
    const style = IMPACT_STYLE[input.strength];
    this.textObject
      .setText(String(this.amount))
      .setFont(damageNumberFontKey(input.strength), style.fontPx);
  }

  private setVisible(visible: boolean, force = false): void {
    const changed = this.visible !== visible;
    if (!changed && !force) return;
    this.textObject.setVisible(visible);
    if (!changed) return;
    this.visible = visible;
    this.visibilityChanged(visible);
  }

  private setActive(active: boolean, force = false): void {
    const changed = this.active !== active;
    if (!changed && !force) return;
    this.textObject.setActive(active);
    if (changed) this.active = active;
  }

  private renderMotion(): void {
    const input = this.requireInput();
    const style = IMPACT_STYLE[input.strength];
    const progress = Math.min(1, this.age / DAMAGE_NUMBER_LIFETIME_MS);
    const popProgress = Math.min(1, this.age / style.flashMs);
    const scale = style.popScale - (style.popScale - 1) * popProgress;
    const position = this.position();
    this.textObject
      .setPosition(position.x, position.y)
      .setScale(scale)
      .setAlpha(1 - progress);
    this.motionDirty = false;
  }

  private position(): Point {
    const input = this.requireInput();
    const style = IMPACT_STYLE[input.strength];
    const progress = Math.min(1, this.age / DAMAGE_NUMBER_LIFETIME_MS);
    return {
      x: this.startPosition.x,
      y: this.startPosition.y - style.risePx * progress,
    };
  }

  private requireInput(): DamageNumberInput {
    if (this.input === undefined) throw new Error('Damage number actor is inactive');
    return this.input;
  }
}

function createDamageActorPool(
  scene: Phaser.Scene,
  visibilityChanged: (visible: boolean) => void,
): ObjectPool<DamageNumberActor> {
  const actors: DamageNumberActor[] = [];
  let actorId = 0;
  try {
    return new ObjectPool(DAMAGE_NUMBER_CAP, () => {
      const actor = new DamageNumberActor(actorId, scene, visibilityChanged);
      actorId += 1;
      actors.push(actor);
      return actor;
    });
  } catch (creationError) {
    let cleanupFailure: unknown;
    let cleanupFailed = false;
    for (const actor of actors) {
      try {
        actor.destroy();
      } catch (error) {
        if (!cleanupFailed) {
          cleanupFailed = true;
          cleanupFailure = error;
        }
      }
    }
    if (cleanupFailed) {
      throw new AggregateError(
        [creationError, cleanupFailure],
        'Damage number pool creation and cleanup both failed',
      );
    }
    throw creationError;
  }
}

function maximumStrength(left: ImpactStrength, right: ImpactStrength): ImpactStrength {
  const order: Record<ImpactStrength, number> = { light: 0, medium: 1, heavy: 2 };
  return order[left] >= order[right] ? left : right;
}

function byOldest(left: DamageNumberActor, right: DamageNumberActor): number {
  return left.activationOrder - right.activationOrder;
}

function evictionCandidate(
  actors: readonly DamageNumberActor[],
): DamageNumberActor | undefined {
  let oldest: DamageNumberActor | undefined;
  let oldestLight: DamageNumberActor | undefined;
  for (const actor of actors) {
    if (oldest === undefined || byOldest(actor, oldest) < 0) oldest = actor;
    if (
      actor.strength === 'light'
      && (oldestLight === undefined || byOldest(actor, oldestLight) < 0)
    ) oldestLight = actor;
  }
  return oldestLight ?? oldest;
}

function copyInput(input: DamageNumberInput): DamageNumberInput {
  return { ...input, position: { ...input.position } };
}

function assertDamageEvent(event: DamageAppliedEvent): void {
  if (!Number.isSafeInteger(event.targetId) || event.targetId < 0) {
    throw new RangeError('Damage number targetId must be a non-negative safe integer');
  }
  assertEffectiveAmount(event.effectiveAmount);
  assertPoint(event.position, 'Damage number position');
}

function assertEffectiveAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Damage number effectiveAmount must be a non-negative safe integer');
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

function runAllAttempts(steps: readonly (() => void)[]): void {
  let firstFailure: unknown;
  let failed = false;
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstFailure = error;
      }
    }
  }
  if (failed) throw firstFailure;
}
