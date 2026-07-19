import { describe, expect, it } from 'vitest';
import {
  imageAssets,
  requiredAssetFailureCount,
  requiredTextureKeys,
  spriteSheetAssets,
} from '../../src/game/assets/assetManifest';

describe('required asset status', () => {
  it('모든 manifest texture key를 검사 대상으로 사용한다', () => {
    expect(requiredTextureKeys).toEqual([
      ...imageAssets.map(({ key }) => key),
      ...spriteSheetAssets.map(({ key }) => key),
    ]);
  });

  it('network load error가 있으면 texture가 있어도 실패한다', () => {
    expect(requiredAssetFailureCount(requiredTextureKeys, () => true, 1)).toBe(1);
  });

  it('load error event가 없어도 required texture가 없으면 실패한다', () => {
    const missing = requiredTextureKeys[2];
    expect(requiredAssetFailureCount(requiredTextureKeys, (key) => key !== missing, 0)).toBe(1);
  });

  it('load error가 없고 모든 required texture가 있으면 성공한다', () => {
    expect(requiredAssetFailureCount(requiredTextureKeys, () => true, 0)).toBe(0);
  });
});
