import Phaser from 'phaser';
import type { GameScene } from './GameScene';
import {
  resultButtonLabel,
  resultMessage,
  type RunResult,
} from './ResultCopy';

type ResultData = { outcome?: RunResult };

export class ResultScene extends Phaser.Scene {
  private outcome: RunResult = 'lost';

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.outcome = data.outcome ?? 'lost';
  }

  create(): void {
    document.querySelector('#game-root')?.setAttribute('data-scene', 'Result');
    let accepted = false;
    const result = this.add.dom(270, 500).createFromHTML(
      `<section style="display:flex;flex-direction:column;align-items:center;gap:28px;color:#fff;font-family:system-ui,sans-serif;text-align:center;text-shadow:0 2px 3px #34291f"><div role="heading" aria-level="1" style="font-size:34px;font-weight:800;white-space:nowrap">${resultMessage(this.outcome)}</div><button type="button" class="primary-game-button">${resultButtonLabel()}</button></section>`,
    ).setDepth(2200);
    result.addListener('click');
    result.on('click', () => {
      if (accepted) return;
      accepted = true;
      (this.scene.get('Game') as GameScene).restartRunFromResult();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      result.removeListener('click');
      result.removeAllListeners();
      result.destroy();
    });
  }
}
