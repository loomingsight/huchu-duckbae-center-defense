import Phaser from 'phaser';
import { GAME_CONFIG_SPEC } from './GameConfigSpec';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';
import { TitleScene } from './scenes/TitleScene';

export function createGameConfig(
  gameScene: typeof GameScene = GameScene,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.WEBGL,
    parent: 'game-root',
    width: GAME_CONFIG_SPEC.width,
    height: GAME_CONFIG_SPEC.height,
    backgroundColor: '#8fc66b',
    dom: { createContainer: true },
    render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, PreloadScene, TitleScene, gameScene, ResultScene],
  };
}

export function createGame(gameScene?: typeof GameScene): Phaser.Game {
  return new Phaser.Game(createGameConfig(gameScene));
}
