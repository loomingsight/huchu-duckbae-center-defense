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
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
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
  private simulationTicks = 0;
  private readonly spawnMarkers: EnemySpawnRequest[] = [];

  private constructor(seed: number) {
    assertSeed(seed);
    this.rng = new SeededRng(seed);
    this.waves = new WaveSystem(WAVE_DEFINITIONS, this.rng);
    this.waves.start(1);
  }

  static create(input: { readonly seed: number }): GameSession {
    return new GameSession(input.seed);
  }

  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[] {
    assertFixedStep(stepMs);
    if (!this.stateMachine.canStepWorld()) return [];

    void player;
    this.simulationTicks += 1;
    const requests = this.waves.step(FIXED_STEP_MS, this.spawnMarkers.length);
    this.spawnMarkers.push(...requests);
    return requests.map((request) => ({
      type: 'enemySpawnRequested' as const,
      request,
    }));
  }

  snapshot(): RunSnapshot {
    return {
      mode: this.stateMachine.current(),
      simulationMs: simulationMsFromTicks(this.simulationTicks),
      wave: this.waves.current,
      pendingSpawns: this.waves.pendingCount,
      activeEnemyCount: this.spawnMarkers.length,
      activeProjectileCount: 0,
      shelterHp: BALANCE.shelter.maxHp,
      snacks: 0,
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

  reset(seed: number): void {
    assertSeed(seed);
    const rng = new SeededRng(seed);
    const waves = new WaveSystem(WAVE_DEFINITIONS, rng);
    waves.start(1);

    this.stateMachine.reset('playing');
    this.rng = rng;
    this.waves = waves;
    this.spawnMarkers.length = 0;
    this.simulationTicks = 0;
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
