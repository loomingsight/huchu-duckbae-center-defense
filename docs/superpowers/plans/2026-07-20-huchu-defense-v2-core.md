# 후추덕배 디펜스 V2 Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직접 구매, 부채꼴 짖기, 기본 동료 덕배, 감속·돌진 적, 세 자동 기술, 정확한 5개 웨이브를 하나의 결정적 fixed-step `GameSession`으로 구현한다.
**Architecture:** Phaser를 모르는 순수 TypeScript 시스템이 구매·조준·이동·피해·웨이브·승패를 소유하고 `GameSession`이 고정된 순서로 조립한다. Scene·HUD·보스 rig·오디오는 이 계획에서 정의한 snapshot과 event만 소비하며 simulation 상태를 바꾸지 않는다.

**Tech Stack:** Node.js `>=22.12.0`, TypeScript `7.0.2`, Phaser `4.1.0`, Vite `8.1.5`, Vitest `4.1.10`

## Global Constraints

- 논리 해상도는 `540 × 960`, simulation은 `1000 / 60ms` fixed-step이며 `simulationMs = ticks * 1000 / 60`으로만 계산한다. 순수 규칙 모듈은 Phaser, `Math.random()`, wall clock과 새 런타임 의존성을 사용하지 않는다.
- 보호소는 `(270, 480)`, 최대 HP `1,000`, 웨이브 사이 회복 없음이고 후추·덕배는 HP·충돌·사망이 없다.
- 후추 이동 속도는 초당 `150`이다. 적의 `HP/속도/보호소 피해/공격 간격/간식`은 각각 똥 방치 보호자 `60/44/25/1,800/2`, 오프리시 보호자 `110/42/50/1,800/4`, 개장수 `900/25/120/2,400/20`, 불법번식업자 `1,500/23/160/2,100/35`다.
- Huchu presentation의 `opaqueHeightLogical=72`; 짖기는 `3H`, `120°`, 피해 `18`, cadence `800ms`다.
- 6프레임 공격은 `eventFrame=3`, `fps=12`, 판정 `250ms`; 8프레임 보스 공격은 `eventFrame=5`, `fps=10`, 판정 `500ms`이며 core가 `eventFrame / fps`로 fixed-step 판정을 예약한다.
- 구매 비용은 습득 순서대로 `15/25/40`, command queue capacity는 `1`, 먼저 들어온 command만 다음 step 경계에서 처리한다.
- 구매는 `playing`에서 world를 멈추지 않는다. `GameMode`는 `playing | countdown | visibilityPause | won | lost`만 허용한다.
- `skillSelection`, 카드 API, `deokbaeHowl`, `scold`, `stunned`, stun timer는 최종 코드·debug fixture·테스트 계약에 남기지 않는다.
- 덕배는 모든 run에 처음부터 존재하고 피해 `11`, cadence `1,000ms`, 짖기와 같은 `3H` 조준 우선순위를 사용한다.
- 꼬리치기·아쿠아빔·안전신문고의 cooldown은 각각 `8,000/10,000/22,000ms`; 성공한 cast만 전역 queue를 `200ms` 잠근다.
- 꼬리치기는 피해 `14`, 넉백 `35`, 일반 적 `0.6/1,500ms`, 보스 `0.8/1,000ms`; 기절은 없다.
- 개장수 `pathProgress`는 `-70`에서 시작하고 첫 segment를 선형 외삽한 gameplay 위치·ETA를 사용한다. 개장수 넉백 하한도 `-70`이며 다른 적은 기존 `0` 하한을 유지한다.
- 아쿠아빔은 `600ms` 추적 뒤 피해 `160`, 죽은 표적을 한 번만 재지정한다. 안전신문고는 `300ms` 단일 timeline 뒤 일반 `90`, 보스 `45`를 snapshot 생존자에게 동시에 적용한다.
- 한 step 순서는 `입력·구매 → spawn·이동 → player impact → 적 피해·사망·간식 → 적 공격·투사체 → 패배 → 승리 → 웨이브 종료 → HUD/queue`다.
- 같은 step의 승리·패배는 패배가 우선하며 결과 확정 뒤 구매·피해·웨이브 요청은 무시한다. 웨이브 사이는 정확히 `3,000ms`, 패배 결과 준비는 `1,200ms`이고 기존 결정적 UI clock으로만 진행한다. 명령은 `/Users/jadon/Documents/huchu-defense/.worktrees/huchu-defense-mvp`에서 실행한다.
- 이 계획이 public core 계약을 먼저 바꾸는 동안 legacy debug/UI/browser consumer는 잠시 타입 비호환일 수 있다. 따라서 여기서는 소유한 core 단위 테스트만 gate로 삼고, 전체 `npm run typecheck`·build·E2E는 Presentation/Boss, Integration Task 1 debug/lifecycle과 Task 2 E2E 이관을 모두 적용한 뒤 처음 실행한다.

## Exact File Map

```text
src/game/types/GameTypes.ts, core/GameMode.ts       canonical IDs, cost, source, five-state mode
src/game/data/balance.ts                            all core numeric balance
src/game/progression/{ProgressionTypes,ProgressionSystem}.ts
                                                    purchase contract and capacity-1 transaction
src/game/combat/TargetingSystem.ts                  deterministic threat/highest-HP ranking
src/game/combat/BarkSystem.ts                       locked-direction 120-degree multi-hit timeline
src/game/companions/CompanionSystem.ts              new default Deokbae rule module
src/game/enemies/EnemyTypes.ts                      slow/dash snapshot without stunned
src/game/enemies/EnemySystem.ts                     split integration, ETA, tail effect, lifecycle
src/game/world/PathSystem.ts                        opt-in negative-distance first-segment extension
src/game/combat/EnemyAttackSystem.ts                windup-only interrupt, no stun
src/game/combat/{CombatTypes,CombatSystem}.ts       effective damage event and lifecycle ordering
src/game/skills/{SkillTypes,skillDefinitions,SkillSystem}.ts
                                                    three fixed timelines and 200ms scheduler
src/game/waves/PathDeck.ts                          new seeded exhaustion deck
src/game/waves/{WaveTypes,WaveSystem}.ts            path-set/group schedule materialization
src/game/data/{waveDefinitions,validateGameData}.ts exact data and validation
src/game/session/RunSnapshot.ts                     V2 public snapshot
src/game/session/RunOutcomeResolver.ts              loss-first terminal resolver
src/game/session/GameSession.ts                     fixed-step orchestration
src/game/events/GameEvents.ts                       public event union
tests/unit/{ProgressionSystem,TargetingSystem,BarkSystem,CompanionSystem,EnemySystem,EnemyAttackSystem,CombatSystem,SkillSystem,WaveSystem,GameDataValidation,GameSession,RunOutcomeResolver,GameStateMachine}.test.ts
tests/unit/fixtures.ts                               V2 enemy/skill fixtures
```

Delete in Task 6: `src/game/progression/SkillCardPicker.ts`, `tests/unit/SkillCardPicker.test.ts`. Integration 계획만 `src/game/debug/*`와 E2E fixture를 이관한다. Presentation 계획은 `SkillSelectionModal`, `BossHud`, UI tests와 Scene/HUD wiring을, boss/audio 계획은 `PathPoseSampler`, `DogTraderRig`, `TRADER_SIDE_BY_PATH`와 audio consumer를 소유한다.

## Interfaces

