# 후추덕배 디펜스 V2 통합 검증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코어 전투, 프레젠테이션, 개장수 리그와 오디오 하위 계획을 하나의 재현 가능한 V2 실행 흐름으로 묶고 모바일 E2E·시각·성능·전체 회귀 검증을 통과시킨다.

**Architecture:** 프로덕션 규칙은 `GameSession`과 순수 TypeScript 시스템에 남기고, E2E 전용 `TestBridge`는 command 입력과 snapshot 관찰만 제공한다. 통합 검증은 고정 seed·수동 fixed-step을 사용하며 디버그 전용 hold와 오디오 가속 transport가 프로덕션 상태를 오염시키지 않도록 `import.meta.env.MODE === 'e2e'` 경계 안에 둔다.

**Tech Stack:** Node.js `>=22.12.0`, TypeScript `7.0.2`, Phaser `4.1.0`, Vite `8.1.5`, Vitest `4.1.10`, Playwright `1.61.1`, Sharp `0.35.3`, Web Audio API

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-20-huchu-defense-v2-design.md`이며 충돌 시 이 설계가 우선한다.
- 화면에 노출하는 이름은 정확히 `후추덕배 디펜스`이고 저장소명, package name과 배포 URL은 바꾸지 않는다.
- 논리 해상도 `540 × 960`, WebGL, `FIT`, 중앙 정렬, DPR 최대 2와 60Hz fixed-step을 유지한다.
- 게임 모드는 `playing | countdown | visibilityPause | won | lost`뿐이다. `skillSelection`과 카드·모달·재개 countdown은 존재하지 않는다.
- 구매 기술은 `tailSwipe | aquaBeam | safetyReport`, 비용은 습득 순서대로 `15/25/40`이며 한 simulation step에는 먼저 들어온 command 하나만 소비한다.
- 후추 기본 짖기는 피해 18, 간격 0.8초, 반경 `216 = 3H`, 120도 부채꼴이고 덕배는 시작부터 피해 11, 간격 1초로 동행한다.
- 보호소 최대 HP는 1,000이다. 활성 적 60, 투사체 80, 전투 이펙트 120, 피해 숫자 64, SFX voice 12, BGM voice 6을 넘지 않는다.
- 오디오는 외부 음원과 새 런타임 의존성 없이 Web Audio API로 합성한다.
- 모든 프로덕션 규칙 테스트는 실제 시간, `Math.random()`, DOM, Phaser와 AudioContext 구현체에 의존하지 않는다.
- 기존 baseline은 코드 테스트 443개가 통과하고 `tests/assets/asset-validation.test.ts`의 Sharp 기반 3개만 기본 5초 제한에서 timeout 된다. Presentation 계획의 asset-pipeline Task가 느린 통합 test에만 15초 제한을 지정한다.
- 모든 명령은 `/Users/jadon/Documents/huchu-defense/.worktrees/huchu-defense-mvp`에서 실행한다.

## Plan Bundle and Execution Order

1. `2026-07-20-huchu-defense-v2-core.md`
2. `2026-07-20-huchu-defense-v2-presentation.md`
3. `2026-07-20-huchu-defense-v2-boss-audio.md`
4. 이 문서의 통합 Task 1~4

구현을 시작하기 전 이 네 plan 문서 자체를 별도 문서 커밋으로 저장하고 `git status --short`가 비어 있는지 확인한다. 이 clean-worktree precondition이 충족되지 않으면 Task 구현이나 최종 `workingTreeDirty=false` 성능 gate를 시작하지 않는다.

세 하위 계획은 순서대로 실행한다. 각 문서 안의 Task는 한 worker가 구현하고 다른 worker가 spec compliance와 code quality를 각각 검토한 뒤 다음 Task로 넘어간다. 같은 파일의 수정을 병렬 실행하지 않는다. Primary owner 뒤에 오는 계획은 표에 적힌 injection seam만 추가하고 앞선 generic 구현을 되돌리지 않는다.

Core public 계약 변경부터 이 문서 Task 2의 E2E 이관까지는 legacy browser consumer가 의도적으로 중간 비호환 상태다. 따라서 앞선 세 계획은 각자 소유한 unit/asset/review gate만 통과시키고 `tests/e2e/*`를 수정하지 않는다. Task 1은 debug/lifecycle source와 그 단위 테스트를 이관하고, Task 2가 legacy E2E까지 교체한 뒤 `npm run typecheck`로 전체 source/test graph의 첫 compile gate를 연다.

| 경계 파일 | 최종 소유 계획 |
| --- | --- |
| `src/game/session/GameSession.ts`, domain types, wave/skill/enemy systems | Core |
| `src/game/scenes/GameScene.ts`, generic actor/HUD/impact view | Presentation primary; Boss & Audio may inject `CompositeEnemyRigFactory`, `projectileOriginByKind`, `AudioSystem`; Integration Task 1 may only extract the existing logical fixed step behind protected `stepLogicalWorld()` and replace input read with `MovementIntentPort`, preserving the production presentation path |
| `src/game/scenes/BootScene.ts`, `TitleScene.ts`, `HudSystem.ts`, lifecycle | Presentation primary UI; Boss & Audio installs lazy audio and `MutePort`/lifecycle adapters; Integration Task 1 may only select the e2e transport dependencies and install a read-only title audio probe under `MODE==='e2e'` |
| `src/game/enemies/DogTraderRig.ts`, `DogTraderAttackGeometry.ts`, `src/game/audio/*` | Boss & Audio |
| `src/game/debug/*`, `tests/e2e/*`, `tests/performance/*` | Integration |

## Cross-Plan Interface Ledger

하위 계획 구현자는 이 이름과 shape를 바꾸지 않는다.

```ts
export type GameMode = 'playing' | 'countdown' | 'visibilityPause' | 'won' | 'lost';
export type PurchasableSkillId = 'tailSwipe' | 'aquaBeam' | 'safetyReport';
export type EnemyState = 'moving' | 'windup' | 'holding' | 'dead';
export type DamageSource = 'bark' | 'deokbae' | PurchasableSkillId;
export type ImpactStrength = 'light' | 'medium' | 'heavy';
export type SkillCost = 15 | 25 | 40;

export interface SkillPurchaseCommand {
  readonly skillId: PurchasableSkillId;
}

export interface SkillPurchaseResult {
  readonly status: 'queued' | 'learned' | 'alreadyLearned' | 'insufficientSnacks' | 'queueBusy';
  readonly skillId: PurchasableSkillId;
  readonly cost: SkillCost | null;
  readonly spent: number;
  readonly snacks: number;
  readonly nextCost: SkillCost | null;
}

export interface CompanionSnapshot {
  readonly companion:'deokbae'; readonly active:true; readonly cooldownRemainingMs:number;
}

export interface DamageAppliedEvent {
  readonly type: 'damageApplied';
  readonly castId: string;
  readonly appliedAtStep: number;
  readonly targetId: number;
  readonly amount: number;
  readonly effectiveAmount: number;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly impactDirection: Readonly<{ x: number; y: number }>;
  readonly source: DamageSource;
  readonly strength: ImpactStrength;
  readonly lethal: boolean;
}

export interface AudioSnapshot {
  readonly state: 'locked' | 'running' | 'suspended' | 'silent';
  readonly muted: boolean;
  readonly sfxVoices: number;
  readonly bgmVoices: number;
  readonly totalVoices: number;
  readonly transportPhaseSteps: number;
  readonly bossLayerActive: boolean;
}

export interface RunSnapshot {
  readonly mode:GameMode; readonly simulationMs:number; readonly wave:1|2|3|4|5;
  readonly shelterHp:number; readonly shelterMaxHp:1000; readonly snacks:number;
  readonly nextSkillCost:SkillCost|null;
  readonly learnedSkills:Readonly<Record<PurchasableSkillId,boolean>>;
  readonly skillStates:Readonly<Record<PurchasableSkillId,SkillSnapshot>>;
  readonly companion:CompanionSnapshot; readonly enemies:readonly EnemySnapshot[];
  readonly projectiles:readonly ProjectileSnapshot[];
  readonly activeEnemyCount:number; readonly pendingSpawns:number; readonly activeProjectileCount:number;
}
```

`GameSession`의 통합 진입점은 다음과 같다.

```ts
export class GameSession {
  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[];
  queueSkillPurchase(skillId: PurchasableSkillId): SkillPurchaseResult;
  requestVisibilityPause(): void;
  requestVisibilityResume(): void;
  snapshot(): RunSnapshot;
  reset(seed: number): void;
}
```

`queueSkillPurchase()`는 command 하나를 예약하면 현재 비용을 `cost`와 `nextCost`에 넣은 `status='queued'`, `spent=0`을 반환하고 `status='learned'`를 미리 반환하지 않는다. 같은 frame의 첫 유효 요청만 queue에 넣고 추가 요청은 `queueBusy`로 돌려보낸다. 실제 간식 차감과 `{ type: 'skillPurchaseResolved', result: SkillPurchaseResult }`의 `status='learned'`는 다음 `step()` 경계에서 원자적으로 발생한다. UI는 반환값보다 다음 snapshot과 이벤트를 canonical state로 사용한다.

---

### Task 1: E2E debug contract를 V2 command와 telemetry로 이관

**Files:**
- Create: `src/game/player/MovementIntentPort.ts`
- Create: `src/game/debug/E2eAudioTestPort.ts`, `src/game/debug/E2eAudioStressLoadController.ts`, `src/game/debug/E2ePresentationStressController.ts`, `src/game/debug/E2eTitleAudioProbe.ts`
- Modify: `src/game/debug/E2eCombatEffectPool.ts`
- Modify: `src/game/scenes/GameScene.ts`, `src/game/scenes/BootScene.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `src/game/debug/ScenarioSessionPort.ts`
- Modify: `src/game/debug/TestBridge.ts`
- Modify: `src/game/debug/E2eEnemySystem.ts`
- Modify: `src/game/debug/E2eGameSession.ts`
- Modify: `src/game/debug/E2eGameScene.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Modify: `src/game/lifecycle/VisibilityController.ts`
- Modify: `src/game/lifecycle/WebGlRecoveryController.ts`
- Modify: `tests/unit/TestBridgeLifecycle.test.ts`
- Create: `tests/unit/MovementIntentPort.test.ts`, `tests/unit/E2eAudioTestPort.test.ts`, `tests/unit/E2eAudioStressLoadController.test.ts`, `tests/unit/E2ePresentationStressController.test.ts`
- Modify: `tests/unit/RunFactory.test.ts`
- Modify: `tests/unit/SimulationResolution.test.ts`
- Modify: `tests/unit/VisibilityController.test.ts`
- Modify: `tests/unit/WebGlRecoveryController.test.ts`
- Modify: `tests/unit/WorldPauseController.test.ts`
- Modify: `tests/unit/UiTransitionClock.test.ts`
- Modify: `tests/unit/fixtures.ts`

**Interfaces:**
- Consumes: Core의 `GameSession.queueSkillPurchase()`, `RunSnapshot`, `GameEvent`; Presentation의 `HudSnapshot`, `PresentationTelemetry.snapshot()`; Boss & Audio의 `AudioSnapshot`, `DogTraderRigTelemetryPort`, `AudioTransportClock`, `BgmVoiceSink`, `AudioSystem.tickTransport()`.
- Produces: Playwright가 사용할 `HuchuTestBridge.purchaseSkill()`, render-free movement batch, E2E 전용 가속 transport, 실제 64-number/120-effect stress driver, Title에서도 보이는 read-only audio probe와 단일 `GameDebugSnapshot`.

- [ ] **Step 1: V2 bridge 타입을 요구하는 failing test 작성**

`tests/unit/RunFactory.test.ts`에 다음 계약을 추가한다.

```ts
it('E2E run factory는 modal 없이 V2 구매와 companion snapshot을 노출한다', () => {
  const run = E2eGameSession.create({ seed: 424242 });

  expect(run.snapshot()).toMatchObject({
    shelterHp: 1000,
    companion: { companion:'deokbae', active: true },
    nextSkillCost: 15,
    learnedSkills: { tailSwipe:false, aquaBeam:false, safetyReport:false },
  });
  expect('selectCard' in run).toBe(false);
  expect(run.queueSkillPurchase('tailSwipe')).toMatchObject({ status:'insufficientSnacks',skillId:'tailSwipe',snacks:0,nextCost:15 });
});
it.each(['playing','countdown'] as const)('%s visibility 복귀는 명시적 확인 뒤 원래 mode로 돌아간다',(mode)=>{
  const h=createVisibilityHarness(mode); h.controller.hidden(); h.controller.visible();
  expect(h.controller.needsConfirmation).toBe(true); h.controller.confirmResume();
  expect(h.session.currentMode()).toBe(mode);
});
it.each(['playing','countdown','visibilityPause','won','lost'] as const)('%s만으로 V2 world pause 규칙을 결정한다',(mode)=>{
  const h=createWorldPauseHarness(mode); h.controller.sync();
  expect(h.lastPaused()).toBe(mode!=='playing');
});
it('UI clock은 countdown과 lost만 진행한다',()=>{
  expect(['playing','visibilityPause','won'].map(mode=>stepFreshClock(mode as GameMode))).toEqual(['running','running','running']);
  expect(stepFreshClock('countdown')).toBe('completed');
  expect(stepFreshClock('lost')).toBe('completed');
});
it('30 fixed step의 (1,0) 입력은 후추를 75px 이동시키고 batch 뒤 입력을 0으로 되돌린다',async()=>{
  const h=createBatchHarness({player:{x:270,y:480}});
  const beforeMs=h.bridge.snapshot().run.simulationMs;
  await h.bridge.advanceSimulationBatch(30,{x:1,y:0});
  expect(h.bridge.snapshot().player.x).toBeCloseTo(345,6);
  expect(h.bridge.snapshot().run.simulationMs-beforeMs).toBeCloseTo(500,9);
  expect(h.presentationCalls()).toEqual({render:0,dom:0,audio:0});
  await h.bridge.advanceSimulationBatch(1,{x:0,y:0});
  expect(h.bridge.snapshot().player.x).toBeCloseTo(345,6);
});
it('event cursor는 reset 뒤 1부터 시작하고 exclusive하게 읽는다',async()=>{
  const h=createBridgeHarness(); await h.bridge.loadScenario('bark-cone'); await h.bridge.advance(1000);
  const first=h.bridge.eventsSince(0); expect(first[0]?.sequence).toBe(1);
  const cursor=first.at(-1)!.sequence;
  expect(h.bridge.eventsSince(cursor).every(event=>event.sequence>cursor)).toBe(true);
  await h.bridge.loadScenario('empty-run');
  await h.bridge.loadScenario('bark-cone'); await h.bridge.advance(1000);
  expect(h.bridge.eventsSince(0)[0]?.sequence).toBe(1);
});
it('1.2 game seconds를 x64 transport로 진행하면 76.8초 loop를 정확히 한 바퀴 돈다',async()=>{
  const h=createE2eAudioHarness(); await h.audio.unlock(); h.audio.beginRun(); h.port.setAccelerated(true);
  h.port.advanceFromGameMs(1200);
  expect(h.audio.snapshot().transportPhaseSteps).toBeCloseTo(0,9);
});
it('가속을 요청하지 않은 E2E audio port는 실제 clock과 voice sink를 delegate한다',async()=>{
  const h=createE2eAudioHarness(); await h.audio.unlock(); h.audio.beginRun(); h.audio.tickTransport();
  expect(h.port.snapshot().mode).toBe('realtime');
  expect(h.realSink.scheduledCount).toBeGreaterThan(0);
});
it('E2E session은 GameScene의 dogTrader projectile-origin dependency를 보존한다',()=>{
  const hand={x:123,y:234};
  const run=E2eGameSession.create({seed:7},{projectileOriginByKind:{dogTrader:()=>hand}});
  expect(releaseDogTraderAttack(run)).toMatchObject({type:'projectileRequested',from:hand,projectileKind:'net'});
});
it('stress driver는 실제 sink에서 12/6 peak를 만들고 cap을 넘지 않는다',async()=>{
  const h=createRealtimeAudioStressHarness(); await h.driver.primeAtDownbeat(); h.advanceRealtime(3000);
  expect(h.driver.snapshot()).toMatchObject({generation:1,peakSfxVoices:12,peakBgmVoices:6,peakTotalVoices:18});
  expect(h.samples.every(s=>s.sfxVoices<=12&&s.bgmVoices<=6&&s.totalVoices<=18)).toBe(true);
  h.driver.reset(); expect(h.driver.snapshot()).toEqual({generation:2,peakSfxVoices:0,peakBgmVoices:0,peakTotalVoices:0});
});
it('presentation stress는 같은 pool에서 피해 숫자 64와 effect 120을 계속 유지한다',()=>{
  const h=createPresentationStressHarness(); const before=h.telemetry.snapshot(); h.controller.start(); h.controller.step(1000);
  const after=h.telemetry.snapshot();
  expect(after.damageNumbers).toMatchObject({instanceId:before.damageNumbers.instanceId,created:64,active:64});
  expect(after.effects).toMatchObject({instanceId:before.effects.instanceId,created:120,active:120});
  h.controller.reset(); expect(h.telemetry.snapshot().damageNumbers).toMatchObject({instanceId:before.damageNumbers.instanceId,active:0});
});
```

- [ ] **Step 2: 실패를 확인**

Run: `npm run test:unit -- tests/unit/RunFactory.test.ts tests/unit/TestBridgeLifecycle.test.ts tests/unit/SimulationResolution.test.ts tests/unit/MovementIntentPort.test.ts tests/unit/E2eAudioTestPort.test.ts tests/unit/E2eAudioStressLoadController.test.ts tests/unit/E2ePresentationStressController.test.ts tests/unit/VisibilityController.test.ts tests/unit/WebGlRecoveryController.test.ts tests/unit/WorldPauseController.test.ts tests/unit/UiTransitionClock.test.ts`

Expected: FAIL. `companion`, `nextSkillCost`, `tailSwipe` 또는 `queueSkillPurchase`가 기존 debug 계약에 없고 lifecycle tests/source에 제거된 `skillSelection` 분기가 남아 있다.

- [ ] **Step 3: debug-only hold와 V2 snapshot 타입 구현**

`src/game/debug/TestContract.ts`의 공개 계약을 다음 shape로 맞춘다.

```ts
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
  readonly player: Readonly<{x:number;y:number}>;
  readonly hud: HudSnapshot;
  readonly audio: AudioSnapshot;
  readonly audioStress:Readonly<{generation:number;peakSfxVoices:number;peakBgmVoices:number;peakTotalVoices:number}>|null;
  readonly traderRig: DogTraderRigTelemetrySnapshot;
  readonly pools: {
    readonly enemies: PoolSnapshot;
    readonly labels: PoolSnapshot;
    readonly projectiles: PoolSnapshot;
    readonly effects: PoolSnapshot;
    readonly damageNumbers: PoolSnapshot;
  };
  readonly listenerCount: number;
}

export type GameDebugEvent = GameEvent & {
  readonly sequence:number;
  readonly atSimulationMs:number;
};

export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  advanceSimulationBatch(stepCount:number,input:Readonly<{x:number;y:number}>):Promise<void>;
  purchaseSkill(id: PurchasableSkillId): Promise<SkillPurchaseResult>;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
  stepSceneOnceForTest(): void;
  restartScene(): void;
  setAcceleratedAudio(enabled: boolean): Promise<void>;
}

export interface HuchuAudioTestProbe {
  readonly ready:Promise<void>;
  snapshot():AudioSnapshot;
}
interface SessionScenePort {
  advanceLogicalBatchForTest(stepCount:number,input:Readonly<{x:number;y:number}>):readonly GameEvent[];
  dogTraderRigTelemetry():DogTraderRigTelemetrySnapshot;
  presentationStressPort():E2ePresentationStressPort;
}
interface E2ePresentationStressPort {
  start():void; step(stepMs:number):void; reset():void;
  snapshot():Readonly<{generation:number;damageNumbers:64;effects:120}>|null;
}
declare global {
  interface Window {
    __HUCHU_TEST__?:HuchuTestBridge;
    __HUCHU_AUDIO_TEST__?:HuchuAudioTestProbe;
  }
}
```

`E2eEnemySystem`의 `stunned` fixture는 프로덕션 `EnemyState`로 위장하지 않는다. 별도 `heldForDebug: Set<number>`를 두고 override한 `step()`에서 hold 대상의 progress를 복원한다.

```ts
override step(stepMs: number): void {
  const held = new Map(this.snapshots()
    .filter(({ id }) => this.heldForDebug.has(id))
    .map(({ id, pathProgress }) => [id, pathProgress]));
  super.step(stepMs);
  for (const [id, pathProgress] of held) {
    const enemy=this.enemies.get(id); if(enemy!==undefined) enemy.pathProgress=pathProgress;
  }
}
```

`E2eGameSession.create(input,deps)`는 Core의 `GameSessionDependencies` 전체를 production constructor로 forward한다. `E2eGameScene.createSession(seed)`는 Boss 계획이 GameScene에 둔 protected `sessionDependencies()`를 읽어 `E2eGameSession.create({seed},this.sessionDependencies())`를 호출한다. debug enemy/hold 기능을 추가해도 `projectileOriginByKind.dogTrader`를 feet origin으로 덮어쓰지 않는다.

`ScenarioFactory`에서 기존 `skill-selection`, `all-skills`와 `stunnedMs` seed를 제거한다. `skill-dock`은 간식 80과 정지된 debug 적 1명을, `boss-rig-p1`~`p6`는 해당 경로의 `pathProgress=-70` 개장수 1명을 만든다. `boss-rig-corner-p2`는 P2 개장수를 첫 south→southWest 8방향 전환 직전인 `pathProgress=150`에 두고 1.8초 동안 45px 진행시켜 누적 약 162px corner를 확실히 통과하게 한다. `boss-rig-attack-p2`는 공격 경계의 P2 개장수를 즉시 windup시켜 500ms 뒤 net projectile을 낸다. `boss-rig-feedback`은 후추의 현재 locked 방향과 부채꼴 안에 HP 18인 개장수 하나만 두어 다음 자연스러운 bark가 canonical damage→shared feedback→death/release를 일으키게 한다. 기존 `wave-schedule`은 spawn timing만 빠르게 보는 auto-clear probe로 유지하되, 새 `full-run`은 실제 `WaveSystem`/HP/피해/간식/공격을 그대로 사용하고 `enableWaveAutoClear()`·`removeEnemyWithoutReward()`·enemy hold를 절대 호출하지 않는다. `stress`는 적·이름표 60, 투사체 80, 이펙트 120, 피해 숫자 64를 계속 active로 유지하고 realtime audio driver로 실제 SFX/BGM 동시 voice peak `12/6`을 매 run 재현한다.

`MovementIntentPort`는 `read():MovementIntent`와 `reset():void`만 갖는다. `GameScene`은 keyboard 우선·joystick fallback을 구현한 production port를 기본 생성하고 모든 fixed step에서 오직 이 port를 읽는다. 기존 `advanceSimulationStep()` 안의 player controller + `GameSession.step()`만 protected `stepLogicalWorld(stepMs,intent):readonly GameEvent[]`로 추출한다. production `advanceSimulationStep()`은 이 logical method를 호출한 뒤 기존 `applySessionEvents`/visual clock/HUD/audio/render를 모두 그대로 수행한다.

`E2eGameScene`은 `MutableMovementIntentPort`를 주입하고 `advanceLogicalBatchForTest(stepCount,input)`에서 protected logical method를 직접 반복한다. bridge batch는 `full-run` scenario에서만 허용하고, `stepCount`를 정수 `1..60`으로 제한하며 input을 길이 1로 clamp한다. render/audio/DOM/presentation event adapter를 호출하지 않은 채 player controller와 `GameSession.step(FIXED_STEP_MS,player)`를 정확히 그 횟수만 진행하고 반환된 모든 canonical event를 bridge log에 순서대로 남긴다. batch 끝에는 `sessionSnapshot()`/`playerSnapshot()` 기반 logical telemetry만 한 번 갱신하고 `finally`에서 input을 `{x:0,y:0}`으로 되돌린다. full-run helper는 pool/HUD/audio snapshot을 읽지 않으며 다음 seed는 page를 새로 열기 때문에 의도적으로 생략한 presentation state를 재사용하지 않는다. 일반 시각 E2E는 기존 `advance(ms)`를 계속 사용한다. `GameDebugSnapshot.player`는 그 결과의 logical player 좌표다.

기존 오류복구·pool lifecycle E2E가 사용하는 `advanceWithoutFlush(ms)`, `stepSceneOnceForTest()`, `restartScene()`은 V2 계약에 그대로 보존한다. `restartScene()`은 기존 bridge를 dispose하고 새 Scene이 새 bridge를 설치하게 하며, `advanceWithoutFlush()`는 `stress`에서만 허용한다. `eventsSince(cursor)`는 항상 `sequence > cursor`인 이벤트만 반환한다. event log reset은 배열을 비우고 `nextSequence=1`로 되돌리므로 helper의 최초 cursor `0`이 첫 이벤트를 놓치지 않는다.

`E2eAudioTestPort`는 Boss & Audio 계획의 generic `AudioTransportClock`과 `BgmVoiceSink`를 감싼 switchable adapter다. 기본 mode에서는 production context clock과 실제 Web Audio voice sink를 그대로 delegate하므로 일반 E2E와 `stress` 성능 측정이 실제 node scheduling 비용을 포함한다. 이 realtime mode에서 `advanceFromGameMs()`는 clock을 인위적으로 전진시키지 않는 no-op이다. `setAcceleratedAudio(true)`가 호출될 때만 BGM이 현재 fractional phase를 저장하고 예약 source를 정리한 뒤 manual clock/node-free counting sink로 전환하며 scale 64를 쓴다. `false`는 같은 phase에서 production delegate로 복귀한다. accelerated bridge의 `advance()`, `advanceWithoutFlush()`와 `advanceSimulationBatch()`가 진행한 game ms를 port에 정확히 한 번 전달하고, port는 변환된 audio delta를 최대 25ms transport 구간으로 잘라 clock을 전진시키며 매 구간 `AudioSystem.tickTransport()`를 호출한다. 따라서 1.2초가 76.8초 loop가 되면서 lookahead scheduler도 건너뛰지 않는다. `MODE==='e2e'`가 아닌 production은 adapter 자체를 만들지 않는다.

`E2eTitleAudioProbe`는 그 `AudioSystem`을 read-only로 참조해 `window.__HUCHU_AUDIO_TEST__`에 `{ready,snapshot}`만 설치한다. `BootScene`에서 singleton audio를 registry에 넣은 직후 e2e mode에서 설치하므로 `TitleScene` 시작 버튼 전 `state:'locked'`, 클릭 뒤 Game bridge와 동일한 singleton의 `state:'running'`을 관찰한다. Scene restart는 probe/audio singleton을 교체하지 않으며 production build에는 전역을 설치하지 않는다.

`E2eAudioStressLoadController`는 `stress` scenario에서만 켜지는 realtime driver다. 보스 layer를 active로 둔 뒤 25ms마다 공개 `AudioSnapshot`을 관찰해 `bgmVoices===6`인 known bar downbeat(Boss `BgmSystem.test`가 보장)를 찾고, 그 callback 안에서 서로 다른 `SFX_IDS`/castId로 실제 SFX sink를 12까지 한 번에 채운다. bar 간격 2.4초와 4× throttle timer 여유를 포함해 첫 3,500ms 안에 6-voice downbeat를 보지 못하면 `primeAtDownbeat()`가 reject한다. `loadScenario('stress')`는 reset 직후 peak 세 값이 모두 0인지 내부 assert하고 새 `generation`을 발급한 다음, 측정에 반환하기 전에 `await driver.primeAtDownbeat()`를 수행한다. 이후 같은 방식의 burst를 각 bar downbeat에 반복한다. 모든 source는 기존 bus와 voice budget을 통과하며 private node나 cap을 우회하지 않는다. transient 특성상 매 순간 12/6을 강요하지 않고 `{peakSfxVoices,peakBgmVoices,peakTotalVoices}` high-water가 각 run에서 정확히 `12/6/18`에 도달했는지와 모든 sampled snapshot이 `<=12/<=6/<=18`인지 기록한다. scenario reset은 timer/예약 burst를 해제하고 세 peak counter를 `{0,0,0}`으로 clear한 뒤 generation을 증가시키며, destroy도 같은 cleanup을 수행한다.

`E2ePresentationStressController`는 `E2eGameScene`이 protected `damageFeedbackPoolForAdapters()`와 `E2eCombatEffectPool`로 만든 debug-only port를 받는다. start 시 서로 다른 targetId/position의 synthetic light `DamageAppliedEvent` 64개를 실제 `DamageFeedbackPool.show()`에 넣고 effect 120개를 채운다. fixed-step 누적 250ms마다 새 cast/target ids로 64개를 보충해 350ms lifetime 동안 active count가 64에서 떨어지지 않게 하고, 기존 `maintainStressPools()` 호출에서 projectile 80과 함께 실행한다. `reset()`은 producer를 교체하지 않고 damage/effect active slot과 누적 clock만 비운다. `E2eCombatEffectPool.ts`는 V2 `CombatEffectPool` API에 맞게 120개 실제 pooled effect를 seed/maintain하며 동일 instance를 보존한다.

`eventsSince()`는 새 객체를 재해석하지 않고 canonical `GameEvent`에 monotonic `sequence/atSimulationMs`만 붙인다.

`TestBridge.snapshot()`은 `PresentationTelemetry.snapshot()`의 `enemies/labels/projectiles/effects/damageNumbers`를 그대로 `pools`에 매핑하고 같은 snapshot의 `listenerCount`를 복사한다. HUD는 `HudSystem.snapshot():HudSnapshot`, audio는 공개 snapshot, `audioStress`는 stress controller가 활성일 때의 high-water 또는 null, trader는 Boss 계획의 `DogTraderRigTelemetryPort.snapshot()`을 사용하며 debug bridge가 actor-pool 내부 rig를 탐색하거나 shape를 다시 정의하지 않는다.

`VisibilityController.visible()`과 `WebGlRecoveryController.onRestored()`에서 `originalMode==='skillSelection'` 즉시복귀 분기를 삭제한다. `playing/countdown`은 항상 사용자 확인 뒤 coordinator reason을 해제하고, `won/lost`에서는 새 pause를 얻지 않는다. 두 reason이 겹치면 마지막 reason이 해제될 때 원래 `playing/countdown`으로 돌아간다. `WorldPauseController` tests는 `playing`만 unpaused이고 나머지 네 mode는 paused임을, `UiTransitionClock` tests는 `countdown/lost`만 시간을 소비함을 고정한다.

- [ ] **Step 4: V2 debug 단위 테스트 통과 확인**

Run: `npm run test:unit -- tests/unit/RunFactory.test.ts tests/unit/TestBridgeLifecycle.test.ts tests/unit/SimulationResolution.test.ts tests/unit/MovementIntentPort.test.ts tests/unit/E2eAudioTestPort.test.ts tests/unit/E2eAudioStressLoadController.test.ts tests/unit/E2ePresentationStressController.test.ts tests/unit/VisibilityController.test.ts tests/unit/WebGlRecoveryController.test.ts tests/unit/WorldPauseController.test.ts tests/unit/UiTransitionClock.test.ts`

Expected: PASS. debug hold는 snapshot의 `EnemyState`에 `stunned`를 노출하지 않고 reset 뒤 hold set과 telemetry가 비워지며 lifecycle에는 다섯 mode 외 분기가 없다.

- [ ] **Step 5: 이관 범위 커밋**

전체 typecheck는 아직 legacy `tests/e2e/skill-selection.spec.ts`와 구 bridge 호출이 남아 있으므로 Task 2의 E2E 이관 뒤 실행한다.

```bash
git add src/game/debug src/game/player/MovementIntentPort.ts src/game/scenes/GameScene.ts src/game/scenes/BootScene.ts src/game/lifecycle/VisibilityController.ts src/game/lifecycle/WebGlRecoveryController.ts tests/unit/RunFactory.test.ts tests/unit/TestBridgeLifecycle.test.ts tests/unit/SimulationResolution.test.ts tests/unit/MovementIntentPort.test.ts tests/unit/E2eAudioTestPort.test.ts tests/unit/E2eAudioStressLoadController.test.ts tests/unit/E2ePresentationStressController.test.ts tests/unit/VisibilityController.test.ts tests/unit/WebGlRecoveryController.test.ts tests/unit/WorldPauseController.test.ts tests/unit/UiTransitionClock.test.ts tests/unit/fixtures.ts
git commit -m "test: migrate V2 debug contract"
```

---

### Task 2: 모바일 E2E 흐름을 구매·부채꼴·이름표·보스·오디오 기준으로 교체

**Files:**
- Delete: `tests/e2e/skill-selection.spec.ts`
- Create: `tests/e2e/skill-dock.spec.ts`
- Create: `tests/e2e/boss-rig.spec.ts`
- Create: `tests/e2e/audio.spec.ts`
- Create: `tests/unit/E2eContractCutover.test.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/title-and-input.spec.ts`
- Modify: `tests/e2e/combat.spec.ts`
- Modify: `tests/e2e/health-bar-colors.spec.ts`
- Modify: `tests/e2e/gameplay-visuals.spec.ts` for V2 bridge/API cutover; Task 3 later updates only screenshot assertions/snapshots
- Modify: `tests/e2e/wave-schedule.spec.ts`
- Modify: `tests/e2e/lifecycle.spec.ts`
- Modify: `tests/e2e/error-recovery.spec.ts`
- Modify: `tests/e2e/full-run.spec.ts`
- Modify: `tests/e2e/test-bridge.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `HuchuTestBridge`, 세 하위 계획의 완성된 runtime.
- Produces: 모바일 브라우저에서 사용자 핵심 흐름을 고정하는 Playwright 회귀 테스트.

- [ ] **Step 1: legacy E2E cutover RED와 새 도크·부채꼴 acceptance 작성**

`tests/unit/E2eContractCutover.test.ts`는 `tests/e2e`의 `.ts` 파일을 읽어 `skillSelection|SkillCard|selectCard|deokbaeHowl|scold|stunned|stunnedMs`가 0건이고 `skill-selection.spec.ts`가 존재하지 않으며 `skill-dock.spec.ts`, `boss-rig.spec.ts`, `audio.spec.ts`가 존재해야 한다고 먼저 요구한다. 이 정적 test는 프로덕션 runtime에 포함하지 않는다.

`tests/e2e/skill-dock.spec.ts`의 핵심 흐름은 다음과 같다.

```ts
test('간식이 차도 멈추지 않고 먼저 누른 기술 하나를 배운다', async ({ page }) => {
  await openScenario(page, 'skill-dock');
  const before = await snapshot(page);
  await expect(page.getByRole('button', { name: /꼬리치기.*15/ })).toHaveAttribute('data-affordable','true');

  await page.evaluate(() => {
    (document.querySelector('[data-skill="tailSwipe"]') as HTMLButtonElement).click();
    (document.querySelector('[data-skill="aquaBeam"]') as HTMLButtonElement).click();
  });
  await advance(page, 1000 / 60);

  const after = await snapshot(page);
  expect(after.run.simulationMs).toBeGreaterThan(before.run.simulationMs);
  expect(after.run.learnedSkills).toMatchObject({ tailSwipe:true, aquaBeam:false });
  expect(after.run.snacks).toBe(before.run.snacks - 15);
  await expect(page.getByText('꼬리치기 습득!')).toBeVisible();
  await expect(page.locator('[data-ui="skill-selection"]')).toHaveCount(0);
});
```

같은 file에서 mobile project의 `390×844` 실제 DOM geometry를 수치로 고정한다.

```ts
test('HUD overlay는 Phaser scale 밖의 390px CSS 좌표에서 dock과 joystick이 겹치지 않는다',async({page})=>{
  await openScenario(page,'skill-dock');
  const box=async(selector:string)=>await page.locator(selector).boundingBox().then(value=>{if(!value)throw new Error(`missing ${selector}`);return value;});
  const root=await box('#game-root'), joystick=await box('[data-ui="virtual-joystick"]');
  const ring=await box('[data-ui="virtual-joystick-ring"]'), dock=await box('[data-ui="skill-dock"]');
  expect(root.width).toBeCloseTo(390,0); expect(root.height).toBeCloseTo(844,0);
  expect(joystick.width).toBeCloseTo(112,0); expect(joystick.height).toBeCloseTo(112,0);
  expect(ring.width).toBeCloseTo(92,0); expect(ring.height).toBeCloseTo(92,0);
  expect(root.x+root.width-(joystick.x+joystick.width)).toBeGreaterThanOrEqual(16);
  expect(dock.y-(joystick.y+joystick.height)).toBeGreaterThanOrEqual(16);
  for(const button of await page.locator('[data-ui="skill-dock"] button').all()){
    const b=await button.boundingBox(); expect(b!.width).toBeGreaterThanOrEqual(88); expect(b!.height).toBeGreaterThanOrEqual(56);
  }
});
```

`tests/e2e/title-and-input.spec.ts`는 joystick hit target 중심에서 오른쪽으로 drag해 logical player x가 증가하는지 확인하고 Scene restart 뒤 `.hud-overlay`가 정확히 1개인지 검사한다. 이 bbox/입력 test가 통과해야 screenshot review로 진행한다.

`tests/e2e/combat.spec.ts`에는 같은 release event에서 부채꼴 안 세 적의 HP가 18씩 줄고 바깥 적은 그대로인 시나리오를 넣는다. 모든 `damageApplied`가 같은 `castId`와 `appliedAtStep`을 가져야 한다.

- [ ] **Step 2: cutover RED 확인**

Run: `npm run test:unit -- tests/unit/E2eContractCutover.test.ts`

Expected: FAIL and print the exact legacy E2E files/identifiers plus missing V2 spec files. Core multi-hit와 Presentation HUD 자체는 이미 앞선 계획에서 구현됐으므로 이를 거짓 RED 원인으로 삼지 않는다.

- [ ] **Step 3: 보스·오디오·수명주기 E2E 작성**

`tests/e2e/boss-rig.spec.ts`는 P1~P6를 순회한다.

```ts
import { expect, test } from '@playwright/test';
import { PATH_DEFINITIONS, TRADER_SIDE_BY_PATH } from '../../src/game/data/pathDefinitions';
import { PathPoseSampler } from '../../src/game/world/PathPoseSampler';
import { dogTraderAttackOrigin } from '../../src/game/enemies/DogTraderAttackGeometry';
import type { GameDebugEvent, TestScenarioId } from '../../src/game/debug/TestContract';
import { advance, events, openScenario, snapshot } from './helpers';

for (const pathId of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const) {
  test(`${pathId} 개장수는 사람 앞·트럭 대각선 뒤를 유지한다`, async ({ page }) => {
    await openScenario(page, `boss-rig-${pathId.toLowerCase()}` as TestScenarioId);
    const rig=(await snapshot(page)).traderRig.active!; // first render is contractually snapped
    expect(isOutsideWorld(rig.human,540,960)).toBe(true);
    expect(isOutsideWorld(rig.truck,540,960)).toBe(true);
    const sampler=new PathPoseSampler(PATH_DEFINITIONS[pathId]);
    const human=sampler.sampleExtended(rig.pathProgress);
    const behind=sampler.sampleExtended(rig.pathProgress-70);
    const signedSide=TRADER_SIDE_BY_PATH[pathId]*28;
    const truck={x:behind.position.x+behind.normal.x*signedSide,y:behind.position.y+behind.normal.y*signedSide};
    expect(rig.pathId).toBe(pathId);
    expect(rig.parts).toEqual(2);
    expect(rig.gameplayEntityCount).toBe(1);
    expect(rig.human.x).toBeCloseTo(human.position.x,1);
    expect(rig.human.y).toBeCloseTo(human.position.y,1);
    expect(rig.truck.x).toBeCloseTo(truck.x,1);
    expect(rig.truck.y).toBeCloseTo(truck.y,1);
    expect(rig.followDistance).toBeCloseTo(70, 0);
    expect(rig.lateralDistance).toBeCloseTo(signedSide,0);
  });
}

test('corner 방향·mirror와 실제 bark의 두-part feedback/death를 노출한다',async({page})=>{
  await openScenario(page,'boss-rig-corner-p2');
  const before=(await snapshot(page)).traderRig.active!; await advance(page,1800);
  const after=(await snapshot(page)).traderRig.active!;
  expect({direction:after.humanDirection,flipX:after.humanFlipX})
    .toEqual(expectedDirectionAndFlip('human-walk',PATH_DEFINITIONS.P2,after.pathProgress));
  expect({direction:after.truckDirection,flipX:after.truckFlipX})
    .toEqual(expectedDirectionAndFlip('truck-roll',PATH_DEFINITIONS.P2,after.pathProgress-70));
  expect(after.humanDirection===before.humanDirection && after.humanFlipX===before.humanFlipX).toBe(false);
  await openScenario(page,'boss-rig-feedback'); await advance(page,900);
  expect((await snapshot(page)).traderRig).toMatchObject({active:null,lastSharedFeedbackParts:2,lastReleaseParts:2});
});
test('E2E 개장수 net은 feet가 아니라 방향별 hand socket에서 출발한다',async({page})=>{
  await openScenario(page,'boss-rig-attack-p2');
  const enemy=(await snapshot(page)).run.enemies.find(({kind})=>kind==='dogTrader')!;
  await advance(page,500);
  const release=(await events(page,0)).find((event):event is Extract<GameDebugEvent,{type:'projectileRequested'}>=>event.type==='projectileRequested'&&event.projectileKind==='net');
  expect(release).toMatchObject({from:dogTraderAttackOrigin(enemy)});
  expect(release?.from).not.toEqual(enemy.position);
});
```

P1~P6 좌표 비교는 scenario load의 첫 render가 contract상 snap되는 시점에서 수행해 120ms damping과 수동 clock을 혼합하지 않는다. `isOutsideWorld()`는 test-local pure geometry helper다. `expectedDirectionAndFlip()`은 production resolver를 호출하지 않고 test의 8구간 각도 table과 original/mirror table로 독립 계산한다. 따라서 rig snapshot에 상수 `followDistance/lateralDistance`만 써도 실제 사람·트럭 좌표, side 부호, corner 방향과 flip 검증을 우회할 수 없다.

`tests/e2e/audio.spec.ts`는 Title에서 `await window.__HUCHU_AUDIO_TEST__!.ready` 후 시작 전 `snapshot().state==='locked'`를 먼저 확인하고, `보호소 지키기` 클릭 뒤 Game bridge의 동일 audio snapshot이 `running`인지 확인한다. 이후 mute 저장, 보스 공유 layer, 임의 fractional visibility pause 뒤 다음 미재생 step과 voice cap을 검증한다. 실제 76.8초를 기다리지 않고 `setAcceleratedAudio(true)` 뒤 game time 1.2초를 진행한다. `gameplay-visuals.spec.ts`도 이 Task에서 카드/scold/all-skills bridge 호출을 V2 direct purchase/scenario로 먼저 이관하고, Task 3은 이미 V2인 파일의 screenshot locator와 baseline만 다룬다.

Files 목록의 기존 E2E는 모두 V2 bridge shape로 이관한다. `skill-selection.spec.ts`는 삭제하고, `combat/full-run/lifecycle/error-recovery/test-bridge` 안의 `forceModeForTest('skillSelection')`, 카드 선택, `scold/deokbaeHowl/stunned` fixture를 각각 direct purchase, five-state lifecycle, debug hold와 canonical `GameEvent` assertion으로 바꾼다. 금지 문자열을 주석이나 skip 이름으로 남겨 정적 cutover test를 우회하지 않는다.

`test-bridge.spec.ts`의 기존 restart/reset pool 재사용 검증은 삭제하지 않는다. enemy/projectile/effect의 `instanceId/created` 동일성에 새 labels/damageNumbers pool까지 추가하고, restart처럼 의도적으로 새 Scene을 만드는 경우에만 instanceId가 바뀌며 같은 Scene의 scenario reset 세 번에서는 모두 유지됨을 구분한다.

`tests/e2e/full-run.spec.ts`는 deterministic bot/input policy 하나를 고정하고 seed `[104729,130363,155921]`를 수동 fixed-step으로 끝까지 실행한다. 각 run은 68 spawn, 세 구매, 3,000ms inter-wave countdown, W4/W5 boss를 확인하고 world `simulationMs`와 countdown을 포함한 manual fixed-step `durationMs`를 함께 모은다. 6~8분 gate는 후자를 사용한다. `tests/e2e/helpers.ts`에 다음 exact helper를 둔다.

`full-run.spec.ts`의 이 test에는 `test.setTimeout(120_000)`을 설정한다. browser context 안에서 render-free 30-step batch를 사용하므로 세 seed 합계 최대 호출 수는 `3 × 540000 / 500 = 3,240`회이며 Playwright round-trip은 seed당 한 번의 `page.evaluate`뿐이다.

```ts
import type { PurchasableSkillId } from '../../src/game/types/GameTypes';

export interface FullRunResult {
  readonly outcome:'won'; readonly durationMs:number; readonly simulationMs:number;
  readonly shelterMaxHp:1000; readonly finalShelterHp:number; readonly spawnCount:number;
  readonly purchaseCount:number; readonly countdowns:readonly number[]; readonly bossKinds:readonly string[];
}
export async function runFullGame(page:Page,input:{seed:number;policy:'threat-orbit-v2'}):Promise<FullRunResult>{
  await openScenario(page,'full-run',input.seed);
  return page.evaluate(async ({seed})=>{
    const bridge=window.__HUCHU_TEST__!; const FIXED=1000/60, BATCH_STEPS=30, BATCH_MS=FIXED*BATCH_STEPS, LIMIT_MS=540_000;
    const order:PurchasableSkillId[]=['tailSwipe','aquaBeam','safetyReport'];
    let sequence=0,spawnCount=0,purchaseCount=0,elapsedMs=0; const countdowns:number[]=[]; const bossKinds=new Set<string>();
    const normalize=(x:number,y:number)=>{const length=Math.hypot(x,y);return length<1e-9?{x:0,y:0}:{x:x/length,y:y/length};};
    while(elapsedMs<LIMIT_MS){
      const snapshot=bridge.snapshot(), run=snapshot.run;
      if(run.mode==='won'||run.mode==='lost'){
        if(run.mode!=='won')throw new Error(`threat-orbit-v2 lost at ${run.simulationMs}`);
        return {outcome:'won' as const,durationMs:elapsedMs,simulationMs:run.simulationMs,shelterMaxHp:run.shelterMaxHp,finalShelterHp:run.shelterHp,spawnCount,purchaseCount,countdowns,bossKinds:[...bossKinds]};
      }
      const next=order.find(id=>!run.learnedSkills[id]);
      if(run.mode==='playing'&&next&&run.nextSkillCost!==null&&run.snacks>=run.nextSkillCost)await bridge.purchaseSkill(next);
      const threats=[...run.enemies].filter(e=>e.state!=='dead').sort((a,b)=>a.etaMs-b.etaMs
        || Number(b.state==='windup'||b.state==='holding')-Number(a.state==='windup'||a.state==='holding')
        || Number(b.isBoss)-Number(a.isBoss)||a.spawnSequence-b.spawnSequence);
      for(const enemy of threats)if(enemy.isBoss)bossKinds.add(enemy.kind);
      let move={x:0,y:0}; const target=threats[0];
      if(run.mode==='playing'&&target){
        const outward=normalize(target.position.x-270,target.position.y-480);
        const desired={x:target.position.x+outward.x*96,y:target.position.y+outward.y*96};
        const toward=normalize(desired.x-snapshot.player.x,desired.y-snapshot.player.y);
        const distance=Math.hypot(desired.x-snapshot.player.x,desired.y-snapshot.player.y);
        move=distance>24?toward:{x:-outward.y*(seed%2===0?1:-1),y:outward.x*(seed%2===0?1:-1)};
      }
      await bridge.advanceSimulationBatch(BATCH_STEPS,move);
      elapsedMs+=BATCH_MS;
      const events=bridge.eventsSince(sequence);
      for(const event of events){
        sequence=Math.max(sequence,event.sequence);
        if(event.type==='enemySpawned')spawnCount+=1;
        if(event.type==='skillPurchaseResolved'&&event.result.status==='learned')purchaseCount+=1;
        if(event.type==='waveTransition')countdowns.push(event.countdownMs);
      }
    }
    throw new Error('threat-orbit-v2 exceeded 540000 simulation ms');
  },{seed:input.seed});
}
```

```ts
const durations=[];
for(const seed of [104729,130363,155921]){
  const result=await runFullGame(page,{seed,policy:'threat-orbit-v2'});
  expect(result).toMatchObject({outcome:'won',shelterMaxHp:1000,spawnCount:68,purchaseCount:3,countdowns:[3000,3000,3000,3000]});
  expect(result.finalShelterHp).toBeGreaterThan(0);
  expect(result.durationMs-result.simulationMs).toBeGreaterThanOrEqual(12_000);
  expect(result.durationMs-result.simulationMs).toBeLessThan(12_500);
  expect([...result.bossKinds].sort()).toEqual(['dogTrader','illegalBreeder']);
  durations.push(result.durationMs);
}
const median=[...durations].sort((a,b)=>a-b)[1]!;
expect(median).toBeGreaterThanOrEqual(360_000);
expect(median).toBeLessThanOrEqual(480_000);
```

같은 spec은 보호소 HP 0과 최종 clear가 겹친 seed에서 lost가 우선하고 `resultReady(lost)`가 정확히 1,200ms 뒤 한 번만 나오는지 검증한다.

- [ ] **Step 4: 첫 전체 typecheck와 핵심 E2E 통과 확인**

Run: `npm run test:unit -- tests/unit/E2eContractCutover.test.ts && npm run typecheck && npm run test:e2e -- tests/e2e/title-and-input.spec.ts tests/e2e/combat.spec.ts tests/e2e/skill-dock.spec.ts tests/e2e/health-bar-colors.spec.ts tests/e2e/wave-schedule.spec.ts tests/e2e/boss-rig.spec.ts tests/e2e/audio.spec.ts tests/e2e/lifecycle.spec.ts tests/e2e/error-recovery.spec.ts tests/e2e/full-run.spec.ts tests/e2e/test-bridge.spec.ts --project=mobile-chromium`

Expected: TypeScript diagnostics 0 and all E2E PASS. 5웨이브 전체 실행은 총 68개 spawn, W4 개장수, W5 불법번식업자, 보호소 HP 1,000과 세 직접 구매를 관찰하고 세 seed 승리 시간 중앙값이 6~8분이다.

- [ ] **Step 5: 커밋**

```bash
git add tests/e2e tests/unit/E2eContractCutover.test.ts src/game/debug
git commit -m "test: cover V2 mobile game flow"
```

---

### Task 3: 390px 시각 승인 흐름 확정

**Files:**
- Modify: `scripts/assets/render-asset-review.mjs`
- Modify: `tests/visual/asset-review.spec.ts`
- Modify: `tests/e2e/gameplay-visuals.spec.ts`
- Replace: `tests/visual/__snapshots__/mobile-chromium/**/*.png`
- Replace: `tests/visual/__snapshots__/desktop-chromium/**/*.png`

**Interfaces:**
- Consumes: Presentation과 Boss & Audio 계획이 만든 animation manifest, asset verifier와 runtime actors.
- Produces: 머리:몸 비율, 외곽선, 방향·socket과 HUD 겹침을 실제 표시 크기로 판정하는 390px 승인판.

- [ ] **Step 1: review section contract의 failing test 작성**

`tests/visual/asset-review.spec.ts`에서 review 페이지의 필수 section을 먼저 고정한다.

```ts
const REQUIRED_REVIEW_SECTIONS = [
  'actors-at-390px',
  'walk-and-attack-frames',
  'tail-swipe-event-frame',
  'trader-directions-and-mirrors',
  'trader-event-sockets',
  'labels-hp-and-damage-numbers',
  'shelter-hp-and-skill-dock',
] as const;

