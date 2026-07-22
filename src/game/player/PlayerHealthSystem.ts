export interface PlayerDamageResult {
  readonly effectiveAmount: number;
  readonly hp: number;
  readonly lethal: boolean;
}

export class PlayerHealthSystem {
  private hp: number;

  constructor(private readonly maxHp = 1000, initialHp = maxHp) {
    if (
      !Number.isSafeInteger(maxHp)
      || !Number.isSafeInteger(initialHp)
      || maxHp <= 0
      || initialHp < 0
      || initialHp > maxHp
    ) {
      throw new RangeError('Invalid player HP');
    }
    this.hp = initialHp;
  }

  get currentHp(): number {
    return this.hp;
  }

  get maximumHp(): number {
    return this.maxHp;
  }

  damage(amount: number): PlayerDamageResult {
    if (!Number.isFinite(amount)) {
      throw new RangeError('Invalid player damage');
    }
    if (amount <= 0 || this.hp === 0) {
      return { effectiveAmount: 0, hp: this.hp, lethal: this.hp === 0 };
    }
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    return {
      effectiveAmount: before - this.hp,
      hp: this.hp,
      lethal: this.hp === 0,
    };
  }

  reset(): void {
    this.hp = this.maxHp;
  }
}
