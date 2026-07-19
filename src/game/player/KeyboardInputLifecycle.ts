export const MOVEMENT_KEY_CODES = {
  up: 38,
  down: 40,
  left: 37,
  right: 39,
  w: 87,
  a: 65,
  s: 83,
  d: 68,
} as const;

interface OwnedKey {
  readonly keyCode: number;
}

interface KeyboardRemovalPort {
  removeKey(keyCode: number, destroy: boolean, removeCapture: boolean): unknown;
}

export function destroyOwnedKeys(
  keyboard: KeyboardRemovalPort,
  keys: readonly OwnedKey[],
): void {
  keys.forEach((key) => keyboard.removeKey(key.keyCode, true, true));
}