```ts
export type PathId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
export type EnemyKind = 'poopGuardian' | 'offLeashGuardian' | 'dogTrader' | 'illegalBreeder';
export type EnemyVariant = 'male' | 'female';
export type EnemyState = 'moving' | 'windup' | 'holding' | 'dead';
export type PurchasableSkillId = 'tailSwipe' | 'aquaBeam' | 'safetyReport';
export type SkillCost = 15 | 25 | 40;
export type DamageSource = 'bark' | 'deokbae' | PurchasableSkillId;
export type ImpactStrength = 'light' | 'medium' | 'heavy';
export type GameMode = 'playing' | 'countdown' | 'visibilityPause' | 'won' | 'lost';
export interface SkillTargetSnapshot { readonly targetId: number; readonly position: Point; }
export interface SkillSnapshot { readonly learned: boolean; readonly cooldownRemainingMs: number; readonly ready: boolean; readonly progress: number; readonly activeCastId: string | null; }

export interface SkillPurchaseResult {
  readonly status: 'queued' | 'learned' | 'alreadyLearned' | 'insufficientSnacks' | 'queueBusy';
  readonly skillId: PurchasableSkillId;
  readonly cost: SkillCost | null;
  readonly spent: number;
  readonly snacks: number;
  readonly nextCost: SkillCost | null;
}
export interface ProgressionSnapshot {
  readonly snacks: number; readonly learned: Readonly<Record<PurchasableSkillId, boolean>>;
  readonly queuedSkillId: PurchasableSkillId | null; readonly nextCost: SkillCost | null;
}
export interface DamageAppliedEvent {
  readonly type: 'damageApplied'; readonly castId: string; readonly appliedAtStep: number;
  readonly targetId: number; readonly amount: number; readonly effectiveAmount: number;
  readonly position: Point; readonly impactDirection: Point;
  readonly source: DamageSource; readonly strength: ImpactStrength;
  readonly lethal: boolean;
}
export interface DamageCommand { readonly castId: string; readonly targetId: number; readonly amount: number; readonly impactDirection: Point; readonly source: DamageSource; readonly strength: ImpactStrength; }
export interface ShelterDamageRequest {
  readonly type: 'shelterDamageRequested'; readonly castId: string;
  readonly sourceEnemyId: number; readonly sourceEnemyKind: EnemyKind;
  readonly amount: number; readonly position: Point; readonly impactDirection: Point;
  readonly strength: 'medium' | 'heavy';
}
export interface EnemyDamageResult { readonly effectiveAmount: number; readonly position: Point; readonly lethal: boolean; readonly lifecycleEvents: readonly EnemyLifecycleEvent[]; }
export interface CompanionSnapshot {
  readonly companion: 'deokbae'; readonly active: true; readonly cooldownRemainingMs: number;
}
export interface EnemySnapshot {
  readonly id: number; readonly kind: EnemyKind; readonly variant: EnemyVariant;
  readonly state: EnemyState; readonly pathId: PathId; readonly pathProgress: number;
  readonly position: Point; readonly etaMs: number; readonly currentHp: number;
  readonly maxHp: number; readonly spawnSequence: number; readonly isBoss: boolean;
  readonly moveSpeedMultiplier: number; readonly slowRemainingMs: number;
  readonly dashCooldownRemainingMs: number; readonly animationElapsedMs: number;
}
export interface RunSnapshot {
  readonly mode: GameMode; readonly simulationMs: number; readonly wave: 1|2|3|4|5;
  readonly shelterHp: number; readonly shelterMaxHp: 1000; readonly snacks: number;
  readonly nextSkillCost: SkillCost|null;
  readonly learnedSkills: Readonly<Record<PurchasableSkillId,boolean>>;
  readonly skillStates: Readonly<Record<PurchasableSkillId,SkillSnapshot>>;
  readonly companion: CompanionSnapshot; readonly enemies: readonly EnemySnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly activeEnemyCount: number; readonly pendingSpawns: number; readonly activeProjectileCount: number;
}
export type CoreCombatEvent =
  | { readonly type: 'barkStarted'; readonly castId: string; readonly targetId: number }
  | { readonly type: 'barkImpact'; readonly castId: string; readonly origin: Point; readonly direction: Point; readonly targetIds: readonly number[] }
  | { readonly type: 'companionAttackStarted'; readonly castId: string; readonly companion: 'deokbae'; readonly targetId: number }
  | { readonly type: 'companionAttack'; readonly castId: string; readonly companion: 'deokbae'; readonly origin: Point; readonly targetId: number; readonly targetPosition: Point }
  | { readonly type: 'skillCastStarted'; readonly castId: string; readonly skillId: PurchasableSkillId; readonly origin: Point; readonly targets: readonly SkillTargetSnapshot[]; readonly durationMs: 250 | 300 | 600 }
  | { readonly type: 'skillTargetChanged'; readonly castId: string; readonly skillId: 'aquaBeam'; readonly previousTargetId: number; readonly targetId: number; readonly targetPosition: Point }
  | { readonly type: 'skillImpact'; readonly castId: string; readonly skillId: PurchasableSkillId; readonly origin: Point; readonly targets: readonly SkillTargetSnapshot[] };
export type SkillTimelineEvent = Extract<CoreCombatEvent, { readonly type: 'skillCastStarted' | 'skillTargetChanged' | 'skillImpact' }>;
export type CompanionAttackEvent = Extract<CoreCombatEvent, { readonly type: 'companionAttack' }>;
export type CoreStateEvent =
  | { readonly type: 'skillPurchaseResolved'; readonly result: SkillPurchaseResult & { readonly status: 'learned' } }
  | { readonly type: 'enemyDied'; readonly enemyId: number; readonly kind: EnemyKind; readonly position: Point }
  | { readonly type: 'snackEarned'; readonly enemyId: number; readonly kind: EnemyKind; readonly amount: number; readonly snacks: number }
  | { readonly type: 'bossActiveChanged'; readonly active: boolean; readonly activeBossCount: number }
  | { readonly type: 'shelterDamaged'; readonly castId: string; readonly appliedAtStep: number; readonly sourceEnemyId: number; readonly amount: number; readonly effectiveAmount: number; readonly hp: number; readonly maxHp: number; readonly position: Point; readonly impactDirection: Point; readonly strength: 'medium' | 'heavy'; readonly visual: ShelterVisualState };
export type EnemyCombatEvent =
  | { readonly type:'attackStarted'; readonly castId:string; readonly enemyId:number; readonly kind:EnemyKind }
  | { readonly type:'attackCancelled'|'attackHolding'; readonly castId:string; readonly enemyId:number; readonly kind:EnemyKind }
  | { readonly type:'projectileRequested'; readonly castId:string; readonly enemyId:number; readonly kind:EnemyKind; readonly projectileKind:'poop'|'net'|'electric'; readonly from:Point; readonly to:Point; readonly speed:number; readonly damage:number; readonly lifeMs:1200 }
  | { readonly type:'projectileHit'; readonly castId:string; readonly projectileId:number; readonly projectileKind:'poop'|'net'|'electric'; readonly position:Point }
  | ShelterDamageRequest;
export type AttackOriginResolver = (enemy: EnemySnapshot) => Point;
export type SessionLifecycleEvent =
  | { readonly type:'modeChanged'; readonly mode:GameMode }
  | { readonly type:'runEnded'|'resultReady'; readonly outcome:'won'|'lost' }
  | { readonly type:'enemySpawnRequested'; readonly request:EnemySpawnRequest }
  | { readonly type:'enemySpawned'; readonly enemyId:number; readonly request:EnemySpawnRequest }
  | { readonly type:'waveStarted'; readonly wave:1|2|3|4|5 }
  | { readonly type:'waveTransition'; readonly fromWave:1|2|3|4; readonly toWave:2|3|4|5; readonly countdownMs:3000 }
  | { readonly type:'waveCountdownChanged'; readonly remainingMs:number };
export type GameEvent = DamageAppliedEvent | CoreCombatEvent | CoreStateEvent | EnemyCombatEvent | SessionLifecycleEvent;
export function impactStrengthFor(source:DamageSource):ImpactStrength;
```

`GameSession.queueSkillPurchase(skillId: PurchasableSkillId): SkillPurchaseResult`는 enqueue 성공 시 `queued`, `spent:0`, unchanged `snacks/nextCost`를 반환한다. 다음 step은 위 `CoreStateEvent`의 `skillPurchaseResolved`를 emit한다. `RunSnapshot`은 `snacks`, `nextSkillCost`, `learnedSkills`, `skillStates`, `companion`, 위 `EnemySnapshot`을 제공한다.

---

### Task 1: V2 canonical types, balance와 capacity-1 직접 구매

