import type Phaser from 'phaser';
import type { ImpactStrength } from '../types/GameTypes';
import { AssetKeys } from './AssetKeys';

export const DAMAGE_NUMBER_DIGITS = '0123456789';
export const DAMAGE_NUMBER_STROKE_COLOR = '#34291f';
export const DAMAGE_NUMBER_STROKE_PX = 3;
export const DAMAGE_NUMBER_GLYPH_CELL_SIZE = 32;
export const DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH = DAMAGE_NUMBER_GLYPH_CELL_SIZE * 10;
export const DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT = DAMAGE_NUMBER_GLYPH_CELL_SIZE * 3;

export const DAMAGE_NUMBER_FONT_STYLES = {
  light: { fontPx: 13, color: '#fff0c2' },
  medium: { fontPx: 17, color: '#f2a24a' },
  heavy: { fontPx: 24, color: '#ffe066' },
} as const satisfies Record<ImpactStrength, {
  readonly fontPx: number;
  readonly color: string;
}>;

export const DAMAGE_NUMBER_FONT_KEYS = {
  light: AssetKeys.damageNumberLight,
  medium: AssetKeys.damageNumberMedium,
  heavy: AssetKeys.damageNumberHeavy,
} as const satisfies Record<ImpactStrength, string>;

const STRENGTHS = ['light', 'medium', 'heavy'] as const satisfies readonly ImpactStrength[];

interface RuntimeBitmapFontGlyph extends Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData {
  readonly xAdvance: number;
}

interface RuntimeBitmapFontData {
  readonly font: string;
  readonly size: number;
  readonly lineHeight: number;
  readonly retroFont: false;
  readonly chars: Record<number, RuntimeBitmapFontGlyph>;
}

interface RuntimeBitmapFontEntry {
  readonly data: RuntimeBitmapFontData;
  readonly texture: string;
  readonly frame: null;
}

export function damageNumberFontKey(strength: ImpactStrength): string {
  return DAMAGE_NUMBER_FONT_KEYS[strength];
}

export function ensureDamageNumberBitmapFonts(scene: Phaser.Scene): void {
  const textureExists = scene.textures.exists(AssetKeys.damageNumberGlyphs);
  const fontPresence = STRENGTHS.map((strength) => (
    scene.cache.bitmapFont.exists(DAMAGE_NUMBER_FONT_KEYS[strength])
  ));
  const existingFontCount = fontPresence.filter(Boolean).length;

  if (textureExists && existingFontCount === STRENGTHS.length) {
    assertCompleteCache(scene);
    return;
  }
  if (textureExists || existingFontCount > 0) {
    throw new Error(
      `Damage number bitmap font cache is partial: texture=${textureExists}, fonts=${existingFontCount}/3`,
    );
  }

  let createdTexture = false;
  try {
    const texture = scene.textures.createCanvas(
      AssetKeys.damageNumberGlyphs,
      DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH,
      DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT,
    );
    if (texture === null) throw new Error('Damage number glyph texture could not be created');
    createdTexture = true;

    const entries = STRENGTHS.map((strength, row) => (
      createFontEntry(texture, strength, row)
    ));
    texture.refresh();
    entries.forEach(({ strength, entry }) => {
      scene.cache.bitmapFont.add(DAMAGE_NUMBER_FONT_KEYS[strength], entry);
    });
    assertCompleteCache(scene);
  } catch (error) {
    for (const key of Object.values(DAMAGE_NUMBER_FONT_KEYS)) {
      scene.cache.bitmapFont.remove(key);
    }
    if (createdTexture) scene.textures.remove(AssetKeys.damageNumberGlyphs);
    throw error;
  }
}

