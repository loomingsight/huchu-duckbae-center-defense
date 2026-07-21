import {
  animationEntries,
  type AnimationDirection,
  type AnimationManifestEntry,
  type Point,
  type SourceAnimationManifestEntry,
} from './AnimationManifest';

export type DogTraderAction = 'walk' | 'attack' | 'truckRoll';

export const ATTACK_SOCKETS: Readonly<Record<AnimationDirection, Point>> = Object.freeze({
  north: Object.freeze({ x: 140, y: 112 }),
  northWest: Object.freeze({ x: 151, y: 119 }),
  west: Object.freeze({ x: 101, y: 136 }),
  southWest: Object.freeze({ x: 154, y: 137 }),
  south: Object.freeze({ x: 143, y: 143 }),
  northEast: Object.freeze({ x: 105, y: 119 }),
  east: Object.freeze({ x: 155, y: 136 }),
  southEast: Object.freeze({ x: 102, y: 137 }),
});

export const MIRROR_OF = Object.freeze({
  northEast: 'northWest',
  east: 'west',
  southEast: 'southWest',
} as const);

const actionStem: Readonly<Record<DogTraderAction, string>> = Object.freeze({
  walk: 'human-walk',
  attack: 'human-attack',
  truckRoll: 'truck-roll',
});

function directionStem(direction: AnimationDirection): string {
  return direction.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function keyFor(action: DogTraderAction, direction: AnimationDirection): string {
  return `dog-trader-${actionStem[action]}-${directionStem(direction)}`;
}

export const DOG_TRADER_ENTRIES: readonly AnimationManifestEntry[] = Object.freeze(
  animationEntries.filter(({ key }) => key.startsWith('dog-trader-')),
);

export const DOG_TRADER_SOURCE_ENTRIES: readonly SourceAnimationManifestEntry[] = Object.freeze(
  DOG_TRADER_ENTRIES.filter(
    (entry): entry is SourceAnimationManifestEntry => 'source' in entry,
  ),
);

function dogTraderEntry(
  action: DogTraderAction,
  direction: AnimationDirection,
): AnimationManifestEntry {
  const key = keyFor(action, direction);
  const entry = DOG_TRADER_ENTRIES.find((candidate) => candidate.key === key);
  if (entry === undefined) throw new Error(`Unknown dog trader animation entry: ${key}`);
  return entry;
}

export function resolveDogTraderAsset(
  action: DogTraderAction,
  direction: AnimationDirection,
): {
  readonly entry: AnimationManifestEntry;
  readonly flipX: boolean;
  readonly eventSocket?: Point;
} {
  const mirror = MIRROR_OF[direction as keyof typeof MIRROR_OF];
  return {
    entry: dogTraderEntry(action, mirror ?? direction),
    flipX: mirror !== undefined,
    eventSocket: action === 'attack' ? ATTACK_SOCKETS[direction] : undefined,
  };
}
