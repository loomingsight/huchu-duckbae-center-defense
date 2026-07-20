import Phaser from 'phaser';
import { ensureSkillIconTextures } from '../assets/SkillIconTextures';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import { validateGameData } from '../data/validateGameData';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import { RuntimeErrorOverlay } from '../ui/RuntimeErrorOverlay';

export class BootScene extends Phaser.Scene {
  private generation = 0;
  private errorOverlay: RuntimeErrorOverlay | undefined;

  constructor() {
    super('Boot');
  }

  init(): void {
    this.generation += 1;
  }

  create(): void {
    const generation = this.generation;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.generation += 1;
      this.errorOverlay?.destroy();
      this.errorOverlay = undefined;
    });
    void this.validateAndContinue(generation);
  }

  private async validateAndContinue(generation: number): Promise<void> {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      throw new Error('WebGL renderer is required.');
    }
    let paths = PATH_DEFINITIONS;
    if (import.meta.env.MODE === 'e2e') {
      const { overrideGamePaths } = await import('../debug/E2eBootOverrides');
      paths = overrideGamePaths(PATH_DEFINITIONS) as typeof PATH_DEFINITIONS;
    }
    if (generation !== this.generation) return;
    const errors = validateGameData({ paths, waves: WAVE_DEFINITIONS });
    if (errors.length > 0) {
      this.errorOverlay = new RuntimeErrorOverlay(this);
      this.errorOverlay.show(
        '게임 데이터를 확인하지 못했어요',
        errors[0],
        { label: '다시 시도', onSelect: () => this.scene.restart() },
      );
      return;
    }

    ensureSkillIconTextures(this);
    this.scene.start('Preload');
  }
}
