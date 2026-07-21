import { describe, expect, it } from 'vitest';
import { AssetKeys } from '../../src/game/assets/AssetKeys';
import {
  ENEMY_LABEL_NAMES,
  enemyLabelAtlasFrame,
  type EnemyLabelCombinedFrameData,
} from '../../src/game/assets/EnemyLabelAtlas';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/constants';
import {
  ENEMY_LABEL_BACKGROUND,
  ENEMY_LABEL_FONT_PX,
  ENEMY_LABEL_STROKE_PX,
  EnemyLabelView,
  enemyLabelLayout,
} from '../../src/game/enemies/EnemyLabelView';

describe('EnemyLabelView', () => {
  it('view당 combined Image 하나만 만들고 HP step이 변할 때만 frame을 바꾼다', () => {
    const fake = createFakeScene({ labelFrameSize: { width: 126, height: 19 } });
    const label = new EnemyLabelView(fake.scene as never);

    label.bind('똥 방치 보호자');
    label.render({
      position: { x: 270, y: 500 }, currentHp: 60, maxHp: 60,
      opaqueHeightLogical: 84, visible: true,
    });
    label.render({
      position: { x: 275, y: 505 }, currentHp: 59, maxHp: 60,
      opaqueHeightLogical: 84, visible: true,
    });
    label.render({
      position: { x: 280, y: 510 }, currentHp: 30, maxHp: 60,
      opaqueHeightLogical: 84, visible: false,
    });
    label.render({
      position: { x: 280, y: 510 }, currentHp: 30, maxHp: 60,
      opaqueHeightLogical: 84, visible: false,
    });

    expect(fake.textCreates).toEqual([]);
    expect(fake.imageCreates).toEqual([[0, 0, AssetKeys.enemyLabels]]);
    expect(calls(fake.images[0]!, 'setFrame')).toEqual([
      [enemyLabelAtlasFrame('똥 방치 보호자', 0)],
      [enemyLabelAtlasFrame('똥 방치 보호자', 30)],
      [enemyLabelAtlasFrame('똥 방치 보호자', 15)],
    ]);
    expect(lastCall(fake.images[0]!, 'setPosition')).toEqual([217, 401]);
    expect(lastCall(fake.images[0]!, 'setDepth')).toEqual([512]);
    expect(lastCall(fake.images[0]!, 'setVisible')).toEqual([false]);
    expect(calls(fake.images[0]!, 'setPosition')).toHaveLength(3);
    expect(calls(fake.images[0]!, 'setDepth')).toHaveLength(3);
    expect(calls(fake.images[0]!, 'setActive')).toHaveLength(4);
    expect(calls(fake.images[0]!, 'setVisible')).toHaveLength(4);
    expect(calls(fake.images[0]!, 'setDisplaySize')).toEqual([]);
    expect(calls(fake.images[0]!, 'setTint')).toEqual([]);
    expect(label.snapshot()).toMatchObject({
      displayName: '똥 방치 보호자',
      fontPx: 14,
      strokePx: 1,
      background: ENEMY_LABEL_BACKGROUND,
      hpAboveName: true,
      damageLayerAbove: true,
      visible: false,
      hp: {
        currentHp: 30,
        maxHp: 60,
        hpRatio: 0.5,
        hpColor: 0xf2ca45,
      },
    });
  });

  it('reset 뒤 같은 pooled Image를 다른 이름으로 LIFO 재사용한다', () => {
    const fake = createFakeScene();
    const label = new EnemyLabelView(fake.scene as never);
    label.bind('개장수');
    label.render({
      position: { x: 270, y: 500 }, currentHp: 60, maxHp: 60,
      opaqueHeightLogical: 84, visible: true,
    });
    expect(() => label.bind('불법번식업자')).toThrow('already bound');

    label.reset();
    label.bind('불법번식업자');

    expect(fake.imageCreates).toHaveLength(1);
    expect(calls(fake.images[0]!, 'setFrame')).toEqual([
      [enemyLabelAtlasFrame('개장수', 0)],
      [enemyLabelAtlasFrame('개장수', 30)],
      [enemyLabelAtlasFrame('불법번식업자', 0)],
    ]);
    expect(label.snapshot().hp).toBeNull();
  });

  it.each(ENEMY_LABEL_NAMES)(
    '%s는 14px/stroke/background와 actor→name→HP→damage 논리 순서를 유지한다',
    (name) => {
      const layout = enemyLabelLayout({ x: 270, y: 500 }, 84, name);

      expect({ fontPx: ENEMY_LABEL_FONT_PX, strokePx: ENEMY_LABEL_STROKE_PX })
        .toEqual({ fontPx: 14, strokePx: 1 });
      expect(ENEMY_LABEL_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/i);
      expect(layout.name.bottom).toBeLessThan(500 - 84);
      expect(layout.hp.bottom).toBeLessThan(layout.name.top);
      expect(layout.hp.top - layout.damageAnchor.y).toBe(8);
    },
  );

  it.each([
    ['top', { x: 270, y: 90 }, 'top'],
    ['left', { x: 0, y: 500 }, 'left'],
    ['right', { x: WORLD_WIDTH, y: 500 }, 'right'],
  ] as const)('%s spawn은 name·HP·damage anchor 묶음을 world 안으로 clamp한다', (
    _edge,
    position,
    clampedEdge,
  ) => {
    const layout = enemyLabelLayout(position, 84, '똥 방치 보호자');
    const horizontal = [
      layout.name.left, layout.name.right, layout.hp.left, layout.hp.right,
      layout.damageAnchor.x,
    ];
    const vertical = [
      layout.name.top, layout.name.bottom, layout.hp.top, layout.hp.bottom,
      layout.damageAnchor.y,
    ];

    expect(Math.min(...horizontal)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...horizontal)).toBeLessThanOrEqual(WORLD_WIDTH);
    expect(Math.min(...vertical)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vertical)).toBeLessThanOrEqual(WORLD_HEIGHT);
    if (clampedEdge === 'top') expect(Math.min(...vertical)).toBe(0);
    if (clampedEdge === 'left') expect(Math.min(...horizontal)).toBe(0);
    if (clampedEdge === 'right') expect(Math.max(...horizontal)).toBe(WORLD_WIDTH);
  });

  it('actual name metadata로 combined Image 위치·edge clamp·boss depth·damageAnchor를 계산한다', () => {
    const fake = createFakeScene({ labelFrameSize: { width: 126, height: 19 } });
    const label = new EnemyLabelView(fake.scene as never);
    label.bind('똥 방치 보호자');

    label.render({
      position: { x: WORLD_WIDTH, y: 500 }, currentHp: 900, maxHp: 900,
      opaqueHeightLogical: 100, visible: true,
    });

    const layout = enemyLabelLayout(
      { x: WORLD_WIDTH, y: 500 },
      100,
      '똥 방치 보호자',
      { width: 126, height: 19 },
    );
    expect(lastCall(fake.images[0]!, 'setPosition')).toEqual([
      Math.min(layout.name.left, layout.hp.left),
      Math.min(layout.name.top, layout.hp.top),
    ]);
    expect(lastCall(fake.images[0]!, 'setDepth')).toEqual([502]);
    expect(label.damageAnchor()).toEqual(layout.damageAnchor);
    expect(Math.max(layout.name.right, layout.hp.right, layout.damageAnchor.x)).toBe(WORLD_WIDTH);
  });

  it('rendered-visible은 single Image render state, HP fill 의미, name·HP viewport를 모두 요구한다', () => {
    const fake = createFakeScene();
    const label = new EnemyLabelView(fake.scene as never);
    const camera = {};
    const viewport = { left: 0, right: WORLD_WIDTH, top: 0, bottom: WORLD_HEIGHT };
    label.bind('똥 방치 보호자');
    label.render({
      position: { x: 270, y: 500 }, currentHp: 60, maxHp: 60,
      opaqueHeightLogical: 84, visible: true,
    });

    expect(label.renderedVisible(camera as never, viewport)).toBe(true);
    fake.images[0]!.state.onCamera = false;
    expect(label.renderedVisible(camera as never, viewport)).toBe(false);
    fake.images[0]!.state.onCamera = true;
    fake.images[0]!.state.alpha = 0;
    expect(label.renderedVisible(camera as never, viewport)).toBe(false);
    fake.images[0]!.state.alpha = 1;
    expect(label.renderedVisible(
      camera as never,
      { left: 0, right: 40, top: 0, bottom: 40 },
    )).toBe(false);

    label.render({
      position: { x: 270, y: 500 }, currentHp: 0, maxHp: 60,
      opaqueHeightLogical: 84, visible: true,
    });
    expect(label.renderedVisible(camera as never, viewport)).toBe(false);
  });

  it('invalid combined frame metadata는 bind를 원자 실패시킨다', () => {
    const fake = createFakeScene({ corruptMetadata: true });
    const label = new EnemyLabelView(fake.scene as never);

    expect(() => label.bind('똥 방치 보호자')).toThrow(/invalid metadata/i);
    expect(label.snapshot().displayName).toBeNull();
  });

  it('pool 생성 rollback용 destroy는 single Image listener와 GameObject를 제거한다', () => {
    const fake = createFakeScene();
    const label = new EnemyLabelView(fake.scene as never);

    label.destroy();

    expect(calls(fake.images[0]!, 'removeAllListeners')).toHaveLength(1);
    expect(calls(fake.images[0]!, 'destroy')).toHaveLength(1);
  });
});

