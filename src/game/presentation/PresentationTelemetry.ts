import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { EnemyLabelBindingTelemetry } from '../enemies/EnemyActorPool';
import { runCleanupSteps } from '../scenes/SceneRuntimeLifecycle';

export interface PresentationTelemetrySnapshot {
  readonly enemies: PoolSnapshot;
  readonly labels: PoolSnapshot;
  readonly labelBindings: readonly EnemyLabelBindingTelemetry[];
  readonly projectiles: PoolSnapshot;
  readonly effects: PoolSnapshot;
  readonly damageNumbers: PoolSnapshot;
  readonly listenerCount: number;
}

interface EnemyTelemetryProducer {
  snapshot(): PoolSnapshot;
  labelPoolSnapshot(): PoolSnapshot;
  labelBindingSnapshots?(): readonly EnemyLabelBindingTelemetry[];
  reset(): void;
}

interface ProjectileTelemetryProducer {
  snapshot(): PoolSnapshot;
  reset(): void;
}

interface EffectTelemetryProducer {
  snapshot(): PoolSnapshot;
  releaseAll(): void;
}

interface DamageTelemetryProducer {
  snapshot(): PoolSnapshot;
  reset(): void;
}

export interface PresentationTelemetryOptions {
  readonly enemies: EnemyTelemetryProducer;
  readonly projectiles: ProjectileTelemetryProducer;
  readonly effects: EffectTelemetryProducer;
  readonly damageNumbers: DamageTelemetryProducer;
  readonly listenerCount: () => number;
}

export class PresentationTelemetry {
  constructor(private readonly producers: PresentationTelemetryOptions) {}

  snapshot(): PresentationTelemetrySnapshot {
    return {
      enemies: this.producers.enemies.snapshot(),
      labels: this.producers.enemies.labelPoolSnapshot(),
      labelBindings: this.producers.enemies.labelBindingSnapshots?.() ?? [],
      projectiles: this.producers.projectiles.snapshot(),
      effects: this.producers.effects.snapshot(),
      damageNumbers: this.producers.damageNumbers.snapshot(),
      listenerCount: this.producers.listenerCount(),
    };
  }

  reset(): void {
    runCleanupSteps([
      () => this.producers.enemies.reset(),
      () => this.producers.projectiles.reset(),
      () => this.producers.effects.releaseAll(),
      () => this.producers.damageNumbers.reset(),
    ]);
  }
}
