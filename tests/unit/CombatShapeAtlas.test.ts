import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  COMBAT_SHAPE_ATLAS_HEIGHT,
  COMBAT_SHAPE_ATLAS_WIDTH,
  COMBAT_SHAPE_FRAME_SIZE,
  COMBAT_SHAPE_FRAMES,
  IMPACT_SHAPE_FRAME_SIZE,
  ensureCombatShapeAtlas,
  impactShapeFrame,
} from '../../src/game/assets/CombatShapeAtlas';

it('H6 atlas는 projectile 3개와 56px impact 3 kind x 4 phase를 한 texture에 bake한다', () => {
  const fake = createAtlasScene();
  const expectedFrames = [
    'projectile-poop',
    'projectile-net',
    'projectile-electric',
    'impact-poop-0',
    'impact-poop-1',
    'impact-poop-2',
    'impact-poop-3',
    'impact-net-0',
    'impact-net-1',
    'impact-net-2',
    'impact-net-3',
    'impact-electric-0',
    'impact-electric-1',
    'impact-electric-2',
    'impact-electric-3',
    'safety-report',
  ] as const;

  ensureCombatShapeAtlas(fake.scene as never);

  expect(COMBAT_SHAPE_FRAME_SIZE).toBe(40);
  expect(COMBAT_SHAPE_ATLAS_WIDTH).toBe(872);
  expect(COMBAT_SHAPE_ATLAS_HEIGHT).toBe(56);
  expect(COMBAT_SHAPE_FRAMES).toEqual(expectedFrames);
  expect(fake.graphicsCalls.get('generateTexture')).toEqual([[
    AssetKeys.combatShapes, 872, 56,
  ]]);
  expect(fake.frameAdds.slice(0, 3)).toEqual([
    ['projectile-poop', 0, 0, 0, 40, 40],
    ['projectile-net', 0, 40, 0, 40, 40],
    ['projectile-electric', 0, 80, 0, 40, 40],
  ]);
  expect(fake.frameAdds.slice(3, -1)).toEqual(expectedFrames.slice(3, -1).map((name, index) => (
    [name, 0, 120 + index * 56, 0, 56, 56]
  )));
  expect(fake.frameAdds.at(-1)).toEqual(['safety-report', 0, 792, 0, 80, 56]);
  expect(impactShapeFrame('poop', 0)).toBe('impact-poop-0');
  expect(impactShapeFrame('net', 2)).toBe('impact-net-2');
  expect(impactShapeFrame('electric', 3)).toBe('impact-electric-3');
});

it('combat atlas는 안전신문고용 굵은 주황색 한글 신고 글리프 frame을 포함한다', () => {
  const fake = createAtlasScene();

  ensureCombatShapeAtlas(fake.scene as never);

  expect(COMBAT_SHAPE_FRAMES).toContain('safety-report');
  expect(fake.frameNames()).toContain('safety-report');
  expect(fake.graphicsCalls.get('fillStyle')).toContainEqual([0xff6b35, 1]);
  expect(fake.graphicsCalls.get('fillRect')).toContainEqual([798, 41, 27, 6]);
  expect(fake.graphicsCalls.get('fillRect')).toContainEqual([860, 8, 7, 30]);
});

it('H6 atlas는 마지막 impact phase frame 실패도 texture 전체 rollback 후 retry한다', () => {
  const fake = createAtlasScene({ failureMode: 'add', failFrameAt: 14 });

  expect(() => ensureCombatShapeAtlas(fake.scene as never)).toThrow(
    'Combat shape atlas could not add frame impact-electric-3',
  );

  expect(fake.removedKeys).toEqual([AssetKeys.combatShapes]);
  expect(fake.textureExists()).toBe(false);
  expect(fake.frameNames()).toEqual([]);
  expect(fake.graphicsCalls.get('destroy')).toHaveLength(1);

  ensureCombatShapeAtlas(fake.scene as never);

  expect(fake.textureExists()).toBe(true);
  expect(fake.frameNames()).toEqual(COMBAT_SHAPE_FRAMES);
  expect(fake.graphicsCalls.get('destroy')).toHaveLength(2);
});