**Files:**
- Modify: `src/game/types/GameTypes.ts`, `src/game/core/GameMode.ts`, `src/game/data/balance.ts`
- Modify: `src/game/progression/ProgressionTypes.ts`, `src/game/progression/ProgressionSystem.ts`
- Create: `tests/unit/Balance.test.ts`
- Test: `tests/unit/ProgressionSystem.test.ts`, `tests/unit/GameStateMachine.test.ts`

**Interfaces:**
- Consumes: `PurchasableSkillId`, `SkillCost`
- Produces: `queuePurchase(skillId): SkillPurchaseResult`, `consumeQueuedPurchase(): SkillPurchaseResult | undefined`, `snapshot(): ProgressionSnapshot`

- [ ] **Step 1: Write the failing purchase and mode tests**

```ts
it('첫 command만 queue하고 다음 step에 15를 원자적으로 차감한다', () => {
  const p = new ProgressionSystem();
  p.addSnacks(40);
  expect(p.queuePurchase('tailSwipe')).toEqual({ status:'queued', skillId:'tailSwipe', cost:15, spent:0, snacks:40, nextCost:15 });
  expect(p.queuePurchase('aquaBeam').status).toBe('queueBusy');
  expect(p.consumeQueuedPurchase()).toEqual({ status:'learned', skillId:'tailSwipe', cost:15, spent:15, snacks:25, nextCost:25 });
  expect(p.snapshot()).toMatchObject({ snacks:25, learned:{ tailSwipe:true, aquaBeam:false, safetyReport:false }, queuedSkillId:null });
});
it('GameMode에는 V2 다섯 상태만 존재한다', () => {
  expectTypeOf<GameMode>().toEqualTypeOf<'playing'|'countdown'|'visibilityPause'|'won'|'lost'>();
});
it('V2 balance와 eventFrame 기반 판정 시간을 한 곳에 고정한다', () => {
  expect(BALANCE).toMatchObject({
    shelter:{maxHp:1000,x:270,y:480}, player:{speed:150,opaqueHeightLogical:72},
    enemies:{
      poopGuardian:{displayName:'똥 방치 보호자',hp:60,speed:44,damage:25,attackIntervalMs:1800,snack:2,isBoss:false,attackTiming:'normal'},
      offLeashGuardian:{displayName:'오프리시 보호자',hp:110,speed:42,damage:50,attackIntervalMs:1800,snack:4,isBoss:false,attackTiming:'normal'},
      dogTrader:{displayName:'개장수',hp:900,speed:25,damage:120,attackIntervalMs:2400,snack:20,isBoss:true,attackTiming:'boss'},
      illegalBreeder:{displayName:'불법번식업자',hp:1500,speed:23,damage:160,attackIntervalMs:2100,snack:35,isBoss:true,attackTiming:'boss'},
    },
  });
  expect(attackImpactMs('normal')).toBe(250);
  expect(attackImpactMs('boss')).toBe(500);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/Balance.test.ts tests/unit/ProgressionSystem.test.ts tests/unit/GameStateMachine.test.ts`
Expected: FAIL with the old balance values, missing `attackImpactMs`, `queuePurchase is not a function`, and the legacy `skillSelection` mode assertion.

- [ ] **Step 3: Write the minimal canonical purchase implementation**

```ts
const COSTS = [15, 25, 40] as const;
const IDS = ['tailSwipe', 'aquaBeam', 'safetyReport'] as const;
export const ACTION_TIMINGS = {
  normal:{frameCount:6,eventFrame:3,fps:12},
  boss:{frameCount:8,eventFrame:5,fps:10},
} as const;
export function attackImpactMs(kind:keyof typeof ACTION_TIMINGS):number {
  const timing=ACTION_TIMINGS[kind]; return timing.eventFrame/timing.fps*1000;
}
export class ProgressionSystem {
  private snacks = 0;
  private readonly learned = new Set<PurchasableSkillId>();
  private queued: PurchasableSkillId | null = null;
  addSnacks(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(this.snacks + amount)) throw new RangeError('Invalid snacks');
    this.snacks += amount;
  }
  queuePurchase(skillId: PurchasableSkillId): SkillPurchaseResult {
    const cost = COSTS[this.learned.size] ?? null;
    if (this.learned.has(skillId)) return this.result('alreadyLearned', skillId, cost, 0);
    if (this.queued !== null) return this.result('queueBusy', skillId, cost, 0);
    if (cost === null || this.snacks < cost) return this.result('insufficientSnacks', skillId, cost, 0);
    this.queued = skillId;
    return this.result('queued', skillId, cost, 0);
  }
  consumeQueuedPurchase(): SkillPurchaseResult | undefined {
    if (this.queued === null) return undefined;
    const skillId = this.queued; this.queued = null;
    const cost = COSTS[this.learned.size]!;
    this.snacks -= cost; this.learned.add(skillId);
    return this.result('learned', skillId, cost, cost);
  }
  snapshot(): ProgressionSnapshot {
    return { snacks:this.snacks, learned:Object.fromEntries(IDS.map(id => [id, this.learned.has(id)])) as Record<PurchasableSkillId,boolean>, queuedSkillId:this.queued, nextCost:COSTS[this.learned.size] ?? null };
  }
  reset(): void { this.snacks = 0; this.learned.clear(); this.queued = null; }
  private result(status: SkillPurchaseResult['status'], skillId: PurchasableSkillId, cost: SkillCost | null, spent: number): SkillPurchaseResult {
    return { status, skillId, cost, spent, snacks:this.snacks, nextCost:COSTS[this.learned.size] ?? null };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/Balance.test.ts tests/unit/ProgressionSystem.test.ts tests/unit/GameStateMachine.test.ts`
Expected: PASS; additionally assert costs `15→25→40→null`, duplicate and insufficient requests preserve state.

- [ ] **Step 5: Commit**

```bash
git add src/game/types/GameTypes.ts src/game/core/GameMode.ts src/game/data/balance.ts src/game/progression tests/unit/Balance.test.ts tests/unit/ProgressionSystem.test.ts tests/unit/GameStateMachine.test.ts
git commit -m "feat: replace card progression with direct purchases"
```
### Task 2: Threat targeting, multi-hit bark와 기본 덕배

**Files:**
- Modify: `src/game/combat/TargetingSystem.ts`, `src/game/combat/BarkSystem.ts`
- Create: `src/game/companions/CompanionSystem.ts`
- Create: `tests/unit/CompanionSystem.test.ts`
- Modify: `tests/unit/TargetingSystem.test.ts`, `tests/unit/BarkSystem.test.ts`

**Interfaces:**
- Consumes: `EnemySnapshot`, `BALANCE.player.opaqueHeightLogical=72`
- Produces: `rankThreatTargets(origin,enemies,range)`, `rankHighestHpTargets(origin,enemies)`, `BarkSystem.step(stepMs,context)`, `CompanionSystem.step(stepMs,context)` and `CompanionSnapshot`

- [ ] **Step 1: Write failing geometry, lock and companion tests**

