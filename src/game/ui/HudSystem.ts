import type Phaser from 'phaser';
import type { RunSnapshot } from '../session/RunSnapshot';
import { SkillHud, type SkillHudState, type SkillSlotDisplaySnapshot } from './SkillHud';
import { TopHud, type TopHudSnapshot } from './TopHud';

export interface HudSnapshot {
  readonly top: TopHudSnapshot;
  readonly skillSlots: readonly SkillSlotDisplaySnapshot[];
}

export class HudSystem {
  private readonly top: TopHud;
  private readonly skills: SkillHud;

  constructor(scene: Phaser.Scene) {
    this.top = new TopHud(scene);
    this.skills = new SkillHud(scene);
  }

  render(run: RunSnapshot, skills: SkillHudState): void {
    this.top.render({
      shelterHp: run.shelterHp,
      wave: run.wave,
      snacks: run.snacks,
    });
    this.skills.render(skills);
  }

  snapshot(): HudSnapshot {
    return {
      top: this.top.snapshot(),
      skillSlots: this.skills.snapshot(),
    };
  }

  destroy(): void {
    this.top.destroy();
    this.skills.destroy();
  }
}
