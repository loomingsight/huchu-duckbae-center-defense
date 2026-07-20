import Phaser from 'phaser';
import {
  GAME_TITLE,
  clampDevicePixelRatio,
} from '../presentation/PresentationConfig';
import {
  resultButtonLabel,
  resultMessage,
  type RunResult,
} from './ResultCopy';

type ResultData = { outcome?: RunResult };
type RestartableGameScene = Phaser.Scene & { restartRunFromResult(): void };

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
    this.add.text(270, 410, GAME_TITLE, {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#ffffff',
    }).setOrigin(0.5).setResolution(clampDevicePixelRatio(window.devicePixelRatio)).setDepth(2200);
    let accepted = false;
    const result = this.add.dom(270, 500).createFromHTML(
      `<section style="display:flex;flex-direction:column;align-items:center;gap:28px;color:#fff;font-family:system-ui,sans-serif;text-align:center;text-shadow:0 2px 3px #34291f"><div role="heading" aria-level="1" style="font-size:34px;font-weight:800;white-space:nowrap">${resultMessage(this.outcome)}</div><button type="button" class="primary-game-button">${resultButtonLabel()}</button></section>`,
    ).setDepth(2200);
    result.addListener('click');
    result.on('click', () => {
      if (accepted) return;
      accepted = true;
      (this.scene.get('Game') as RestartableGameScene).restartRunFromResult();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      result.removeListener('click');
      result.removeAllListeners();
      result.destroy();
    });
  }
}