```ts
it('3H와 120도 경계를 포함해 모든 대상을 같은 impact에 담는다', () => {
  const bark = new BarkSystem();
  bark.step(0, { origin:{x:0,y:0}, enemies:[enemy({id:1,position:{x:216,y:0}})] });
  const events = bark.step(250, { origin:{x:10,y:0}, enemies:[enemy({id:1,position:{x:118,y:187.061487}}), enemy({id:2,position:{x:118,y:-187.061487}})] });
  expect(events.find(e => e.type === 'barkImpact')).toMatchObject({ origin:{x:10,y:0}, targetIds:[1,2] });
});
it('locked target 사망 뒤 current origin과 last direction으로 release한다', () => {
  const bark = new BarkSystem();
  bark.step(0, { origin:{x:0,y:0}, enemies:[enemy({id:1,position:{x:100,y:0}})] });
  expect(bark.step(250, { origin:{x:20,y:30}, enemies:[enemy({id:2,position:{x:120,y:30}})] }).at(-1))
    .toMatchObject({ type:'barkImpact', origin:{x:20,y:30}, direction:{x:1,y:0}, targetIds:[2] });
});
it('아쿠아빔 표적은 최고 HP 뒤 boss와 보호소 위협도로 동률을 푼다', () => {
  const ranked=rankHighestHpTargets({x:0,y:0},[
    enemy({id:1,currentHp:200,isBoss:false,etaMs:100}),
    enemy({id:2,currentHp:200,isBoss:true,etaMs:500}),
    enemy({id:3,currentHp:150,isBoss:true,etaMs:10}),
  ]);
  expect(ranked.map(({enemy})=>enemy.id)).toEqual([2,1,3]);
});
it('덕배는 대상 없이는 cadence를 소비하지 않고 250ms 판정 뒤 후추 위치에서 공격한다', () => {
  const d = new CompanionSystem();
  expect(d.step(5000,{ player:{x:270,y:600}, enemies:[] })).toEqual([]);
  expect(d.step(0,{ player:{x:270,y:600}, enemies:[enemy({id:9,position:{x:270,y:500}})] }).at(0))
    .toMatchObject({ type:'companionAttackStarted', targetId:9 });
  expect(d.step(250,{ player:{x:280,y:610}, enemies:[enemy({id:9,position:{x:270,y:500}})] }).at(0))
    .toMatchObject({ type:'companionAttack', origin:{x:280,y:610}, targetId:9 });
  expect(d.snapshot()).toMatchObject({ companion:'deokbae', active:true, cooldownRemainingMs:750 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/TargetingSystem.test.ts tests/unit/BarkSystem.test.ts tests/unit/CompanionSystem.test.ts`
Expected: FAIL because bark is single-target/150px and `CompanionSystem` does not exist.

- [ ] **Step 3: Implement shared ranking and timelines**

```ts
export const compareThreat = (a: RankedTarget, b: RankedTarget): number =>
  a.enemy.etaMs - b.enemy.etaMs
  || Number(isAttacking(b.enemy)) - Number(isAttacking(a.enemy))
  || Number(b.enemy.isBoss) - Number(a.enemy.isBoss)
  || a.distanceToOrigin - b.distanceToOrigin
  || a.enemy.spawnSequence - b.enemy.spawnSequence;
export const inCone = (origin: Point, direction: Point, target: Point, radius: number, angleDeg: number): boolean => {
  const dx=target.x-origin.x, dy=target.y-origin.y, length=Math.hypot(dx,dy);
  return length <= radius + 1e-9 && (length === 0 || (dx*direction.x+dy*direction.y)/length >= Math.cos(angleDeg*Math.PI/360)-1e-9);
};
export class CompanionSystem {
  private cooldown=0; private sequence=1;
  private pending:{castId:string;targetId:number;remainingMs:number}|null=null;
  step(stepMs:number, c:{player:Point;enemies:readonly EnemySnapshot[]}): readonly CoreCombatEvent[] {
    const events:CoreCombatEvent[]=[]; this.cooldown=Math.max(0,this.cooldown-stepMs);
    if(this.pending){
      this.pending.remainingMs=Math.max(0,this.pending.remainingMs-stepMs);
      if(this.pending.remainingMs===0){
        const target=c.enemies.find(e=>e.id===this.pending!.targetId&&e.state!=='dead')
          ?? selectThreatTarget(c.player,c.enemies,216);
        if(target)events.push({type:'companionAttack',castId:this.pending.castId,companion:'deokbae',origin:{...c.player},targetId:target.id,targetPosition:{...target.position}});
        this.pending=null;
      }
    }
    if(this.pending===null&&this.cooldown===0){
      const target=selectThreatTarget(c.player,c.enemies,216); if(!target)return events;
      const castId=`deokbae:${this.sequence++}`; this.pending={castId,targetId:target.id,remainingMs:attackImpactMs('normal')}; this.cooldown=1000;
      events.push({type:'companionAttackStarted',castId,companion:'deokbae',targetId:target.id});
    }
    return events;
  }
  snapshot():CompanionSnapshot{return{companion:'deokbae',active:true,cooldownRemainingMs:this.cooldown};}
  reset():void{this.cooldown=0;this.sequence=1;this.pending=null;}
}
```

```ts
private impact(context:BarkContext):BarkImpactEvent {
  const locked=context.enemies.find(enemy=>enemy.id===this.lockedTargetId&&enemy.state!=='dead');
  if(locked)this.lastDirection=normalized({x:locked.position.x-context.origin.x,y:locked.position.y-context.origin.y});
  const targetIds=context.enemies.filter(enemy=>enemy.state!=='dead'&&inCone(context.origin,this.lastDirection,enemy.position,216,120))
    .sort((a,b)=>a.spawnSequence-b.spawnSequence||a.id-b.id).map(enemy=>enemy.id);
  return {type:'barkImpact',castId:this.castId!,origin:{...context.origin},direction:{...this.lastDirection},targetIds};
}
```

`BarkSystem`은 `windupMs=attackImpactMs('normal')`, `cadenceMs=800`을 사용한다. lock된 적이 살아 있는 동안만 방향을 갱신하고, 사망하면 마지막 방향을 보존한 채 판정 시점의 현재 Huchu origin에서 부채꼴을 다시 계산한다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/TargetingSystem.test.ts tests/unit/BarkSystem.test.ts tests/unit/CompanionSystem.test.ts`
Expected: PASS including ETA → attacking → boss → distance → spawn order, 최고 HP → boss → threat 순위, no-target cadence preservation, 250ms companion 판정과 Huchu gameplay origin. 덕배의 뒤 `44`·왼쪽 `18` 시각 위치는 Presentation만 계산한다.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/TargetingSystem.ts src/game/combat/BarkSystem.ts src/game/companions tests/unit/TargetingSystem.test.ts tests/unit/BarkSystem.test.ts tests/unit/CompanionSystem.test.ts
git commit -m "feat: add cone bark and default Deokbae companion"
```
### Task 3: Enemy slow, off-leash dash, ETA와 windup interrupt

**Files:**
- Modify: `src/game/enemies/EnemyTypes.ts`, `src/game/enemies/EnemySystem.ts`
- Modify: `src/game/combat/EnemyAttackSystem.ts`, `src/game/combat/ProjectileSystem.ts`, `src/game/data/balance.ts`
- Modify: `src/game/world/PathSystem.ts`
- Modify: `tests/unit/EnemySystem.test.ts`, `tests/unit/EnemyAttackSystem.test.ts`, `tests/unit/ProjectileSystem.test.ts`, `tests/unit/PathSystem.test.ts`, `tests/unit/fixtures.ts`

**Interfaces:**
- Consumes: tail effect `{knockbackPx:35,multiplier:number,durationMs:number}`
- Produces: `PathSystem.positionAtExtended(distancePx)`, dog-trader `-70` pre-entry/knockback floor, `applyTailEffect(enemyId,effect): {interruptedWindup:boolean}`, split-step movement, slow-aware `etaMs`, optional pure `AttackOriginResolver`, castId-preserving `EnemyCombatEvent`

- [ ] **Step 1: Write failing slow/dash/interrupt tests**

