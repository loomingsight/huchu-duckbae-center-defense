import type Phaser from 'phaser';

const BAR_WIDTH = 72;
const BAR_HEIGHT = 6;
const BAR_OFFSET_Y = 10;

export function playerHpColor(current: number, maximum: number): number {
  assertHp(current, maximum);
  const ratio = current / maximum;
  if (ratio >= 0.67) return 0x5f9f55;
  if (ratio >= 0.34) return 0xd7a62d;
  if (ratio > 0) return 0xd96745;
  return 0x685b52;
}

export class PlayerHpView {
  private readonly bar: Phaser.GameObjects.Graphics;
  private destroyed = false;
  private flashRemainingMs = 0;
  private lastRender = { current: 1000, maximum: 1000, x: 0, footY: 0 };

  constructor(scene: Phaser.Scene, x: number, footY: number) {
    this.bar = scene.add.graphics().setDepth(footY + 2).setName('player-hp-bar');
    this.render(1000, 1000, x, footY);
  }

  render(current: number, maximum: number, x: number, footY: number): void {
    assertHp(current, maximum);
    if (this.destroyed) return;
    this.lastRender = { current, maximum, x, footY };
    const ratio = current / maximum;
    const color = this.flashRemainingMs > 0 ? 0xff5a55 : playerHpColor(current, maximum);
    this.bar.clear()
      .fillStyle(0x34291f, 0.82)
      .fillRoundedRect(-BAR_WIDTH / 2 - 1, BAR_OFFSET_Y - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2, 3)
      .fillStyle(color, 1)
      .fillRoundedRect(-BAR_WIDTH / 2, BAR_OFFSET_Y, BAR_WIDTH * ratio, BAR_HEIGHT, 2)
      .setPosition(x, footY)
      .setDepth(footY + 2);
  }

  flashRed(durationMs: number): void {
    assertFiniteNonNegative(durationMs, 'Player HP flash duration');
    if (this.destroyed) return;
    this.flashRemainingMs = durationMs;
    this.rerender();
  }

  step(stepMs: number): void {
    assertFiniteNonNegative(stepMs, 'Player HP flash step');
    if (this.destroyed || this.flashRemainingMs === 0) return;
    this.flashRemainingMs = Math.max(0, this.flashRemainingMs - stepMs);
    if (this.flashRemainingMs === 0) this.rerender();
  }

  reset(current: number, maximum: number, x: number, footY: number): void {
    this.flashRemainingMs = 0;
    this.render(current, maximum, x, footY);
  }

  damageFlashRemainingSnapshot(): number {
    return this.flashRemainingMs;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.bar.removeAllListeners();
    this.bar.destroy();
  }

  private rerender(): void {
    this.render(
      this.lastRender.current,
      this.lastRender.maximum,
      this.lastRender.x,
      this.lastRender.footY,
    );
  }
}

function assertHp(current: number, maximum: number): void {
  if (
    !Number.isSafeInteger(current)
    || !Number.isSafeInteger(maximum)
    || maximum <= 0
    || current < 0
    || current > maximum
  ) {
    throw new RangeError('Player HP must be safe integers within maximum');
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
}
