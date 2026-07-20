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

it('Result 화면은 게임명을 결과 위에 표시하고 exact restart 문구를 쓴다', () => {
  vi.stubGlobal('document', { querySelector: vi.fn(() => ({ setAttribute: vi.fn() })) });
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
  let click: (() => void) | undefined;
  let shutdown: (() => void) | undefined;
  const result = {
    createFromHTML: vi.fn((value: string) => {
      html = value;
      return result;
    }),
    setDepth: vi.fn(() => result),
    addListener: vi.fn(() => result),
    on: vi.fn((_event: string, handler: () => void) => {
      click = handler;
      return result;
    }),
    removeListener: vi.fn(() => result),
    removeAllListeners: vi.fn(() => result),
    destroy: vi.fn(() => result),
  };
  const addDom = vi.fn((_x: number, _y: number) => result);
  const restartRunFromResult = vi.fn();
  const scene = new ResultScene();
  Object.assign(scene, {
    add: { text: addText, dom: addDom },
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

  click?.();
  click?.();
  expect(restartRunFromResult).toHaveBeenCalledTimes(1);
  shutdown?.();
  expect(result.removeListener).toHaveBeenCalledWith('click');
  expect(result.removeAllListeners).toHaveBeenCalledOnce();
  expect(result.destroy).toHaveBeenCalledOnce();
});
