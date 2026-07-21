import Phaser from 'phaser';
import { GAME_AUDIO_REGISTRY_KEY } from '../audio/AudioRegistry';
import type { AudioSystem } from '../audio/AudioSystem';
import {
  GAME_TITLE,
  clampDevicePixelRatio,
} from '../presentation/PresentationConfig';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    document.querySelector('#game-root')?.setAttribute('data-scene', 'Title');
    this.add.text(270, 310, GAME_TITLE, {
      fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: '#34291f',
    }).setOrigin(0.5).setResolution(clampDevicePixelRatio(window.devicePixelRatio));
    const start = this.add.dom(270, 570).createFromHTML(
      '<button type="button" class="primary-game-button">보호소 지키기</button>',
    );
    let active = true;
    let audioReady = false;
    let accepted = false;
    const audio = this.registry.get(GAME_AUDIO_REGISTRY_KEY) as AudioSystem;
    const syncAudioVisibility = (): void => {
      if (!active || !audioReady) return;
      void (document.hidden ? audio.pauseForLifecycle() : audio.resumeForLifecycle());
    };
    document.addEventListener('visibilitychange', syncAudioVisibility);
    start.addListener('click').on('click', async () => {
      if (accepted) return;
      accepted = true;
      await audio.unlock();
      if (!active) return;
      audioReady = true;
      if (document.hidden) await audio.pauseForLifecycle();
      if (!active) return;
      audio.beginRun();
      this.scene.start('Game');
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      active = false;
      document.removeEventListener('visibilitychange', syncAudioVisibility);
      start.removeListener('click');
      start.removeAllListeners();
      start.destroy();
    });
  }
}
