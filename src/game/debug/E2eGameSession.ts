import { BALANCE } from '../data/balance';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import type { GameEvent } from '../events/GameEvents';
import { ShelterSystem } from '../shelter/ShelterSystem';
import { GameSession } from '../session/GameSession';
import { WaveSystem } from '../waves/WaveSystem';
import { E2eEnemySystem } from './E2eEnemySystem';
import type {
  ScenarioEnemySeed,
  ScenarioSessionPort,
  ScenarioWaveSchedule,
} from './ScenarioSessionPort';

const EMPTY_WAVE_DEFINITIONS = WAVE_DEFINITIONS.map(({ wave }) => ({ wave, spawns: [] }));

export class E2eGameSession extends GameSession {
  private constructor(seed: number) {
    super(seed, E2eEnemySystem.createDefault());
  }

  static override create(input: { readonly seed: number }): E2eGameSession {
    return new E2eGameSession(input.seed);
  }

  scenarioAdapter(): ScenarioSessionPort {
    const useWaveSchedule = (wave: number, schedule: ScenarioWaveSchedule): void => {
      const definitions = schedule === 'real'
        ? WAVE_DEFINITIONS
        : schedule === 'exhausted'
          ? EMPTY_WAVE_DEFINITIONS
          : WAVE_DEFINITIONS.map(({ wave: waveNumber }) => ({
            wave: waveNumber,
            spawns: [{
              atMs: 86_400_000,
              pathId: 'P6' as const,
              kind: 'poopGuardian' as const,
              variant: 'male' as const,
            }],
          }));
      this.waves = new WaveSystem(definitions, this.rng, BALANCE.caps.enemies);
      this.waves.start(wave);
      this.waveStartEventPending = true;
    };
    return {
      spawnEnemy: (seed: ScenarioEnemySeed) => {
        const enemies = this.enemies as E2eEnemySystem;
        const spawned = enemies.spawnSeed(seed);
        if (seed.stunnedMs !== undefined && seed.stunnedMs > 0) {
          const snapshot = enemies.snapshots().find(({ id }) => id === spawned.enemyId)!;
          this.attacks[seed.kind].stun(spawned.enemyId, seed.stunnedMs, snapshot.pathProgress);
        }
        return spawned.enemyId;
      },
      damageEnemy: (enemyId, amount) => {
        const events = this.enemies.damage(enemyId, amount);
        this.accumulateSnacks(events);
        return events;
      },
      stunEnemy: (enemyId, durationMs) => {
        const enemy = this.enemies.snapshots().find(({ id }) => id === enemyId);
        this.enemies.stun(enemyId, durationMs);
        if (enemy !== undefined && durationMs > 0) {
          this.attacks[enemy.kind].stun(enemyId, durationMs, enemy.pathProgress);
        }
      },
      knockBackEnemy: (enemyId, distance) => {
        const enemy = this.enemies.snapshots().find(({ id }) => id === enemyId);
        this.enemies.knockBack(enemyId, distance);
        if (enemy !== undefined && distance > 0) this.attacks[enemy.kind].interrupt(enemyId);
      },
      removeEnemyWithoutReward: (enemyId) => {
        this.enemies.removeWithoutReward(enemyId);
        for (const attack of Object.values(this.attacks)) attack.remove(enemyId);
      },
      suppressWaveSpawns: () => useWaveSchedule(1, 'exhausted'),
      useWaveSchedule,
      damageShelter: (damage) => {
        this.eventBuffer.push(...this.shelter.damage(damage));
        this.resolvePostStepOutcome();
        return this.flushEvents();
      },
      replaceShelter: (currentHp, maxHp = currentHp) => {
        this.shelter = new ShelterSystem(maxHp, currentHp);
      },
      spawnProjectile: (seed) => {
        const events = this.projectiles.spawn(seed);
        this.nextProjectileId = Math.max(this.nextProjectileId, seed.id + 1);
        return events;
      },
      maintainStressProjectiles: () => {
        const events: GameEvent[] = [];
        while (this.projectiles.activeCount < BALANCE.caps.projectiles) {
          const id = this.nextProjectileId;
          this.nextProjectileId += 1;
          events.push(...this.projectiles.spawn({
            id,
            kind: 'poop',
            from: projectileOrigin(id),
            to: { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
            speed: 1,
            damage: 0,
            lifeMs: 60_000,
          }));
        }
        return events;
      },
      resetSimulationClock: () => {
        this.simulationTicks = 0;
      },
      projectilePoolTelemetry: () => this.projectiles.poolSnapshot(),
    };
  }

  scenarioPortForE2e(): ScenarioSessionPort {
    return this.scenarioAdapter();
  }
}

function projectileOrigin(id: number): { readonly x: number; readonly y: number } {
  return {
    x: 24 + id % 20 * 26,
    y: 24 + Math.floor(id % 80 / 20) * 72,
  };
}