it('H6 atlas는 generateTexture가 key 등록 뒤 실패해도 orphan texture를 제거하고 retry한다', () => {
  const fake = createAtlasScene({ failureMode: 'generate' });

  expect(() => ensureCombatShapeAtlas(fake.scene as never)).toThrow(
    'fake generateTexture refresh failed',
  );

  expect(fake.removedKeys).toEqual([AssetKeys.combatShapes]);
  expect(fake.textureExists()).toBe(false);
  expect(fake.frameNames()).toEqual([]);
  expect(fake.graphicsCalls.get('destroy')).toHaveLength(1);

  ensureCombatShapeAtlas(fake.scene as never);

  expect(fake.textureExists()).toBe(true);
  expect(fake.frameNames()).toEqual(COMBAT_SHAPE_FRAMES);
  expect(fake.graphicsCalls.get('destroy')).toHaveLength(2);
});

it('16 combat shape frames are rasterized into one mixed-cell atlas exactly once', () => {
  const fake = createAtlasScene();

  ensureCombatShapeAtlas(fake.scene as never);

  expect(AssetKeys.combatShapes).toBe('combat-shapes');
  expect(COMBAT_SHAPE_ATLAS_WIDTH).toBe(872);
  expect(COMBAT_SHAPE_ATLAS_HEIGHT).toBe(56);
  expect(COMBAT_SHAPE_FRAME_SIZE).toBe(40);
  expect(IMPACT_SHAPE_FRAME_SIZE).toBe(56);
  expect(COMBAT_SHAPE_FRAMES).toEqual([
    'projectile-poop',
    'projectile-net',
    'projectile-electric',
    'impact-poop-0',
    'impact-poop-1',
    'impact-poop-2',
    'impact-poop-3',
    'impact-net-0',
    'impact-net-1',
    'impact-net-2',
    'impact-net-3',
    'impact-electric-0',
    'impact-electric-1',
    'impact-electric-2',
    'impact-electric-3',
    'safety-report',
  ]);
  expect(fake.makeGraphics).toEqual([{ add: false }]);
  expect(fake.graphicsCalls.get('generateTexture')).toEqual([
    [AssetKeys.combatShapes, 872, 56],
  ]);
  expect(fake.frameAdds).toEqual([
    ['projectile-poop', 0, 0, 0, 40, 40],
    ['projectile-net', 0, 40, 0, 40, 40],
    ['projectile-electric', 0, 80, 0, 40, 40],
    ...COMBAT_SHAPE_FRAMES.slice(3, -1).map((name, index) => (
      [name, 0, 120 + index * 56, 0, 56, 56]
    )),
    ['safety-report', 0, 792, 0, 80, 56],
  ]);
  expect(fake.graphicsCalls.get('destroy')).toHaveLength(1);

  ensureCombatShapeAtlas(fake.scene as never);

  expect(fake.makeGraphics).toHaveLength(1);
  expect(fake.graphicsCalls.get('generateTexture')).toHaveLength(1);
  expect(fake.frameAdds).toHaveLength(16);
  expect(fake.graphicsCalls.get('destroy')).toHaveLength(1);
});

