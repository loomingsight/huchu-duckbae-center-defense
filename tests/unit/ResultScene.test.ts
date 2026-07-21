import {
  resultButtonLabel,
  resultMessage,
} from '../../src/game/scenes/ResultCopy';
import { ResultScene } from '../../src/game/scenes/ResultScene';
import { afterEach } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  },
}));

afterEach(() => vi.unstubAllGlobals());

it('승패 결과 문구와 actual restart button label을 고정한다', () => {
  expect(resultMessage('won')).toBe('보호소를 지켰어요!');
  expect(resultMessage('lost')).toBe('다시 지켜볼까요?');
  expect(resultButtonLabel()).toBe('보호소 지키기');
});

it('Result 화면은 게임명을 결과 위에 표시하고 exact restart 문구를 쓴다', async () => {
  vi.stubGlobal('document', {
    hidden: false,
    querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', { devicePixelRatio: 3 });
  const titleText = {
    setOrigin: vi.fn(),
    setResolution: vi.fn(),
    setDepth: vi.fn(),
  };
  titleText.setOrigin.mockReturnValue(titleText);
  titleText.setResolution.mockReturnValue(titleText);
  titleText.setDepth.mockReturnValue(titleText);
  const addText = vi.fn((_x: number, _y: number, _text: string, _style: object) => titleText);
  let html = '';
  let click: (() => Promise<void>) | undefined;
  let shutdown: (() => void) | undefined;
  const result = {
    createFromHTML: vi.fn((value: string) => {
      html = value;
      return result;
    }),
    setDepth: vi.fn(() => result),
    addListener: vi.fn(() => result),
    on: vi.fn((_event: string, handler: () => Promise<void>) => {
      click = handler;
      return result;
    }),
    removeListener: vi.fn(() => result),
    removeAllListeners: vi.fn(() => result),
    destroy: vi.fn(() => result),
  };
  const addDom = vi.fn((_x: number, _y: number) => result);
  const calls: string[] = [];
  const audio = {
    unlock: vi.fn(async () => { calls.push('unlock'); return true; }),
    pauseForLifecycle: vi.fn(async () => { calls.push('pause'); }),
    resumeForLifecycle: vi.fn(async () => { calls.push('resume'); }),
  };
  const restartRunFromResult = vi.fn(() => { calls.push('restart'); });
  const scene = new ResultScene();
  Object.assign(scene, {
    add: { text: addText, dom: addDom },
    registry: { get: vi.fn(() => audio) },
    scene: { get: vi.fn(() => ({ restartRunFromResult })) },
    events: { once: vi.fn((_event: string, handler: () => void) => { shutdown = handler; }) },
  });
  scene.init({ outcome: 'won' });

  scene.create();

  expect(addText).toHaveBeenCalledWith(270, expect.any(Number), '후추덕배 디펜스', expect.any(Object));
  expect(addText.mock.calls[0]![1]).toBeLessThan(addDom.mock.calls[0]![1]);
  expect(titleText.setOrigin).toHaveBeenCalledWith(0.5);
  expect(titleText.setResolution).toHaveBeenCalledWith(2);
  expect(html).not.toContain('후추덕배 디펜스');
  expect(html).toContain('보호소를 지켰어요!');
  expect(html).toContain('>보호소 지키기</button>');

  await click?.();
  await click?.();
  expect(calls).toEqual(['unlock', 'restart']);
  expect(audio.unlock).toHaveBeenCalledTimes(1);
  expect(restartRunFromResult).toHaveBeenCalledTimes(1);
  shutdown?.();
  expect(result.removeListener).toHaveBeenCalledWith('click');
  expect(result.removeAllListeners).toHaveBeenCalledOnce();
  expect(result.destroy).toHaveBeenCalledOnce();
});

it('Result terminal은 hidden/visible마다 audio lifecycle을 동기화한다', async () => {
  let hidden = false;
  const visibility = new Map<string, () => void>();
  vi.stubGlobal('document', {
    get hidden() { return hidden; },
    querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
    addEventListener: vi.fn((event: string, listener: () => void) => visibility.set(event, listener)),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const title = chainableText();
  const result = chainableResult();
  const audio = {
    unlock: vi.fn(async () => true),
    pauseForLifecycle: vi.fn(async () => undefined),
    resumeForLifecycle: vi.fn(async () => undefined),
  };
  const scene = new ResultScene();
  Object.assign(scene, {
    add: { text: vi.fn(() => title), dom: vi.fn(() => result) },
    registry: { get: vi.fn(() => audio) },
    scene: { get: vi.fn(() => ({ restartRunFromResult: vi.fn() })) },
    events: { once: vi.fn() },
  });

  scene.create();
  hidden = true;
  visibility.get('visibilitychange')?.();
  hidden = false;
  visibility.get('visibilitychange')?.();
  await Promise.resolve();

  expect(audio.pauseForLifecycle).toHaveBeenCalledOnce();
  expect(audio.resumeForLifecycle).toHaveBeenCalledOnce();
});

it('Result unlock 대기 중 Scene이 종료되면 이전 Game Scene을 재시작하지 않는다', async () => {
  let resolveUnlock: ((value: boolean) => void) | undefined;
  let click: (() => Promise<void>) | undefined;
  let shutdown: (() => void) | undefined;
  vi.stubGlobal('document', {
    hidden: false,
    querySelector: vi.fn(() => ({ setAttribute: vi.fn() })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const title = chainableText();
  const result = chainableResult((handler) => { click = handler; });
  const audio = {
    unlock: vi.fn(() => new Promise<boolean>((resolve) => { resolveUnlock = resolve; })),
    pauseForLifecycle: vi.fn(async () => undefined),
    resumeForLifecycle: vi.fn(async () => undefined),
  };
  const restartRunFromResult = vi.fn();
  const scene = new ResultScene();
  Object.assign(scene, {
    add: { text: vi.fn(() => title), dom: vi.fn(() => result) },
    registry: { get: vi.fn(() => audio) },
    scene: { get: vi.fn(() => ({ restartRunFromResult })) },
    events: { once: vi.fn((_event: string, handler: () => void) => { shutdown = handler; }) },
  });

  scene.create();
  const restarting = click?.();
  shutdown?.();
  resolveUnlock?.(true);
  await restarting;

  expect(restartRunFromResult).not.toHaveBeenCalled();
});

function chainableText() {
  const text = { setOrigin: vi.fn(), setResolution: vi.fn(), setDepth: vi.fn() };
  text.setOrigin.mockReturnValue(text);
  text.setResolution.mockReturnValue(text);
  text.setDepth.mockReturnValue(text);
  return text;
}

function chainableResult(onClick?: (handler: () => Promise<void>) => void) {
  const result = {
    createFromHTML: vi.fn(() => result),
    setDepth: vi.fn(() => result),
    addListener: vi.fn(() => result),
    on: vi.fn((_event: string, handler: () => Promise<void>) => {
      onClick?.(handler);
      return result;
    }),
    removeListener: vi.fn(() => result),
    removeAllListeners: vi.fn(() => result),
    destroy: vi.fn(() => result),
  };
  return result;
}