interface FakeFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly customData: EnemyLabelCombinedFrameData;
}

interface FakeObject {
  readonly object: object;
  readonly calls: Map<string, unknown[][]>;
  readonly state: {
    active: boolean;
    visible: boolean;
    alpha: number;
    onCamera: boolean;
    width: number;
    height: number;
    frame: FakeFrame | null;
    destroyed: boolean;
  };
}

function createFakeScene(options: {
  readonly labelFrameSize?: { readonly width: number; readonly height: number };
  readonly corruptMetadata?: boolean;
} = {}) {
  const textCreates: unknown[][] = [];
  const images: FakeObject[] = [];
  const imageCreates: unknown[][] = [];
  const texture = {
    get: (frameName: string): FakeFrame => createFrame(frameName, options),
  };
  return {
    scene: {
      add: {
        text: (...args: unknown[]) => {
          textCreates.push(args);
          return {};
        },
        image: (...args: unknown[]) => {
          imageCreates.push(args);
          const image = createFakeObject(texture);
          images.push(image);
          return image.object;
        },
      },
    },
    textCreates,
    images,
    imageCreates,
  };
}

function createFrame(
  frameName: string,
  options: {
    readonly labelFrameSize?: { readonly width: number; readonly height: number };
    readonly corruptMetadata?: boolean;
  },
): FakeFrame {
  const separator = frameName.lastIndexOf('::hp-');
  const displayName = frameName.slice(0, separator) as typeof ENEMY_LABEL_NAMES[number];
  const hpStep = Number(frameName.slice(separator + 5));
  const nameWidth = options.labelFrameSize?.width ?? displayName.length * 14 + 6;
  const nameHeight = options.labelFrameSize?.height ?? 17;
  const combinedWidth = Math.max(nameWidth, 30);
  const nameOffsetY = 14 - nameHeight / 2;
  const combinedHeight = Math.ceil(Math.max(4, nameOffsetY + nameHeight));
  return {
    name: frameName,
    width: combinedWidth,
    height: combinedHeight,
    customData: {
      displayName,
      hpStep,
      nameWidth: options.corruptMetadata === true ? 0 : nameWidth,
      nameHeight,
      combinedWidth,
      combinedHeight,
      nameOffsetX: (combinedWidth - nameWidth) / 2,
      nameOffsetY,
      hpOffsetX: (combinedWidth - 30) / 2,
      hpOffsetY: 0,
    },
  };
}

