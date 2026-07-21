import Phaser from 'phaser';
import { GAME_AUDIO_REGISTRY_KEY } from '../audio/AudioRegistry';
import { AudioSystem } from '../audio/AudioSystem';
import {
  E2E_AUDIO_TEST_PORT_REGISTRY_KEY,
  E2eAudioTestPort,
} from '../debug/E2eAudioTestPort';
import { installE2eTitleAudioProbe } from '../debug/E2eTitleAudioProbe';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import { validateGameData } from '../data/validateGameData';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import { RuntimeErrorOverlay } from '../ui/RuntimeErrorOverlay';
import type { StoragePort } from '../audio/AudioTypes';

const UNAVAILABLE_STORAGE: StoragePort = {
  getItem: () => null,
  setItem: () => undefined,
};

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
    this.installAudioSystem();
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

    this.scene.start('Preload');
  }

  private installAudioSystem(): void {
    if (this.registry === undefined || this.registry.get(GAME_AUDIO_REGISTRY_KEY) !== undefined) return;
    const audioPort = import.meta.env.MODE === 'e2e' ? new E2eAudioTestPort() : undefined;
    const audio = new AudioSystem(
      () => new AudioContext(),
      this.resolveStorage(),
      audioPort === undefined ? {} : { bgmTransportFactory: audioPort },
    );
    audioPort?.bindTickTransport(() => audio.tickTransport());
    this.registry.set(GAME_AUDIO_REGISTRY_KEY, audio);
    if (audioPort !== undefined) {
      this.registry.set(E2E_AUDIO_TEST_PORT_REGISTRY_KEY, audioPort);
      installE2eTitleAudioProbe(audio);
    }
  }

  private resolveStorage(): StoragePort {
    try {
      return window.localStorage;
    } catch {
      return UNAVAILABLE_STORAGE;
    }
  }
}
