import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_CONFIG_SPEC } from '../../src/game/GameConfigSpec';
import { TitleScene } from '../../src/game/scenes/TitleScene';
import { MapView } from '../../src/game/world/MapView';

vi.mock('phaser', () => ({
  default: { Scene: class {} },
}));

afterEach(() => vi.unstubAllGlobals());

describe('GAME_CONFIG_SPEC', () => {
  it('고정 backing-store WebGL/FIT 계약과 smooth render 설정을 고정한다', () => {
    expect(GAME_CONFIG_SPEC).toEqual({
      width: 540, height: 960, renderer: 'WEBGL', scaleMode: 'FIT', autoCenter: 'CENTER_BOTH',
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    });
    expect(GAME_CONFIG_SPEC).not.toHaveProperty('resolution');
  });

  it('browser title과 접근성 root label에 exact 게임명을 사용한다', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

    expect(html).toContain('<title>후추덕배 디펜스</title>');
    expect(html).toContain('<main id="game-root" aria-label="후추덕배 디펜스 게임"></main>');
  });

  it('Title 화면은 exact 게임명과 시작 문구를 쓰고 Text DPR을 2로 제한한다', () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    const text = { setOrigin: vi.fn(), setResolution: vi.fn() };
    text.setOrigin.mockReturnValue(text);
    text.setResolution.mockReturnValue(text);
    let buttonHtml = '';
    const button = {
      createFromHTML: vi.fn((html: string) => {
        buttonHtml = html;
        return button;
      }),
      addListener: vi.fn(() => button),
      on: vi.fn(() => button),
    };
    const title = new TitleScene();
    Object.assign(title, {
      add: { text: vi.fn(() => text), dom: vi.fn(() => button) },
      scene: { start: vi.fn() },
    });

    title.create();

    expect(title.add.text).toHaveBeenCalledWith(270, 310, '후추덕배 디펜스', expect.any(Object));
    expect(text.setResolution).toHaveBeenCalledWith(2);
    expect(buttonHtml).toContain('>보호소 지키기</button>');
  });

  it('MapView는 filter/tint 없이 logical 540x960 image 하나만 만든다', () => {
    const calls: string[] = [];
    const image = new Proxy({}, {
      get: (_target, property) => (...args: unknown[]) => {
        calls.push(`${String(property)}:${args.join(',')}`);
        return image;
      },
    });
    const addImage = vi.fn(() => image);

    new MapView({ add: { image: addImage } } as never);

    expect(addImage).toHaveBeenCalledTimes(1);
    expect(calls).toContain('setDisplaySize:540,960');
    expect(calls.some((call) => /tint|filter|pipeline/i.test(call))).toBe(false);
  });
});