function createFakeObject(texture: { get(frameName: string): FakeFrame }): FakeObject {
  const callsByMethod = new Map<string, unknown[][]>();
  const state: FakeObject['state'] = {
    active: false,
    visible: false,
    alpha: 1,
    onCamera: true,
    width: 1,
    height: 1,
    frame: null,
    destroyed: false,
  };
  const target = {};
  const object = new Proxy(target, {
    get: (_current, property) => {
      if (property === 'active') return state.active;
      if (property === 'visible') return state.visible;
      if (property === 'alpha') return state.alpha;
      if (property === 'width') return state.width;
      if (property === 'height') return state.height;
      if (property === 'frame') return state.frame;
      if (property === 'texture') return texture;
      if (property === 'willRender') {
        return () => state.onCamera && state.active && state.visible && state.alpha > 0;
      }
      return (...args: unknown[]) => {
        record(callsByMethod, String(property), args);
        if (property === 'setActive') state.active = Boolean(args[0]);
        if (property === 'setVisible') state.visible = Boolean(args[0]);
        if (property === 'setAlpha') state.alpha = Number(args[0]);
        if (property === 'setFrame') {
          state.frame = texture.get(String(args[0]));
          state.width = state.frame.width;
          state.height = state.frame.height;
        }
        if (property === 'destroy') state.destroyed = true;
        return object;
      };
    },
  });
  return { object, calls: callsByMethod, state };
}

function record(callsByMethod: Map<string, unknown[][]>, method: string, args: unknown[]): void {
  const history = callsByMethod.get(method) ?? [];
  history.push(args);
  callsByMethod.set(method, history);
}

function calls(fake: FakeObject, method: string): unknown[][] {
  return fake.calls.get(method) ?? [];
}

function lastCall(fake: FakeObject, method: string): unknown[] | undefined {
  return calls(fake, method).at(-1);
}
