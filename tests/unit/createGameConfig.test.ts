import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_CONFIG_SPEC } from '../../src/game/GameConfigSpec';
import { createGameConfig } from '../../src/game/createGame';
import { TitleScene } from '../../src/game/scenes/TitleScene';
import { MapView } from '../../src/game/world/MapView';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Game: class {},
    WEBGL: 2,
    Scale: { FIT: 'FIT', CENTER_BOTH: 'CENTER_BOTH' },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));

afterEach(() => vi.unstubAllGlobals());

describe('GAME_CONFIG_SPEC', () => {
  it('actual createGameConfig가 지원되는 Phaser viewport/render 계약을 반환한다', () => {
    class FakeScene {}

    const config = createGameConfig(FakeScene as never);

    expect(config).toMatchObject({
      type: 2,
      width: 540,
      height: 960,
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      scale: { mode: 'FIT', autoCenter: 'CENTER_BOTH' },
    });
    expect(config).not.toHaveProperty('resolution');
  });

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
    expect(html).toContain('<main id="game-root" aria-label="후추덕배 디펜스"></main>');
  });

  it('Title 화면은 exact 게임명과 시작 문구를 쓰고 Text DPR을 2로 제한한다', () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    vi.stubGlobal('document', {
      hidden: false,
      querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
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
      registry: { get: vi.fn(() => ({
        pauseForLifecycle: vi.fn(async () => undefined),
        resumeForLifecycle: vi.fn(async () => undefined),
      })) },
      scene: { start: vi.fn() },
      events: { once: vi.fn() },
    });

    title.create();

    expect(title.add.text).toHaveBeenCalledWith(270, 310, '후추덕배 디펜스', expect.any(Object));
    expect(text.setResolution).toHaveBeenCalledWith(2);
    expect(buttonHtml).toContain('>보호소 지키기</button>');
  });

  it('Title 시작 click은 audio unlock 완료 뒤 beginRun하고 Game을 정확히 한 번 시작한다', async () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('document', {
      hidden: false,
      querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const calls: string[] = [];
    const text = { setOrigin: vi.fn(), setResolution: vi.fn() };
    text.setOrigin.mockReturnValue(text);
    text.setResolution.mockReturnValue(text);
    let onClick: (() => Promise<void>) | undefined;
    const button = {
      createFromHTML: vi.fn(() => button),
      addListener: vi.fn(() => button),
      on: vi.fn((_event: string, listener: () => Promise<void>) => {
        onClick = listener;
        return button;
      }),
    };
    const audio = {
      unlock: vi.fn(async () => { calls.push('unlock'); return true; }),
      pauseForLifecycle: vi.fn(async () => { calls.push('pause'); }),
      resumeForLifecycle: vi.fn(async () => { calls.push('resume'); }),
      beginRun: vi.fn(() => calls.push('beginRun')),
    };
    const title = new TitleScene();
    Object.assign(title, {
      add: { text: vi.fn(() => text), dom: vi.fn(() => button) },
      registry: { get: vi.fn(() => audio) },
      scene: { start: vi.fn(() => calls.push('start:Game')) },
      events: { once: vi.fn() },
    });

    title.create();
    await onClick?.();
    await onClick?.();

    expect(calls).toEqual(['unlock', 'beginRun', 'start:Game']);
  });

  it('Title unlock 도중 숨겨지면 audio를 suspend한 뒤 Game을 시작한다', async () => {
    let hidden = false;
    let resolveUnlock: ((value: boolean) => void) | undefined;
    const calls: string[] = [];
    const visibility = new Map<string, () => void>();
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('document', {
      get hidden() { return hidden; },
      querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
      addEventListener: vi.fn((event: string, listener: () => void) => visibility.set(event, listener)),
      removeEventListener: vi.fn(),
    });
    const text = { setOrigin: vi.fn(), setResolution: vi.fn() };
    text.setOrigin.mockReturnValue(text);
    text.setResolution.mockReturnValue(text);
    let click: (() => Promise<void>) | undefined;
    const button = {
      createFromHTML: vi.fn(() => button),
      addListener: vi.fn(() => button),
      on: vi.fn((_event: string, listener: () => Promise<void>) => {
        click = listener;
        return button;
      }),
      removeListener: vi.fn(() => button),
      removeAllListeners: vi.fn(() => button),
      destroy: vi.fn(() => button),
    };
    const audio = {
      unlock: vi.fn(() => new Promise<boolean>((resolve) => {
        calls.push('unlock');
        resolveUnlock = resolve;
      })),
      pauseForLifecycle: vi.fn(async () => { calls.push('pause'); }),
      resumeForLifecycle: vi.fn(async () => { calls.push('resume'); }),
      beginRun: vi.fn(() => calls.push('beginRun')),
    };
    const title = new TitleScene();
    Object.assign(title, {
      add: { text: vi.fn(() => text), dom: vi.fn(() => button) },
      registry: { get: vi.fn(() => audio) },
      scene: { start: vi.fn(() => calls.push('start:Game')) },
      events: { once: vi.fn() },
    });

    title.create();
    const starting = click?.();
    hidden = true;
    visibility.get('visibilitychange')?.();
    resolveUnlock?.(true);
    await starting;

    expect(calls).toEqual(['unlock', 'pause', 'beginRun', 'start:Game']);
  });

  it('Title unlock 대기 중 Scene이 종료되면 beginRun과 Game 전환을 폐기한다', async () => {
    let resolveUnlock: ((value: boolean) => void) | undefined;
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    vi.stubGlobal('document', {
      hidden: false,
      querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const text = { setOrigin: vi.fn(), setResolution: vi.fn() };
    text.setOrigin.mockReturnValue(text);
    text.setResolution.mockReturnValue(text);
    let click: (() => Promise<void>) | undefined;
    let shutdown: (() => void) | undefined;
    const button = {
      createFromHTML: vi.fn(() => button),
      addListener: vi.fn(() => button),
      on: vi.fn((_event: string, listener: () => Promise<void>) => {
        click = listener;
        return button;
      }),
      removeListener: vi.fn(() => button),
      removeAllListeners: vi.fn(() => button),
      destroy: vi.fn(() => button),
    };
    const audio = {
      unlock: vi.fn(() => new Promise<boolean>((resolve) => { resolveUnlock = resolve; })),
      pauseForLifecycle: vi.fn(async () => undefined),
      resumeForLifecycle: vi.fn(async () => undefined),
      beginRun: vi.fn(),
    };
    const startGame = vi.fn();
    const title = new TitleScene();
    Object.assign(title, {
      add: { text: vi.fn(() => text), dom: vi.fn(() => button) },
      registry: { get: vi.fn(() => audio) },
      scene: { start: startGame },
      events: { once: vi.fn((_event: string, handler: () => void) => { shutdown = handler; }) },
    });

    title.create();
    const starting = click?.();
    shutdown?.();
    resolveUnlock?.(true);
    await starting;

    expect(audio.beginRun).not.toHaveBeenCalled();
    expect(startGame).not.toHaveBeenCalled();
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
