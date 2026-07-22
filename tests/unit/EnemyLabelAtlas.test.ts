import { describe, expect, it } from 'vitest';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  ENEMY_LABEL_ATLAS_FRAMES,
  ENEMY_LABEL_BACKGROUND,
  ENEMY_LABEL_FONT_PX,
  ENEMY_LABEL_NAMES,
  ENEMY_LABEL_STROKE_PX,
  ENEMY_LABEL_TEXT_STYLE,
  enemyLabelAtlasFrame,
  ensureEnemyLabelAtlas,
} from '../../src/game/assets/EnemyLabelAtlas';

describe('EnemyLabelAtlas', () => {
  it('Preload create는 combat atlas → combined label atlas → damage fonts → Title 순서를 보장한다', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../../src/game/scenes/PreloadScene.ts', import.meta.url),
      'utf8',
    );
    const combat = source.indexOf('ensureCombatShapeAtlas(this)');
    const labels = source.indexOf('ensureEnemyLabelAtlas(this)');
    const damage = source.indexOf('ensureDamageNumberBitmapFonts(this)');
    const title = source.indexOf("this.scene.start('Title')");

    expect(combat).toBeGreaterThanOrEqual(0);
    expect(labels).toBeGreaterThan(combat);
    expect(damage).toBeGreaterThan(labels);
    expect(title).toBeGreaterThan(damage);
  });

  it('4개 이름×31 HP 단계를 2D-packed single atlas의 정확히 124 frame으로 만든다', () => {
    const fake = createAtlasScene();

    ensureEnemyLabelAtlas(fake.scene as never);

    expect(AssetKeys.enemyLabels).toBe('enemy-labels');
    expect(ENEMY_LABEL_NAMES).toEqual([
      '똥 방치러', '오프리시 빌런', '개장수', '불법번식업자',
    ]);
    expect(ENEMY_LABEL_ATLAS_FRAMES).toHaveLength(124);
    expect(new Set(ENEMY_LABEL_ATLAS_FRAMES).size).toBe(124);
    expect(ENEMY_LABEL_NAMES.flatMap((name) => (
      Array.from({ length: 31 }, (_, hpStep) => enemyLabelAtlasFrame(name, hpStep))
    ))).toEqual(ENEMY_LABEL_ATLAS_FRAMES);
    expect({
      fontPx: ENEMY_LABEL_FONT_PX,
      strokePx: ENEMY_LABEL_STROKE_PX,
      background: ENEMY_LABEL_BACKGROUND,
    }).toEqual({ fontPx: 14, strokePx: 1, background: '#f7edcf' });
    expect(ENEMY_LABEL_TEXT_STYLE).toEqual({
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#2f251f',
      stroke: '#17120f',
      strokeThickness: 1,
      backgroundColor: '#f7edcf',
      padding: { x: 3, y: 1 },
    });
    expect(fake.textConfigs).toHaveLength(4);
    expect(fake.textConfigs.map(({ text }) => text)).toEqual(ENEMY_LABEL_NAMES);
    expect(fake.textConfigs.every(({ style, add }) => (
      style === ENEMY_LABEL_TEXT_STYLE && add === false
    ))).toBe(true);
    expect(fake.createCanvasCalls).toHaveLength(1);
    expect(fake.createCanvasCalls[0]?.[0]).toBe(AssetKeys.enemyLabels);
    expect(fake.createCanvasCalls[0]?.[1]).toBeLessThanOrEqual(2048);
    expect(new Set(fake.frameAdds.map((args) => args[3])).size).toBeGreaterThan(1);
    expect(fake.drawCalls).toHaveLength(124);
    expect(fake.frameAdds.map(([name]) => name)).toEqual(ENEMY_LABEL_ATLAS_FRAMES);
    expect(fake.frameNames()).toEqual(ENEMY_LABEL_ATLAS_FRAMES);
    expect(fake.refreshCalls).toBe(1);
    expect(fake.destroyCalls).toEqual(ENEMY_LABEL_NAMES);
  });

  it('background alpha/tint와 threshold별 fill pixel 색을 atlas에 정확히 bake한다', () => {
    const fake = createAtlasScene();

    ensureEnemyLabelAtlas(fake.scene as never);

    expect(fake.fillCalls.filter(({ style, alpha, width, height }) => (
      style === '#2a241f' && alpha === 0.75 && width === 30 && height === 4
    ))).toHaveLength(124);
    expect(fake.fillCalls.filter(({ style, alpha }) => (
      style === '#d94b43' && alpha === 1
    ))).toHaveLength(4 * 5);
    expect(fake.fillCalls.filter(({ style, alpha }) => (
      style === '#f2ca45' && alpha === 1
    ))).toHaveLength(4 * 10);
    expect(fake.fillCalls.filter(({ style, alpha }) => (
      style === '#39a852' && alpha === 1
    ))).toHaveLength(4 * 15);
  });

  it('각 combined frame은 name/HP 논리 bounds를 복구할 exact metadata를 가진다', () => {
    const fake = createAtlasScene();
    ensureEnemyLabelAtlas(fake.scene as never);

    const data = fake.frameData(enemyLabelAtlasFrame('똥 방치러', 16));

    expect(data).toEqual({
      displayName: '똥 방치러',
      hpStep: 16,
      nameWidth: '똥 방치러'.length * 14 + 6,
      nameHeight: 17,
      combinedWidth: '똥 방치러'.length * 14 + 6,
      combinedHeight: 23,
      nameOffsetX: 0,
      nameOffsetY: 5.5,
      hpOffsetX: (('똥 방치러'.length * 14 + 6) - 30) / 2,
      hpOffsetY: 0,
    });
  });

  it('complete cache는 restart에서 재사용하고 Text/canvas/frame/refresh를 늘리지 않는다', () => {
    const fake = createAtlasScene();
    ensureEnemyLabelAtlas(fake.scene as never);
    const before = fake.counts();

    ensureEnemyLabelAtlas(fake.scene as never);

    expect(fake.counts()).toEqual(before);
    expect(fake.removedKeys).toEqual([]);
  });

  it('existing partial atlas는 크게 실패하고 기존 자원을 제거하거나 rasterize하지 않는다', () => {
    const fake = createAtlasScene({ existingFrames: ENEMY_LABEL_ATLAS_FRAMES.slice(0, -1) });

    expect(() => ensureEnemyLabelAtlas(fake.scene as never)).toThrow(/missing frame/i);

    expect(fake.textConfigs).toEqual([]);
    expect(fake.createCanvasCalls).toEqual([]);
    expect(fake.removedKeys).toEqual([]);
  });

  it('frame 등록 중 실패하면 신규 atlas만 rollback하고 4개 임시 Text를 전부 destroy한다', () => {
    const fake = createAtlasScene({ failFrameAt: 62 });

    expect(() => ensureEnemyLabelAtlas(fake.scene as never)).toThrow(/could not add frame/i);

    expect(fake.removedKeys).toEqual([AssetKeys.enemyLabels]);
    expect(fake.textureExists()).toBe(false);
    expect(fake.destroyCalls).toEqual(ENEMY_LABEL_NAMES);
  });

  it('Text 치수가 유효하지 않으면 실패를 일으킨 Text까지 전부 destroy한다', () => {
    const fake = createAtlasScene({ invalidTextAt: 1 });

    expect(() => ensureEnemyLabelAtlas(fake.scene as never)).toThrow(/invalid raster dimensions/i);

    expect(fake.createCanvasCalls).toEqual([]);
    expect(fake.destroyCalls).toEqual(ENEMY_LABEL_NAMES.slice(0, 2));
  });
});

