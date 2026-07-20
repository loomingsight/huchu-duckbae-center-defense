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
  let html = '';
  const result = {
    createFromHTML: vi.fn((value: string) => {
      html = value;
      return result;
    }),
    setDepth: vi.fn(() => result),
    addListener: vi.fn(() => result),
    on: vi.fn(() => result),
    removeListener: vi.fn(() => result),
    removeAllListeners: vi.fn(() => result),
    destroy: vi.fn(() => result),
  };
  const scene = new ResultScene();
  Object.assign(scene, {
    add: { dom: vi.fn(() => result) },
    scene: { get: vi.fn(() => ({ restartRunFromResult: vi.fn() })) },
    events: { once: vi.fn() },
  });
  scene.init({ outcome: 'won' });

  scene.create();

  const titleIndex = html.indexOf('후추덕배 디펜스');
  const outcomeIndex = html.indexOf('보호소를 지켰어요!');
  expect(titleIndex).toBeGreaterThanOrEqual(0);
  expect(outcomeIndex).toBeGreaterThan(titleIndex);
  expect(html).toContain('>보호소 지키기</button>');
});
