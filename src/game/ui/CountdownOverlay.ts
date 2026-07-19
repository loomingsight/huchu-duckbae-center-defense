import type Phaser from 'phaser';

export type CountdownKind = 'resumeCombat' | 'nextWave' | 'lostResult';

export function countdownLabel(remainingMs: number, kind: CountdownKind): string {
  if (!Number.isFinite(remainingMs) || remainingMs < 0) {
    throw new RangeError('Countdown remaining time must be finite and non-negative');
  }
  if (remainingMs === 0 || kind === 'lostResult') return '';
  const count = Math.ceil(remainingMs / 1000);
  return kind === 'nextWave' ? `다음 웨이브 ${count}` : String(count);
}

export class CountdownOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add.text(270, 420, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '64px',
      color: '#ffffff',
      stroke: '#34291f',
      strokeThickness: 8,
      align: 'center',
    }).setOrigin(0.5).setDepth(1900).setVisible(false);
  }

  render(remainingMs: number, kind: CountdownKind): void {
    if (this.destroyed) return;
    const label = countdownLabel(remainingMs, kind);
    this.text.setText(label).setVisible(label.length > 0);
  }

  reset(): void {
    this.render(0, 'resumeCombat');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.text.removeAllListeners();
    this.text.destroy();
    this.destroyed = true;
  }
}
