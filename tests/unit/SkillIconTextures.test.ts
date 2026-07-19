import { AssetKeys } from '../../src/game/assets/AssetKeys';
import { ensureSkillIconTextures } from '../../src/game/assets/SkillIconTextures';

it('Boot는 다섯 28x28 icon texture를 cache guard로 정확히 한 번 생성한다', () => {
  const existing = new Set<string>();
  const generated: Array<{ key: string; width: number; height: number }> = [];
  let graphicsCreated = 0;
  let graphicsDestroyed = 0;
  const graphics = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      if (property === 'generateTexture') {
        const [key, width, height] = args as [string, number, number];
        generated.push({ key, width, height });
        existing.add(key);
      }
      if (property === 'destroy') graphicsDestroyed += 1;
      return graphics;
    },
  });
  const scene = {
    textures: { exists: (key: string) => existing.has(key) },
    make: {
      graphics: () => {
        graphicsCreated += 1;
        return graphics;
      },
    },
  };

  expect(ensureSkillIconTextures(scene as never)).toBe(5);
  expect(ensureSkillIconTextures(scene as never)).toBe(0);

  expect(generated).toEqual([
    AssetKeys.skillBark,
    AssetKeys.skillScold,
    AssetKeys.skillAquaBeam,
    AssetKeys.skillDeokbaeHowl,
    AssetKeys.skillSafetyReport,
  ].map((key) => ({ key, width: 28, height: 28 })));
  expect(graphicsCreated).toBe(5);
  expect(graphicsDestroyed).toBe(5);
});
