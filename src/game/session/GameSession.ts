import {
  FIXED_STEP_MS,
  simulationMsFromTicks,
  TIME_EPSILON_MS,
} from '../constants';
import {
  BarkSystem,
  type BarkEvent,
  type BarkSnapshot,
} from '../combat/BarkSystem';
import { CombatSystem } from '../combat/CombatSystem';
import type { DamageCommand } from '../combat/CombatTypes';
import { EnemyAttackSystem } from '../combat/EnemyAttackSystem';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { selectThreatTarget } from '../combat/TargetingSystem';
import type { GameMode } from '../core/GameMode';
import { GameStateMachine } from '../core/GameStateMachine';
import { SeededRng } from '../core/SeededRng';
import { BALANCE } from '../data/balance';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import type {
  ScenarioEnemySeed,
  ScenarioSessionPort,
  ScenarioWaveSchedule,
} from '../debug/ScenarioSessionPort';
import { EnemySystem, type EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import { ProgressionSystem } from '../progression/ProgressionSystem';
import { pickSkillCards } from '../progression/SkillCardPicker';
import { ShelterSystem } from '../shelter/ShelterSystem';
import {
  SkillSystem,
  type AutoSkillId,
  type SkillSnapshot,
} from '../skills/SkillSystem';
import type { SkillCard, SkillLevels } from '../skills/SkillTypes';
import type { EnemyKind, SkillId } from '../types/GameTypes';
import { UiTransitionClock } from '../ui/UiTransitionClock';
import type { Point } from '../world/Geometry';
import { WaveSystem } from '../waves/WaveSystem';
import type { RunSnapshot } from './RunSnapshot';
import { RunOutcomeResolver } from './RunOutcomeResolver';

const INITIAL_SKILLS: SkillLevels = {
  bark: 1,
  scold: 0,
  aquaBeam: 0,
  deokbaeHowl: 0,
  safetyReport: 0,
};

const BARK_RANGE = 150;
const SCENARIO_WAVE_DEFINITIONS = WAVE_DEFINITIONS.map(({ wave }) => ({
  wave,
  spawns: [],
}));

type CountdownTransition = 'resumeCombat' | 'nextWave' | 'lostResult';

interface ActiveBarkAttack {
  readonly attackId: string;
  readonly targetId: number;
  readonly targetPosition: Point;
}

export class GameSession {
  private readonly stateMachine = new GameStateMachine('playing');
  private rng: SeededRng;
  private waves: WaveSystem;
  private readonly enemies = EnemySystem.createDefault();
  private readonly combat = new CombatSystem(this.enemies);
  private readonly bark = new BarkSystem(INITIAL_SKILLS.bark);
  private readonly attacks = createAttackSystems();
  private readonly projectiles = new ProjectileSystem(
    BALANCE.caps.projectiles,
    BALANCE.shelter.hitRadius,
  );
  private readonly shelter = new ShelterSystem(BALANCE.shelter.maxHp);
  private readonly skills = new SkillSystem(INITIAL_SKILLS);
  private readonly progression = new ProgressionSystem(
    BALANCE.snackThresholds,
    BALANCE.pendingSkillCombatDelayMs,
  );
  private readonly uiClock = new UiTransitionClock(0);
  private readonly outcomes = new RunOutcomeResolver();
  private simulationTicks = 0;
  private cards: readonly SkillCard[] = [];
  private uiTransition: CountdownTransition | null = null;
  private nextBarkAttackSequence = 1;
  private nextProjectileId = 0;
  private activeBarkAttack: ActiveBarkAttack | null = null;
  private waveStartEventPending = true;
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
    assertPlayer(player);
    const entryMode = this.stateMachine.current();
    if (entryMode === 'countdown' || entryMode === 'lost') {
      if (
        this.uiTransition !== null
        && this.uiClock.step(stepMs, entryMode) === 'completed'
      ) {
        const completed = this.uiTransition;
        this.uiTransition = null;
        if (completed === 'lostResult') {
          this.eventBuffer.push({ type: 'resultReady', outcome: 'lost' });
          return this.flushEvents();
        }
        if (completed === 'nextWave') {
          this.eventBuffer.push({
            type: 'waveStarted',
            wave: this.waves.startPendingNext(),
          });
        }
        this.stateMachine.transition('playing');
        this.eventBuffer.push({ type: 'modeChanged', mode: 'playing' });
      } else if (entryMode === 'countdown' && this.uiTransition !== null) {
        this.eventBuffer.push({
          type: 'waveCountdownChanged',
          remainingMs: this.uiClock.remainingMs,
        });
      }
      return this.flushEvents();
    }
    if (!this.stateMachine.canStepWorld()) return this.flushEvents();

    if (this.waveStartEventPending) {
      this.waveStartEventPending = false;
      this.eventBuffer.push({ type: 'waveStarted', wave: this.waves.current });
    }
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
    const combatEnemyCount = this.enemies.activeCount;
    const shelterDamage: number[] = [];
    this.stepAutoSkills(player);
    this.stepEnemyAttacks(FIXED_STEP_MS, shelterDamage);
    this.stepProjectiles(FIXED_STEP_MS, shelterDamage);
    this.stepBark(player);
    for (const amount of shelterDamage) {
      this.eventBuffer.push(...this.shelter.damage(amount));
    }
    this.progression.step(FIXED_STEP_MS, {
      mode: 'playing',
      activeEnemies: combatEnemyCount,
    });
    this.resolvePostStepOutcome();
    return this.flushEvents();
  }

  snapshot(): RunSnapshot {
    const skillState = this.skillStateSnapshot();
    return {
      mode: this.stateMachine.current(),
      simulationMs: simulationMsFromTicks(this.simulationTicks),
      wave: this.waves.current,
      pendingSpawns: this.waves.pendingCount,
      activeEnemyCount: this.enemies.activeCount,
      activeProjectileCount: this.projectiles.activeCount,
      shelterHp: this.shelter.currentHp,
      snacks: this.progression.snapshot().snacks,
      enemies: this.enemies.snapshots(),
      projectiles: this.projectiles.snapshots(),
      skills: skillState.levels,
      skillStates: skillState.cooldowns,
      barkState: this.bark.snapshot(),
    };
  }

  currentMode(): GameMode {
    return this.stateMachine.current();
  }

  barkSnapshot(): BarkSnapshot {
    return this.bark.snapshot();
  }

  barkCadenceMs(): number {
    return this.bark.cadenceDurationMs();
  }

  currentCards(): readonly SkillCard[] {
    return this.cards.map((card) => ({ ...card }));
  }

  skillCooldownProgress(): Readonly<Record<SkillId, number>> {
    return this.skills.cooldownProgressSnapshot();
  }

  skillStateSnapshot(): {
    readonly levels: SkillLevels;
    readonly learnedOrder: readonly AutoSkillId[];
    readonly cooldowns: Readonly<Record<SkillId, SkillSnapshot>>;
  } {
    return {
      levels: this.skills.levelsSnapshot(),
      learnedOrder: this.skills.learnedOrderSnapshot(),
      cooldowns: {
        bark: this.skills.snapshot('bark'),
        scold: this.skills.snapshot('scold'),
        aquaBeam: this.skills.snapshot('aquaBeam'),
        deokbaeHowl: this.skills.snapshot('deokbaeHowl'),
        safetyReport: this.skills.snapshot('safetyReport'),
      },
    };
  }

  countdownState(): {
    readonly kind: CountdownTransition | null;
    readonly remainingMs: number;
  } {
    return {
      kind: this.uiTransition,
      remainingMs: this.uiTransition === null ? 0 : this.uiClock.remainingMs,
    };
  }

  selectCard(cardId: string): readonly GameEvent[] {
    if (this.stateMachine.current() !== 'skillSelection') {
      throw new Error('Skill card can only be selected during skillSelection');
    }
    const card = this.cards.find((candidate) => candidate.id === cardId);
    if (card === undefined) throw new RangeError(`Unknown skill card ${cardId}`);

    const nextLevel = this.skills.levelUp(card.skillId);
    if (nextLevel !== card.nextLevel) {
      throw new Error(`Skill card ${card.id} does not match canonical level`);
    }
    if (card.skillId === 'bark') {
      this.bark.setLevel(nextLevel);
      this.bark.reset();
      this.activeBarkAttack = null;
    }
    this.progression.resolveSelection();
    this.cards = [];
    this.eventBuffer.push({
      type: 'skillLearned',
      skillId: card.skillId,
      level: card.nextLevel,
    });
    this.beginCountdown(this.waves.pendingNext === null ? 'resumeCombat' : 'nextWave');
    return this.flushEvents();
  }

  requestVisibilityPause(): void {
    const before = this.stateMachine.current();
    this.stateMachine.hide();
    if (this.stateMachine.current() !== before) this.uiClock.pause();
  }

  requestVisibilityResume(): void {
    if (this.stateMachine.current() !== 'visibilityPause') return;
    this.stateMachine.resume();
    this.uiClock.resume();
  }

  forceModeForTest(mode: GameMode): void {
    this.stateMachine.transition(mode);
  }

  modeStateForControllers(): GameStateMachine {
    return this.stateMachine;
  }

  scenarioPortForE2e(): ScenarioSessionPort {
    if (import.meta.env.PROD) throw new Error('Scenario session port is unavailable');
    const useWaveSchedule = (wave: number, schedule: ScenarioWaveSchedule): void => {
      const definitions = schedule === 'real'
        ? WAVE_DEFINITIONS
        : schedule === 'exhausted'
          ? SCENARIO_WAVE_DEFINITIONS
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
        const spawned = this.enemies.spawnForScenario(seed);
        if (seed.stunnedMs !== undefined && seed.stunnedMs > 0) {
          const snapshot = this.enemies.snapshots().find(({ id }) => id === spawned.enemyId)!;
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
      projectilePoolTelemetry: () => this.projectiles.poolSnapshot(),
    };
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
    for (const attack of Object.values(this.attacks)) attack.clear();
    this.projectiles.clear();
    this.shelter.reset();
    this.bark.setLevel(INITIAL_SKILLS.bark);
    this.bark.reset();
    this.eventBuffer.length = 0;
    this.simulationTicks = 0;
    this.progression.reset();
    this.uiClock.restart(0);
    this.outcomes.reset();
    this.skills.reset();
    this.cards = [];
    this.uiTransition = null;
    this.nextBarkAttackSequence = 1;
    this.nextProjectileId = 0;
    this.activeBarkAttack = null;
    this.waveStartEventPending = true;
  }

  private stepEnemyAttacks(stepMs: number, shelterDamage: number[]): void {
    for (const enemy of this.enemies.snapshots()) {
      const attack = this.attacks[enemy.kind];
      const events = attack.step(stepMs, enemy);
      let cancelled = false;
      for (const event of events) {
        this.eventBuffer.push(event);
        if (event.type === 'attackCancelled') {
          cancelled = true;
        } else if (event.type === 'shelterDamageRequested') {
          shelterDamage.push(event.damage);
        } else if (event.type === 'projectileRequested') {
          this.eventBuffer.push(...this.projectiles.spawn({
            id: this.nextProjectileId,
            kind: event.projectileKind,
            from: event.from,
            to: event.to,
            speed: event.speed,
            damage: event.damage,
            lifeMs: event.lifeMs,
          }));
          this.nextProjectileId += 1;
        }
      }
      const attackState = attack.snapshot(enemy.id);
      if (attackState.state === 'windup' || attackState.state === 'holding') {
        this.enemies.setState(
          enemy.id,
          attackState.state,
          attackState.animationElapsedMs,
        );
      } else if (cancelled) {
        this.enemies.setState(enemy.id, 'moving', 0);
      }
    }
  }

  private stepAutoSkills(player: PlayerSnapshot): void {
    const casts = this.skills.step(FIXED_STEP_MS, {
      player: { x: player.x, y: player.y },
      enemies: this.enemies.snapshots(),
    });
    for (const cast of casts) {
      for (const hit of cast.hits) {
        const lifecycleEvents = this.enemies.damage(hit.targetId, hit.damage);
        this.accumulateSnacks(lifecycleEvents);
        this.eventBuffer.push(...lifecycleEvents);
        if (!this.enemies.has(hit.targetId)) continue;

        if (hit.nextPathProgress !== undefined) {
          const enemy = this.requireActiveEnemy(hit.targetId);
          this.enemies.applyPathProgress(hit.targetId, hit.nextPathProgress);
          this.attacks[enemy.kind].interrupt(hit.targetId);
        }
        if (hit.stunMs !== undefined) {
          const enemy = this.requireActiveEnemy(hit.targetId);
          this.enemies.stun(hit.targetId, hit.stunMs);
          const stunnedEnemy = this.requireActiveEnemy(hit.targetId);
          // Enemy movement already consumed this tick; the attack track consumes it below.
          this.attacks[enemy.kind].stun(
            hit.targetId,
            stunnedEnemy.stunnedMs + FIXED_STEP_MS,
            enemy.pathProgress,
          );
        }
      }
      this.eventBuffer.push(cast);
    }
  }

  private requireActiveEnemy(enemyId: number): EnemySnapshot {
    const enemy = this.enemies.snapshots().find(({ id }) => id === enemyId);
    if (enemy === undefined) throw new Error(`Active skill target ${enemyId} disappeared`);
    return enemy;
  }

  private stepProjectiles(stepMs: number, shelterDamage: number[]): void {
    for (const event of this.projectiles.step(stepMs)) {
      this.eventBuffer.push(event);
      if (event.type === 'shelterDamageRequested') shelterDamage.push(event.damage);
    }
  }

  private stepBark(player: PlayerSnapshot): void {
    const enemies = this.enemies.snapshots();
    const enemiesById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
    const target = selectThreatTarget(player, enemies, BARK_RANGE);
    const barkEvents = this.bark.step(
      FIXED_STEP_MS,
      target,
      (enemyId) => this.enemies.has(enemyId),
    );
    const damageCommands: DamageCommand[] = [];

    for (const event of barkEvents) {
      this.handleBarkEvent(event, player, enemiesById, damageCommands);
    }

    const lifecycleEvents = this.combat.applyDamage(damageCommands);
    this.accumulateSnacks(lifecycleEvents);
    this.eventBuffer.push(...lifecycleEvents);
  }

  private handleBarkEvent(
    event: BarkEvent,
    player: PlayerSnapshot,
    enemiesById: ReadonlyMap<number, EnemySnapshot>,
    damageCommands: DamageCommand[],
  ): void {
    if (event.type === 'barkStarted') {
      const target = enemiesById.get(event.targetId);
      if (target === undefined) throw new Error('Bark started without an active target');
      const attackId = `bark:${this.nextBarkAttackSequence}`;
      this.nextBarkAttackSequence += 1;
      this.activeBarkAttack = {
        attackId,
        targetId: event.targetId,
        targetPosition: { ...target.position },
      };
      this.eventBuffer.push({ type: 'barkStarted', attackId, targetId: event.targetId });
      return;
    }

    const attack = this.activeBarkAttack;
    if (attack === null || attack.targetId !== event.targetId) {
      throw new Error('Bark release requires the active locked target');
    }
    if (event.type === 'barkReleased') {
      const targetPosition = enemiesById.get(event.targetId)?.position ?? attack.targetPosition;
      this.eventBuffer.push({
        type: 'barkReleased',
        attackId: attack.attackId,
        targetId: event.targetId,
        origin: { x: player.x, y: player.y },
        target: { ...targetPosition },
      });
      return;
    }

    damageCommands.push({
      attackId: attack.attackId,
      targetId: event.targetId,
      amount: event.amount,
    });
  }

  private accumulateSnacks(events: readonly EnemyLifecycleEvent[]): void {
    for (const event of events) {
      if (event.type === 'enemyDied') {
        for (const attack of Object.values(this.attacks)) attack.remove(event.enemyId);
      } else {
        this.progression.addSnacks(event.amount);
      }
    }
  }

  private flushEvents(): readonly GameEvent[] {
    const events = this.eventBuffer.splice(0);
    return events;
  }

  private openSkillSelection(): void {
    const request = this.progression.takeNextRequest();
    if (request === undefined) throw new Error('Progression request disappeared');
    this.cards = pickSkillCards(this.skills.levelsSnapshot(), this.rng);
    this.stateMachine.transition('skillSelection');
    this.eventBuffer.push(
      { type: 'modeChanged', mode: 'skillSelection' },
      { type: 'skillSelectionOpened', request, cards: this.currentCards() },
    );
  }

  private beginCountdown(kind: Exclude<CountdownTransition, 'lostResult'>): void {
    if (kind === 'nextWave' && this.waves.pendingNext === null) {
      throw new Error('Next-wave countdown has no pending wave');
    }
    this.uiTransition = kind;
    this.uiClock.restart(BALANCE.waveCountdownMs);
    this.stateMachine.transition('countdown');
    this.eventBuffer.push({ type: 'modeChanged', mode: 'countdown' });
    if (kind === 'nextWave') {
      this.eventBuffer.push({
        type: 'waveTransition',
        fromWave: this.waves.current,
        toWave: this.waves.pendingNext!,
        countdownMs: 3000,
      });
    }
    this.eventBuffer.push({
      type: 'waveCountdownChanged',
      remainingMs: this.uiClock.remainingMs,
    });
  }

  private resolvePostStepOutcome(): void {
    const resolution = this.outcomes.resolve({
      shelterHp: this.shelter.currentHp,
      wave: this.waves.current,
      active: this.enemies.activeCount,
      pending: this.waves.pendingCount,
      skillDue: this.progression.canOpen(),
    });
    if (resolution.mode === 'lost' || resolution.mode === 'won') {
      this.finish(resolution.mode);
      return;
    }
    if (resolution.nextWave !== undefined) {
      this.waves.setPendingNext(resolution.nextWave);
    }
    if (resolution.mode === 'skillSelection') {
      this.openSkillSelection();
    } else if (resolution.countdownKind === 'nextWave') {
      this.beginCountdown('nextWave');
    }
  }

  private finish(outcome: 'won' | 'lost'): void {
    if (this.stateMachine.current() === 'won' || this.stateMachine.current() === 'lost') return;
    this.stateMachine.transition(outcome);
    this.eventBuffer.push(
      { type: 'modeChanged', mode: outcome },
      { type: 'runEnded', outcome },
    );
    if (outcome === 'lost') {
      this.uiTransition = 'lostResult';
      this.uiClock.restart(1200);
    } else {
      this.eventBuffer.push({ type: 'resultReady', outcome: 'won' });
    }
  }

}

function createAttackSystems(): Record<EnemyKind, EnemyAttackSystem> {
  const shelter = {
    center: { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
    radius: BALANCE.shelter.hitRadius,
  };
  return Object.fromEntries(
    (Object.keys(BALANCE.enemies) as EnemyKind[]).map((kind) => [
      kind,
      new EnemyAttackSystem({ kind, balance: BALANCE.enemies[kind], shelter }),
    ]),
  ) as Record<EnemyKind, EnemyAttackSystem>;
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

function assertPlayer(player: PlayerSnapshot): void {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
    throw new RangeError('GameSession player position must be finite');
  }
}
