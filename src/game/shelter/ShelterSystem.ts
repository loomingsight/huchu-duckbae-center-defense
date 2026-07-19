import type { ShelterVisualState } from './ShelterTypes';

export interface ShelterDamageEvent {
  readonly type: 'shelterDamaged';
  readonly hp: number;
  readonly visual: ShelterVisualState;
}

export function shelterVisualState(hp: number, maxHp: number): ShelterVisualState {
  const ratio = hp / maxHp;
  return ratio >= 0.67
    ? 'healthy'
    : ratio >= 0.34
      ? 'damaged'
      : ratio > 0
        ? 'critical'
        : 'failed';
}

export class ShelterSystem {
  private hp: number;

  constructor(private readonly maxHp = 100, initialHp = maxHp) {
    if (
      !Number.isFinite(maxHp)
      || !Number.isFinite(initialHp)
      || maxHp <= 0
      || initialHp < 0
      || initialHp > maxHp
    ) {
      throw new RangeError('Invalid shelter HP');
    }
    this.hp = initialHp;
  }

  get currentHp(): number {
    return this.hp;
  }

  damage(amount: number): readonly ShelterDamageEvent[] {
    if (!Number.isFinite(amount)) throw new RangeError('Invalid shelter damage');
    if (this.hp <= 0 || amount <= 0) return [];
    this.hp = Math.max(0, this.hp - amount);
    return [{
      type: 'shelterDamaged',
      hp: this.hp,
      visual: shelterVisualState(this.hp, this.maxHp),
    }];
  }

  reset(): void {
    this.hp = this.maxHp;
  }
}
