export const EFFECT_WORKLOAD_TOPOLOGY = 'effects/blitter-120-bobs+lazy-graphics@1' as const;
export const PROJECTILE_WORKLOAD_TOPOLOGY = 'projectiles/image@2' as const;
export const DAMAGE_WORKLOAD_TOPOLOGY = 'damage/bitmap-text@1' as const;

export interface EffectWorkloadCounters {
  topology: typeof EFFECT_WORKLOAD_TOPOLOGY;
  poolInstanceId: number;
  allocatedRoots: number;
  allocatedChildren: number;
  impactActive: number;
  renderEligibleBobs: number;
  graphicsAllocated: number;
  graphicsVisible: number;
  stepPasses: number;
  activeActorVisits: number;
  visibleDrawableVisits: number;
  stateVersion: number;
  activations: number;
  releases: number;
  rejected: number;
}

export interface ProjectileLogicalWorkloadCounters {
  poolInstanceId: number;
  active: number;
  logicalStepPasses: number;
  logicalActorVisits: number;
  activations: number;
  releases: number;
  rejected: number;
}

export interface ProjectileViewWorkloadCounters {
  topology: typeof PROJECTILE_WORKLOAD_TOPOLOGY;
  poolInstanceId: number;
  allocatedRoots: number;
  allocatedChildren: number;
  active: number;
  visibleRoots: number;
  visibleLeaves: number;
  renderPasses: number;
  requestedVisits: number;
  visibleRootVisits: number;
  stateVersion: number;
  activations: number;
  releases: number;
  rejected: number;
}

export interface DamageWorkloadCounters {
  topology: typeof DAMAGE_WORKLOAD_TOPOLOGY;
  poolInstanceId: number;
  allocatedRoots: number;
  allocatedChildren: number;
  active: number;
  renderEligibleTexts: number;
  stepPasses: number;
  activeActorVisits: number;
  visibleDrawableVisits: number;
  stateVersion: number;
  activations: number;
  merges: number;
  evictions: number;
  expirations: number;
  rejected: number;
}
