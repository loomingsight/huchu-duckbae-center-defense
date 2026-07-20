import { impactStrengthFor } from '../skills/skillDefinitions';
import type {
  CombatEvent,
  DamageAppliedEvent,
  DamageCommand,
  EnemyDamageResult,
} from './CombatTypes';

const UNIT_VECTOR_EPSILON = 1e-9;

export interface DamageTarget {
  damage(targetId: number, amount: number): EnemyDamageResult;
}

export class CombatSystem {
  constructor(private readonly targets: DamageTarget) {}

  applyDamage(
    commands: readonly DamageCommand[],
    appliedAtStep: number,
  ): readonly CombatEvent[] {
    assertAppliedAtStep(appliedAtStep);
    commands.forEach(assertDamageCommand);

    const processedTargetsByCast = new Map<string, Set<number>>();
    const events: CombatEvent[] = [];
    for (const command of commands) {
      if (command.amount <= 0) continue;

      const processedTargets = processedTargetsByCast.get(command.castId) ?? new Set<number>();
      if (processedTargets.has(command.targetId)) continue;
      processedTargets.add(command.targetId);
      processedTargetsByCast.set(command.castId, processedTargets);

      const result = this.targets.damage(command.targetId, command.amount);
      assertDamageResult(result);
      const applied: DamageAppliedEvent = {
        type: 'damageApplied',
        castId: command.castId,
        appliedAtStep,
        targetId: command.targetId,
        amount: command.amount,
        effectiveAmount: Math.min(command.amount, Math.max(0, result.effectiveAmount)),
        position: { ...result.position },
        impactDirection: { ...command.impactDirection },
        source: command.source,
        strength: command.strength,
        lethal: result.lethal,
      };
      events.push(applied, ...result.lifecycleEvents);
    }
    return events;
  }
}

function assertDamageCommand(command: DamageCommand): void {
  if (typeof command.castId !== 'string' || command.castId.trim().length === 0) {
    throw new RangeError('Damage castId must be a non-empty string');
  }
  if (!Number.isSafeInteger(command.targetId) || command.targetId < 0) {
    throw new RangeError('Damage targetId must be a non-negative safe integer');
  }
  if (!Number.isFinite(command.amount)) {
    throw new RangeError('Damage amount must be finite');
  }
  assertPoint(command.impactDirection, 'Damage impactDirection');
  const directionLength = Math.hypot(command.impactDirection.x, command.impactDirection.y);
  if (Math.abs(directionLength - 1) > UNIT_VECTOR_EPSILON) {
    throw new RangeError('Damage impactDirection must be normalized');
  }
  const expectedStrength = impactStrengthFor(command.source);
  if (command.strength !== expectedStrength) {
    throw new RangeError(`Damage strength for ${command.source} must be ${expectedStrength}`);
  }
}

function assertDamageResult(result: EnemyDamageResult): void {
  if (!Number.isFinite(result.effectiveAmount)) {
    throw new RangeError('Enemy effective damage must be finite');
  }
  assertPoint(result.position, 'Enemy damage position');
  if (typeof result.lethal !== 'boolean') {
    throw new RangeError('Enemy damage lethal must be boolean');
  }
  if (!Array.isArray(result.lifecycleEvents)) {
    throw new RangeError('Enemy damage lifecycleEvents must be an array');
  }
}

function assertAppliedAtStep(appliedAtStep: number): void {
  if (!Number.isSafeInteger(appliedAtStep) || appliedAtStep < 0) {
    throw new RangeError('Damage appliedAtStep must be a non-negative safe integer');
  }
}

function assertPoint(point: { readonly x: number; readonly y: number }, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${label} must be finite`);
  }
}