for (const id of REQUIRED_REVIEW_SECTIONS) {
  await expect(page.locator(`[data-review-section="${id}"]`)).toBeVisible();
}
```

- [ ] **Step 2: RED 확인**

Run: `npm run assets:review && npx playwright test tests/visual/asset-review.spec.ts --project=mobile-chromium`

Expected: FAIL. 기존 review HTML에는 일곱 `data-review-section`이 없다.

- [ ] **Step 3: 390px 시각 review 판에 필수 overlay 구현**

`render-asset-review.mjs`가 다음 고정 섹션을 생성하도록 한다.

```js
export const reviewSections = [
  'actors-at-390px',
  'walk-and-attack-frames',
  'tail-swipe-event-frame',
  'trader-directions-and-mirrors',
  'trader-event-sockets',
  'labels-hp-and-damage-numbers',
  'shelter-hp-and-skill-dock',
];
```

각 section에는 manifest key, frame index, foot anchor, alpha bounds와 실제 CSS 표시 크기를 텍스트로 함께 그린다. 머리:몸 1:1, 다른 캐릭터 혼입과 1.5~2px 외곽선은 자동 수치만으로 승인하지 않고 이 판의 screenshot review 항목으로 남긴다.

- [ ] **Step 4: 에셋 검증, 후보 캡처의 명시적 승인, snapshot 갱신**

Run: `npm run assets:build`

Expected: exit 0, V2 runtime assets와 manifest 생성.

Run: `npm run assets:verify`

Expected: `Asset verification passed`와 실패 0건.

Run: `npm run assets:review`

Expected: review HTML/contact sheet가 생성되고 일곱 필수 section이 모두 존재.

Run: `npx playwright test tests/visual/asset-review.spec.ts tests/e2e/gameplay-visuals.spec.ts`

Expected before V2 baseline approval: screenshot mismatch는 새 `*-actual.png`를 `test-results`에 남긴다. 구조/locator assertion 실패는 후보로 취급하지 않고 먼저 수정한다.

`assets:review`의 mobile/desktop 390px actor·shelter 판과 Playwright가 만든 gameplay `actual.png`를 사용자에게 한 번에 보여 준다. 머리:몸 1:1, 캐릭터 혼입/잘림, 외곽선, 보호소 네 상태, HUD 겹침, 개장수 방향·트럭을 사람이 확인해 명시적으로 승인하기 전에는 baseline 파일을 덮어쓰거나 commit하지 않는다.

사용자 승인 뒤 Run: `npx playwright test tests/visual/asset-review.spec.ts tests/e2e/gameplay-visuals.spec.ts --update-snapshots`

Expected: mobile·desktop baseline이 승인된 V2 화면으로 교체되고 모든 snapshot test가 PASS.

승인 직후 Run: `npx playwright test tests/visual/asset-review.spec.ts tests/e2e/gameplay-visuals.spec.ts`

Expected: update option 없이 PASS. 이 non-update 재실행이 성공해야 Step 5로 진행한다.

- [ ] **Step 5: 단위 suite와 커밋**

Run: `npm run test:unit`

Expected: Presentation 계획에서 안정화한 Sharp test를 포함해 timeout 0건, 실패 0건.

```bash
git add scripts/assets/render-asset-review.mjs tests/visual tests/e2e/gameplay-visuals.spec.ts
git commit -m "test: stabilize V2 visual verification"
```

---

### Task 4: 모바일 성능 예산과 최종 release gate 확정

**Files:**
- Create: `tests/performance/PerformanceEnvironment.ts`
- Modify: `tests/performance/PerformanceWindow.ts`
- Modify: `tests/performance/performance.spec.ts`
- Modify: `tests/unit/PerformanceWindow.test.ts`
- Modify: `package.json`
- Modify: `tests/e2e/test-bridge.spec.ts`

**Interfaces:**
- Consumes: Task 1의 pool/audio/listener telemetry와 `stress` scenario.
- Produces: 4배 CPU throttle에서 3회 중앙값을 판정하고 환경 metadata를 남기는 단일 모바일 성능 gate.

- [ ] **Step 1: median과 strict low-streak failing test 작성**

`tests/unit/PerformanceWindow.test.ts`에 추가한다.

```ts
import { medianPerformanceRun, passesPerformanceBudget } from '../performance/PerformanceWindow';

