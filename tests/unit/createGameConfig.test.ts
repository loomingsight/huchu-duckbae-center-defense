import { describe, expect, it } from 'vitest';
import { GAME_CONFIG_SPEC } from '../../src/game/GameConfigSpec';

describe('GAME_CONFIG_SPEC', () => {
  it('Node 환경에서 Phaser import 없이 고정 backing-store WebGL 계약을 고정한다', () => {
    expect(GAME_CONFIG_SPEC).toEqual({
      width: 540, height: 960, renderer: 'WEBGL', scaleMode: 'FIT', autoCenter: 'CENTER_BOTH',
    });
  });
});
