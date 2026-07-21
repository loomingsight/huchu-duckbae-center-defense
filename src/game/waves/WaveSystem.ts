import { reachedDuration } from '../constants';
import type { RandomSource } from '../core/SeededRng';
import type { EnemyVariant } from '../types/GameTypes';
import { PathDeck } from './PathDeck';
import type {
  BossKind,
  EnemySpawnRequest,
  ScheduledSpawn,
  WaveDefinition,
} from './WaveTypes';

type RegularKind = 'poopGuardian' | 'offLeashGuardian';
const BOSS_PATH_ID: ScheduledSpawn['pathId'] = 'P3';

interface MaterializedWave {
  readonly spawns: readonly ScheduledSpawn[];
  readonly variantCursor: Record<RegularKind, number>;
  readonly seededBossVariants: Map<number, EnemyVariant>;
}

const isBoss = (spawn: ScheduledSpawn): boolean => (
  spawn.kind === 'dogTrader' || spawn.kind === 'illegalBreeder'
);

export class WaveSystem {
  private elapsedMs = 0;
  private cursor = 0;
  private currentWaveIndex = 0;
  private sequence = 0;
  private started = false;
  private pendingNextWave: number | null = null;
  private scheduledSpawns: readonly ScheduledSpawn[] = [];
  private readonly materializedByWave = new Map<number, readonly ScheduledSpawn[]>();
  private seededBossVariants = new Map<number, EnemyVariant>();
  private variantCursor: Record<RegularKind, number> = {
    poopGuardian: 0,
    offLeashGuardian: 0,
  };

  constructor(
    private readonly definitions: readonly WaveDefinition[],
    private readonly rng: RandomSource,
    private readonly enemyCap = 60,
  ) {
    if (!Number.isSafeInteger(enemyCap) || enemyCap <= 0) {
      throw new RangeError('enemyCap must be a positive safe integer');
    }
  }

  start(waveNumber: number): void {
    if (!Number.isSafeInteger(waveNumber)) {
      throw new RangeError(`Unknown wave ${String(waveNumber)}`);
    }
    const index = this.definitions.findIndex(({ wave }) => wave === waveNumber);
    const definition = this.definitions.at(index);
    if (index < 0 || definition === undefined) {
      throw new RangeError(`Unknown wave ${waveNumber}`);
    }

    const scheduledSpawns = this.scheduleFor(definition);
    this.scheduledSpawns = scheduledSpawns;
    this.currentWaveIndex = index;
    this.elapsedMs = 0;
    this.cursor = 0;
    this.started = true;
  }

  previewBoss(waveNumber: number): EnemySpawnRequest {
    if (!Number.isSafeInteger(waveNumber)) {
      throw new RangeError(`Wave ${String(waveNumber)} has no boss`);
    }
    const definition = this.definitions.find(({ wave }) => wave === waveNumber);
    if (definition === undefined || !definition.groups.some(([, , , boss]) => boss !== undefined)) {
      throw new RangeError(`Wave ${waveNumber} has no boss`);
    }
    const spawns = this.scheduleFor(definition);
    const scheduled = spawns.find(isBoss);
    if (scheduled === undefined) throw new RangeError(`Wave ${waveNumber} has no boss`);
    return { ...scheduled, spawnSequence: 0 };
  }

  step(stepMs: number, activeEnemies: number): readonly EnemySpawnRequest[] {
    if (!this.started) throw new Error('WaveSystem.start must be called first');
    if (!Number.isFinite(stepMs) || stepMs < 0) {
      throw new RangeError('stepMs must be finite and non-negative');
    }
    if (
      !Number.isSafeInteger(activeEnemies)
      || activeEnemies < 0
      || activeEnemies > this.enemyCap
    ) {
      throw new RangeError(`activeEnemies must be an integer from 0 to ${this.enemyCap}`);
    }

    this.elapsedMs += stepMs;
    const requests: EnemySpawnRequest[] = [];
    while (this.cursor < this.scheduledSpawns.length) {
      const scheduled = this.scheduledSpawns.at(this.cursor)!;
      const releaseBossWithoutIdleDelay = isBoss(scheduled)
        && activeEnemies === 0
        && requests.length === 0;
      if (
        (!reachedDuration(this.elapsedMs, scheduled.atMs) && !releaseBossWithoutIdleDelay)
        || activeEnemies + requests.length >= this.enemyCap
      ) {
        break;
      }
      requests.push({ ...scheduled, spawnSequence: this.sequence });
      this.sequence += 1;
      this.cursor += 1;
    }
    return requests;
  }