```ts
it('slow가 step 중간에 끝나면 0.6/정상 구간을 나눠 적분한다', () => {
  const s=EnemySystem.withSingleEnemy({kind:'poopGuardian',pathId:'P3'}); const id=s.snapshots()[0]!.id;
  s.applyTailEffect(id,{knockbackPx:35,multiplier:0.6,durationMs:10}); const before=s.snapshots()[0]!.pathProgress;
  s.step(20); expect(s.snapshots()[0]!.pathProgress-before).toBeCloseTo(44*0.6*0.01+44*0.01,9);
  expect(s.snapshots()[0]).toMatchObject({moveSpeedMultiplier:1,slowRemainingMs:0});
});
it('off-leash dash 64에도 현재 multiplier를 적용하고 attack cadence는 바꾸지 않는다', () => {
  const s=EnemySystem.withSingleEnemy({kind:'offLeashGuardian',pathId:'P3'}); const id=s.snapshots()[0]!.id;
  s.applyTailEffect(id,{knockbackPx:0,multiplier:0.6,durationMs:5000}); s.step(4000);
  expect(s.snapshots()[0]!.pathProgress).toBeCloseTo(42*0.6*4+64*0.6,9);
});
it('dogTrader는 -70 pre-entry에서 시작하고 첫 segment 밖 위치와 ETA를 보존한다',()=>{
  const path=new PathSystem([[0,0],[100,0]]);
  expect(path.positionAtExtended(-70)).toEqual({x:-70,y:0});
  const s=EnemySystem.withSingleEnemy({kind:'dogTrader',pathId:'P3'}); const before=s.snapshots()[0]!;
  expect(before.pathProgress).toBe(-70); expect(before.etaMs).toBeGreaterThan(0);
  const nearStart=EnemySystem.withSingleEnemy({kind:'dogTrader',pathId:'P3',initialProgress:10});
  nearStart.applyTailEffect(nearStart.snapshots()[0]!.id,{knockbackPx:35,multiplier:.8,durationMs:1000});
  expect(nearStart.snapshots()[0]!.pathProgress).toBe(-25);
});
it('새 tail impact는 windup만 한 번 취소하고 holding/projectile은 지우지 않는다', () => {
  const attack=attackSystemFor('poopGuardian'); const target=enemy({id:3,state:'windup'});
  attack.step(0,target); expect(attack.interruptWindup(3)).toBe(true); expect(attack.interruptWindup(3)).toBe(false);
  expect('stunnedMs' in target).toBe(false);
});
it('일반 공격은 250ms, 두 보스 공격은 500ms event frame에 release한다', () => {
  const regular=attackSystemFor('poopGuardian'); const boss=attackSystemFor('dogTrader');
  expect(regular.step(249,enemy({id:1})).some(e=>e.type==='projectileRequested')).toBe(false);
  expect(regular.step(1,enemy({id:1})).some(e=>e.type==='projectileRequested')).toBe(true);
  expect(boss.step(499,enemy({id:2,kind:'dogTrader',isBoss:true})).some(e=>e.type==='projectileRequested')).toBe(false);
  expect(boss.step(1,enemy({id:2,kind:'dogTrader',isBoss:true})).some(e=>e.type==='projectileRequested')).toBe(true);
  expect(attackImpactMs(BALANCE.enemies.illegalBreeder.attackTiming)).toBe(500);
});
it('enemy castId와 kind는 attack start부터 projectile hit까지 보존된다',()=>{
  const attack=attackSystemFor('poopGuardian');
  const started=attack.step(0,enemy({id:7}))[0];
  const projectileRequest=attack.step(250,enemy({id:7})).find(e=>e.type==='projectileRequested')!;
  const projectile=new ProjectileSystem(1); projectile.spawn({...projectileRequest,id:99});
  const impactEvents=advanceProjectileToHit(projectile);
  const hit=impactEvents.find(e=>e.type==='projectileHit');
  const shelterRequest=impactEvents.find(e=>e.type==='shelterDamageRequested');
  expect([started,projectileRequest,hit,shelterRequest]).toEqual([
    expect.objectContaining({type:'attackStarted',castId:'enemy:7:1',kind:'poopGuardian'}),
    expect.objectContaining({type:'projectileRequested',castId:'enemy:7:1',kind:'poopGuardian'}),
    expect.objectContaining({type:'projectileHit',castId:'enemy:7:1',projectileKind:'poop'}),
    expect.objectContaining({type:'shelterDamageRequested',castId:'enemy:7:1',sourceEnemyId:7,sourceEnemyKind:'poopGuardian',amount:25,strength:'medium'}),
  ]);
});
it('off-leash direct release도 250ms에 구조화된 보호소 요청을 낸다',()=>{
  const attack=attackSystemFor('offLeashGuardian'); const target=enemy({id:8,kind:'offLeashGuardian'});
  attack.step(0,target);
  expect(attack.step(250,target).find(e=>e.type==='shelterDamageRequested')).toMatchObject({
    castId:'enemy:8:1',sourceEnemyId:8,sourceEnemyKind:'offLeashGuardian',amount:50,strength:'medium',
    position:{x:270,y:480},impactDirection:expect.any(Object),
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/EnemySystem.test.ts tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts`
Expected: FAIL with missing `applyTailEffect`, `interruptWindup`, and legacy `stunnedMs` fields.

- [ ] **Step 3: Implement boundary-split movement and interrupt**

```ts
private advanceMoving(enemy: MutableEnemy, stepMs: number): void {
  let remaining=stepMs;
  while (remaining>TIME_EPSILON_MS) {
    const slowBoundary=enemy.slowRemainingMs>0?enemy.slowRemainingMs:Number.POSITIVE_INFINITY;
    const dashBoundary=enemy.kind==='offLeashGuardian'?enemy.dashCooldownRemainingMs:Number.POSITIVE_INFINITY;
    const slice=Math.min(remaining,slowBoundary,dashBoundary);
    enemy.pathProgress=Math.min(enemy.attackProgress,enemy.pathProgress+enemy.speed*enemy.moveSpeedMultiplier*slice/1000);
    enemy.slowRemainingMs=Math.max(0,enemy.slowRemainingMs-slice);
    enemy.dashCooldownRemainingMs=Math.max(0,enemy.dashCooldownRemainingMs-slice);
    remaining-=slice;
    if(enemy.slowRemainingMs===0) enemy.moveSpeedMultiplier=1;
    if(enemy.kind==='offLeashGuardian'&&enemy.dashCooldownRemainingMs===0){enemy.pathProgress=Math.min(enemy.attackProgress,enemy.pathProgress+64*enemy.moveSpeedMultiplier);enemy.dashCooldownRemainingMs=4000;}
  }
}
applyTailEffect(enemyId:number,effect:TailEffect):{interruptedWindup:boolean}{
  const enemy=this.enemies.get(enemyId); if(!enemy)return{interruptedWindup:false};
  const interruptedWindup=enemy.state==='windup'; const floor=enemy.kind==='dogTrader'?-70:0;
  enemy.pathProgress=Math.max(floor,enemy.pathProgress-Math.max(0,effect.knockbackPx));
  enemy.moveSpeedMultiplier=effect.multiplier; enemy.slowRemainingMs=Math.max(enemy.slowRemainingMs,effect.durationMs);
  if(interruptedWindup)enemy.state='moving'; return{interruptedWindup};
}
```

`spawnEnemy()` initializes only `dogTrader` at `pathProgress=-70`; all others remain `0`. Add `PathSystem.positionAtExtended(distancePx)` without changing clamped `positionAt()`: finite negative distance extrapolates along the normalized first segment, `0..length` delegates to `positionAt`, and values above length clamp to the final point. Enemy snapshots use the extended method, and ETA integration starts at the real negative progress so the 70px pre-entry time is included. `withSingleEnemy({initialProgress})` remains a test fixture factory option and is not exposed by `GameSession` or debug bridge.

```ts
interruptWindup(enemyId:number):boolean{
  const track=this.tracks.get(enemyId); if(track?.phase!=='windup')return false;
  track.phase='moving'; track.cycleMs=0; track.windupMs=0; return true;
}
```

