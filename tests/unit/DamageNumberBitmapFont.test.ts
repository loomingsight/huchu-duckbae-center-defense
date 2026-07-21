import { describe, expect, it } from 'vitest';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  DAMAGE_NUMBER_DIGITS,
  DAMAGE_NUMBER_FONT_KEYS,
  DAMAGE_NUMBER_FONT_STYLES,
  DAMAGE_NUMBER_GLYPH_CELL_SIZE,
  DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT,
  DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH,
  DAMAGE_NUMBER_STROKE_COLOR,
  DAMAGE_NUMBER_STROKE_PX,
  damageNumberFontKey,
  ensureDamageNumberBitmapFonts,
} from '../../src/game/assets/DamageNumberBitmapFont';

describe('DamageNumberBitmapFont', () => {
  it('13/17/24px exact style의 0..9 30 glyph를 한 texture에 그리고 3개 font cache를 등록한다', () => {
    const fake = createBitmapFontScene();

    ensureDamageNumberBitmapFonts(fake.scene as never);

    expect(AssetKeys.damageNumberGlyphs).toBe('damage-number-glyphs');
    expect(DAMAGE_NUMBER_DIGITS).toBe('0123456789');
    expect(DAMAGE_NUMBER_STROKE_COLOR).toBe('#34291f');
    expect(DAMAGE_NUMBER_STROKE_PX).toBe(3);
    expect(DAMAGE_NUMBER_FONT_STYLES).toEqual({
      light: { fontPx: 13, color: '#fff0c2' },
      medium: { fontPx: 17, color: '#f2a24a' },
      heavy: { fontPx: 24, color: '#ffe066' },
    });
    expect(DAMAGE_NUMBER_FONT_KEYS).toEqual({
      light: 'damage-number-light',
      medium: 'damage-number-medium',
      heavy: 'damage-number-heavy',
    });
    expect(damageNumberFontKey('heavy')).toBe(AssetKeys.damageNumberHeavy);
    expect(fake.createCanvasCalls).toEqual([[
      AssetKeys.damageNumberGlyphs,
      DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH,
      DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT,
    ]]);
    expect(DAMAGE_NUMBER_GLYPH_CELL_SIZE).toBe(32);
    expect(fake.strokeDraws).toHaveLength(30);
    expect(fake.fillDraws).toHaveLength(30);
    expect(fake.refreshCalls).toBe(1);
    expect(fake.cacheAdds.map(([key]) => key)).toEqual(Object.values(DAMAGE_NUMBER_FONT_KEYS));

    for (const [strength, key] of Object.entries(DAMAGE_NUMBER_FONT_KEYS)) {
      const entry = fake.cacheEntries.get(key) as BitmapFontEntry;
      const style = DAMAGE_NUMBER_FONT_STYLES[strength as keyof typeof DAMAGE_NUMBER_FONT_STYLES];
      expect(entry.texture).toBe(AssetKeys.damageNumberGlyphs);
      expect(entry.frame).toBeNull();
      expect(entry.data).toMatchObject({
        font: key,
        size: style.fontPx,
        lineHeight: style.fontPx + DAMAGE_NUMBER_STROKE_PX,
        retroFont: false,
      });
      expect(Object.keys(entry.data.chars).map(Number)).toEqual(
        [...DAMAGE_NUMBER_DIGITS].map((digit) => digit.charCodeAt(0)),
      );
      Object.values(entry.data.chars).forEach((glyph) => {
        expect(glyph).toMatchObject({
          width: expect.any(Number),
          height: style.fontPx + DAMAGE_NUMBER_STROKE_PX,
          xOffset: 0,
          yOffset: 0,
          xAdvance: expect.any(Number),
          kerning: {},
        });
      });
    }
    expect(new Set(fake.fillDraws.slice(0, 10).map((draw) => draw.fillStyle)))
      .toEqual(new Set(['#fff0c2']));
    expect(new Set(fake.fillDraws.slice(10, 20).map((draw) => draw.fillStyle)))
      .toEqual(new Set(['#f2a24a']));
    expect(new Set(fake.fillDraws.slice(20, 30).map((draw) => draw.fillStyle)))
      .toEqual(new Set(['#ffe066']));
    expect(fake.strokeDraws.every((draw) => (
      draw.strokeStyle === '#34291f'
      && draw.lineWidth === 3
      && draw.lineCap === 'round'
      && draw.lineJoin === 'round'
    ))).toBe(true);
  });

  it('complete texture/font cache는 scene restart에서 그대로 재사용한다', () => {
    const fake = createBitmapFontScene();
    ensureDamageNumberBitmapFonts(fake.scene as never);
    const before = fake.counts();

    ensureDamageNumberBitmapFonts(fake.scene as never);

    expect(fake.counts()).toEqual(before);
    expect(fake.removedTextures).toEqual([]);
    expect(fake.cacheRemoves).toEqual([]);
  });

  it.each([
    { texture: true, fontKeys: [] as string[] },
    { texture: true, fontKeys: [AssetKeys.damageNumberLight] },
    { texture: false, fontKeys: [AssetKeys.damageNumberLight] },
  ])('partial cache $texture/$fontKeys는 기존 자원을 건드리지 않고 크게 실패한다', ({ texture, fontKeys }) => {
    const fake = createBitmapFontScene({ existingTexture: texture, existingFontKeys: fontKeys });

    expect(() => ensureDamageNumberBitmapFonts(fake.scene as never)).toThrow(/partial/i);

    expect(fake.createCanvasCalls).toEqual([]);
    expect(fake.cacheAdds).toEqual([]);
    expect(fake.removedTextures).toEqual([]);
    expect(fake.cacheRemoves).toEqual([]);
  });

  it('font cache 등록 중 실패가 entry를 넣은 후 throw해도 새 texture와 3개 key를 전부 rollback한다', () => {
    const fake = createBitmapFontScene({ failCacheAddAt: 1 });

    expect(() => ensureDamageNumberBitmapFonts(fake.scene as never)).toThrow('font add failure');

    expect(fake.removedTextures).toEqual([AssetKeys.damageNumberGlyphs]);
    expect(fake.textureExists()).toBe(false);
    expect(fake.cacheEntries.size).toBe(0);
    expect(new Set(fake.cacheRemoves)).toEqual(new Set(Object.values(DAMAGE_NUMBER_FONT_KEYS)));
  });
});