it('atlas uses the existing projectile and impact vector commands, colors, and line widths', () => {
  const fake = createAtlasScene();

  ensureCombatShapeAtlas(fake.scene as never);

  expect(fake.graphicsCalls.get('fillStyle')).toEqual([
    [0x75421f, 1],
    [0xd39b5d, 0.8],
    [0x75421f, 1],
    [0x75421f, 1],
    [0x75421f, 1],
    [0x75421f, 1],
    [0xff6b35, 1],
  ]);
  expect(fake.graphicsCalls.get('fillCircle')).toEqual([
    [17, 22, 5],
    [22, 20, 5],
    [21, 18, 1.5],
  ]);
  expect(fake.graphicsCalls.get('lineStyle')).toEqual([
    [2, 0xf1d57a, 1],
    [4, 0x55f4ef, 1],
    [3 * 0.75, 0xf1d57a, 1],
    [3, 0xf1d57a, 1],
    [3 * 1.2, 0xf1d57a, 1],
    [3 * 1.4, 0xf1d57a, 1],
    [4 * 0.75, 0x55f4ef, 1],
    [4, 0x55f4ef, 1],
    [4 * 1.2, 0x55f4ef, 1],
    [4 * 1.4, 0x55f4ef, 1],
  ]);
  expect(fake.graphicsCalls.get('strokeCircle')).toEqual([
    [60, 20, 10],
    [372, 28, 16 * 0.75],
    [428, 28, 16],
    [484, 28, 16 * 1.2],
    [540, 28, 16 * 1.4],
    [596, 28, 14 * 0.75],
    [652, 28, 14],
    [708, 28, 14 * 1.2],
    [764, 28, 14 * 1.4],
  ]);
  expect(fake.graphicsCalls.get('fillEllipse')).toEqual([
    [148, 28, 18 * 0.75, 8 * 0.75],
    [204, 28, 18, 8],
    [260, 28, 18 * 1.2, 8 * 1.2],
    [316, 28, 18 * 1.4, 8 * 1.4],
  ]);
  expect(fake.graphicsCalls.get('moveTo')).toEqual([
    [53, 13],
    [67, 13],
    [90, 16],
  ]);
  expect(fake.graphicsCalls.get('lineTo')).toEqual([
    [67, 27],
    [53, 27],
    [97, 19],
    [94, 28],
    [110, 15],
    [103, 19],
    [106, 12],
  ]);
});

it('an existing atlas is verified without silently repairing missing frames', () => {
  const fake = createAtlasScene({
    textureExists: true,
    frames: COMBAT_SHAPE_FRAMES.slice(0, -1),
  });

  expect(() => ensureCombatShapeAtlas(fake.scene as never)).toThrow(
    'Combat shape atlas is missing frame safety-report',
  );
  expect(fake.makeGraphics).toEqual([]);
  expect(fake.frameAdds).toEqual([]);
  expect(fake.removedKeys).toEqual([]);
  expect(fake.textureExists()).toBe(true);
});

it.each([
  ['frame add', 'add', 'Combat shape atlas could not add frame projectile-electric'],
  ['completeness assertion', 'assert', 'Combat shape atlas is missing frame projectile-electric'],
] as const)(
  'a newly generated atlas rolls back after %s failure and can be retried',
  (_label, failureMode, expectedError) => {
    const fake = createAtlasScene({ failureMode, failFrameAt: 2 });

    expect(() => ensureCombatShapeAtlas(fake.scene as never)).toThrow(expectedError);

    expect(fake.removedKeys).toEqual([AssetKeys.combatShapes]);
    expect(fake.textureExists()).toBe(false);
    expect(fake.frameNames()).toEqual([]);
    expect(fake.graphicsCalls.get('destroy')).toHaveLength(1);

    ensureCombatShapeAtlas(fake.scene as never);

    expect(fake.textureExists()).toBe(true);
    expect(fake.frameNames()).toEqual(COMBAT_SHAPE_FRAMES);
    expect(fake.removedKeys).toEqual([AssetKeys.combatShapes]);
    expect(fake.graphicsCalls.get('destroy')).toHaveLength(2);
  },
);

