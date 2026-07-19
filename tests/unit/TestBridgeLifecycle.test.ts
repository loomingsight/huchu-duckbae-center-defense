import type { HuchuTestBridge } from '../../src/game/debug/TestContract';
import { installOwnedTestBridge } from '../../src/game/debug/TestBridge';
import { SceneRuntimeLifecycle } from '../../src/game/scenes/SceneRuntimeLifecycle';

const bridge = (name: string) => ({ name }) as unknown as HuchuTestBridge;

it('disposer는 자신이 설치한 bridge가 아니면 다른 generation의 bridge를 지우지 않는다', () => {
  const target: { __HUCHU_TEST__?: HuchuTestBridge } = {};
  const first = bridge('first');
  const second = bridge('second');
  const disposeFirst = installOwnedTestBridge(target, first);
  const disposeSecond = installOwnedTestBridge(target, second);

  disposeFirst();
  expect(target.__HUCHU_TEST__).toBe(second);
  disposeSecond();
  expect(target.__HUCHU_TEST__).toBeUndefined();
});

it('import 완료 전 shutdown과 설치 후 shutdown 모두 stale disposer를 남기지 않는다', () => {
  const lifecycle = new SceneRuntimeLifecycle();
  const disposed: string[] = [];

  const beforeImport = lifecycle.begin();
  lifecycle.end(beforeImport);
  expect(lifecycle.isActive(beforeImport)).toBe(false);
  expect(lifecycle.attach(beforeImport, () => disposed.push('late'))).toBe(false);
  expect(disposed).toEqual(['late']);

  const afterInstall = lifecycle.begin();
  expect(lifecycle.attach(afterInstall, () => disposed.push('installed'))).toBe(true);
  lifecycle.end(afterInstall);
  expect(disposed).toEqual(['late', 'installed']);
  expect(lifecycle.isActive(afterInstall)).toBe(false);
});
