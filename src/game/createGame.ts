import Phaser from 'phaser';
import { GAME_CONFIG_SPEC, resolveDpr } from './GameConfigSpec';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';
import { TitleScene } from './scenes/TitleScene';

type HuchuGameConfig = Phaser.Types.Core.GameConfig & { resolution: number };

export function createGameConfig(devicePixelRatio = 1): HuchuGameConfig {
  return {
    type: Phaser.WEBGL,
    parent: 'game-root',
    width: GAME_CONFIG_SPEC.width,
    height: GAME_CONFIG_SPEC.height,
    resolution: resolveDpr(devicePixelRatio),
    backgroundColor: '#8fc66b',
    dom: { createContainer: true },
    render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, PreloadScene, TitleScene, GameScene, ResultScene],
  };
}

export function createGame(): Phaser.Game {
  return new Phaser.Game(createGameConfig(window.devicePixelRatio));
}
