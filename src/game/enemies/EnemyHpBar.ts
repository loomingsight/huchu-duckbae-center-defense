import type Phaser from 'phaser';

export const ENEMY_HP_BAR_WIDTH = 30;
export const ENEMY_HP_BAR_HEIGHT = 4;

export function enemyHpRatio(current: number, max: number): number {
  if (
    !Number.isFinite(current)
    || !Number.isFinite(max)
    || current < 0
    || max <= 0
    || current > max
  ) {
    throw new RangeError('Enemy HP requires 0 <= current <= finite positive max');
  }
  return current / max;
}

export function enemyHpColor(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new RangeError('Enemy HP ratio must be finite from 0 to 1');
  }
  return ratio > 0.5 ? 0x39a852 : ratio >= 0.2 ? 0xf2ca45 : 0xd94b43;
}

export class EnemyHpBar {
  constructor(private readonly graphics: Phaser.GameObjects.Graphics) {}

  render(current: number, max: number): void {
    const ratio = enemyHpRatio(current, max);
    this.graphics.clear();
    this.graphics.fillStyle(0x2a241f, 0.75);
    this.graphics.fillRect(
      -ENEMY_HP_BAR_WIDTH / 2,
      -ENEMY_HP_BAR_HEIGHT / 2,
      ENEMY_HP_BAR_WIDTH,
      ENEMY_HP_BAR_HEIGHT,
    );
    this.graphics.fillStyle(enemyHpColor(ratio), 1);
    this.graphics.fillRect(
      -ENEMY_HP_BAR_WIDTH / 2,
      -ENEMY_HP_BAR_HEIGHT / 2,
      ENEMY_HP_BAR_WIDTH * ratio,
      ENEMY_HP_BAR_HEIGHT,
    );
    this.graphics.setActive(true).setVisible(true);
  }

  reset(): void {
    this.graphics.clear();
    this.graphics.setAlpha(1).setActive(false).setVisible(false);
  }
}
