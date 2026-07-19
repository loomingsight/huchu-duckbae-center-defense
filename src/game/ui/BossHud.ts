import type Phaser from 'phaser';
import { subtractDuration } from '../constants';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { EnemyKind } from '../types/GameTypes';

export const BOSS_HUD = { x: 130, y: 58, width: 280, height: 12 } as const;
export const BOSS_NOTICE_MS = 900;

export interface BossHudSnapshot {
  readonly name: string;
  readonly width: 280;
  readonly height: 12;
  readonly noticeVisible: boolean;
}

export function bossName(kind: EnemyKind): string | undefined {
  if (kind === 'dogTrader') return '개장수';
  if (kind === 'illegalBreeder') return '불법번식업자';
  return undefined;
}

export class BossHud {
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly noticeText: Phaser.GameObjects.Text;
  private activeBossId: number | null = null;
  private activeName: string | null = null;
  private noticeRemainingMs = 0;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.nameText = scene.add.text(270, 38, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#34291f',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1850).setVisible(false).setName('boss-name');
    this.bar = scene.add.graphics().setDepth(1850).setVisible(false).setName('boss-hp-bar');
    this.noticeText = scene.add.text(270, 320, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '34px',
      color: '#ffe8a3',
      stroke: '#34291f',
      strokeThickness: 7,
      align: 'center',
    }).setOrigin(0.5).setDepth(1950).setVisible(false).setName('boss-notice');
  }

  render(enemies: readonly EnemySnapshot[]): void {
    if (this.destroyed) return;
    const boss = enemies.find((enemy) => enemy.isBoss && enemy.state !== 'dead');
    if (boss === undefined) {
      this.hide();
      return;
    }
    const name = bossName(boss.kind);
    if (name === undefined) throw new Error(`Boss ${boss.kind} has no display name`);
    if (this.activeBossId !== boss.id) {
      this.activeBossId = boss.id;
      this.activeName = name;
      this.noticeRemainingMs = BOSS_NOTICE_MS;
      this.noticeText.setText(`${name} 등장!`);
    }

    const ratio = Math.max(0, Math.min(1, boss.currentHp / boss.maxHp));
    this.nameText.setText(name).setVisible(true);
    this.bar
      .clear()
      .fillStyle(0x2f2824, 0.95)
      .fillRect(BOSS_HUD.x, BOSS_HUD.y, BOSS_HUD.width, BOSS_HUD.height)
      .fillStyle(0xd94b43, 1)
      .fillRect(BOSS_HUD.x, BOSS_HUD.y, BOSS_HUD.width * ratio, BOSS_HUD.height)
      .setVisible(true);
    this.noticeText.setVisible(this.noticeRemainingMs > 0);
  }

  step(stepMs: number): void {
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('Boss HUD stepMs must be finite and non-negative');
    }
    if (this.destroyed || this.activeBossId === null || this.noticeRemainingMs === 0) return;
    this.noticeRemainingMs = subtractDuration(this.noticeRemainingMs, stepMs);
    this.noticeText.setVisible(this.noticeRemainingMs > 0);
  }

  snapshot(): BossHudSnapshot | null {
    if (this.activeBossId === null || this.activeName === null) return null;
    return {
      name: this.activeName,
      width: BOSS_HUD.width,
      height: BOSS_HUD.height,
      noticeVisible: this.noticeRemainingMs > 0,
    };
  }

  reset(): void {
    if (this.destroyed) return;
    this.hide();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.activeBossId = null;
    this.activeName = null;
    this.noticeRemainingMs = 0;
    this.nameText.removeAllListeners().destroy();
    this.bar.removeAllListeners().destroy();
    this.noticeText.removeAllListeners().destroy();
    this.destroyed = true;
  }

  private hide(): void {
    this.activeBossId = null;
    this.activeName = null;
    this.noticeRemainingMs = 0;
    this.nameText.setText('').setVisible(false);
    this.bar.clear().setVisible(false);
    this.noticeText.setText('').setVisible(false);
  }
}
