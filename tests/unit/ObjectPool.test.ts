import { ObjectPool } from '../../src/game/pooling/ObjectPool';

describe('ObjectPool', () => {
  it('constructor에서 capacity만큼 eager-create하고 cap 이후 factory를 호출하지 않는다', () => {
    let factoryCalls = 0;
    const pool = new ObjectPool(2, () => ({ id: factoryCalls += 1 }));

    expect(factoryCalls).toBe(2);
    expect([pool.acquire(), pool.acquire(), pool.acquire()].filter(Boolean)).toHaveLength(2);
    expect(factoryCalls).toBe(2);
    expect(pool.createdCount).toBe(2);
    expect(pool.snapshot()).toMatchObject({ created: 2, active: 2, available: 0 });
  });

  it('release는 활성 item만 한 번 반환하고 foreign·double release는 no-op으로 보고한다', () => {
    const pool = new ObjectPool(2, () => ({ id: Symbol() }));
    const first = pool.acquire()!;
    const foreign = { id: Symbol() };

    expect(pool.release(foreign)).toBe(false);
    expect(pool.release(first)).toBe(true);
    expect(pool.release(first)).toBe(false);
    expect(pool.snapshot()).toMatchObject({ created: 2, active: 0, available: 2 });
    expect(pool.acquire()).toBe(first);
  });

  it('releaseAll은 활성 item에만 reset을 정확히 한 번 적용하고 모두 반환한다', () => {
    const pool = new ObjectPool(3, () => ({ resets: 0 }));
    const first = pool.acquire()!;
    const second = pool.acquire()!;

    pool.releaseAll((item) => { item.resets += 1; });
    pool.releaseAll((item) => { item.resets += 1; });

    expect(first.resets).toBe(1);
    expect(second.resets).toBe(1);
    expect(pool.snapshot()).toMatchObject({ created: 3, active: 0, available: 3 });
  });

  it('snapshot instanceId는 pool identity를 안정적으로 구분한다', () => {
    const first = new ObjectPool(1, () => ({}));
    const second = new ObjectPool(1, () => ({}));
    const initial = first.snapshot();

    first.acquire();

    expect(first.snapshot().instanceId).toBe(initial.instanceId);
    expect(second.snapshot().instanceId).not.toBe(initial.instanceId);
    expect(initial).toMatchObject({ created: 1, active: 0, available: 1 });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'invalid capacity %s를 factory 호출 전에 fail-fast한다',
    (capacity) => {
      let factoryCalls = 0;

      expect(() => new ObjectPool(capacity, () => ({ id: factoryCalls += 1 }))).toThrow(RangeError);
      expect(factoryCalls).toBe(0);
    },
  );

  it('factory의 duplicate reference를 거부하고 pool identity counter를 소비하지 않는다', () => {
    const before = new ObjectPool(1, () => ({})).snapshot();
    const shared = {};
    let factoryCalls = 0;

    expect(() => new ObjectPool(2, () => {
      factoryCalls += 1;
      return shared;
    })).toThrow(RangeError);

    expect(factoryCalls).toBe(2);
    const after = new ObjectPool(2, () => ({})).snapshot();
    expect(after).toEqual({
      instanceId: before.instanceId + 1,
      created: 2,
      active: 0,
      available: 2,
    });
  });

  it.each([null, undefined, 1, 'item', true])(
    'factory의 non-reference %s를 eager construction에서 거부한다',
    (item) => {
      expect(() => new ObjectPool<object>(1, () => item as never)).toThrow(RangeError);
    },
  );

  it('함수도 non-null unique reference로서 pool item으로 허용한다', () => {
    const item = (): string => 'pooled';
    const pool = new ObjectPool(1, () => item);

    expect(pool.snapshot()).toMatchObject({ created: 1, active: 0, available: 1 });
    expect(pool.acquire()).toBe(item);
  });
});