it('PreloadScene ensures the runtime atlas before starting Title', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../../src/game/scenes/PreloadScene.ts', import.meta.url),
    'utf8',
  );
  const preloadIndex = source.indexOf('preload(): void');
  const createIndex = source.indexOf('create(): void');
  const ensureIndex = source.indexOf('ensureCombatShapeAtlas(this)');
  const titleIndex = source.indexOf("this.scene.start('Title')");

  expect(createIndex).toBeGreaterThan(preloadIndex);
  expect(ensureIndex).toBeGreaterThanOrEqual(0);
  expect(ensureIndex).toBeGreaterThan(createIndex);
  expect(titleIndex).toBeGreaterThan(ensureIndex);
  expect(source.slice(preloadIndex, createIndex)).not.toContain('ensureCombatShapeAtlas');
});

it('runtime render paths never generate the atlas or hide stress-only shapes', async () => {
  const { readFile } = await import('node:fs/promises');
  const [effects, projectiles] = await Promise.all([
    readFile(new URL('../../src/game/combat/CombatEffectPool.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/game/combat/ProjectileActorPool.ts', import.meta.url), 'utf8'),
  ]);

  expect(effects).not.toContain('generateTexture');
  expect(projectiles).not.toContain('generateTexture');
  expect(effects).not.toMatch(/stress[\s\S]{0,120}(visible|alpha)/i);
  expect(projectiles).not.toMatch(/stress[\s\S]{0,120}(visible|alpha)/i);
});

interface AtlasSceneOptions {
  readonly textureExists?: boolean;
  readonly frames?: readonly string[];
  readonly failureMode?: 'add' | 'assert' | 'generate';
  readonly failFrameAt?: number;
}

function createAtlasScene(options: AtlasSceneOptions = {}): {
  readonly scene: object;
  readonly makeGraphics: object[];
  readonly graphicsCalls: Map<string, unknown[][]>;
  readonly frameAdds: unknown[][];
  readonly removedKeys: string[];
  readonly textureExists: () => boolean;
  readonly frameNames: () => readonly string[];
} {
  let textureExists = options.textureExists ?? false;
  const frames = new Set(options.frames ?? []);
  const makeGraphics: object[] = [];
  const graphicsCalls = new Map<string, unknown[][]>();
  const frameAdds: unknown[][] = [];
  const removedKeys: string[] = [];
  let frameIndex = 0;
  let failureInjected = false;
  const graphics = recordingObject(graphicsCalls, (method) => {
    if (method === 'generateTexture') {
      textureExists = true;
      frameIndex = 0;
      if (!failureInjected && options.failureMode === 'generate') {
        failureInjected = true;
        throw new Error('fake generateTexture refresh failed');
      }
    }
  });
  const texture = {
    has: (name: string) => frames.has(name),
    add: (...args: unknown[]) => {
      frameAdds.push(args);
      const injectFailure = !failureInjected && frameIndex === options.failFrameAt;
      frameIndex += 1;
      if (injectFailure) {
        failureInjected = true;
        if (options.failureMode === 'add') return null;
        if (options.failureMode === 'assert') return {};
      }
      frames.add(String(args[0]));
      return {};
    },
  };
  return {
    scene: {
      make: {
        graphics: (config: object) => {
          makeGraphics.push(config);
          return graphics;
        },
      },
      textures: {
        exists: (key: string) => key === AssetKeys.combatShapes && textureExists,
        get: (key: string) => {
          if (key !== AssetKeys.combatShapes || !textureExists) {
            throw new Error(`Missing texture ${key}`);
          }
          return texture;
        },
        remove: (key: string) => {
          removedKeys.push(key);
          if (key === AssetKeys.combatShapes) {
            textureExists = false;
            frames.clear();
          }
        },
      },
    },
    makeGraphics,
    graphicsCalls,
    frameAdds,
    removedKeys,
    textureExists: () => textureExists,
    frameNames: () => [...frames],
  };
}

function recordingObject(
  calls: Map<string, unknown[][]>,
  onCall: (method: string, args: readonly unknown[]) => void,
): object {
  const object = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      const method = String(property);
      const history = calls.get(method) ?? [];
      history.push(args);
      calls.set(method, history);
      onCall(method, args);
      return object;
    },
  });
  return object;
}
