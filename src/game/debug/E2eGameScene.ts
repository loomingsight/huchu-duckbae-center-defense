import Phaser from 'phaser';
import { shelterVisualState } from '../shelter/ShelterSystem';
import { GameScene } from '../scenes/GameScene';
import type { GameSession } from '../session/GameSession';
import { E2eCombatEffectPool } from './E2eCombatEffectPool';
import { E2eGameSession } from './E2eGameSession';
import type { ScenarioScenePort } from './ScenarioSessionPort';
import { installTestBridge } from './TestBridge';

export class E2eGameScene extends GameScene {
  override create(): void {
    super.create();
    const dispose = installTestBridge(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
  }

  scenarioAdapter(): ScenarioScenePort {
    const session = (this.session as E2eGameSession).scenarioAdapter();
    const effects = this.combatEffects as E2eCombatEffectPool;
    return {
      seedEnemy: (seed) => {
        const enemyId = session.spawnEnemy(seed);
        const actor = this.enemyActors?.acquire(enemyId);
        if (actor === undefined) throw new Error('Enemy actor pool exhausted');
        this.renderEnemies();
        this.renderHud();
        return enemyId;
      },
      suppressWaveSpawns: () => session.suppressWaveSpawns(),
      useWaveSchedule: (wave, schedule) => {
        session.useWaveSchedule(wave, schedule);
        this.renderHud();
        this.renderEnemies();
      },
      damageShelter: (damage) => {
        const events = session.damageShelter(damage);
        this.applySessionEvents(events);
        this.renderHud();
        return events;
      },
      replaceShelter: (currentHp, maxHp) => {
        session.replaceShelter(currentHp, maxHp);
        this.shelterView?.render(shelterVisualState(currentHp, maxHp ?? currentHp));
        this.renderHud();
      },
      seedProjectile: (seed) => {
        const events = session.spawnProjectile(seed);
        this.applySessionEvents(events);
        this.renderProjectiles();
        return events;
      },
      seedEffectPool: (active) => effects.seedEffects(active),
      maintainStressPools: () => {
        const events = session.maintainStressProjectiles();
        this.applySessionEvents(events);
        effects.maintainEffects(120);
        this.renderProjectiles();
        return events;
      },
      resetSimulationClock: () => session.resetSimulationClock(),
      projectilePoolTelemetry: () => session.projectilePoolTelemetry(),
      effectImpacts: () => effects.projectileImpactSnapshots(),
      removeEnemyWithoutReward: (enemyId) => {
        session.removeEnemyWithoutReward(enemyId);
        this.enemyActors?.release(enemyId);
        this.renderEnemies();
        this.renderHud();
      },
      sessionIdentity: () => this.session,
    };
  }

  protected override createSession(seed: number): GameSession {
    return E2eGameSession.create({ seed });
  }

  protected override createCombatEffectPool(): E2eCombatEffectPool {
    return new E2eCombatEffectPool(this);
  }
}