interface AtlasFakeOptions {
  readonly existingFrames?: readonly string[];
  readonly failFrameAt?: number;
  readonly invalidTextAt?: number;
}

interface FakeFrameData {
  displayName: string;
  hpStep: number;
  nameWidth: number;
  nameHeight: number;
  combinedWidth: number;
  combinedHeight: number;
  nameOffsetX: number;
  nameOffsetY: number;
  hpOffsetX: number;
  hpOffsetY: number;
}

function createAtlasScene(options: AtlasFakeOptions = {}) {
  const widths = new Map<string, number>(
    ENEMY_LABEL_NAMES.map((name) => [name, name.length * 14 + 6]),
  );
  const textConfigs: Array<{ text: string; style: unknown; add: boolean }> = [];
  const destroyCalls: string[] = [];
  const createCanvasCalls: unknown[][] = [];
  const drawCalls: unknown[][] = [];
  const fillCalls: Array<{
    style: string;
    alpha: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  const frameAdds: unknown[][] = [];
  const removedKeys: string[] = [];
  let refreshCalls = 0;
  let texture: ReturnType<typeof makeTexture> | undefined = options.existingFrames === undefined
    ? undefined
    : makeTexture(options.existingFrames);

  function metadataFor(frameName: string): FakeFrameData {
    const separator = frameName.lastIndexOf('::hp-');
    const displayName = frameName.slice(0, separator);
    const hpStep = Number(frameName.slice(separator + 5));
    const nameWidth = widths.get(displayName)!;
    const nameHeight = 17;
    const combinedWidth = Math.max(nameWidth, 30);
    return {
      displayName,
      hpStep,
      nameWidth,
      nameHeight,
      combinedWidth,
      combinedHeight: 23,
      nameOffsetX: (combinedWidth - nameWidth) / 2,
      nameOffsetY: 5.5,
      hpOffsetX: (combinedWidth - 30) / 2,
      hpOffsetY: 0,
    };
  }

  function makeTexture(existingFrames: readonly string[] = []) {
    const frames = new Map<string, { width: number; height: number; customData: FakeFrameData }>();
    existingFrames.forEach((name) => {
      const data = metadataFor(name);
      frames.set(name, { width: data.combinedWidth, height: data.combinedHeight, customData: data });
    });
    const context = {
      fillStyle: '#000000',
      globalAlpha: 1,
      drawImage: (...args: unknown[]) => { drawCalls.push(args); },
      fillRect: (x: number, y: number, width: number, height: number) => {
        fillCalls.push({ style: context.fillStyle, alpha: context.globalAlpha, x, y, width, height });
      },
    };
    return {
      width: 2048,
      height: 256,
      canvas: {},
      context,
      add: (...args: unknown[]) => {
        frameAdds.push(args);
        if (options.failFrameAt === frameAdds.length - 1) return null;
        const name = String(args[0]);
        const frame = {
          width: Number(args[4]),
          height: Number(args[5]),
          customData: {} as FakeFrameData,
        };
        frames.set(name, frame);
        return frame;
      },
      has: (name: string) => frames.has(name),
      get: (name: string) => frames.get(name),
      getFrameNames: () => [...frames.keys()],
      refresh: () => {
        refreshCalls += 1;
        return texture;
      },
    };
  }

  const scene = {
    make: {
      text: (config: { text: string; style: unknown; add: boolean }) => {
        textConfigs.push(config);
        return {
          width: options.invalidTextAt === textConfigs.length - 1 ? 0 : widths.get(config.text)!,
          height: 17,
          canvas: { label: config.text },
          destroy: () => { destroyCalls.push(config.text); },
        };
      },
    },
    textures: {
      exists: (key: string) => key === AssetKeys.enemyLabels && texture !== undefined,
      get: (key: string) => {
        if (key !== AssetKeys.enemyLabels || texture === undefined) throw new Error('missing texture');
        return texture;
      },
      createCanvas: (...args: unknown[]) => {
        createCanvasCalls.push(args);
        texture = makeTexture();
        texture.width = Number(args[1]);
        texture.height = Number(args[2]);
        return texture;
      },
      remove: (key: string) => {
        removedKeys.push(key);
        if (key === AssetKeys.enemyLabels) texture = undefined;
      },
    },
  };

  return {
    scene,
    textConfigs,
    destroyCalls,
    createCanvasCalls,
    drawCalls,
    fillCalls,
    frameAdds,
    removedKeys,
    frameNames: () => texture?.getFrameNames() ?? [],
    frameData: (name: string) => texture?.get(name)?.customData,
    textureExists: () => texture !== undefined,
    get refreshCalls() { return refreshCalls; },
    counts: () => ({
      texts: textConfigs.length,
      canvases: createCanvasCalls.length,
      draws: drawCalls.length,
      fills: fillCalls.length,
      frames: frameAdds.length,
      refreshes: refreshCalls,
      destroys: destroyCalls.length,
    }),
  };
}
