import type Phaser from 'phaser';
import type { ShelterVisualState } from '../shelter/ShelterTypes';

const BAR_WIDTH = 92;
const BAR_HEIGHT = 7;

export function shelterVisualState(current: number, maximum: number): ShelterVisualState {
  assertHp(current, maximum);
  const ratio = current / maximum;
  if (ratio >= 0.67) return 'healthy';
  if (ratio >= 0.34) return 'damaged';
  if (ratio > 0) return 'critical';
  return 'failed';
}

export function formatShelterHp(current: number, maximum: number): string {
  assertHp(current, maximum);
  return `${current.toLocaleString('en-US')} / ${maximum.toLocaleString('en-US')}`;
}

export class ShelterHpView {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private destroyed = false;
  private flashRemainingMs = 0;
  private lastRender = { current: 1000, maximum: 1000, x: 0, footY: 0 };

  constructor(scene: Phaser.Scene, x: number, footY: number) {
    this.bar = scene.add.graphics().setDepth(footY + 2).setName('shelter-hp-bar');
    this.text = scene.add.text(x, footY + 21, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#34291f',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(footY + 3).setName('shelter-hp-text');
    this.moveTo(x, footY);
  }

  render(current: number, maximum: number, x: number, footY: number): void {
    if (this.destroyed) return;
    this.lastRender = { current, maximum, x, footY };
    const state = shelterVisualState(current, maximum);
    const ratio = current / maximum;
    const color = this.flashRemainingMs > 0 ? 0xd94b45
      : state === 'healthy' ? 0x5f9f55
      : state === 'damaged' ? 0xd7a62d
        : state === 'critical' ? 0xd96745 : 0x685b52;
    this.bar.clear()
      .fillStyle(0x34291f, 0.82)
      .fillRoundedRect(-BAR_WIDTH / 2 - 1, 11, BAR_WIDTH + 2, BAR_HEIGHT + 2, 3)
      .fillStyle(color, 1)
      .fillRoundedRect(-BAR_WIDTH / 2, 12, BAR_WIDTH * ratio, BAR_HEIGHT, 2);
    this.text.setText(formatShelterHp(current, maximum));
    this.moveTo(x, footY);
  }

  moveTo(x: number, footY: number): void {
    if (this.destroyed) return;
    this.bar.setPosition(x, footY);
    this.text.setPosition(x, footY + 21);
  }

  reset(current: number, maximum: number, x: number, footY: number): void {
    this.flashRemainingMs = 0;
    this.render(current, maximum, x, footY);
  }

  flashRed(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError('Shelter HP flash duration must be finite and non-negative');
    }
    if (this.destroyed) return;
    this.flashRemainingMs = durationMs;
    this.render(
      this.lastRender.current,
      this.lastRender.maximum,
      this.lastRender.x,
      this.lastRender.footY,
    );
  }

  step(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Shelter HP flash step must be finite and non-negative');
    }
    if (this.destroyed || this.flashRemainingMs === 0) return;
    this.flashRemainingMs = Math.max(0, this.flashRemainingMs - stepMs);
    if (this.flashRemainingMs === 0) {
      this.render(
        this.lastRender.current,
        this.lastRender.maximum,
        this.lastRender.x,
        this.lastRender.footY,
      );
    }
  }

  damageFlashRemainingSnapshot(): number {
    return this.flashRemainingMs;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.bar.removeAllListeners();
    this.text.removeAllListeners();
    this.bar.destroy();
    this.text.destroy();
  }
}

function assertHp(current: number, maximum: number): void {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(maximum) || maximum <= 0
    || current < 0 || current > maximum) {
    throw new RangeError('Shelter HP must be safe integers within maximum');
  }
}
