import type { GameMode } from '../core/GameMode';
import type { ProjectileImpactSnapshot } from '../combat/ProjectileActorPool';
import type { ProjectileKind } from '../combat/ProjectileSystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { SkillCard } from '../skills/SkillTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import type { CountdownKind } from '../ui/CountdownOverlay';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import type { SkillSelectionRequest } from '../progression/ProgressionTypes';
import type { ShelterVisualState } from '../shelter/ShelterTypes';
import type { HudSnapshot } from '../ui/HudSystem';

export type TestScenarioId =
  | 'empty-run'
  | 'wave-schedule'
  | 'canonical-combat-progression'
  | 'health-bar-colors'
  | 'bark-targeting'
  | 'skill-selection'
  | 'skill-selection-wave-clear'
  | 'all-skills'
  | 'poop-attack'
  | 'boss'
  | 'shelter-defeat'
  | 'final-enemy'
  | 'stress';

export interface PoolCount {
  readonly instanceId: number;
  readonly created: number;
  readonly active: number;
  readonly available: number;
}

export interface DebugEnemySnapshot extends EnemySnapshot {
  readonly hpBar: {
    readonly visible: true;
    readonly width: number;
    readonly height: number;
    readonly color: number;
  };
}

export interface GameDebugSnapshot extends Omit<RunSnapshot, 'enemies'> {
  readonly enemies: readonly DebugEnemySnapshot[];
  readonly player: { readonly x: number; readonly y: number };
  readonly enemyPool: PoolSnapshot;
  readonly projectilePool: PoolSnapshot;
  readonly projectileImpacts: readonly ProjectileImpactSnapshot[];
  readonly combatEffectImpacts: readonly ProjectileImpactSnapshot[];
  readonly shelterShakeOffset: number;
  readonly barkWavePool: PoolSnapshot;
  readonly combatEffectPool: PoolSnapshot;
  readonly pools: {
    readonly enemies: PoolCount;
    readonly projectiles: PoolCount;
    readonly effects: PoolCount;
  };
  readonly runtime: { readonly sessionInstanceId: number };
  readonly shelterFrame: number;
  readonly hud: HudSnapshot;
  readonly cards: readonly SkillCard[];
  readonly cooldownProgress: Readonly<Record<SkillId, number>>;
  readonly countdown: {
    readonly kind: CountdownKind | null;
    readonly remainingMs: number;
  };
  readonly worldClocks: {
    readonly worldPaused: boolean;
    readonly worldAnimationMs: number;
    readonly barkAnimationElapsedMs: number | null;
    readonly barkEffectAgesMs: readonly number[];
    readonly projectileEffectAgesMs: readonly number[];
    readonly skillEffectAgesMs: readonly number[];
    readonly shelterEffectAgeMs: number | null;
    readonly offLeashEffectAgeMs: number | null;
  };
}

type GameDebugEventMetadata = {
  readonly sequence: number;
  readonly atMs: number;
};

export type GameDebugEvent = GameDebugEventMetadata & (
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'playerMoved' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
  | { readonly type: 'enemySpawned'; readonly enemyId: number }
  | { readonly type: 'waveStarted'; readonly wave: number }
  | {
    readonly type: 'waveTransition';
    readonly fromWave: number;
    readonly toWave: number;
    readonly countdownMs: 3000;
  }
  | { readonly type: 'runEnded' | 'resultReady'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'barkStarted'; readonly attackId: string; readonly targetId: number }
  | { readonly type: 'barkReleased'; readonly attackId: string; readonly targetId: number }
  | {
    readonly type: 'attackStarted' | 'attackCancelled' | 'attackHolding';
    readonly enemyId: number;
  }
  | {
    readonly type: 'projectileSpawned';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
  }
  | {
    readonly type: 'projectileHit';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
    readonly position: { readonly x: number; readonly y: number };
  }
  | {
    readonly type: 'projectileDropped';
    readonly projectileId: number;
    readonly kind: ProjectileKind;
    readonly reason: 'capacity';
  }
  | {
    readonly type: 'shelterDamaged';
    readonly hp: number;
    readonly visual: ShelterVisualState;
  }
  | { readonly type: 'enemyDied'; readonly enemyId: number }
  | { readonly type: 'snackEarned'; readonly enemyId: number; readonly amount: number }
  | { readonly type: 'waveCountdownChanged'; readonly remainingMs: number }
  | {
    readonly type: 'skillSelectionOpened';
    readonly request: SkillSelectionRequest;
    readonly cards: readonly SkillCard[];
  }
  | { readonly type: 'skillLearned'; readonly skillId: SkillId; readonly level: SkillLevel }
  | { readonly type: 'skillCast'; readonly skillId: Exclude<SkillId, 'bark'>; readonly targetIds: readonly number[] }
);

export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
  stepSceneOnceForTest(): void;
  forceModeForTest(mode: GameMode): void;
  restartScene(): void;
}

declare global {
  interface Window {
    __HUCHU_TEST__?: HuchuTestBridge;
  }
}
