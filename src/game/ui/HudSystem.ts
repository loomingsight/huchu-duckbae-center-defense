import type Phaser from 'phaser';
import type { RunSnapshot } from '../session/RunSnapshot';
import { BossHud, type BossHudSnapshot } from './BossHud';
import { SkillHud, type SkillHudState, type SkillSlotDisplaySnapshot } from './SkillHud';
import { TopHud, type TopHudSnapshot } from './TopHud';

export interface HudSnapshot {
  readonly top: TopHudSnapshot;
  readonly skillSlots: readonly SkillSlotDisplaySnapshot[];
  readonly bossBar: BossHudSnapshot | null;
}

export class HudSystem {
  private readonly top: TopHud;
  private readonly skills: SkillHud;
  private readonly boss: BossHud;

  constructor(scene: Phaser.Scene) {
    this.top = new TopHud(scene);
    this.skills = new SkillHud(scene);
    this.boss = new BossHud(scene);
  }

  render(run: RunSnapshot, skills: SkillHudState): void {
    this.top.render({
      shelterHp: run.shelterHp,
      wave: run.wave,
      snacks: run.snacks,
    });
    this.skills.render(skills);
    this.boss.render(run.enemies);
  }

  step(stepMs: number): void {
    this.boss.step(stepMs);
  }

  reset(): void {
    this.boss.reset();
  }

  snapshot(): HudSnapshot {
    return {
      top: this.top.snapshot(),
      skillSlots: this.skills.snapshot(),
      bossBar: this.boss.snapshot(),
    };
  }

  destroy(): void {
    this.top.destroy();
    this.skills.destroy();
    this.boss.destroy();
  }
}
