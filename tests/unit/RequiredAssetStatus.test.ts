import { describe, expect, it } from 'vitest';
import { requiredAssetFailureCount, requiredTextureKeys } from '../../src/game/assets/assetManifest';

const exactRequiredTextureKeys = [
  'map-background',
  'enemy-trader',
  'huchu-walk',
  'huchu-attack',
  'huchu-tail-swipe',
  'huchu-tail-overlay',
  'deokbae-walk',
  'deokbae-attack',
  'poop-male-walk',
  'poop-male-attack',
  'poop-female-walk',
  'poop-female-attack',
  'offleash-male-walk',
  'offleash-male-attack',
  'offleash-female-walk',
  'offleash-female-attack',
  'breeder-male-walk',
  'breeder-male-attack',
  'breeder-female-walk',
  'breeder-female-attack',
  'dog-trader-human-walk-north',
  'dog-trader-human-walk-north-west',
  'dog-trader-human-walk-west',
  'dog-trader-human-walk-south-west',
  'dog-trader-human-walk-south',
  'dog-trader-human-attack-north',
  'dog-trader-human-attack-north-west',
  'dog-trader-human-attack-west',
  'dog-trader-human-attack-south-west',
  'dog-trader-human-attack-south',
  'dog-trader-truck-roll-north',
  'dog-trader-truck-roll-north-west',
  'dog-trader-truck-roll-west',
  'dog-trader-truck-roll-south-west',
  'dog-trader-truck-roll-south',
] as const;

describe('required asset status', () => {
  it('모든 manifest texture key를 검사 대상으로 사용한다', () => {
    expect(requiredTextureKeys).toEqual(exactRequiredTextureKeys);
  });

  it('network load error가 있으면 texture가 있어도 실패한다', () => {
    expect(requiredAssetFailureCount(requiredTextureKeys, () => true, 1)).toBe(1);
  });

  it('같은 required file의 중복 error event는 한 파일로 집계한다', () => {
    const failed = requiredTextureKeys[0]!;
    expect(requiredAssetFailureCount(
      requiredTextureKeys,
      (key) => key !== failed,
      new Set([failed, failed]),
    )).toBe(1);
  });

  it('load error event가 없어도 required texture가 없으면 실패한다', () => {
    const missing = requiredTextureKeys[2];
    expect(requiredAssetFailureCount(requiredTextureKeys, (key) => key !== missing, 0)).toBe(1);
  });

  it('load error가 없고 모든 required texture가 있으면 성공한다', () => {
    expect(requiredAssetFailureCount(requiredTextureKeys, () => true, 0)).toBe(0);
  });
});
