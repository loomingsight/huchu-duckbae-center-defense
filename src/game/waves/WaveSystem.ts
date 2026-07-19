import { reachedDuration } from '../constants';
import type { RandomSource } from '../core/SeededRng';
import type {
  EnemySpawnRequest,
  ScheduledSpawn,
  WaveDefinition,
} from './WaveTypes';

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
  private finalBossVariant: 'male' | 'female' = 'male';
  private readonly seededBossVariants = new Map<number, 'male' | 'female'>();

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
    const index = waveNumber - 1;
    const definition = this.definitions.at(index);
    if (definition === undefined || definition.wave !== waveNumber) {
      throw new RangeError(`Unknown wave ${waveNumber}`);
    }

    let finalBossVariant: 'male' | 'female' = 'male';
    if (definition.spawns.some((spawn) => spawn.variant === 'seeded')) {
      finalBossVariant = this.ensureSeededBossVariant(waveNumber);
    }

    this.currentWaveIndex = index;
    this.elapsedMs = 0;
    this.cursor = 0;
    this.finalBossVariant = finalBossVariant;
    this.started = true;
  }

  previewBoss(waveNumber: number): EnemySpawnRequest {
    if (!Number.isSafeInteger(waveNumber)) {
      throw new RangeError(`Wave ${String(waveNumber)} has no boss`);
    }
    const definition = this.definitions.at(waveNumber - 1);
    const scheduled = definition?.spawns.find(isBoss);
    if (definition?.wave !== waveNumber || scheduled === undefined) {
      throw new RangeError(`Wave ${waveNumber} has no boss`);
    }
    const variant = scheduled.variant === 'seeded'
      ? this.ensureSeededBossVariant(waveNumber)
      : scheduled.variant;
    return { ...scheduled, variant, spawnSequence: 0 };
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
    const spawns = this.currentDefinition().spawns;
    while (this.cursor < spawns.length) {
      const scheduled = spawns.at(this.cursor)!;
      if (
        !reachedDuration(this.elapsedMs, scheduled.atMs)
        || activeEnemies + requests.length >= this.enemyCap
      ) {
        break;
      }
      const variant = scheduled.variant === 'seeded'
        ? this.finalBossVariant
        : scheduled.variant;
      requests.push({ ...scheduled, variant, spawnSequence: this.sequence });
      this.sequence += 1;
      this.cursor += 1;
    }
    return requests;
  }

  get current(): number {
    return this.currentDefinition().wave;
  }

  get pendingCount(): number {
    return this.currentDefinition().spawns.length - this.cursor;
  }

  get elapsed(): number {
    return this.elapsedMs;
  }

  setPendingNext(waveNumber: number): void {
    if (
      !Number.isSafeInteger(waveNumber)
      || waveNumber !== this.current + 1
      || waveNumber > this.definitions.length
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
    this.pendingNextWave = null;
    this.start(waveNumber);
    return waveNumber;
  }

  private currentDefinition(): WaveDefinition {
    return this.definitions.at(this.currentWaveIndex)!;
  }

  private ensureSeededBossVariant(waveNumber: number): 'male' | 'female' {
    const cached = this.seededBossVariants.get(waveNumber);
    if (cached !== undefined) return cached;
    const selected = this.rng.next() < 0.5 ? 'male' : 'female';
    this.seededBossVariants.set(waveNumber, selected);
    return selected;
  }
}
