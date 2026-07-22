import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Asset manifest scripts are executable ESM JavaScript without declaration files.
import { mapAsset } from '../../scripts/assets/manifest.mjs';
import { PATH_DEFINITIONS } from '../../src/game/data/pathDefinitions';

const source = readFileSync(mapAsset.source, 'utf8');

describe('simple static grass map', () => {
  it('공개 source에서 황토색 길과 교차로 도형을 완전히 제거한다', () => {
    expect(source.toLowerCase()).not.toContain('#cfa66d');
    expect(source).not.toContain('stroke-width="54"');
    expect(source).not.toMatch(/id="(?:road|path|crossroad)/i);
  });

  it('저대비 장식 풀을 고정 위치에 정확히 12개만 둔다', () => {
    expect(source.match(/class="grass-tuft"/g)).toHaveLength(12);
    expect(source).toContain('id="grass-decorations"');
    expect(source).not.toMatch(/<animate|<script/i);
  });

  it('단일 SVG→WebP 규격을 유지하고 gameplay path data는 별도 6개 경로로 남는다', () => {
    expect(mapAsset).toEqual({
      source: 'assets/source/map/map-v2-simple.svg',
      output: 'public/assets/map/map-background.webp',
      width: 1080,
      height: 1920,
    });
    expect(Object.keys(PATH_DEFINITIONS)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  });
});
