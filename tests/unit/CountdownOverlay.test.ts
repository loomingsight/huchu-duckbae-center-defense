import {
  CountdownOverlay,
  countdownLabel,
} from '../../src/game/ui/CountdownOverlay';

describe('CountdownOverlay', () => {
  it('3초를 3,2,1로 표시하고 next wave prefix를 한 overlay에서 유지한다', () => {
    expect(countdownLabel(3000, 'resumeCombat')).toBe('3');
    expect(countdownLabel(2000, 'resumeCombat')).toBe('2');
    expect(countdownLabel(1, 'resumeCombat')).toBe('1');
    expect(countdownLabel(3000, 'nextWave')).toBe('다음 웨이브 3');
    expect(countdownLabel(1200, 'lostResult')).toBe('');
    expect(countdownLabel(0, 'nextWave')).toBe('');
  });

  it('render 0은 숨기고 destroy는 idempotent cleanup한다', () => {
    const fake = createCountdownFakeScene();
    const overlay = new CountdownOverlay(fake.scene as never);

    overlay.render(3000, 'nextWave');
    expect(fake.lastText).toBe('다음 웨이브 3');
    expect(fake.visible).toBe(true);
    overlay.render(0, 'nextWave');
    expect(fake.visible).toBe(false);
    overlay.destroy();
    overlay.destroy();

    expect(fake.destroyCount).toBe(1);
  });
});

function createCountdownFakeScene(): {
  readonly scene: object;
  lastText: string;
  visible: boolean;
  destroyCount: number;
} {
  const fake = {
    scene: {},
    lastText: '',
    visible: false,
    destroyCount: 0,
  };
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const name = String(property);
      if (name === 'setText') fake.lastText = String(args.at(0));
      if (name === 'setVisible') fake.visible = Boolean(args.at(0));
      if (name === 'destroy') fake.destroyCount += 1;
      return object;
    },
  });
  fake.scene = { add: { text: () => object } };
  return fake;
}