interface BitmapFontGlyph {
  readonly width: number;
  readonly height: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly xAdvance: number;
  readonly kerning: Record<string, number>;
}

interface BitmapFontEntry {
  readonly texture: string;
  readonly frame: null;
  readonly data: {
    readonly font: string;
    readonly size: number;
    readonly lineHeight: number;
    readonly retroFont: boolean;
    readonly chars: Record<number, BitmapFontGlyph>;
  };
}

interface BitmapFontFakeOptions {
  readonly existingTexture?: boolean;
  readonly existingFontKeys?: readonly string[];
  readonly failCacheAddAt?: number;
}

function createBitmapFontScene(options: BitmapFontFakeOptions = {}) {
  const createCanvasCalls: unknown[][] = [];
  const cacheAdds: unknown[][] = [];
  const cacheRemoves: string[] = [];
  const removedTextures: string[] = [];
  const strokeDraws: DrawRecord[] = [];
  const fillDraws: DrawRecord[] = [];
  const cacheEntries = new Map<string, unknown>();
  let textureExists = options.existingTexture ?? false;
  let refreshCalls = 0;
  let font = '';
  let fillStyle: string | CanvasGradient | CanvasPattern = '';
  let strokeStyle: string | CanvasGradient | CanvasPattern = '';
  let lineWidth = 1;
  let lineCap: CanvasLineCap = 'butt';
  let lineJoin: CanvasLineJoin = 'miter';
  let textBaseline: CanvasTextBaseline = 'alphabetic';

  options.existingFontKeys?.forEach((key) => cacheEntries.set(key, {}));

  const recordDraw = (text: string, x: number, y: number): DrawRecord => ({
    text, x, y, font, fillStyle: String(fillStyle), strokeStyle: String(strokeStyle),
    lineWidth, lineCap, lineJoin, textBaseline,
  });
  const context = {
    clearRect: () => undefined,
    measureText: () => {
      const fontPx = Number.parseInt(font.match(/(\d+)px/)?.[1] ?? '0', 10);
      return {
        width: fontPx * 0.62,
        actualBoundingBoxAscent: fontPx * 0.76,
        actualBoundingBoxDescent: fontPx * 0.24,
      };
    },
    strokeText: (text: string, x: number, y: number) => { strokeDraws.push(recordDraw(text, x, y)); },
    fillText: (text: string, x: number, y: number) => { fillDraws.push(recordDraw(text, x, y)); },
    get font() { return font; }, set font(value: string) { font = value; },
    get fillStyle() { return fillStyle; }, set fillStyle(value) { fillStyle = value; },
    get strokeStyle() { return strokeStyle; }, set strokeStyle(value) { strokeStyle = value; },
    get lineWidth() { return lineWidth; }, set lineWidth(value: number) { lineWidth = value; },
    get lineCap() { return lineCap; }, set lineCap(value: CanvasLineCap) { lineCap = value; },
    get lineJoin() { return lineJoin; }, set lineJoin(value: CanvasLineJoin) { lineJoin = value; },
    get textBaseline() { return textBaseline; }, set textBaseline(value: CanvasTextBaseline) { textBaseline = value; },
  };
  const texture = {
    width: DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH,
    height: DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT,
    context,
    refresh: () => {
      refreshCalls += 1;
      return texture;
    },
  };
  const bitmapFont = {
    exists: (key: string) => cacheEntries.has(key),
    has: (key: string) => cacheEntries.has(key),
    get: (key: string) => cacheEntries.get(key) ?? null,
    add: (key: string, entry: unknown) => {
      const addIndex = cacheAdds.length;
      cacheAdds.push([key, entry]);
      cacheEntries.set(key, entry);
      if (options.failCacheAddAt === addIndex) throw new Error('font add failure');
      return bitmapFont;
    },
    remove: (key: string) => {
      cacheRemoves.push(key);
      cacheEntries.delete(key);
      return bitmapFont;
    },
  };
  const scene = {
    textures: {
      exists: (key: string) => key === AssetKeys.damageNumberGlyphs && textureExists,
      get: (key: string) => {
        if (key !== AssetKeys.damageNumberGlyphs || !textureExists) throw new Error('missing texture');
        return texture;
      },
      createCanvas: (...args: unknown[]) => {
        createCanvasCalls.push(args);
        textureExists = true;
        return texture;
      },
      remove: (key: string) => {
        removedTextures.push(key);
        if (key === AssetKeys.damageNumberGlyphs) textureExists = false;
      },
    },
    cache: { bitmapFont },
  };

  return {
    scene,
    createCanvasCalls,
    cacheAdds,
    cacheRemoves,
    removedTextures,
    strokeDraws,
    fillDraws,
    cacheEntries,
    textureExists: () => textureExists,
    get refreshCalls() { return refreshCalls; },
    counts: () => ({
      canvases: createCanvasCalls.length,
      strokes: strokeDraws.length,
      fills: fillDraws.length,
      refreshes: refreshCalls,
      cacheAdds: cacheAdds.length,
    }),
  };
}

interface DrawRecord {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly fillStyle: string;
  readonly strokeStyle: string;
  readonly lineWidth: number;
  readonly lineCap: CanvasLineCap;
  readonly lineJoin: CanvasLineJoin;
  readonly textBaseline: CanvasTextBaseline;
}
