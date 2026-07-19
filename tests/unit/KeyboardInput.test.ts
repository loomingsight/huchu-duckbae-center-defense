import {
  destroyOwnedKeys,
  MOVEMENT_KEY_CODES,
} from '../../src/game/player/KeyboardInputLifecycle';

it('필요한 8개 키만 소유하고 destroy에서 key와 capture를 함께 제거한다', () => {
  const keyCodes = {
    up: 38, down: 40, left: 37, right: 39,
    w: 87, a: 65, s: 83, d: 68,
  } as const;
  expect(MOVEMENT_KEY_CODES).toEqual(keyCodes);
  const keys = Object.values(keyCodes).map((keyCode) => ({ keyCode }));
  const removeKey = vi.fn();

  destroyOwnedKeys({ removeKey }, keys);

  expect(removeKey).toHaveBeenCalledTimes(8);
  for (const keyCode of Object.values(keyCodes)) {
    expect(removeKey).toHaveBeenCalledWith(keyCode, true, true);
  }
});
