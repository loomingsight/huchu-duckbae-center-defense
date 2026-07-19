import type { EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { DamageCommand } from './CombatTypes';

export interface DamageTarget {
  damage(targetId: number, amount: number): readonly EnemyLifecycleEvent[];
}

export class CombatSystem {
  constructor(private readonly targets: DamageTarget) {}

  applyDamage(commands: readonly DamageCommand[]): readonly EnemyLifecycleEvent[] {
    commands.forEach(assertDamageCommand);

    const processedTargetsByAttack = new Map<string, Set<number>>();
    const events: EnemyLifecycleEvent[] = [];
    for (const command of commands) {
      if (command.amount <= 0) continue;

      const processedTargets = processedTargetsByAttack.get(command.attackId) ?? new Set<number>();
      if (processedTargets.has(command.targetId)) continue;
      processedTargets.add(command.targetId);
      processedTargetsByAttack.set(command.attackId, processedTargets);
      events.push(...this.targets.damage(command.targetId, command.amount));
    }
    return events;
  }
}

function assertDamageCommand(command: DamageCommand): void {
  if (typeof command.attackId !== 'string' || command.attackId.trim().length === 0) {
    throw new RangeError('Damage attackId must be a non-empty string');
  }
  if (!Number.isSafeInteger(command.targetId) || command.targetId < 0) {
    throw new RangeError('Damage targetId must be a non-negative safe integer');
  }
  if (!Number.isFinite(command.amount)) {
    throw new RangeError('Damage amount must be finite');
  }
}
