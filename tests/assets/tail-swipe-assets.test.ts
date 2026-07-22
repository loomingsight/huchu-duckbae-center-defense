import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Asset verifier is executable ESM JavaScript without declaration files.
import { verifyAnimationSheet } from '../../scripts/assets/verify-assets.mjs';
// @ts-expect-error Asset manifest scripts are executable ESM JavaScript without declaration files.
import { sourceAnimationEntries } from '../../scripts/assets/manifest.mjs';

const overlay = sourceAnimationEntries.find(({ key }: { key: string }) =>
  key === 'huchu-tail-overlay');
const body = sourceAnimationEntries.find(({ key }: { key: string }) =>
  key === 'huchu-tail-swipe');

describe('tail swipe layered assets', () => {
  it('꼬리 오버레이는 네 개의 꼬리 전용 프레임 구조를 지킨다', async () => {
    expect(overlay).toBeDefined();
    if (overlay === undefined) return;
    expect(existsSync(overlay.source)).toBe(true);
    await expect(verifyAnimationSheet(overlay)).resolves.toBeUndefined();
  });

  it('꼬리치기 몸 레이어의 좌상단 꼬리 영역은 투명하다', async () => {
    expect(body).toBeDefined();
    if (body === undefined) return;
    const { data, info } = await sharp(body.source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let opaqueTailPixels = 0;
    for (let frame = 0; frame < body.frameCount; frame += 1) {
      for (let y = 30; y < 120; y += 1) {
        for (let x = 0; x < 80; x += 1) {
          const alpha = data[(y * info.width + frame * body.frameWidth + x) * 4 + 3];
          if ((alpha ?? 0) > 0) opaqueTailPixels += 1;
        }
      }
    }
    expect(opaqueTailPixels).toBe(0);
  });

  it('에셋 리뷰는 꼬리 오버레이를 일반 캐릭터 외곽선 대상으로 취급하지 않는다', async () => {
    expect(overlay).toBeDefined();
    if (overlay === undefined) return;
    // @ts-expect-error Asset review script is executable ESM JavaScript without declaration files.
    const { reviewRow } = await import('../../scripts/assets/render-asset-review.mjs');
    const row = await reviewRow(overlay);

    expect(row.outlineAt390).toBeNull();
    expect(row.cssWidth).toBeCloseTo(256 * (72 / 204) * 2 * (390 / 540), 9);
  });

  it('네 프레임 모두 직선 plume이 아닌 말린 꼬리의 compact silhouette를 갖는다', async () => {
    expect(overlay).toBeDefined();
    if (overlay === undefined) return;
    const { data, info } = await sharp(overlay.source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const ratios = Array.from({ length: overlay.frameCount }, (_, frame) => {
      const frameLeft = frame * overlay.frameWidth;
      let minX = overlay.frameWidth;
      let maxX = -1;
      let minY = overlay.frameHeight;
      let maxY = -1;
      for (let y = 0; y < overlay.frameHeight; y += 1) {
        for (let x = 0; x < overlay.frameWidth; x += 1) {
          if ((sample(frameLeft + x, y, data, info.width) ?? 0) <= 16) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      expect(height).toBeGreaterThanOrEqual(100);
      return width / height;
    });

    ratios.forEach((ratio) => expect(ratio).toBeLessThanOrEqual(1.2));
  });
});

function sample(x: number, y: number, data: Buffer, width: number): number | undefined {
  return data[(y * width + x) * 4 + 3];
}