  get current(): number {
    return this.currentDefinition().wave;
  }

  get pendingCount(): number {
    return this.scheduledSpawns.length - this.cursor;
  }

  get elapsed(): number {
    return this.elapsedMs;
  }

  setPendingNext(waveNumber: number): void {
    if (
      !Number.isSafeInteger(waveNumber)
      || waveNumber !== this.current + 1
      || !this.definitions.some(({ wave }) => wave === waveNumber)
    ) {
      throw new RangeError(`Invalid next wave ${String(waveNumber)} after ${this.current}`);
    }
    if (this.pendingNextWave !== null && this.pendingNextWave !== waveNumber) {
      throw new Error(`Wave ${this.pendingNextWave} is already pending`);
    }
    this.pendingNextWave = waveNumber;
  }

  get pendingNext(): number | null {
    return this.pendingNextWave;
  }

  startPendingNext(): number {
    if (this.pendingNextWave === null) throw new Error('No next wave is pending');
    const waveNumber = this.pendingNextWave;
    this.start(waveNumber);
    this.pendingNextWave = null;
    return waveNumber;
  }

  private scheduleFor(definition: WaveDefinition): readonly ScheduledSpawn[] {
    const cached = this.materializedByWave.get(definition.wave);
    if (cached !== undefined) return cached;

    const materialized = this.materialize(definition);
    this.variantCursor = materialized.variantCursor;
    this.seededBossVariants = materialized.seededBossVariants;
    this.materializedByWave.set(definition.wave, materialized.spawns);
    return materialized.spawns;
  }

  private materialize(definition: WaveDefinition): MaterializedWave {
    const deck = new PathDeck(definition.pathIds, this.rng);
    const spawns: ScheduledSpawn[] = [];
    const variantCursor = { ...this.variantCursor };
    const seededBossVariants = new Map(this.seededBossVariants);

    for (const [atSeconds, poopCount, offLeashCount, bossKind] of definition.groups) {
      const eventCount = poopCount + offLeashCount + (bossKind === undefined ? 0 : 1);
      const paths = deck.drawMany(eventCount);
      let pathIndex = 0;

      for (let count = 0; count < poopCount; count += 1) {
        spawns.push(this.regularSpawn(
          atSeconds,
          paths[pathIndex++]!,
          'poopGuardian',
          variantCursor,
        ));
      }
      for (let count = 0; count < offLeashCount; count += 1) {
        spawns.push(this.regularSpawn(
          atSeconds,
          paths[pathIndex++]!,
          'offLeashGuardian',
          variantCursor,
        ));
      }
      if (bossKind !== undefined) {
        spawns.push(this.bossSpawn(
          atSeconds,
          BOSS_PATH_ID,
          bossKind,
          definition.wave,
          seededBossVariants,
        ));
      }
    }
    return { spawns, variantCursor, seededBossVariants };
  }

  private regularSpawn(
    atSeconds: number,
    pathId: ScheduledSpawn['pathId'],
    kind: RegularKind,
    variantCursor: Record<RegularKind, number>,
  ): ScheduledSpawn {
    const variant: EnemyVariant = variantCursor[kind]++ % 2 === 0 ? 'male' : 'female';
    return { atMs: atSeconds * 1000, pathId, kind, variant };
  }

  private bossSpawn(
    atSeconds: number,
    pathId: ScheduledSpawn['pathId'],
    kind: BossKind,
    waveNumber: number,
    seededBossVariants: Map<number, EnemyVariant>,
  ): ScheduledSpawn {
    return {
      atMs: atSeconds * 1000,
      pathId,
      kind,
      variant: kind === 'dogTrader'
        ? 'male'
        : this.ensureSeededBossVariant(waveNumber, seededBossVariants),
    };
  }

  private currentDefinition(): WaveDefinition {
    return this.definitions.at(this.currentWaveIndex)!;
  }

  private ensureSeededBossVariant(
    waveNumber: number,
    seededBossVariants: Map<number, EnemyVariant>,
  ): EnemyVariant {
    const cached = seededBossVariants.get(waveNumber);
    if (cached !== undefined) return cached;
    const random = this.rng.next();
    if (!Number.isFinite(random) || random < 0 || random >= 1) {
      throw new RangeError('RandomSource.next() must return a value in [0, 1)');
    }
    const selected = random < 0.5 ? 'male' : 'female';
    seededBossVariants.set(waveNumber, selected);
    return selected;
  }
}
