import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('warmup/refill 후 shared atlas canvas-source texImage2D upload을 만들지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    interface UploadProbe {
      phase: 'warmup' | 'measure';
      readonly sharedSources: WeakSet<HTMLCanvasElement>;
      trackedSourceCount: number;
      uploads: number;
    }
    type UploadProbeWindow = Window & { __SHARED_ATLAS_UPLOAD_PROBE__?: UploadProbe };
    type TexImagePrototype = {
      texImage2D: (...args: unknown[]) => unknown;
      __huchuCanvasUploadPatched?: true;
    };
    const target = window as UploadProbeWindow;
    target.__SHARED_ATLAS_UPLOAD_PROBE__ = {
      phase: 'warmup',
      sharedSources: new WeakSet(),
      trackedSourceCount: 0,
      uploads: 0,
    };
    const patch = (prototype: TexImagePrototype | undefined): void => {
      if (prototype === undefined || prototype.__huchuCanvasUploadPatched === true) return;
      const original = prototype.texImage2D;
      prototype.texImage2D = function (...args: unknown[]): unknown {
        const source = args.find((argument) => argument instanceof HTMLCanvasElement);
        if (source instanceof HTMLCanvasElement) {
          const probe = target.__SHARED_ATLAS_UPLOAD_PROBE__!;
          const stack = new Error().stack ?? '';
          if (
            probe.phase === 'warmup'
            && /(?:EnemyLabelAtlas|DamageNumberBitmapFont)\.ts/.test(stack)
            && stack.includes('CanvasTexture.refresh')
            && !probe.sharedSources.has(source)
          ) {
            probe.sharedSources.add(source);
            probe.trackedSourceCount += 1;
          } else if (probe.phase === 'measure' && probe.sharedSources.has(source)) {
            probe.uploads += 1;
          }
        }
        return Reflect.apply(original, this, args);
      };
      prototype.__huchuCanvasUploadPatched = true;
    };
    patch(WebGLRenderingContext.prototype as unknown as TexImagePrototype);
    patch(WebGL2RenderingContext.prototype as unknown as TexImagePrototype);
  });
  await openScenario(page, 'stress');
  expect((await snapshot(page)).pools).toMatchObject({
    labels: { created: 60, active: 60 },
    damageNumbers: { created: 64, active: 64 },
  });
  const trackedSourceCount = await page.evaluate(() => {
    const probe = (window as Window & {
      __SHARED_ATLAS_UPLOAD_PROBE__?: { phase: string; trackedSourceCount: number; uploads: number };
    }).__SHARED_ATLAS_UPLOAD_PROBE__!;
    probe.phase = 'measure';
    probe.uploads = 0;
    return probe.trackedSourceCount;
  });
  expect(trackedSourceCount).toBeGreaterThanOrEqual(2);

  await advance(page, 800);

  expect((await snapshot(page)).pools.damageNumbers).toMatchObject({
    created: 64,
    active: 64,
  });
  const uploads = await page.evaluate(() => (
    (window as Window & { __SHARED_ATLAS_UPLOAD_PROBE__?: { uploads: number } })
      .__SHARED_ATLAS_UPLOAD_PROBE__?.uploads ?? -1
  ));
  expect(uploads).toBe(0);
});
