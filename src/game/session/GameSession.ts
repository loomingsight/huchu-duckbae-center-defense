import {
  FIXED_STEP_MS,
  simulationMsFromTicks,
  TIME_EPSILON_MS,
} from '../constants';
import type { GameMode } from '../core/GameMode';
import { GameStateMachine } from '../core/GameStateMachine';
import { SeededRng } from '../core/SeededRng';
import { BALANCE } from '../data/balance';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import type { ScenarioEnemySeed } from '../debug/ScenarioSessionPort';
import { EnemySystem } from '../enemies/EnemySystem';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import { WaveSystem } from '../waves/WaveSystem';
import type { RunSnapshot } from './RunSnapshot';

const INITIAL_SKILLS = {
  bark: 1,
  scold: 0,
  aquaBeam: 0,
  deokbaeHowl: 0,
  safetyReport: 0,
} as const satisfies Readonly<Record<SkillId, SkillLevel>>;

export class GameSession {
  private readonly stateMachine = new GameStateMachine('playing');
  private rng: SeededRng;
  private waves: WaveSystem;
  private readonly enemies = EnemySystem.createDefault();
  private simulationTicks = 0;
  private readonly eventBuffer: GameEvent[] = [];

  private constructor(seed: number) {
    assertSeed(seed);
    this.rng = new SeededRng(seed);
    this.waves = new WaveSystem(WAVE_DEFINITIONS, this.rng, BALANCE.caps.enemies);
    this.waves.start(1);
  }

  static create(input: { readonly seed: number }): GameSession {
    return new GameSession(input.seed);
  }

  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[] {
    assertFixedStep(stepMs);
    if (!this.stateMachine.canStepWorld()) return this.flushEvents();

    void player;
    this.simulationTicks += 1;
    const requests = this.waves.step(FIXED_STEP_MS, this.enemies.activeCount);
    for (const request of requests) {
      const enemyId = this.enemies.spawn(request);
      this.eventBuffer.push(
        { type: 'enemySpawnRequested', request },
        { type: 'enemySpawned', enemyId, request },
      );
    }
    this.enemies.step(FIXED_STEP_MS);
    return this.flushEvents();
  }

  snapshot(): RunSnapshot {
    return {
      mode: this.stateMachine.current(),
      simulationMs: simulationMsFromTicks(this.simulationTicks),
      wave: this.waves.current,
      pendingSpawns: this.waves.pendingCount,
      activeEnemyCount: this.enemies.activeCount,
      activeProjectileCount: 0,
      shelterHp: BALANCE.shelter.maxHp,
      snacks: 0,
      enemies: this.enemies.snapshots(),
      skills: { ...INITIAL_SKILLS },
    };
  }

  currentMode(): GameMode {
    return this.stateMachine.current();
  }

  requestVisibilityPause(): void {
    this.stateMachine.hide();
  }

  requestVisibilityResume(): void {
    this.stateMachine.resume();
  }

  forceModeForTest(mode: GameMode): void {
    this.stateMachine.transition(mode);
  }

  modeStateForControllers(): GameStateMachine {
    return this.stateMachine;
  }

  spawnEnemyForScenario(seed: ScenarioEnemySeed): number {
    return this.enemies.spawnForScenario(seed).enemyId;
  }

  damageEnemy(enemyId: number, amount: number): readonly GameEvent[] {
    return this.enemies.damage(enemyId, amount);
  }

  removeEnemyWithoutReward(enemyId: number): void {
    this.enemies.removeWithoutReward(enemyId);
  }

  reset(seed: number): void {
    assertSeed(seed);
    const rng = new SeededRng(seed);
    const waves = new WaveSystem(WAVE_DEFINITIONS, rng, BALANCE.caps.enemies);
    waves.start(1);

    this.stateMachine.reset('playing');
    this.rng = rng;
    this.waves = waves;
    this.enemies.clear();
    this.eventBuffer.length = 0;
    this.simulationTicks = 0;
  }

  private flushEvents(): readonly GameEvent[] {
    const events = this.eventBuffer.splice(0);
    return events;
  }
}

function assertSeed(seed: number): void {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('GameSession seed must be a safe integer');
  }
}

function assertFixedStep(stepMs: number): void {
  if (!Number.isFinite(stepMs) || Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) {
    throw new RangeError('GameSession requires one fixed step');
  }
}
