import manifestJson from './character-animations.json';

export type AnimationEventKind = 'directHit' | 'projectileRelease';
export type AnimationDirection =
  | 'north'
  | 'northWest'
  | 'west'
  | 'southWest'
  | 'south'
  | 'northEast'
  | 'east'
  | 'southEast';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface AnimationManifestBase {
  readonly key: string;
  readonly action: 'walk' | 'attack' | 'tailSwipe' | 'tailOverlay' | 'truckRoll';
  readonly frameCount: 4 | 6 | 8;
  readonly frameWidth: 256;
  readonly frameHeight: 256;
  readonly opaqueHeightPx: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly eventFrame?: number;
  readonly eventKind?: AnimationEventKind;
  readonly direction?: AnimationDirection;
  readonly eventSocket?: Point;
}

export type SourceAnimationManifestEntry = AnimationManifestBase & {
  readonly source: string;
  readonly url: string;
  readonly mirrorOf?: never;
};

export type MirrorAnimationManifestEntry = AnimationManifestBase & {
  readonly mirrorOf: string;
  readonly source?: never;
  readonly url?: never;
};

export type AnimationManifestEntry =
  | SourceAnimationManifestEntry
  | MirrorAnimationManifestEntry;

const frameCounts = new Set([4, 6, 8]);
const actions = new Set(['walk', 'attack', 'tailSwipe', 'tailOverlay', 'truckRoll']);
const eventKinds = new Set(['directHit', 'projectileRelease']);
const hasOwn = (entry: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(entry, key);

export function isSourceAnimationEntry(
  entry: AnimationManifestEntry,
): entry is SourceAnimationManifestEntry {
  const candidate = entry as unknown as Record<string, unknown>;
  return typeof candidate.source === 'string' &&
    typeof candidate.url === 'string' &&
    !hasOwn(candidate, 'mirrorOf');
}

export function validateAnimationEntry(entry: AnimationManifestEntry): void {
  if (entry.key.length === 0) throw new Error('key must not be empty');
  if (!actions.has(entry.action)) throw new Error('unknown animation action');
  if (!frameCounts.has(entry.frameCount)) throw new Error('frameCount must be 4, 6, or 8');
  if (entry.frameWidth !== 256 || entry.frameHeight !== 256) {
    throw new Error('animation frames must be 256x256');
  }
  if (!Number.isFinite(entry.opaqueHeightPx) || entry.opaqueHeightPx <= 0) {
    throw new Error('opaqueHeightPx must be positive');
  }
  if (!Number.isFinite(entry.fps) || entry.fps <= 0) throw new Error('fps must be positive');
  if (
    entry.eventFrame !== undefined &&
    (!Number.isInteger(entry.eventFrame) || entry.eventFrame < 0 || entry.eventFrame >= entry.frameCount)
  ) {
    throw new Error('eventFrame must be inside the sheet');
  }
  if ((entry.eventFrame === undefined) !== (entry.eventKind === undefined)) {
    throw new Error('eventFrame and eventKind must be declared together');
  }
  if (entry.eventKind !== undefined && !eventKinds.has(entry.eventKind)) {
    throw new Error('unknown animation event kind');
  }
  const candidate = entry as unknown as Record<string, unknown>;
  const hasSource = hasOwn(candidate, 'source');
  const hasUrl = hasOwn(candidate, 'url');
  const hasMirror = hasOwn(candidate, 'mirrorOf');
  if (hasMirror && (hasSource || hasUrl)) {
    throw new Error('exactly one of source/url or mirrorOf is required');
  }
  if (hasMirror) {
    if (typeof candidate.mirrorOf !== 'string' || candidate.mirrorOf.length === 0) {
      throw new Error('mirror animations require mirrorOf');
    }
  } else if (
    typeof candidate.source !== 'string' ||
    candidate.source.length === 0 ||
    typeof candidate.url !== 'string' ||
    candidate.url.length === 0
  ) {
    throw new Error('source animations require source and url');
  }
  if (!isSourceAnimationEntry(entry) && !hasMirror) {
    throw new Error('mirror animations require mirrorOf');
  }
}

const parsedEntries = manifestJson as AnimationManifestEntry[];
for (const entry of parsedEntries) validateAnimationEntry(entry);

export const animationEntries: readonly AnimationManifestEntry[] = Object.freeze(parsedEntries);

const entriesByKey = new Map(animationEntries.map((entry) => [entry.key, entry]));
if (entriesByKey.size !== animationEntries.length) throw new Error('animation keys must be unique');

export function animationEntry(key: string): AnimationManifestEntry {
  const entry = entriesByKey.get(key);
  if (entry === undefined) throw new Error(`Unknown animation entry: ${key}`);
  return entry;
}

export function animationFrameAt(entry: AnimationManifestEntry, elapsedMs: number): number {
  const frame = Math.floor((elapsedMs + 1e-7) / (1000 / entry.fps));
  return entry.loop ? frame % entry.frameCount : Math.min(entry.frameCount - 1, frame);
}

export function runtimeTextureKeys(entries: readonly AnimationManifestEntry[]): string[] {
  return entries.filter(isSourceAnimationEntry).map(({ key }) => key);
}

export function resolveAnimationEntry(
  entry: AnimationManifestEntry,
  entries: readonly AnimationManifestEntry[] = animationEntries,
): { readonly source: SourceAnimationManifestEntry; readonly flipX: boolean } {
  let current = entry;
  let flipX = false;
  const visited = new Set<string>();
  const byKey = new Map(entries.map((candidate) => [candidate.key, candidate]));
  while (!isSourceAnimationEntry(current)) {
    if (visited.has(current.key)) throw new Error(`Animation mirror cycle at ${current.key}`);
    visited.add(current.key);
    const source = byKey.get(current.mirrorOf);
    if (source === undefined) throw new Error(`Unknown mirror source: ${current.mirrorOf}`);
    current = source;
    flipX = !flipX;
  }
  return { source: current, flipX };
}