Delete `stun()`, `stunnedMs`, the `stunned` track branch. `EnemyAttackSystem` computes each windup release with `attackImpactMs(balance.attackTiming)` instead of a global `250ms` constant. Each windup allocates `enemy:<enemyId>:<sequence>` once and carries that `castId` plus `kind` through start/cancel/holding/projectile request. Off-leash direct release creates a `ShelterDamageRequest` immediately; `ProjectileSystem` stores the same cast/source metadata and creates the same request shape alongside `projectileHit` on arrival. Both paths set `position` to the shelter impact point, normalize `impactDirection` from attack origin toward the shelter (zero-distance fallback `{x:0,y:-1}`), and map regular/boss attacks to `medium/heavy`. The attack config accepts `projectileOrigin?: AttackOriginResolver` and `releaseEvent()` uses `projectileOrigin?.(enemy) ?? enemy.position`; this pure injection seam lets the later dog-trader plan share hand-socket geometry without importing Phaser or a future rig into core. Released projectiles remain in `ProjectileSystem`. `estimateEtaMs()` copies progress/multiplier/slow/dash countdown and calls the same boundary integrator until `attackProgress`, so snapshot ETA includes the remaining slow interval.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/EnemySystem.test.ts tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts tests/unit/PathSystem.test.ts tests/unit/TargetingSystem.test.ts`
Expected: PASS for dog-trader -70 pre-entry/extended position/ETA, regular/boss slow renewal, dash distance, walking fps multiplier, unchanged attack cadence, 250/500ms release boundaries and finite ETA.

- [ ] **Step 5: Commit**

```bash
git add src/game/enemies src/game/combat/EnemyAttackSystem.ts src/game/combat/ProjectileSystem.ts src/game/data/balance.ts src/game/world/PathSystem.ts tests/unit/EnemySystem.test.ts tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts tests/unit/PathSystem.test.ts tests/unit/fixtures.ts
git commit -m "feat: replace stun with deterministic slows and dash movement"
```
### Task 4: Three auto-skill timelines and damage-applied contract

**Files:**
- Modify: `src/game/skills/SkillTypes.ts`, `src/game/skills/skillDefinitions.ts`, `src/game/skills/SkillSystem.ts`
- Modify: `src/game/combat/CombatTypes.ts`, `src/game/combat/CombatSystem.ts`
- Test: `tests/unit/SkillSystem.test.ts`, `tests/unit/CombatSystem.test.ts`

**Interfaces:**
- Consumes: `learn(skillId, learnedAtMs)`, current player/enemy snapshots
- Produces: `SkillTimelineEvent`, `DamageCommand`, `DamageAppliedEvent`; priority `tailSwipe → aquaBeam → safetyReport`

- [ ] **Step 1: Write failing timeline and damage tests**

```ts
it('같은 시각 ready면 priority대로 200ms 간격으로 시작하고 매번 표적을 재평가한다', () => {
  const s=new SkillSystem(); for(const id of ['safetyReport','aquaBeam','tailSwipe'] as const)s.learn(id,0);
  const c={player:{x:0,y:0},enemies:[enemy({id:1,currentHp:200,position:{x:10,y:0}})]};
  expect(s.step(22000,c).filter(e=>e.type==='skillCastStarted').map(e=>e.skillId)).toEqual(['tailSwipe']);
  expect(s.step(22200,c).filter(e=>e.type==='skillCastStarted').map(e=>e.skillId)).toEqual(['aquaBeam']);
  expect(s.step(22400,c).filter(e=>e.type==='skillCastStarted').map(e=>e.skillId)).toEqual(['safetyReport']);
});
it('aqua는 600ms 동안 한 번만 retarget하고 safety는 300ms snapshot 생존자만 친다', () => {
  const s=new SkillSystem(); s.learn('aquaBeam',0); const a=enemy({id:1,currentHp:200});
  s.step(10000,{player:{x:0,y:0},enemies:[a]});
  expect(s.step(10300,{player:{x:0,y:0},enemies:[enemy({id:2,currentHp:100})]}).some(e=>e.type==='skillTargetChanged')).toBe(true);
  expect(s.step(10600,{player:{x:0,y:0},enemies:[enemy({id:3,currentHp:300})]}).find(e=>e.type==='skillImpact'))
    .toMatchObject({targets:[]});
});
it('tail은 2.2H 경계를 포함하고 normal/boss 감속을 중첩 없이 갱신한다',()=>{
  const s=learnedSkillSystem('tailSwipe',0);
  const context={player:{x:0,y:0},enemies:[
    enemy({id:1,position:{x:158.4,y:0},isBoss:false}),
    enemy({id:2,position:{x:0,y:158.4},isBoss:true}),
  ]};
  s.step(8000,context);
  expect(s.step(8250,context).find(e=>e.type==='skillImpact'))
    .toMatchObject({targets:[{targetId:1},{targetId:2}]});
  expect(tailEffectFor(false)).toEqual({knockbackPx:35,multiplier:0.6,durationMs:1500});
  expect(tailEffectFor(true)).toEqual({knockbackPx:35,multiplier:0.8,durationMs:1000});
});
it('safety는 300ms 뒤 snapshot 생존 일반90/보스45를 같은 step에 만든다',()=>{
  const result=runSafetyTimeline([
    enemy({id:1,isBoss:false}),enemy({id:2,isBoss:true}),enemy({id:3,isBoss:false}),
  ],{removeBeforeImpact:[3]});
  expect(result.commands).toEqual([
    expect.objectContaining({targetId:1,amount:90,source:'safetyReport',strength:'heavy'}),
    expect.objectContaining({targetId:2,amount:45,source:'safetyReport',strength:'heavy'}),
  ]);
  expect(new Set(result.commands.map(c=>c.castId)).size).toBe(1);
  expect(new Set(result.appliedSteps).size).toBe(1);
});
it('effectiveAmount와 lethal을 appliedAtStep에 기록한다',()=>{
  const target={damage:()=>({effectiveAmount:10,position:{x:3,y:4},lethal:true,lifecycleEvents:[]})};
  const events=new CombatSystem(target).applyDamage([{castId:'bark:1',targetId:1,amount:18,impactDirection:{x:1,y:0},source:'bark',strength:'light'}],42);
  expect(events[0]).toMatchObject({type:'damageApplied',castId:'bark:1',appliedAtStep:42,amount:18,effectiveAmount:10,impactDirection:{x:1,y:0},lethal:true});
});
it('player damage source별 피드백 강도를 고정한다',()=>{
  expect(['bark','deokbae','tailSwipe','aquaBeam','safetyReport'].map(source=>impactStrengthFor(source as DamageSource)))
    .toEqual(['light','light','medium','heavy','heavy']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/SkillSystem.test.ts tests/unit/CombatSystem.test.ts`
Expected: FAIL because legacy levels/scold/howl resolve immediately and no `damageApplied` exists.

- [ ] **Step 3: Implement the timeline scheduler**

```ts
export const SKILL_DEFINITIONS={
  tailSwipe:{cooldownMs:8000,impactMs:attackImpactMs('normal'),damage:14},
  aquaBeam:{cooldownMs:10000,impactMs:600,damage:160},
  safetyReport:{cooldownMs:22000,impactMs:300,regularDamage:90,bossDamage:45},
} as const;
export const impactStrengthFor=(source:DamageSource):ImpactStrength=>({
  bark:'light',deokbae:'light',tailSwipe:'medium',aquaBeam:'heavy',safetyReport:'heavy',
} as const)[source];
const PRIORITY=['tailSwipe','aquaBeam','safetyReport'] as const;
step(nowMs:number,context:SkillContext):readonly SkillTimelineEvent[]{
  const events=this.advancePending(nowMs,context);
  if(nowMs+TIME_EPSILON_MS<this.nextGlobalCastAtMs)return events;
  const ready=PRIORITY.filter(id=>this.learned.has(id)&&this.readyAt[id]<=nowMs+TIME_EPSILON_MS)
    .sort((a,b)=>this.readyAt[a]-this.readyAt[b]||PRIORITY.indexOf(a)-PRIORITY.indexOf(b));
  for(const id of ready){const cast=this.startIfTargetExists(id,nowMs,context);if(!cast)continue;this.pending.push(cast);this.readyAt[id]=nowMs+SKILL_DEFINITIONS[id].cooldownMs;this.nextGlobalCastAtMs=nowMs+200;events.push(cast.started);break;}
  return events;
}
```

`startIfTargetExists('aquaBeam')` uses `rankHighestHpTargets`: current HP 내림차순, 동률이면 boss, 보호소 위협도, 거리, 생성 순서다. `advancePending` updates one aqua target at most once, resolves tail targets at impact within `158.4`, and resolves safety only against its stored id list without per-target timers. 모든 player/companion `DamageCommand`는 `impactStrengthFor(source)`를 사용하고, 공격 origin에서 target으로 향하는 normalized `impactDirection`을 고정하며 거리가 0이면 `{x:0,y:-1}`을 사용한다. `CombatSystem.applyDamage(commands, appliedAtStep)` clamps effective damage, passes that direction through one `damageApplied` before `enemyDied/snackEarned`, and deduplicates a target within one `castId`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/SkillSystem.test.ts tests/unit/CombatSystem.test.ts`
Expected: PASS for no-target ready preservation, cooldown-at-start, one retarget, simultaneous notice impacts and castId grouping.

- [ ] **Step 5: Commit**

```bash
git add src/game/skills src/game/combat/CombatTypes.ts src/game/combat/CombatSystem.ts tests/unit/SkillSystem.test.ts tests/unit/CombatSystem.test.ts
git commit -m "feat: add deterministic V2 auto skill timelines"
```
### Task 5: Exact wave schedules and seeded exhaustion path deck

**Files:**
- Create: `src/game/waves/PathDeck.ts`
- Modify: `src/game/waves/WaveTypes.ts`, `src/game/waves/WaveSystem.ts`
- Modify: `src/game/data/waveDefinitions.ts`, `src/game/data/validateGameData.ts`
- Test: `tests/unit/WaveSystem.test.ts`, `tests/unit/GameDataValidation.test.ts`

**Interfaces:**
- Consumes: `RandomSource.next()` and wave path sets
- Produces: `PathDeck.drawMany(count)` and existing `EnemySpawnRequest` with materialized `pathId`

- [ ] **Step 1: Write failing exact schedule/deck tests**

```ts
it('다섯 wave의 시간과 계열 총계를 exact하게 보존한다',()=>{
  expect(summarize(WAVE_DEFINITIONS)).toEqual([
    {poopGuardian:10,offLeashGuardian:0,dogTrader:0,illegalBreeder:0,times:[0,10,20,30,40]},
    {poopGuardian:6,offLeashGuardian:8,dogTrader:0,illegalBreeder:0,times:[0,9,18,27,36,45,56]},
    {poopGuardian:8,offLeashGuardian:10,dogTrader:0,illegalBreeder:0,times:[0,13,26,39,52,65]},
    {poopGuardian:4,offLeashGuardian:6,dogTrader:1,illegalBreeder:0,times:[0,20,40,68]},
    {poopGuardian:6,offLeashGuardian:8,dogTrader:0,illegalBreeder:1,times:[0,20,40,80,110]},
  ]);
});
it('한 event는 path를 중복하지 않고 deck 소진 뒤 seeded reshuffle한다',()=>{
  const deck=new PathDeck(['P1','P2'],new SeededRng(7));
  expect(new Set(deck.drawMany(2)).size).toBe(2); expect(new Set(deck.drawMany(2)).size).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/WaveSystem.test.ts tests/unit/GameDataValidation.test.ts`
Expected: FAIL with old sub-second schedules, wrong boss waves and missing `PathDeck`.

- [ ] **Step 3: Implement grouped schedule data and deck**

```ts
export const WAVE_DEFINITIONS=[
  {wave:1,pathIds:['P1','P2'],groups:[[0,2,0],[10,2,0],[20,2,0],[30,2,0],[40,2,0]]},
  {wave:2,pathIds:['P1','P2','P3','P4'],groups:[[0,1,1],[9,1,1],[18,1,1],[27,1,1],[36,1,1],[45,1,1],[56,0,2]]},
  {wave:3,pathIds:['P1','P2','P3','P4','P5','P6'],groups:[[0,1,2],[13,2,1],[26,1,2],[39,1,2],[52,2,1],[65,1,2]]},
  {wave:4,pathIds:['P1','P2','P3','P4','P5','P6'],groups:[[0,2,2],[20,1,2],[40,1,2],[68,0,0,'dogTrader']]},
  {wave:5,pathIds:['P1','P2','P3','P4','P5','P6'],groups:[[0,2,2],[20,1,2],[40,1,2],[80,0,0,'illegalBreeder'],[110,2,2]]},
] as const satisfies readonly WaveDefinition[];
export class PathDeck {
  private deck:PathId[]=[];
  constructor(private readonly paths:readonly PathId[],private readonly rng:RandomSource){}
  drawMany(count:number):readonly PathId[]{
    if(!Number.isSafeInteger(count)||count<0||count>this.paths.length)throw new RangeError('Invalid event path count');
    const selected:PathId[]=[];
    while(selected.length<count){if(this.deck.length===0)this.refill();const index=this.deck.findIndex(id=>!selected.includes(id));if(index<0){this.refill();continue;}selected.push(this.deck.splice(index,1)[0]!);}
    return selected;
  }
  private refill():void{this.deck=[...this.paths];for(let i=this.deck.length-1;i>0;i--){const j=Math.floor(this.rng.next()*(i+1));[this.deck[i],this.deck[j]]=[this.deck[j]!,this.deck[i]!];}}
}
```

`WaveSystem` interprets each group as `[seconds,poopCount,offLeashCount,bossKind?]`, multiplies seconds by `1,000`, alternates regular variants per family across the run, and lets only the wave-5 breeder consume the seeded boss variant.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/WaveSystem.test.ts tests/unit/GameDataValidation.test.ts`
Expected: PASS for totals `10`, `6+8`, `8+10`, `4+6+1`, `6+8+1`, path sets, no duplicate event path and deterministic reset.

- [ ] **Step 5: Commit**

```bash
git add src/game/waves src/game/data/waveDefinitions.ts src/game/data/validateGameData.ts tests/unit/WaveSystem.test.ts tests/unit/GameDataValidation.test.ts
git commit -m "feat: install exact five-wave schedule and path decks"
```
### Task 6: GameSession fixed-step integration and terminal priority

**Files:**
- Modify: `src/game/session/GameSession.ts`, `src/game/session/RunSnapshot.ts`, `src/game/session/RunOutcomeResolver.ts`
- Modify: `src/game/events/GameEvents.ts`, `src/game/core/GameStateMachine.ts`
- Delete: `src/game/progression/SkillCardPicker.ts`, `tests/unit/SkillCardPicker.test.ts`
- Test: `tests/unit/GameSession.test.ts`, `tests/unit/RunOutcomeResolver.test.ts`, `tests/unit/fixtures.ts`

**Interfaces:**
- Consumes: all Task 1–5 APIs and presentation-provided current `PlayerSnapshot`
- Produces: `queueSkillPurchase`, V2 `RunSnapshot`, `GameEvent`, `GameSessionDependencies`, strict step order and idempotent result

- [ ] **Step 1: Write failing integration and removal-contract tests**

```ts
it('purchase는 다음 fixed step 첫 단계에서 확정되고 world가 계속 돈다',()=>{
  const progression=new ProgressionSystem(); progression.addSnacks(40);
  const run=GameSession.create({seed:1},{progression});
  expect(run.queueSkillPurchase('tailSwipe')).toMatchObject({status:'queued',spent:0,snacks:40});
  const before=run.snapshot().simulationMs; const events=run.step(FIXED_STEP_MS,PLAYER);
  expect(events).toContainEqual({type:'skillPurchaseResolved',result:{status:'learned',skillId:'tailSwipe',cost:15,spent:15,snacks:25,nextCost:25}});
  expect(run.snapshot()).toMatchObject({mode:'playing',simulationMs:before+FIXED_STEP_MS,nextSkillCost:25});
});
it('tail impact가 같은 step attack release를 취소하고 이미 난 projectile은 유지한다',()=>{
  const events=runTailReleaseCollision();
  expect(events.findIndex(e=>e.type==='skillImpact')).toBeLessThan(events.findIndex(e=>e.type==='attackCancelled'));
  expect(events.some(e=>e.type==='shelterDamageRequested')).toBe(false);
});
it('패배와 최종 clear가 겹치면 한 번만 lost를 확정한다',()=>{
  const r=new RunOutcomeResolver(); expect(r.resolve({shelterHp:0,wave:5,active:0,pending:0})).toEqual({mode:'lost'});
  expect(r.resolve({shelterHp:1000,wave:5,active:0,pending:0})).toEqual({mode:'lost'}); expect(r.transitionCount).toBe(1);
});
it('wave 사이는 3000ms이고 lost result는 1200ms 뒤 한 번만 준비된다',()=>{
  const waveRun=runAtClearedWave(1); waveRun.step(FIXED_STEP_MS,PLAYER);
  expect(waveRun.countdownState()).toEqual({kind:'nextWave',remainingMs:3000});
  const shelter=new ShelterSystem(1); shelter.damage(1);
  const lost=GameSession.create({seed:2},{shelter}); lost.step(FIXED_STEP_MS,PLAYER);
  const early=Array.from({length:71},()=>lost.step(FIXED_STEP_MS,PLAYER)).flat();
  expect(early.some(e=>e.type==='resultReady')).toBe(false);
  expect(lost.step(FIXED_STEP_MS,PLAYER).filter(e=>e.type==='resultReady')).toHaveLength(1);
});
it('structured shelter request를 상세 shelterDamaged로 손실 없이 바꾼다',()=>{
  const event=runShelterImpact('dogTrader').find(e=>e.type==='shelterDamaged');
  expect(event).toMatchObject({
    castId:'enemy:41:1',sourceEnemyId:41,amount:120,effectiveAmount:120,
    position:{x:270,y:480},impactDirection:expect.any(Object),strength:'heavy',hp:880,maxHp:1000,
  });
});
it.each(['dogTrader','illegalBreeder'] as const)('%s lifecycle은 boss count 0↔1 event를 정확히 한 번씩 낸다',(kind)=>{
  const h=runWithSingleBoss(kind);
  expect(h.spawn()).toContainEqual({type:'bossActiveChanged',active:true,activeBossCount:1});
  expect(h.kill()).toContainEqual({type:'bossActiveChanged',active:false,activeBossCount:0});
  expect(h.allEvents().filter(e=>e.type==='bossActiveChanged')).toHaveLength(2);
});
it('RunSnapshot은 projectile actor가 소비하는 위치 snapshot을 보존한다',()=>{
  const run=runWithExistingProjectile();
  expect(run.snapshot().projectiles).toEqual([expect.objectContaining({id:expect.any(Number),x:expect.any(Number),y:expect.any(Number)})]);
  expect(run.snapshot().activeProjectileCount).toBe(run.snapshot().projectiles.length);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/GameSession.test.ts tests/unit/RunOutcomeResolver.test.ts`
Expected: FAIL with missing purchase API/events, old outcome `skillDue`, old card branches, or wrong transition timing.

- [ ] **Step 3: Implement the fixed order and public events**

```ts
export interface GameSessionDependencies {
  readonly progression?: ProgressionSystem;
  readonly shelter?: ShelterSystem;
  readonly projectileOriginByKind?: Partial<Record<EnemyKind, AttackOriginResolver>>;
}
step(stepMs:number,player:PlayerSnapshot):readonly GameEvent[]{
  assertFixedStep(stepMs); assertPlayer(player); if(!this.stateMachine.canStepWorld())return this.stepNonWorld(stepMs);
  this.simulationTicks+=1; const appliedAtStep=this.simulationTicks;
  const purchase=this.progression.consumeQueuedPurchase();
  if(purchase?.status==='learned'){this.skills.learn(purchase.skillId,this.simulationTimeMs());this.eventBuffer.push({type:'skillPurchaseResolved',result:purchase});}
  this.spawnWaveRequests(); this.enemies.step(FIXED_STEP_MS);
  const combatCommands:DamageCommand[]=[];
  this.collectBarkCommands(player,combatCommands); this.collectCompanionCommands(player,combatCommands);
  this.collectSkillCommands(player,combatCommands);
  const combatEvents=this.combat.applyDamage(combatCommands,appliedAtStep); this.applyLifecycleAndTailEffects(combatEvents);
  const shelterRequests:ShelterDamageRequest[]=[]; this.stepEnemyAttacks(FIXED_STEP_MS,shelterRequests); this.stepProjectiles(FIXED_STEP_MS,shelterRequests);
  this.applyShelterDamage(shelterRequests,appliedAtStep);
  const resolution=this.outcomes.resolve({shelterHp:this.shelter.currentHp,wave:this.waves.current,active:this.enemies.activeCount,pending:this.waves.pendingCount});
  this.applyResolution(resolution); this.refreshBossCountEvent(); return this.flushEvents();
}
queueSkillPurchase(skillId:PurchasableSkillId):SkillPurchaseResult{
  if(this.stateMachine.current()!=='playing'){const s=this.progression.snapshot();return{status:'queueBusy',skillId,cost:s.nextCost,spent:0,snacks:s.snacks,nextCost:s.nextCost};}
  return this.progression.queuePurchase(skillId);
}
```

`GameSession.create(input, dependencies={})` injects the progression instance and optional pure projectile-origin resolvers into attack systems; production defaults remain fresh progression and feet origin, so core compiles before the dog-trader module exists. `stepEnemyAttacks` and `stepProjectiles` append structured `ShelterDamageRequest` values, and `applyShelterDamage` preserves `castId/sourceEnemyId/position/impactDirection/strength` while adding `appliedAtStep/effectiveAmount/hp/maxHp/visual` to the emitted `shelterDamaged`. Emit `damageApplied` before death/reward, `bossActiveChanged` only at `0↔1`, and the exact `CoreCombatEvent` union. `RunSnapshot` exposes `shelterMaxHp:1000`, `nextSkillCost`, `learnedSkills`, `skillStates`, canonical `companion`, and the existing `ProjectileSystem.snapshot()` array as `projectiles`; `activeProjectileCount` must equal its length. Preserve the existing `UiTransitionClock` but remove only the skill-selection branch: next wave uses 3,000ms, lost result uses 1,200ms, won result is emitted once according to the approved outcome contract. Debug contract migration is deferred entirely to Integration Task 1.

- [ ] **Step 4: Run core regression and static removal gates**

Run: `npx vitest run tests/unit/Balance.test.ts tests/unit/ProgressionSystem.test.ts tests/unit/TargetingSystem.test.ts tests/unit/BarkSystem.test.ts tests/unit/CompanionSystem.test.ts tests/unit/EnemySystem.test.ts tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts tests/unit/CombatSystem.test.ts tests/unit/SkillSystem.test.ts tests/unit/WaveSystem.test.ts tests/unit/GameDataValidation.test.ts tests/unit/GameSession.test.ts tests/unit/RunOutcomeResolver.test.ts`
Expected: PASS.

Run: `rg -n "skillSelection|SkillCard|selectCard|deokbaeHowl|scold|stunned|stunnedMs" src/game/session src/game/core src/game/progression src/game/skills src/game/enemies/EnemyTypes.ts src/game/enemies/EnemySystem.ts src/game/combat/BarkSystem.ts src/game/combat/CombatSystem.ts src/game/combat/CombatTypes.ts src/game/combat/EnemyAttackSystem.ts src/game/combat/ProjectileSystem.ts src/game/combat/TargetingSystem.ts`
Expected: exit `1` and no output. Presentation-owned UI and Integration-owned debug/E2E paths are intentionally outside this core gate.

전체 TypeScript graph 검증은 legacy debug consumer를 V2로 바꾸는 Integration Task 1까지 의도적으로 유예한다.

- [ ] **Step 5: Commit**

```bash
git add src/game/session src/game/events/GameEvents.ts src/game/core/GameStateMachine.ts src/game/progression/SkillCardPicker.ts tests/unit
git commit -m "feat: orchestrate V2 core fixed-step combat"
```

## Cross-plan handoff gate
Core lands before presentation wiring; HUD consumes `nextSkillCost/learnedSkills/skillStates/companion` without optimistic mutation. Presentation computes Deokbae's visual pose; both Deokbae targeting and `companionAttack.origin` remain Huchu-based. Boss/audio consumes `damageApplied/enemySpawned/enemyDied/bossActiveChanged` and supplies a pure dog-trader `AttackOriginResolver` through `GameSessionDependencies`; `PATH_DEFINITIONS` remains waypoint arrays and boss plan exports separate `TRADER_SIDE_BY_PATH`. Final integrator owns debug migration and runs typecheck, unit, presentation/browser/audio and legacy-identifier gates.
