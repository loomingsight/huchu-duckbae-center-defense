import { BALANCE } from '../data/balance';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import { GameSession, type GameSessionDependencies } from '../session/GameSession';
import type { ProjectileLogicalWorkloadCounters } from '../presentation/PresentationWorkloadTelemetry';
import { WaveSystem } from '../waves/WaveSystem';
import type { WaveDefinition } from '../waves/WaveTypes';
import { E2eEnemySystem } from './E2eEnemySystem';
import type { ScenarioEnemySeed, ScenarioSessionPort, ScenarioWaveSchedule } from './ScenarioSessionPort';

const EMPTY_WAVE_DEFINITIONS: readonly WaveDefinition[] = WAVE_DEFINITIONS.map(({ wave, pathIds }) => ({
  wave,
  pathIds,
  groups: [],
}));
const HELD_WAVE_DEFINITIONS: readonly WaveDefinition[] = WAVE_DEFINITIONS.map(({ wave }) => ({
  wave,
  pathIds: ['P6'],
  groups: [[86_400, 1, 0]],
}));

export class E2eGameSession extends GameSession {
  private constructor(seed: number, dependencies: GameSessionDependencies) {
    super(seed, E2eEnemySystem.createDefault(), dependencies);
  }

  static override create(
    input: { readonly seed: number },
    dependencies: GameSessionDependencies = {},
  ): E2eGameSession {
    return new E2eGameSession(input.seed, dependencies);
  }

  scenarioAdapter(): ScenarioSessionPort {
    const useWaveSchedule = (wave: number, schedule: ScenarioWaveSchedule): void => {
      const definitions = schedule === 'real'
        ? WAVE_DEFINITIONS
        : schedule === 'exhausted'
          ? EMPTY_WAVE_DEFINITIONS
          : HELD_WAVE_DEFINITIONS;
      this.waves = new WaveSystem(definitions, this.rng, BALANCE.caps.enemies);
      this.waves.start(wave);
      this.waveStartEventPending = true;
    };
    return {
      spawnEnemy: (seed: ScenarioEnemySeed) => (this.enemies as E2eEnemySystem).spawnSeed(seed).enemyId,
      removeEnemyWithoutReward: (enemyId) => {
        this.enemies.removeWithoutReward(enemyId);
        for (const attack of Object.values(this.attacks)) attack.remove(enemyId);
      },
      suppressWaveSpawns: () => useWaveSchedule(1, 'exhausted'),
      useWaveSchedule,
      grantSnacks: (amount) => this.progression.addSnacks(amount),
      spawnProjectile: (seed) => {
        this.projectiles.spawn(seed);
        this.nextProjectileId = Math.max(this.nextProjectileId, seed.id + 1);
      },
      maintainStressProjectiles: () => {
        let accepted = 0;
        while (this.projectiles.activeCount < BALANCE.caps.projectiles) {
          const id = this.nextProjectileId++;
          const events = this.projectiles.spawn({
            id,
            castId: `e2e-projectile:${id}`,
            enemyId: id,
            kind: 'poopGuardian',
            projectileKind: 'poop',
            from: projectileOrigin(id),
            to: { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
            speed: 1,
            damage: 0,
            lifeMs: 60_000,
          });
          if (events.some(({ type }) => type === 'projectileSpawned')) {
            accepted += 1;
            continue;
          }
          throw new Error('Projectile workload refill was rejected below capacity');
        }
        return accepted;
      },
      prepareTerminalTie: () => {
        useWaveSchedule(5, 'exhausted');
        this.shelter.damage(840);
        const enemyId = (this.enemies as E2eEnemySystem).spawnSeed({
          kind: 'poopGuardian',
          variant: 'male',
          pathId: 'P6',
          placement: { kind: 'worldPoint', x: 270, y: 625 },
          currentHp: 18,
          maxHp: 18,
          heldForDebug: true,
        }).enemyId;
        this.projectiles.spawn({
          id: 0,
          castId: 'e2e-terminal-tie:projectile',
          enemyId,
          kind: 'illegalBreeder',
          projectileKind: 'electric',
          from: { x: 270, y: 377 },
          to: { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
          speed: 260,
          damage: 160,
          lifeMs: 1200,
        });
        this.nextProjectileId = 1;
      },
      resetSimulationClock: () => { this.simulationTicks = 0; },
      projectilePoolTelemetry: () => this.projectiles.poolSnapshot(),
    };
  }

  scenarioPortForE2e(): ScenarioSessionPort {
    return this.scenarioAdapter();
  }

  projectileWorkloadCounters(): Readonly<ProjectileLogicalWorkloadCounters> {
    return this.projectiles.workloadCounters();
  }
}

function projectileOrigin(id: number): { readonly x: number; readonly y: number } {
  return { x: 24 + id % 20 * 26, y: 24 + Math.floor(id % 80 / 20) * 72 };
}
