import { chooseHowlCenter } from '../../src/game/skills/SpatialBucketTargeting';
import { candidateAt } from './fixtures';

describe('chooseHowlCenter', () => {
  it('80x80 최다 버킷을 고르고 동률이면 최소 ETA, bucket y/x 순으로 택한다', () => {
    const result = chooseHowlCenter([
      candidateAt(10, 10, 900),
      candidateAt(20, 20, 800),
      candidateAt(410, 810, 200),
      candidateAt(420, 820, 300),
    ], 80, { width: 540, height: 960 });

    expect(result).toEqual({ x: 415, y: 815 });
  });

  it('dead는 제외하고 좌표를 bounds로 먼저 clamp한 뒤 boundary bucket과 평균을 정한다', () => {
    const center = chooseHowlCenter([
      candidateAt(-10, 79.999, 300, { id: 1, spawnSequence: 1 }),
      candidateAt(-5, 79.999, 200, { id: 2, spawnSequence: 2 }),
      candidateAt(0, 80, 150, { id: 3, spawnSequence: 3 }),
      candidateAt(539.999, 959.999, 100, { id: 4, spawnSequence: 4 }),
      candidateAt(540, 960, 90, { id: 5, spawnSequence: 5 }),
      candidateAt(999, 999, 1, { id: 6, spawnSequence: 6, state: 'dead', currentHp: 0 }),
    ], 80, { width: 540, height: 960 });

    expect(center).toEqual({ x: 0, y: 79.999 });
  });

  it('같은 count/ETA/y/x에서는 shuffled input과 무관하게 같은 clamped 평균을 낸다', () => {
    const candidates = [
      candidateAt(541, 100, 20, { id: 3, spawnSequence: 2 }),
      candidateAt(539, 120, 10, { id: 2, spawnSequence: 1 }),
    ];

    expect(chooseHowlCenter(candidates, 80, { width: 540, height: 960 }))
      .toEqual({ x: 539.5, y: 110 });
    expect(chooseHowlCenter([...candidates].reverse(), 80, { width: 540, height: 960 }))
      .toEqual({ x: 539.5, y: 110 });
  });

  it('살아 있는 적이 없으면 undefined다', () => {
    expect(chooseHowlCenter([
      candidateAt(1, 1, 1, { state: 'dead', currentHp: 0 }),
    ], 80, { width: 540, height: 960 })).toBeUndefined();
  });

  it.each([
    [0, { width: 540, height: 960 }],
    [-1, { width: 540, height: 960 }],
    [Number.NaN, { width: 540, height: 960 }],
    [80, { width: -1, height: 960 }],
    [80, { width: 540, height: Number.POSITIVE_INFINITY }],
  ] as const)('invalid bucket/bounds %s %o를 fail-fast한다', (bucketSize, bounds) => {
    expect(() => chooseHowlCenter([], bucketSize, bounds)).toThrow(RangeError);
  });
});