it('세 번 측정의 중앙값과 strict 3초 미만 저하 구간을 요구한다', () => {
  expect(medianPerformanceRun([
    { medianFps: 54, maxLowStreakSeconds: 1.5 },
    { medianFps: 58, maxLowStreakSeconds: 2.9 },
    { medianFps: 56, maxLowStreakSeconds: 2.2 },
  ])).toEqual({ medianFps: 56, maxLowStreakSeconds: 2.9 });
  expect(passesPerformanceBudget({ medianFps: 55, maxLowStreakSeconds: 3 })).toBe(false);
});
```

- [ ] **Step 2: RED 확인**

Run: `npm run test:unit -- tests/unit/PerformanceWindow.test.ts`

Expected: FAIL. `medianPerformanceRun`과 `passesPerformanceBudget`가 없다.

- [ ] **Step 3: 성능 집계와 환경 attachment 구현**

`PerformanceWindow.ts`에 다음 순수 함수를 추가한다.

```ts
export interface PerformanceRun {
  readonly medianFps: number;
  readonly maxLowStreakSeconds: number;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('Median requires at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

export function medianPerformanceRun(runs: readonly PerformanceRun[]): PerformanceRun {
  if (runs.length !== 3) throw new RangeError('Exactly three performance runs are required');
  const fps = runs.map(({ medianFps }) => medianFps).sort((a, b) => a - b);
  return { medianFps: fps[1]!, maxLowStreakSeconds: Math.max(...runs.map(({maxLowStreakSeconds})=>maxLowStreakSeconds)) };
}

export function passesPerformanceBudget(run: PerformanceRun): boolean {
  return run.medianFps >= 55 && run.maxLowStreakSeconds < 3;
}
```

`analyzePerformanceWindow()`는 기존 `averageFps`만 판정하지 않고 `medianFps: median(oneSecondBuckets)`도 반환한다. `performance.spec.ts`는 각 30초 run의 `medianFps`를 `PerformanceRun`에 넣고, 세 run을 다시 `medianPerformanceRun()`으로 집계한다. FPS만 세 run 중앙값을 사용하고 low-FPS streak는 세 run의 최댓값을 사용해 한 번의 3초 이상 저하도 숨기지 않는다.

`PerformanceEnvironment.ts`는 `headCommit=git rev-parse HEAD`, `git status --porcelain` 기반 `workingTreeDirty`, 그리고 `src`, `tests/performance`, `package.json`, `playwright.config.ts`의 sorted relative path+bytes를 SHA-256한 `workspaceTreeSha256`을 함께 기록한다. 여기에 `os.platform()/release()`, `os.cpus()[0]?.model ?? 'unknown'`, `browser.version()`과 battery API 지원 여부를 JSON attachment로 반환한다. battery 정보는 Node 전역이 아니라 측정 대상 `page.evaluate()` 내부에서 `const batteryNavigator=navigator as Navigator & {getBattery?:()=>Promise<{charging:boolean;level:number}>}`로 좁힌 뒤 호출한다. 없으면 `powerState:'unavailable'`을 기록하고 실패시키지 않는다. 이 workspace hash는 untracked Task 파일까지 포함해 pre-commit 측정도 어떤 bytes였는지 식별한다.

`performance.spec.ts`는 mobile Chromium CDP session에서 다음을 먼저 호출하고 30초를 세 번 측정한다.

```ts
import { loadScenario, openScenario, snapshot } from '../e2e/helpers';

test('@perf V2 stress budget',async({page,browser},testInfo)=>{
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
test.setTimeout(150_000);
// browser.version()과 loadScenario('stress')는 이 fixture/import를 사용한다.
});
```

같은 spec은 `PERF_REQUIRE_CLEAN==='1'`일 때 environment attachment를 만들기만 하지 않고 `workingTreeDirty===false`와 attachment의 `headCommit===execFileSync('git',['rev-parse','HEAD']).trim()`을 assertion으로 강제한다. 기본 pre-commit 측정은 이 env가 없으므로 dirty metadata를 기록하되 실패시키지 않는다.

각 run 사이에는 `loadScenario('stress')`로 같은 pool을 재사용한다. 첫 run 시작 snapshot에서 다섯 pool의 `{instanceId,created}`와 `listenerCount`를 baseline으로 저장한다. 2·3 run의 시작과 각 run 끝 snapshot은 그 identity/created tuple 및 listener count가 baseline과 exact equality여야 하며 새 pool을 만들었다가 같은 active count만 채우는 구현은 실패한다. 각 측정 구간 전체에서 active count는 `enemies=60`, `labels=60`, `projectiles=80`, `effects=120`, `damageNumbers=64`다. 실제 Web Audio node는 transient이므로 매 frame exact 12/6을 요구하지 않는다. 대신 세 run의 `snapshot.audioStress.generation`이 서로 다른 양의 정수이고 각 run 끝 high-water가 정확히 `peakSfxVoices=12`, `peakBgmVoices=6`, `peakTotalVoices=18`이며, 1초마다 수집한 `snapshot.audio` 전체가 `sfx<=12`, `bgm<=6`, `total<=18`인지 assert한다. `PoolSnapshot.created`가 preallocated capacity이고 `active+available=created`인 기존 계약도 함께 assert한다.

`package.json`은 다음 script로 고정한다.

```json
"test:perf": "playwright test tests/performance --grep @perf --workers=1 --project=mobile-chromium"
```

- [ ] **Step 4: 성능 단위와 browser gate 통과 확인**

Run: `npm run test:unit -- tests/unit/PerformanceWindow.test.ts`

Expected: PASS.

Run: `npm run test:perf`

Expected: 세 run의 중앙값 FPS가 55 이상이고, 세 run 중 가장 긴 50fps 미만 연속 구간도 3초 미만이며 환경 JSON attachment가 생성된다.

- [ ] **Step 5: 전체 release gate와 커밋**

Run: `npm run typecheck`

Expected: PASS, TypeScript error 0.

Run: `npm run test:all`

Expected: asset verification/review, unit, build, E2E가 모두 PASS.

Run: `npm run test:perf`

Expected: PASS with 3-run median evidence.

Run: `rg -n "skillSelection|SkillCard|selectCard|deokbaeHowl|scold|stunned|stunnedMs" src/game`

Expected: exit 1, output 없음. 제거를 검증하는 test literal은 허용하되 production/debug source에는 남기지 않는 strict legacy gate다.

Run: `git diff --check`

Expected: output 없음, exit 0.

```bash
git add package.json tests/performance tests/unit/PerformanceWindow.test.ts tests/e2e/test-bridge.spec.ts
git commit -m "test: enforce V2 mobile performance budget"
```

커밋 직후 Run: `PERF_REQUIRE_CLEAN=1 npm run test:perf`

Expected: PASS and clean-mode assertion으로 final attachment의 `headCommit`이 현재 `git rev-parse HEAD`와 같고 `workingTreeDirty=false`; 최종 commit bytes에 대한 3-run median evidence가 남는다. 실패하면 완료로 보고하지 말고 수정 commit을 추가한 뒤 이 post-commit gate를 다시 실행한다.

마지막 커밋 뒤 `git status --short`, `git log --oneline --decorate -12`, `git diff --check HEAD^ HEAD`를 실행해 깨끗한 worktree와 Task별 커밋을 확인한다. 실제 모바일 Chrome 또는 Safari에서 5분 동안 조작·가독성·발열 smoke를 수행하고 기기·OS·브라우저·결과를 최종 handoff에 기록한다. 이 항목은 자동 Playwright 통과로 대체할 수 없는 수동 완료 gate이며, 실제 기기 증거가 없으면 구현 완료가 아니라 `device smoke pending`으로 보고한다.

## Specification Traceability

| V2 설계 절 | 구현 계획 |
| --- | --- |
| 1~2 목표·화면·조작 | Presentation + Integration Task 2 |
| 3 아트·애니메이션 | Presentation + Boss & Audio + Integration Task 3 |
| 4 HUD·기술 도크 | Presentation + Integration Task 2 |
| 5 기본 짖기 | Core + Integration Task 2 |
| 6 간식·비차단 습득 | Core + Presentation + Integration Task 2 |
| 7 자동 기술·덕배 | Core + Presentation |
| 8 적·개장수 | Core + Boss & Audio + Integration Task 2 |
| 9 웨이브 | Core + Integration Task 2 |
| 10 타격감 | Presentation + Boss & Audio |
| 11 오디오 | Boss & Audio + Integration Task 2 |
| 12~14 구조·우선순위·접근성 | 모든 계획 |
| 15 성능 | Integration Task 4 |
| 16 테스트·17 완료 기준 | Integration Task 1~4 |
| 18 제외 항목 | 모든 계획의 Global Constraints |
