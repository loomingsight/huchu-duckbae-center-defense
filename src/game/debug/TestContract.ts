import type { AudioSnapshot } from '../audio/AudioTypes';
import type { GameEvent } from '../events/GameEvents';
import type { DogTraderRigTelemetrySnapshot } from '../enemies/DogTraderRigTelemetry';
import type { EnemyLabelBindingTelemetry } from '../enemies/EnemyActorPool';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { SkillPurchaseResult } from '../progression/ProgressionTypes';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { PurchasableSkillId } from '../types/GameTypes';
import type { HudSnapshot } from '../ui/HudSystem';
import type { E2eAudioStressSnapshot } from './E2eAudioStressLoadController';
import type { E2ePresentationStressSnapshot } from './E2ePresentationStressController';

export type TestScenarioId =
  | 'empty-run'
  | 'wave-schedule'
  | 'full-run'
  | 'bark-cone'
  | 'skill-dock'
  | 'impact-feedback'
  | 'health-bar-colors'
  | 'boss-rig-p1'
  | 'boss-rig-p2'
  | 'boss-rig-p3'
  | 'boss-rig-p4'
  | 'boss-rig-p5'
  | 'boss-rig-p6'
  | 'boss-rig-corner-p2'
  | 'boss-rig-attack-p2'
  | 'boss-rig-feedback'
  | 'audio'
  | 'stress';

export interface GameDebugSnapshot {
  readonly run: RunSnapshot;
  readonly player: Readonly<{ x: number; y: number }>;
  readonly hud: HudSnapshot;
  readonly audio: AudioSnapshot;
  readonly audioStress: E2eAudioStressSnapshot | null;
  readonly presentationStress: E2ePresentationStressSnapshot | null;
  readonly traderRig: DogTraderRigTelemetrySnapshot;
  readonly pools: {
    readonly enemies: PoolSnapshot;
    readonly labels: PoolSnapshot;
    readonly projectiles: PoolSnapshot;
    readonly effects: PoolSnapshot;
    readonly damageNumbers: PoolSnapshot;
  };
  readonly labelBindings: readonly EnemyLabelBindingTelemetry[];
  readonly renderedVisibleEnemyLabels: number;
  readonly listenerCount: number;
}

type DebugMetadata = { readonly sequence: number; readonly atSimulationMs: number };
export type GameDebugEvent = GameEvent extends infer Event
  ? Event extends GameEvent ? Event & DebugMetadata : never
  : never;

export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  advanceSimulationBatch(stepCount: number, input: Readonly<{ x: number; y: number }>): Promise<void>;
  prepareTerminalTieForTest(): void;
  purchaseSkill(id: PurchasableSkillId): Promise<SkillPurchaseResult>;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
  stepSceneOnceForTest(): void;
  restartScene(): void;
  setAcceleratedAudio(enabled: boolean): Promise<void>;
}

export interface HuchuAudioTestProbe {
  readonly ready: Promise<void>;
  snapshot(): AudioSnapshot;
}

declare global {
  interface Window {
    __HUCHU_TEST__?: HuchuTestBridge;
    __HUCHU_AUDIO_TEST__?: HuchuAudioTestProbe;
  }
}
