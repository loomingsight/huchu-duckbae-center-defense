import type { PurchasableSkillId, SkillCost } from '../types/GameTypes';
import type { ProgressionSnapshot, SkillPurchaseResult } from './ProgressionTypes';

const COSTS = [15, 25, 40] as const;
const PURCHASABLE_SKILL_IDS = ['tailSwipe', 'aquaBeam', 'safetyReport'] as const;

export class ProgressionSystem {
  private snacks = 0;
  private readonly learned = new Set<PurchasableSkillId>();
  private queued: PurchasableSkillId | null = null;

  addSnacks(amount: number): void {
    if (
      !Number.isSafeInteger(amount)
      || amount < 0
      || !Number.isSafeInteger(this.snacks + amount)
    ) {
      throw new RangeError('Invalid snacks');
    }
    this.snacks += amount;
  }

  queuePurchase(skillId: PurchasableSkillId): SkillPurchaseResult {
    const cost = COSTS[this.learned.size] ?? null;
    if (this.learned.has(skillId)) {
      return this.result('alreadyLearned', skillId, cost, 0);
    }
    if (this.queued !== null) {
      return this.result('queueBusy', skillId, cost, 0);
    }
    if (cost === null || this.snacks < cost) {
      return this.result('insufficientSnacks', skillId, cost, 0);
    }

    this.queued = skillId;
    return this.result('queued', skillId, cost, 0);
  }

  consumeQueuedPurchase(): SkillPurchaseResult | undefined {
    if (this.queued === null) return undefined;

    const skillId = this.queued;
    const cost = COSTS[this.learned.size]!;
    this.queued = null;
    this.snacks -= cost;
    this.learned.add(skillId);
    return this.result('learned', skillId, cost, cost);
  }

  snapshot(): ProgressionSnapshot {
    return {
      snacks: this.snacks,
      learned: Object.fromEntries(
        PURCHASABLE_SKILL_IDS.map((id) => [id, this.learned.has(id)]),
      ) as Record<PurchasableSkillId, boolean>,
      queuedSkillId: this.queued,
      nextCost: COSTS[this.learned.size] ?? null,
    };
  }

  reset(): void {
    this.snacks = 0;
    this.learned.clear();
    this.queued = null;
  }

  private result(
    status: SkillPurchaseResult['status'],
    skillId: PurchasableSkillId,
    cost: SkillCost | null,
    spent: number,
  ): SkillPurchaseResult {
    return {
      status,
      skillId,
      cost,
      spent,
      snacks: this.snacks,
      nextCost: COSTS[this.learned.size] ?? null,
    };
  }
}