function createFontEntry(
  texture: Phaser.Textures.CanvasTexture,
  strength: ImpactStrength,
  row: number,
): { readonly strength: ImpactStrength; readonly entry: RuntimeBitmapFontEntry } {
  const style = DAMAGE_NUMBER_FONT_STYLES[strength];
  const context = texture.context;
  context.font = `700 ${style.fontPx}px system-ui, sans-serif`;
  context.fillStyle = style.color;
  context.strokeStyle = DAMAGE_NUMBER_STROKE_COLOR;
  context.lineWidth = DAMAGE_NUMBER_STROKE_PX;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.textBaseline = 'alphabetic';

  const chars: Record<number, RuntimeBitmapFontGlyph> = {};
  [...DAMAGE_NUMBER_DIGITS].forEach((digit, column) => {
    const x = column * DAMAGE_NUMBER_GLYPH_CELL_SIZE;
    const y = row * DAMAGE_NUMBER_GLYPH_CELL_SIZE;
    const metrics = context.measureText(digit);
    const glyphWidth = Math.ceil(metrics.width + DAMAGE_NUMBER_STROKE_PX);
    const glyphHeight = style.fontPx + DAMAGE_NUMBER_STROKE_PX;
    if (glyphWidth > DAMAGE_NUMBER_GLYPH_CELL_SIZE || glyphHeight > DAMAGE_NUMBER_GLYPH_CELL_SIZE) {
      throw new Error(`Damage number glyph ${strength}:${digit} exceeds its atlas cell`);
    }
    const ascent = finiteMetric(metrics.actualBoundingBoxAscent, style.fontPx * 0.8);
    const drawX = x + DAMAGE_NUMBER_STROKE_PX / 2;
    const drawY = y + DAMAGE_NUMBER_STROKE_PX / 2 + ascent;
    context.strokeText(digit, drawX, drawY);
    context.fillText(digit, drawX, drawY);

    chars[digit.charCodeAt(0)] = {
      x,
      y,
      width: glyphWidth,
      height: glyphHeight,
      centerX: glyphWidth / 2,
      centerY: glyphHeight / 2,
      xOffset: 0,
      yOffset: 0,
      xAdvance: glyphWidth,
      data: {},
      kerning: {},
      u0: x / DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH,
      v0: 1 - y / DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT,
      u1: (x + glyphWidth) / DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH,
      v1: 1 - (y + glyphHeight) / DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT,
    };
  });

  const key = DAMAGE_NUMBER_FONT_KEYS[strength];
  return {
    strength,
    entry: {
      texture: AssetKeys.damageNumberGlyphs,
      frame: null,
      data: {
        font: key,
        size: style.fontPx,
        lineHeight: style.fontPx + DAMAGE_NUMBER_STROKE_PX,
        retroFont: false,
        chars,
      },
    },
  };
}

function assertCompleteCache(scene: Phaser.Scene): void {
  const texture = scene.textures.get(AssetKeys.damageNumberGlyphs) as Phaser.Textures.CanvasTexture;
  if (
    texture.width !== DAMAGE_NUMBER_GLYPH_TEXTURE_WIDTH
    || texture.height !== DAMAGE_NUMBER_GLYPH_TEXTURE_HEIGHT
  ) {
    throw new Error('Damage number glyph texture has unexpected dimensions');
  }
  for (const strength of STRENGTHS) {
    const key = DAMAGE_NUMBER_FONT_KEYS[strength];
    const entry = scene.cache.bitmapFont.get(key) as RuntimeBitmapFontEntry | null;
    const style = DAMAGE_NUMBER_FONT_STYLES[strength];
    if (
      entry === null
      || entry.texture !== AssetKeys.damageNumberGlyphs
      || entry.frame !== null
      || entry.data?.font !== key
      || entry.data.size !== style.fontPx
      || entry.data.lineHeight !== style.fontPx + DAMAGE_NUMBER_STROKE_PX
      || Object.keys(entry.data.chars).length !== DAMAGE_NUMBER_DIGITS.length
      || [...DAMAGE_NUMBER_DIGITS].some((digit) => entry.data.chars[digit.charCodeAt(0)] === undefined)
    ) {
      throw new Error(`Damage number bitmap font cache entry ${key} is incomplete`);
    }
  }
}

function finiteMetric(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}
