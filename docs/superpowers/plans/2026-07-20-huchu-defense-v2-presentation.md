# 후추덕배 디펜스 V2 Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `540 × 960` 모바일 화면에서 후추·덕배·적·보호소·기술 UI와 모든 타격 결과가 작고 선명하며 같은 판정 순간에 읽히는 V2 프레젠테이션을 완성한다.

**Architecture:** 순수 presentation config와 JSON animation manifest를 Phaser view가 소비하고, `GameSession`이 낸 이벤트만 `GameScene`의 adapter가 DOM HUD·actor pool·impact pool로 전달한다. 덕배 follow는 gameplay 좌표를 바꾸지 않는 `CompanionView`, 이름표·HP·피격·사망은 pooled actor lifecycle, 기술 UI는 canvas와 분리된 DOM overlay로 구현한다.

**Tech Stack:** Phaser 4.1.0, TypeScript 7, Vite 8, Vitest 4, Playwright 1.61, Sharp 0.35, CSS safe-area env

## Global Constraints

- 화면과 브라우저에 보이는 게임명은 모두 정확히 `후추덕배 디펜스`이며 저장소명 `huchu-defense`, package name과 배포 URL은 바꾸지 않는다.
- 논리 해상도 `540 × 960`, `Phaser.Scale.FIT`, `CENTER_BOTH`, WebGL, antialias를 유지하고 `devicePixelRatio`는 `1..2`로 제한하며 `roundPixels=false`로 서브픽셀 이동을 보존한다.
- 맵은 저채도 녹색 면과 넓고 매끈한 황토색 길, 기존 여섯 진입점·분기·합류 topology를 유지하고 장식은 V1보다 약 85% 줄여 중앙 전투 공간을 비운다.
- 390px 폭에서 후추·덕배 `48~55px`, 일반 적 `58~64px`, 보스 `68~75px`, 보호소 `68~74px`; 사람과 강아지 머리:몸은 `1:1`, 최종 외곽선은 `1.5~2px`다.
- 모든 action sheet는 한 동작·한 캐릭터의 한 줄 RGBA PNG이며 프레임은 `256 × 256`; walk `6`, 일반 attack `6`, boss attack `8`, truck roll `4`다.
- manifest 필수값은 `key`, `frameCount`, `frameWidth`, `frameHeight`, `fps`, `loop`; attack은 `eventFrame`, `eventKind`까지 가진다.
- walk는 10fps, 6-frame attack은 12fps, 8-frame boss attack은 10fps; 6-frame 판정은 frame 3, 8-frame 판정은 frame 5다.
- 발 중심은 `origin(0.5, 1)`, 한 sheet의 발 anchor 오차 `±2px`, 중심 이동 `±3px`, 불투명 실루엣 점유율 `75~85%`를 검증한다.
- 범위 기준 `H`는 runtime alpha scan이 아니라 `HUCHU_PRESENTATION.opaqueHeightLogical=72`를 사용한다.
- 후추·덕배는 마지막 이동 facing을 공유하며 덕배 목표 pose는 뒤 `44`, 왼쪽 `18`, 시각 완충 `100ms`; spawn/reset/visibility 복귀/pool 재사용은 즉시 snap한다.
- 조이스틱은 390px 화면에서 ring `92 × 92px`, hit area `112 × 112px`, dead zone 15%; 오른쪽은 `max(16px, env(safe-area-inset-right))`, dock과 하단 간격은 `max(16px, env(safe-area-inset-bottom))`를 적용한다.
- 하단 dock은 좌우·하단 12px, 높이 68px, 간식 44px, 버튼 `88 × 56px` 이상이며 순서는 `꼬리치기`, `아쿠아빔`, `안전신문고`다.
- 적 이름표는 `똥 방치 보호자`, `오프리시 보호자`, `개장수`, `불법번식업자`; 이름 아래 actor, 이름 위 HP, 그 위 피해 숫자 순이다.
- 피해 숫자 pool 64, 공용 effect pool 120, enemy actor/label 60을 넘지 않고 frame마다 Text·DOM·timer를 만들지 않는다.
- 사망 gameplay 제거는 즉시, 시각 actor 반환은 `160ms`; 숫자는 `350ms` 상승하고 같은 적의 `120ms` 이내 피해를 합산한다.
- `prefers-reduced-motion`에서는 camera shake를 끄고 recoil 거리와 pop scale 초과분을 절반으로 줄인다.
- shader, runtime blur/filter, 새 runtime dependency, 피·신체 훼손·사실적 폭력을 추가하지 않는다.
- 개장수 방향 sheet/`DogTraderRig`와 Web Audio 구현은 별도 계획 소유다. 이 계획은 아래 포트만 주입받고 해당 구현 파일을 생성·수정하지 않는다.
- Core가 먼저 public 계약을 바꾼 뒤 Integration이 마지막에 debug bridge를 이관하므로 이 계획은 소유한 unit/asset/review test만 실행한다. `tests/e2e/*`, 전체 `npm run typecheck`, `npm run build`는 수정·실행하지 않고 Integration Task 1~3에 맡긴다.

---

## Cross-plan Interfaces

Core 계획이 먼저 제공하는 계약을 이름까지 그대로 소비한다.

```ts
export type PurchasableSkillId = 'tailSwipe' | 'aquaBeam' | 'safetyReport';
export type ImpactStrength = 'light' | 'medium' | 'heavy';
export interface DamageAppliedEvent {
  readonly type: 'damageApplied'; readonly castId: string; readonly appliedAtStep: number;
  readonly targetId: number; readonly amount: number; readonly effectiveAmount: number;
  readonly position: Point; readonly impactDirection: Point;
  readonly source: 'bark' | 'deokbae' | PurchasableSkillId;
  readonly strength: ImpactStrength; readonly lethal: boolean;
}
export interface CompanionSnapshot {
  readonly companion: 'deokbae'; readonly active: true; readonly cooldownRemainingMs: number;
}
queueSkillPurchase(skillId: PurchasableSkillId): SkillPurchaseResult;
```

- HUD는 `queued`를 눌림 접수로만 처리하고 `skillPurchaseResolved`의 `learned`와 다음 fixed-step snapshot 전에는 간식·버튼 상태를 낙관 변경하지 않는다.
- VFX는 core의 `barkImpact`, `companionAttackStarted`, `companionAttack`, `skillCastStarted`, `skillTargetChanged`, `skillImpact`, `damageApplied`, `shelterDamaged`를 소비한다. Phaser animation callback은 gameplay HP를 바꾸지 않는다.
- 이 계획이 먼저 `CompositeEnemyRig`, `CompositeEnemyRigFactory`와 `MutePort { muted(): boolean; toggle(): void; subscribe(listener): () => void }` 포트를 정의하고 no-op 기본 구현을 제공한다. 별도 보스·오디오 계획은 이 포트를 구현해 주입하며, Presentation은 아직 존재하지 않는 후속 모듈을 import하지 않는다.

```ts
export interface CompositeEnemyRig extends ImpactFeedbackTarget {
  render(snapshot: EnemySnapshot, deltaMs: number): void;
  humanAnchor(): Point;
  snapNextPose(): void;
  reset(): void;
}
export type CompositeEnemyRigFactory = (scene: Phaser.Scene) => CompositeEnemyRig;
export interface MutePort {
  muted(): boolean; toggle(): void; subscribe(listener:(muted:boolean)=>void):()=>void;
}
export interface HudSnapshot {
  readonly wave:1|2|3|4|5; readonly timeText:string; readonly snacks:number;
  readonly shelter:{current:number;maximum:1000;visual:'healthy'|'damaged'|'critical'|'failed'};
  readonly autoSkills:readonly {id:'bark'|'deokbae'|PurchasableSkillId;label:string;progress:number;ready:boolean}[];
  readonly dock:readonly {skillId:PurchasableSkillId;name:string;cost:SkillCost|null;learned:boolean;affordable:boolean;queued:boolean}[];
  readonly muted:boolean;
}
export interface PresentationTelemetrySnapshot {
  readonly enemies:PoolSnapshot; readonly labels:PoolSnapshot; readonly projectiles:PoolSnapshot;
  readonly effects:PoolSnapshot; readonly damageNumbers:PoolSnapshot; readonly listenerCount:number;
}
export class PresentationTelemetry {
  snapshot():PresentationTelemetrySnapshot;
  reset():void;
}
```

## File Structure and Ownership

- Create: `src/game/presentation/{PresentationConfig,ActorMotion,PresentationTelemetry}.ts`, `src/game/assets/AnimationManifest.ts`, `src/game/assets/character-animations.json`
- Create: `src/game/companions/CompanionView.ts`, `src/game/ui/AutoSkillHud.ts`, `src/game/ui/SkillDock.ts`, `src/game/ui/SkillIconSvg.ts`, `src/game/ui/ShelterHpView.ts`
- Create: `src/game/ui/MutePort.ts`, `src/game/enemies/ImpactFeedbackTarget.ts`, `src/game/enemies/CompositeEnemyRig.ts`, `scripts/assets/prepare-v2-character-sheets.mjs`, `scripts/assets/approve-v2-character-assets.mjs`, `scripts/assets/approval-ledger.mjs`
- Create: `src/game/enemies/{EnemyLabelView,EnemyLabelPool}.ts`, `src/game/combat/DamageFeedbackPool.ts`, `src/game/combat/ImpactFeedbackSystem.ts`
- Create: `assets/source/generated/v2/shelter-states.png`, `public/assets/shelter/shelter-states.png`
- Create: `tests/unit/PresentationConfig.test.ts`, `tests/unit/AnimationManifest.test.ts`, `tests/unit/CompanionView.test.ts`, `tests/unit/HudV2.test.ts`, `tests/unit/EnemyLabelView.test.ts`, `tests/unit/ImpactFeedbackSystem.test.ts`
- Modify: `index.html`, `src/styles.css`, `src/game/GameConfigSpec.ts`, `src/game/createGame.ts`, title/result scenes, `MapView`, `PlayerView`, `VirtualJoystick`, `ShelterView`, `HudSystem`, `TopHud`, `EnemyActor`, `EnemyActorPool`, `EnemyHpBar`, `CombatEffectPool`, `GameScene`, `PreloadScene` and asset/unit/visual-review tests.
- Delete in Task 4: `src/game/assets/SkillIconTextures.ts`, `src/game/ui/SkillSelectionModal.ts`, `src/game/ui/SkillHud.ts` and their three unit tests. Integration owns deletion/replacement of the legacy skill-selection E2E.
- Delete in Task 5: `src/game/ui/BossHud.ts`, `tests/unit/BossHud.test.ts`, superseded non-trader combined character sheets listed there.
- Do not touch: files that define `DogTraderRig`, directional resolver/manifest entries, `AudioSystem`, `SfxSystem`, `BgmSystem`, or `src/game/debug/*`.

### Task 1: Smooth viewport and exact game copy

**Files:**
- Create: `src/game/presentation/PresentationConfig.ts`
- Create: `tests/unit/PresentationConfig.test.ts`
- Modify: `src/game/GameConfigSpec.ts`, `src/game/createGame.ts`, `index.html`, `src/game/scenes/TitleScene.ts`, `src/game/scenes/ResultCopy.ts`, `src/game/scenes/ResultScene.ts`, `src/game/world/MapView.ts`
- Modify: `tests/unit/createGameConfig.test.ts`, `tests/unit/ResultScene.test.ts`

**Interfaces:**
- Produces: `HUCHU_PRESENTATION`, `clampDevicePixelRatio(raw: number): number`, `GAME_TITLE`.
- Consumes: no later-task interfaces.

- [ ] **Step 1: Write the RED config/copy tests**

```ts
expect(clampDevicePixelRatio(0.5)).toBe(1);
expect(clampDevicePixelRatio(3)).toBe(2);
expect(HUCHU_PRESENTATION).toMatchObject({
  logicalWidth: 540, logicalHeight: 960, opaqueHeightLogical: 72,
  dogOpaqueHeightLogical: 72, regularEnemyOpaqueHeightLogical: 84,
  bossOpaqueHeightLogical: 100, truckDisplayLogical:{width:142,height:86}, shelterOpaqueHeightLogical: 100,
});
expect(resultButtonLabel()).toBe('보호소 지키기');
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/PresentationConfig.test.ts tests/unit/createGameConfig.test.ts tests/unit/ResultScene.test.ts`

Expected: FAIL with `Cannot find module '../../src/game/presentation/PresentationConfig'` and the old `다시 시작` copy.

- [ ] **Step 3: Add the exact config and wire Phaser resolution**

```ts
export const GAME_TITLE = '후추덕배 디펜스' as const;
export const HUCHU_PRESENTATION = {
  logicalWidth: 540, logicalHeight: 960, maxDevicePixelRatio: 2,
  opaqueHeightLogical: 72, dogOpaqueHeightLogical: 72,
  regularEnemyOpaqueHeightLogical: 84, bossOpaqueHeightLogical: 100,
  truckDisplayLogical:{width:142,height:86}, shelterOpaqueHeightLogical: 100,
} as const;
export function clampDevicePixelRatio(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(2, Math.max(1, raw));
}
```

Phaser `4.1.0`의 `Phaser.Types.Core.GameConfig`에는 top-level `resolution`이 없으므로 존재하지 않는 옵션을 추가하지 않는다. Canvas backing store는 논리 `540 × 960`(effective ratio 1, 따라서 최대 2 이내)을 유지하고 `render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' }`를 사용한다. `clampDevicePixelRatio()`는 Phaser Text의 `setResolution()`과 review raster 출력에만 적용한다. Keep `FIT`, `CENTER_BOTH`, `540 × 960`, and WebGL.

Replace every visible title/root label with:

```html
<title>후추덕배 디펜스</title>
<main id="game-root" aria-label="후추덕배 디펜스"></main>
```

Title heading and both initial/restart buttons are `후추덕배 디펜스` and `보호소 지키기`; ResultScene includes the game title above the outcome. `MapView` remains one `540 × 960` image with no runtime tint/filter.

- [ ] **Step 4: Run GREEN viewport/copy unit tests**

Run: `npx vitest run tests/unit/PresentationConfig.test.ts tests/unit/createGameConfig.test.ts tests/unit/ResultScene.test.ts`

Expected: PASS; config에 지원되지 않는 `resolution` key가 없고 `roundPixels=false`, Text resolution≤2와 네 title surface의 `후추덕배 디펜스`가 검증된다. 실제 390×844 browser geometry는 Integration Task 2에서 검증한다.

- [ ] **Step 5: Commit**

```bash
git add index.html src/game/GameConfigSpec.ts src/game/createGame.ts src/game/presentation/PresentationConfig.ts src/game/scenes/TitleScene.ts src/game/scenes/ResultCopy.ts src/game/scenes/ResultScene.ts src/game/world/MapView.ts tests/unit/PresentationConfig.test.ts tests/unit/createGameConfig.test.ts tests/unit/ResultScene.test.ts
git commit -m "feat: establish v2 presentation viewport and copy"
```

### Task 2: Manifest-driven 256px action-sheet pipeline and review gate

**Files:**
- Create: `src/game/assets/AnimationManifest.ts`, `src/game/assets/character-animations.json`, `tests/unit/AnimationManifest.test.ts`
- Create: `scripts/assets/prepare-v2-character-sheets.mjs`, `scripts/assets/approve-v2-character-assets.mjs`, `scripts/assets/approval-ledger.mjs`
- Create binary sources: `assets/source/generated/v2/{huchu-walk,huchu-attack,huchu-tail-swipe,deokbae-walk,deokbae-attack,poop-male-walk,poop-male-attack,poop-female-walk,poop-female-attack,offleash-male-walk,offleash-male-attack,offleash-female-walk,offleash-female-attack,breeder-male-walk,breeder-male-attack,breeder-female-walk,breeder-female-attack}.png`
- Create binary source/runtime: `assets/source/generated/v2/shelter-states.png`, `public/assets/shelter/shelter-states.png`
- Create: `assets/source/map/map-v2-simple.svg`
- Modify: `scripts/assets/manifest.mjs`, `build-assets.mjs`, `verify-assets.mjs`, `render-asset-review.mjs`, `assets/source/generated-approvals.json`, `assets/source/provenance.json`, `src/game/assets/assetManifest.ts`, `src/game/scenes/PreloadScene.ts`, `package.json`
- Modify: `tests/assets/asset-pipeline.test.ts`, `tests/assets/asset-validation.test.ts`, `tests/visual/asset-review.spec.ts`

**Interfaces:**
- Produces: `AnimationManifestEntry`, `animationEntry(key)`, `animationFrameAt(entry, elapsedMs)`, `buildAnimationSheet`, `buildAnimationAssets`, `verifyAnimationSheet`.
- Consumes later: trader plan appends directional entries using the same generic fields; this task does not create them.

- [ ] **Step 1: Stabilize only the slow Sharp baseline and write RED manifest tests**

In `tests/assets/asset-validation.test.ts` add `const SHARP_INTEGRATION_TIMEOUT_MS = 15_000;` and pass it only to the `runtime asset freshness` `it`/`it.each` cases. Do not change Vitest global timeout.

```ts
expect(animationEntry('huchu-tail-swipe')).toMatchObject({
  frameCount: 6, frameWidth: 256, frameHeight: 256,
  fps: 12, loop: false, eventFrame: 3, eventKind: 'directHit',
});
expect(animationFrameAt(animationEntry('breeder-male-attack'), 500)).toBe(5);
const invalid = Object.assign({}, animationEntry('huchu-attack'), { eventFrame: 6 });
expect(() => validateAnimationEntry(invalid))
  .toThrow('eventFrame must be inside the sheet');
const mirror:AnimationManifestEntry={
  key:'virtual-east',action:'attack',frameCount:8,frameWidth:256,frameHeight:256,
  opaqueHeightPx:204,fps:10,loop:false,eventFrame:5,eventKind:'projectileRelease',
  direction:'east',mirrorOf:'source-west',eventSocket:{x:92,y:130},
};
expect(isSourceAnimationEntry(mirror)).toBe(false);
expect(runtimeTextureKeys([animationEntry('huchu-walk'),mirror])).toEqual(['huchu-walk']);
```

- [ ] **Step 2: Run RED with the explicit Sharp timeout**

Run: `npx vitest run tests/unit/AnimationManifest.test.ts tests/assets/asset-validation.test.ts --testTimeout=15000`

Expected: existing Sharp freshness cases pass within 15s; manifest test fails because `AnimationManifest.ts` does not exist.

- [ ] **Step 3: Add the concrete JSON and TypeScript contract**

Every JSON entry uses `frameWidth=256`, `frameHeight=256`, `opaqueHeightPx=204`. Add these exact keys: five dog sheets, eight regular-enemy sheets, four breeder sheets. Walk entries are `(6,10,true)`, normal attacks `(6,12,false,eventFrame=3)`, breeder attacks `(8,10,false,eventFrame=5)`; every attack has `eventKind` matching `directHit` or `projectileRelease`.

```json
[
  {"key":"huchu-walk","action":"walk","source":"assets/source/generated/v2/huchu-walk.png","url":"/assets/characters/huchu/walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"huchu-attack","action":"attack","source":"assets/source/generated/v2/huchu-attack.png","url":"/assets/characters/huchu/attack.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":12,"loop":false,"eventFrame":3,"eventKind":"directHit"},
  {"key":"huchu-tail-swipe","action":"tailSwipe","source":"assets/source/generated/v2/huchu-tail-swipe.png","url":"/assets/characters/huchu/tail-swipe.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":12,"loop":false,"eventFrame":3,"eventKind":"directHit"},
  {"key":"deokbae-walk","action":"walk","source":"assets/source/generated/v2/deokbae-walk.png","url":"/assets/characters/deokbae/walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"deokbae-attack","action":"attack","source":"assets/source/generated/v2/deokbae-attack.png","url":"/assets/characters/deokbae/attack.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":12,"loop":false,"eventFrame":3,"eventKind":"directHit"},
  {"key":"poop-male-walk","action":"walk","source":"assets/source/generated/v2/poop-male-walk.png","url":"/assets/characters/poop-guardian/male-walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"poop-male-attack","action":"attack","source":"assets/source/generated/v2/poop-male-attack.png","url":"/assets/characters/poop-guardian/male-attack.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":12,"loop":false,"eventFrame":3,"eventKind":"projectileRelease"},
  {"key":"poop-female-walk","action":"walk","source":"assets/source/generated/v2/poop-female-walk.png","url":"/assets/characters/poop-guardian/female-walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"poop-female-attack","action":"attack","source":"assets/source/generated/v2/poop-female-attack.png","url":"/assets/characters/poop-guardian/female-attack.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":12,"loop":false,"eventFrame":3,"eventKind":"projectileRelease"},
  {"key":"offleash-male-walk","action":"walk","source":"assets/source/generated/v2/offleash-male-walk.png","url":"/assets/characters/offleash-guardian/male-walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"offleash-male-attack","action":"attack","source":"assets/source/generated/v2/offleash-male-attack.png","url":"/assets/characters/offleash-guardian/male-attack.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":12,"loop":false,"eventFrame":3,"eventKind":"directHit"},
  {"key":"offleash-female-walk","action":"walk","source":"assets/source/generated/v2/offleash-female-walk.png","url":"/assets/characters/offleash-guardian/female-walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"offleash-female-attack","action":"attack","source":"assets/source/generated/v2/offleash-female-attack.png","url":"/assets/characters/offleash-guardian/female-attack.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":12,"loop":false,"eventFrame":3,"eventKind":"directHit"},
  {"key":"breeder-male-walk","action":"walk","source":"assets/source/generated/v2/breeder-male-walk.png","url":"/assets/characters/illegal-breeder/male-walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"breeder-male-attack","action":"attack","source":"assets/source/generated/v2/breeder-male-attack.png","url":"/assets/characters/illegal-breeder/male-attack.png","frameCount":8,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":false,"eventFrame":5,"eventKind":"projectileRelease"},
  {"key":"breeder-female-walk","action":"walk","source":"assets/source/generated/v2/breeder-female-walk.png","url":"/assets/characters/illegal-breeder/female-walk.png","frameCount":6,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":true},
  {"key":"breeder-female-attack","action":"attack","source":"assets/source/generated/v2/breeder-female-attack.png","url":"/assets/characters/illegal-breeder/female-attack.png","frameCount":8,"frameWidth":256,"frameHeight":256,"opaqueHeightPx":204,"fps":10,"loop":false,"eventFrame":5,"eventKind":"projectileRelease"}
]
```

```ts
export type AnimationEventKind = 'directHit' | 'projectileRelease';
export type AnimationDirection = 'north'|'northWest'|'west'|'southWest'|'south'|'northEast'|'east'|'southEast';
interface AnimationManifestBase {
  readonly key: string; readonly action: 'walk' | 'attack' | 'tailSwipe' | 'truckRoll';
  readonly frameCount: 4 | 6 | 8;
  readonly frameWidth: 256; readonly frameHeight: 256; readonly opaqueHeightPx: number;
  readonly fps: number; readonly loop: boolean; readonly eventFrame?: number;
  readonly eventKind?: AnimationEventKind; readonly direction?: AnimationDirection;
  readonly eventSocket?: Point;
}
export type AnimationManifestEntry = AnimationManifestBase & (
  | { readonly source:string; readonly url:string; readonly mirrorOf?:never }
  | { readonly mirrorOf:string; readonly source?:never; readonly url?:never }
);
export const isSourceAnimationEntry = (entry:AnimationManifestEntry):entry is AnimationManifestEntry & {source:string;url:string} => 'source' in entry;
export function animationFrameAt(entry: AnimationManifestEntry, elapsedMs: number): number {
  const frame = Math.floor((elapsedMs + 1e-7) / (1000 / entry.fps));
  return entry.loop ? frame % entry.frameCount : Math.min(entry.frameCount - 1, frame);
}
```

`buildAnimationSheet(entry,{sourceRoot,outputRoot})` accepts only `isSourceAnimationEntry(entry)`, validates exact `(frameCount × 256) × 256` RGBA dimensions, then losslessly recompresses to `public${entry.url}` without resize or frame rearrangement. Mirror entries are logical manifest rows only; the later dog-trader adapter resolves them to a source row plus `flipX`.

`assetManifest.ts` also exports the non-animation contract `SHELTER_V2={source:'assets/source/generated/v2/shelter-states.png',url:'/assets/shelter/shelter-states.png',frameCount:4,frameWidth:256,frameHeight:256,opaqueHeightPx:204}`. `ShelterView` later computes scale only as `HUCHU_PRESENTATION.shelterOpaqueHeightLogical / SHELTER_V2.opaqueHeightPx`.

- [ ] **Step 4: `imagegen`으로 17개 action strip과 V2 보호소 sheet 생성·정규화**

이 Step을 시작할 때 `imagegen` skill을 읽고 사용자에게 실제 V2 캐릭터 에셋 생성이 시작됨을 알린다. `view_image`로 `assets/source/characters/{huchu,deokbae,enemy-poop-male-base,enemy-poop-female-base,enemy-offleash-male,enemy-offleash-female,enemy-breeder-male,enemy-breeder-female}.png`를 먼저 확인한다. 각 캐릭터의 첫 walk 결과를 같은 캐릭터의 attack reference로 사용하고, 매 호출은 한 캐릭터·한 action만 만든다.

```text
Use case: stylized-concept
Asset type: 후추덕배 디펜스 모바일 2D action sprite strip
Canvas: perfectly flat #ff00ff background, exactly one horizontal row, equal cells, no text/logo/watermark/shadow
Style: 아기자기한 2D, two-step shading, head height : body height = 1 : 1; source outline은 dog 6~7px, regular human 5~6px, breeder boss 5px의 불투명 단색 rim으로 그려 최종 390px 표시에서 1.5~2px가 되게 함
Animation: fixed feet, constant silhouette, readable 60Hz in-between motion, no clipping or mixed character
Dog identity: 후추는 크림색 털·흰 주둥이/가슴·반쯤 접힌 귀·진한 눈·말린 꼬리; 덕배는 황갈색 긴 털·흰 가슴·세운 술 귀·풍성한 꼬리·민트색 옷
Enemy identity: poop 40대 남/여가 휘파람·딴청 후 똥을 집어 던짐; offleash 60대 남/여가 빈 목줄을 들고 무심히 걷고 문을 밂; breeder 50대 남/여가 현실 기기와 다른 과장된 가상 전기충격기를 충전·발사
Safety: fictional satire only, no real person, blood, gore, injury, dehumanization or realistic violence
Frames: [walk 6 | normal attack 6 with event on zero-based frame 3 | breeder attack 8 with event on zero-based frame 5]
```

17개 stem은 JSON key와 정확히 같고 반환물을 `tmp/imagegen/v2/chroma/<stem>.png`에 저장한다. chroma 제거 결과는 `tmp/imagegen/v2/alpha/<stem>.png`로 쓴다.

같은 batch에서 보호소만 별도 1회 생성한다. `4 equal horizontal cells, healthy/damaged/critical/failed, same small cozy dog shelter identity, cute flat mobile 2D, two-step shading, simple cream walls and mint roof, readable state changes without fire or realistic destruction, fixed ground anchor, source solid outline 5~6px, no text/logo/shadow, flat #ff00ff background`를 사용한다. 결과를 `tmp/imagegen/v2/chroma/shelter-states.png`, chroma 제거본을 `tmp/imagegen/v2/alpha/shelter-states.png`로 둔다. 기존 광원·재질감이 강한 `assets/source/generated/shelter-states-edit.png`는 V2 runtime에서 사용하지 않는다.

```bash
V2_STEMS=(huchu-walk huchu-attack huchu-tail-swipe deokbae-walk deokbae-attack poop-male-walk poop-male-attack poop-female-walk poop-female-attack offleash-male-walk offleash-male-attack offleash-female-walk offleash-female-attack breeder-male-walk breeder-male-attack breeder-female-walk breeder-female-attack)
for stem in "${V2_STEMS[@]}"; do python3 /Users/jadon/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input "tmp/imagegen/v2/chroma/$stem.png" --out "tmp/imagegen/v2/alpha/$stem.png" --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill; done
python3 /Users/jadon/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input tmp/imagegen/v2/chroma/shelter-states.png --out tmp/imagegen/v2/alpha/shelter-states.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

`prepare-v2-character-sheets.mjs`는 action strip을 manifest frameCount로 등분하고 캐릭터별 largest common trim box를 사용한다. 비율을 보존한 채 각 cell의 불투명 높이를 `204px`, 발 중심을 `(128,254)`에 맞추고, alpha가 cell edge에 닿지 않도록 1px 이상 남긴 뒤 정확한 source PNG 17개를 쓴다. 보호소도 네 state에 공통인 largest trim box를 비율 보존으로 한 번만 scale해 모든 cell의 공통 불투명 높이를 정확히 `204px`, 지면 anchor를 `(128,254)`에 맞추고 최종 sheet `1024×256`으로 만든다. 개별 state resize는 금지한다.

Run: `node scripts/assets/prepare-v2-character-sheets.mjs tmp/imagegen/v2/alpha assets/source/generated/v2`

Expected: character source PNG 17개와 `shelter-states.png`가 생성되고 각각 `frameCount*256 × 256`, `1024×256`, RGBA다.

- [ ] **Step 5: Implement asset verification and visual review**

`verifyAnimationSheet` must reject wrong dimensions/count, empty frame, alpha touching an edge, occupancy outside 75–85%, absolute foot anchor outside `254±2px`, within-sheet foot spread over 2px, center spread over 3px, mismatched event metadata, and Huchu rendered silhouette differing from logical 72 by over 2px. 공격 entry는 `eventFrame / fps * 1000`이 core의 normal `250ms` 또는 boss `500ms`와 일치해야 한다. Source/mirror union tests verify build/preload skips virtual files and resolves them to one source entry plus flip without a second texture. `verifyV2ShelterSheet()`는 `1024×256` RGBA, 네 non-empty state, 각 state opaque height `204px`, edge alpha 없음, 공통 ground anchor `254±2`, center spread≤3, 네 state pixel hash가 모두 다름과 runtime freshness를 요구한다. unit test는 `100/204` runtime scale과 `390/540` FIT scale을 적용한 불투명 높이 `72.22px`가 `68~74px` 안인지 네 state 모두 검사한다. `measureOutlineAt390()`은 32개 유효 scanline의 연속 dark-rim 중앙값을 dog/regular/breeder/shelter의 실제 목표 높이로 rasterize한 결과에서 측정해 `1.5~2px` 밖이면 reject한다. `render-asset-review.mjs` renders walk/attack/tail rows and all four shelter states at 390px viewport scale with anchor, opaque bounds and measured outline overlays; Playwright expects exactly 17 generic sheets plus one V2 shelter sheet. 자동 검증에 더해 머리:몸 1:1, 캐릭터 혼입, 신체 잘림, 보호소 네 상태 판독성, 외곽선과 행동 식별성은 사람 눈으로 판정한다. Trader rows are asserted only by the separate directional-rig plan.

Create this exact flat source and rasterize it to `public/assets/map/map-background.webp` at `1080 × 1920`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 960">
  <rect width="540" height="960" fill="#84ad74"/>
  <g fill="none" stroke="#cfa66d" stroke-width="54" stroke-linecap="round" stroke-linejoin="round">
    <path d="M110 0L116 75L138 159L222 214L264 265L270 350L270 430"/>
    <path d="M430 0L424 75L402 159L318 214L276 265L270 350L270 430"/>
    <path d="M270 0L270 110L270 220L270 340L270 430"/>
    <path d="M0 482L90 482L170 445L220 420L240 447L220 480"/>
    <path d="M540 482L450 482L370 445L320 420L300 447L320 480"/>
    <path d="M270 960L270 875L270 790L270 704L270 625L270 530"/>
  </g>
  <g fill="#668d5d"><circle cx="18" cy="110" r="11"/><circle cx="522" cy="205" r="9"/><circle cx="22" cy="825" r="10"/><circle cx="516" cy="890" r="12"/></g>
</svg>
```

- [ ] **Step 6: Build, review, 명시적 승인 후 GREEN**

Run: `npm run assets:build && npm run assets:verify && npm run assets:review && npx vitest run tests/unit/AnimationManifest.test.ts tests/assets --testTimeout=15000 && npx playwright test tests/visual/asset-review.spec.ts`

Expected: `assets:verify` prints `Verified 17 generic animation sheets and 1 shelter sheet`; unit/assets tests pass; review screenshot has no clipped body, mixed character, anchor drift, frame-size jump, or unreadable shelter state. 승인판을 사용자에게 한 번에 보여 준 뒤 승인된 경우에만 `node scripts/assets/approve-v2-character-assets.mjs`가 실제 18개 bytes의 SHA-256을 `generated-approvals.json`에 기록하고 `provenance.json`에 `provider:imagegen`, reference source와 생성일을 쓴다. 수정 요청이 있으면 해당 캐릭터/action 또는 보호소만 다시 생성하고 전체 검증을 반복한다.

두 ledger writer는 overwrite script가 아니다. `approve-v2-character-assets.mjs`는 기존 JSON을 읽고 자기 18개 source key만 upsert하며 unrelated/trader key를 보존하고 전체 key를 stable lexical sort한다. 같은 directory의 임시 파일을 완전히 쓴 뒤 atomic rename으로 두 ledger를 각각 교체한다. `asset-pipeline.test.ts`는 seeded `foreign-entry`를 둔 temp ledger에서 script core를 실행해 foreign entry 보존, 18개 upsert, stable order와 재실행 idempotence를 검증한다. 뒤의 dog-trader approval script도 동일 helper/계약을 재사용한다.

사용자 승인 뒤 Run: `node scripts/assets/approve-v2-character-assets.mjs && npm run assets:verify && npx vitest run tests/assets/asset-pipeline.test.ts tests/assets/asset-validation.test.ts tests/unit/AnimationManifest.test.ts --testTimeout=15000`

Expected: 승인 script가 18개 source의 hash/provenance를 기록하고 post-approval verification과 approval/freshness tests가 모두 PASS. 이 명령이 성공하기 전에는 Step 7 commit으로 넘어가지 않는다.

- [ ] **Step 7: Commit**

```bash
git add package.json assets/source/generated/v2 assets/source/map/map-v2-simple.svg assets/source/generated-approvals.json assets/source/provenance.json public/assets/characters/huchu public/assets/characters/deokbae public/assets/characters/poop-guardian public/assets/characters/offleash-guardian public/assets/characters/illegal-breeder public/assets/shelter/shelter-states.png public/assets/map/map-background.webp src/game/assets/AnimationManifest.ts src/game/assets/character-animations.json src/game/assets/assetManifest.ts src/game/scenes/PreloadScene.ts scripts/assets/prepare-v2-character-sheets.mjs scripts/assets/approve-v2-character-assets.mjs scripts/assets/approval-ledger.mjs scripts/assets/manifest.mjs scripts/assets/build-assets.mjs scripts/assets/verify-assets.mjs scripts/assets/render-asset-review.mjs tests/assets tests/unit/AnimationManifest.test.ts tests/visual/asset-review.spec.ts
git commit -m "feat: add manifest-driven v2 animation assets"
```

### Task 3: Huchu animation sizing and Deokbae CompanionView

**Files:**
- Create: `src/game/companions/CompanionView.ts`, `src/game/presentation/ActorMotion.ts`, `tests/unit/CompanionView.test.ts`
- Modify: `src/game/player/PlayerView.ts`, `src/game/scenes/GameScene.ts`, `src/game/assets/AssetKeys.ts`, `tests/unit/PresentationRules.test.ts`
- Delete runtime only: `public/assets/characters/huchu.png`, `public/assets/characters/deokbae.png`

**Interfaces:**
- Consumes: core `CompanionSnapshot`, `barkStarted/barkImpact`, and Task 2 `animationEntry/animationFrameAt`.
- Produces: `companionTargetPose(player,facing)`, `smoothCompanionPose(current,target,deltaMs)`, `secondaryMotionAt(elapsedMs,reducedMotion)`, `CompanionView.render/reset/destroy`.

- [ ] **Step 1: Write RED pure pose and lifecycle tests**

```ts
expect(companionTargetPose({ x: 270, y: 650 }, { x: 1, y: 0 }))
  .toEqual({ x: 226, y: 632 });
expect(smoothCompanionPose({ x: 0, y: 0 }, { x: 100, y: 0 }, 100).x)
  .toBeCloseTo(63.212, 3);
view.reset({ player: { x: 270, y: 650 }, facing: { x: 0, y: -1 } });
expect(view.snapshot().position).toEqual({ x: 252, y: 694 });
expect(secondaryMotionAt(50,false)).toMatchObject({bobY:expect.any(Number),tiltRad:expect.any(Number)});
expect(Math.abs(secondaryMotionAt(50,true).bobY))
  .toBeCloseTo(Math.abs(secondaryMotionAt(50,false).bobY)/2,6);
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/CompanionView.test.ts tests/unit/PresentationRules.test.ts`

Expected: FAIL because `CompanionView.ts` and six-frame dog rendering do not exist.

- [ ] **Step 3: Implement exact follow math and manifest rendering**

```ts
export function companionTargetPose(player: Point, facing: Point): Point {
  const length = Math.hypot(facing.x, facing.y) || 1;
  const forward = { x: facing.x / length, y: facing.y / length };
  const left = { x: forward.y, y: -forward.x };
  return { x: player.x - forward.x * 44 + left.x * 18,
    y: player.y - forward.y * 44 + left.y * 18 };
}
export function smoothCompanionPose(current: Point, target: Point, deltaMs: number): Point {
  const alpha = 1 - Math.exp(-deltaMs / 100);
  return { x: current.x + (target.x - current.x) * alpha,
    y: current.y + (target.y - current.y) * alpha };
}
export function secondaryMotionAt(elapsedMs:number,reducedMotion:boolean):SecondaryMotion {
  const phase=elapsedMs/1000*Math.PI*4, factor=reducedMotion?0.5:1;
  return {bobY:-Math.abs(Math.sin(phase))*1.5*factor,
    tiltRad:Math.sin(phase)*0.018*factor,
    scaleY:1-Math.abs(Math.sin(phase))*0.025*factor};
}
```

GameScene stores the last non-zero normalized movement facing, defaults to `{x:0,y:-1}`, and passes render delta separately from fixed-step gameplay. `PlayerView` and `CompanionView` use manifest scale `targetOpaqueHeightLogical / opaqueHeightPx`, feet origin, y-depth and 6-frame walk/attack. `companionAttackStarted` starts Deokbae's sheet and `companionAttack` is the matching frame-3 impact; the view never changes damage timing. `secondaryMotionAt` applies 60Hz body bob/tilt/squash as a child-sprite offset while the root feet/world position stays unchanged; ear/tail motion remains in the six source frames. Add a 30/60/120fps partition test that advances the same 1,000ms and compares the final pose within `1e-6`. Reset, visibility resume and scene reuse call `reset` before the first render so no easing from `(0,0)` occurs. 기존 source images remain reference/provenance inputs but are removed from preload/runtime manifests.

- [ ] **Step 4: Run GREEN duo motion tests**

Run: `npx vitest run tests/unit/CompanionView.test.ts tests/unit/PresentationRules.test.ts`

Expected: PASS; manifest sizing computes 48–55px dogs and Deokbae stays behind-left without frame-rate-dependent lag. Start-frame browser evidence is Integration Task 2~3의 책임이다.

- [ ] **Step 5: Commit**

```bash
git add src/game/companions/CompanionView.ts src/game/presentation/ActorMotion.ts src/game/player/PlayerView.ts src/game/scenes/GameScene.ts src/game/assets/AssetKeys.ts tests/unit/CompanionView.test.ts tests/unit/PresentationRules.test.ts public/assets/characters
git commit -m "feat: present huchu and deokbae as a smooth duo"
```

### Task 4: DOM auto-skill HUD, direct-purchase dock, safe-area joystick and shelter HP

**Files:**
- Create: `src/game/ui/AutoSkillHud.ts`, `src/game/ui/SkillDock.ts`, `src/game/ui/SkillIconSvg.ts`, `src/game/ui/ShelterHpView.ts`, `src/game/ui/MutePort.ts`, `src/game/ui/HudLayout.ts`, `tests/unit/HudV2.test.ts`
- Modify: `src/game/ui/HudSystem.ts`, `src/game/ui/TopHud.ts`, `src/game/player/VirtualJoystick.ts`, `src/game/shelter/ShelterView.ts`, `src/game/scenes/GameScene.ts`, `src/game/assets/AssetKeys.ts`, `src/game/scenes/BootScene.ts`, `src/styles.css`, `tests/unit/InputVector.test.ts`
- Delete: `src/game/assets/SkillIconTextures.ts`, `src/game/ui/SkillSelectionModal.ts`, `src/game/ui/SkillHud.ts`, `tests/unit/SkillIconTextures.test.ts`, `tests/unit/SkillSelectionModal.test.ts`, `tests/unit/SkillHudModel.test.ts`

**Interfaces:**
- Consumes: `RunSnapshot.nextSkillCost/learnedSkills/skillStates`, `queueSkillPurchase`, `skillPurchaseResolved`, `MutePort`.
- Produces: `HudSystem.render`, `HudSystem.step`, `HudSystem.showLearned`, `VirtualJoystick.read/setEnabled/destroy`.

- [ ] **Step 1: Write RED DOM model tests**

```ts
expect(skillCopy('tailSwipe')).toEqual({ name: '꼬리치기', icon: 'tail' });
expect(autoRows(state).map((row) => row.label)).toEqual(['짖기 · 자동', '덕배 공격 · 자동']);
expect(dockButtons(state).map((button) => button.name))
  .toEqual(['꼬리치기', '아쿠아빔', '안전신문고']);
expect(formatShelterHp(734, 1000)).toBe('734 / 1,000');
expect([670,660,330,0].map((hp)=>shelterVisualState(hp,1000)))
  .toEqual(['healthy','damaged','critical','failed']);
expect(dockButtons({...state,snacks:40,nextSkillCost:25}).filter(b=>b.affordable).map(b=>b.id))
  .toEqual(['tailSwipe','aquaBeam','safetyReport']);
expect(joystickBottomOffset(0)).toBe(96);  // 12 dock inset + 68 dock + 16 gap
expect(joystickBottomOffset(20)).toBe(108); // 20 inset + 68 dock + 20 safe gap
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/HudV2.test.ts tests/unit/InputVector.test.ts`

Expected: FAIL because the V2 DOM models do not exist.

- [ ] **Step 3: Build non-interactive auto HUD and atomic purchase dock**

`SkillIconSvg.ts` returns inline `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor">` paths for bark, Deokbae, tail, water and report; no emoji, image URL or generated Phaser texture remains. HUD rows never enable pointer events. Dock buttons call `queueSkillPurchase(id)` once per pointer activation, disable while result is `queued`, and update only after snapshot/resolved event.

```ts
export const SKILL_COPY = {
  tailSwipe: { name: '꼬리치기', icon: 'tail' },
  aquaBeam: { name: '아쿠아빔', icon: 'water' },
  safetyReport: { name: '안전신문고', icon: 'report' },
} as const;
```

`HudSystem` creates one `.hud-overlay` as a direct child of `#game-root` (`position:absolute;inset:0`) and mounts `AutoSkillHud`, `SkillDock`, mute control and the joystick DOM hit target inside it. `#game-root` is `position:relative;width:100vw;height:100dvh;overflow:hidden`; the overlay uses unscaled CSS pixels and is never created through `scene.add.dom` or Phaser's scaled `domContainer`. Canvas FIT/letterboxing remains independent below it. Scene shutdown removes the overlay and all DOM listeners exactly once; restart creates one replacement.

On the first false→true affordable edge, show `배울 수 있어요` for 1200ms. On learned resolution, show `${name} 습득!` for 1000ms and immediately add its cooldown row. `TopHud` contains only `WAVE n/5`, `mm:ss`, and mute button.

- [ ] **Step 4: Apply exact CSS geometry and shelter-local HP**

```css
.skill-dock{position:absolute;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));height:68px;display:grid;grid-template-columns:44px repeat(3,minmax(88px,1fr));gap:6px;pointer-events:auto}
.skill-dock button{min-width:88px;min-height:56px;color:#574b3f;touch-action:manipulation}
.skill-dock button[data-affordable="true"]{border-color:#d7a62d;animation:skill-pulse 1.8s ease-in-out infinite}
.auto-skill-hud{position:absolute;top:max(12px,env(safe-area-inset-top));left:12px;display:grid;gap:4px;pointer-events:none}
.virtual-joystick{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:calc(max(12px,env(safe-area-inset-bottom)) + 68px + max(16px,env(safe-area-inset-bottom)));width:112px;height:112px;pointer-events:auto}
.virtual-joystick__ring{position:absolute;inset:10px;width:92px;height:92px;border-radius:50%}
@media (prefers-reduced-motion:reduce){.skill-dock button{animation:none!important}}
```

`HudLayout.joystickBottomOffset(safeBottomPx)` implements `max(12,safe)+68+max(16,safe)` and the CSS expression must match it. `ShelterHpView` is a pooled Graphics+Text child of ShelterView at house foot `y+12`; internal states are `ratio>=.67 healthy`, `>=.34 damaged`, `>0 critical`, otherwise `failed`, and it renders exact `current / maximum`. Remove shelter HP and snacks from TopHud. VirtualJoystick uses CSS-pixel pointer offsets with ring radius 46, while `joystickVector` retains the 15% dead zone. Presentation exports a no-op `MutePort`; Boss & Audio later replaces only that injected port.

`AssetKeys`와 `PreloadScene`은 Task 2의 `/assets/shelter/shelter-states.png`만 V2 shelter key로 등록한다. `ShelterView`는 `healthy/damaged/critical/failed`를 frame `0/1/2/3`에 매핑하고 390px 폭에서 불투명 높이 `68~74px`로 표시한다. 기존 `shelter-states-edit.png` texture key를 runtime에서 참조하면 `HudV2.test.ts`의 source scan이 실패한다.

- [ ] **Step 5: Run GREEN layout-model tests**

Run: `npx vitest run tests/unit/HudV2.test.ts tests/unit/InputVector.test.ts`

Expected: PASS; pure layout/model contract에서 dock buttons 88×56 이상, joystick hit box 112×112, shelter-local HP와 non-blocking purchase가 고정된다. 실제 overlap과 DOM visibility는 Integration Task 2가 검증한다.

- [ ] **Step 6: Commit**

```bash
git add src/game/ui src/game/player/VirtualJoystick.ts src/game/shelter/ShelterView.ts src/game/scenes/GameScene.ts src/game/assets/AssetKeys.ts src/game/assets/SkillIconTextures.ts src/game/scenes/BootScene.ts src/styles.css tests/unit/HudV2.test.ts tests/unit/InputVector.test.ts tests/unit/SkillIconTextures.test.ts tests/unit/SkillSelectionModal.test.ts tests/unit/SkillHudModel.test.ts
git commit -m "feat: replace selection modal with mobile v2 hud"
```

### Task 5: Pooled Korean enemy labels and actor-local HP

**Files:**
- Create: `src/game/enemies/EnemyLabelView.ts`, `src/game/enemies/EnemyLabelPool.ts`, `src/game/enemies/ImpactFeedbackTarget.ts`, `src/game/enemies/CompositeEnemyRig.ts`, `tests/unit/EnemyLabelView.test.ts`, `tests/unit/EnemyLabelPool.test.ts`
- Modify: `src/game/enemies/EnemyActor.ts`, `src/game/enemies/EnemyActorPool.ts`, `src/game/enemies/EnemyHpBar.ts`, `src/game/scenes/GameScene.ts`, `tests/unit/PresentationRules.test.ts`, `tests/unit/PoolCaps.test.ts`
- Delete: `src/game/ui/BossHud.ts`, `tests/unit/BossHud.test.ts`
- Delete superseded runtime files only: `public/assets/characters/{enemy-poop-male,enemy-poop-female,enemy-offleash-male,enemy-offleash-female,enemy-breeder-male,enemy-breeder-female}.png`; keep old source/generated PNGs as reference/provenance inputs but remove them from runtime manifests.

**Interfaces:**
- Consumes: core single enemy config `displayName`, `moveSpeedMultiplier`, Task 2 manifests and Task 3 `secondaryMotionAt`.
- Produces: `ImpactFeedbackTarget`, `CompositeEnemyRig/CompositeEnemyRigFactory`, `EnemyActorPool.feedbackTarget(id)`, `EnemyActorPool.labelPoolSnapshot()`, `EnemyActorPool.snapCompositePoses()`, stable `EnemyLabelPool`, `EnemyLabelView.bind/render/reset` for Task 6.

- [ ] **Step 1: Write RED bind-once and layering tests**

```ts
label.bind('똥 방치 보호자');
label.render({ currentHp: 60, maxHp: 60, opaqueHeightLogical: 84 });
label.render({ currentHp: 30, maxHp: 60, opaqueHeightLogical: 84 });
expect(fakeText.calls('setText')).toEqual([['똥 방치 보호자']]);
expect(label.snapshot()).toMatchObject({ fontPx: 14, hpAboveName: true, damageLayerAbove: true });
expect(enemyAnimation(enemy({state:'moving',moveSpeedMultiplier:.6}))).toMatchObject({action:'walk',fps:6});
expect(enemyAnimation(enemy({kind:'illegalBreeder',state:'windup',animationElapsedMs:500})))
  .toMatchObject({action:'attack',frame:5,fps:10});
const rig=fakeCompositeRig();
const actors=createEnemyActorPool({capacity:60,compositeRig:()=>rig});
const labelIdentity=actors.labelPoolSnapshot().instanceId;
actors.acquire(enemy({id:1,kind:'dogTrader'})); actors.snapCompositePoses();
expect(rig.snapCalls).toBe(1); actors.reset();
expect(actors.labelPoolSnapshot()).toMatchObject({instanceId:labelIdentity,created:60,active:0,available:60});
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/EnemyLabelView.test.ts tests/unit/EnemyLabelPool.test.ts tests/unit/PresentationRules.test.ts`

Expected: FAIL because labels do not exist and BossHud still renders duplicate boss HP.

- [ ] **Step 3: Bind pooled labels and manifest-scaled actors**

`EnemyLabelPool` is an `ObjectPool<EnemyLabelView>` preallocated to 60. `EnemyActorPool.acquire(snapshot)` acquires actor와 label atomically and calls `label.bind(displayName)` only when an id first takes them; capacity failure rolls both acquisitions back. Per-frame render changes position, HP ratio and visibility only. Release/reset returns each label to the same pool without replacement allocation. `EnemyActorPool.labelPoolSnapshot()` delegates to this pool's exact `PoolSnapshot`, so labels have their own stable `instanceId/created/active/available`. Use logical font 14px so FIT at 390px yields about 10px, 1px dark stroke, opaque single-color backing; name sits above the head and HP above the name. Damage anchor is 8 logical px above HP.

`EnemyActor` uses regular target opaque height 84 and boss 100. `moving` selects the six-frame walk sheet at `10 * moveSpeedMultiplier` fps and applies 60Hz secondary motion; `windup/holding` selects attack at manifest fps without slow scaling, using core `animationElapsedMs` so frame 3/5 agrees with gameplay release. Poop uses throw, off-leash uses door-push, breeder uses charge/release. For `dogTrader`, delegate body/flash/recoil to an optional injected `CompositeEnemyRigFactory` and attach the one generic label to `humanAnchor()`; before the boss plan lands, a generic fallback actor keeps Presentation typecheck/tests runnable. Never create a truck label, HP, target or death event.

`EnemyActorPool.snapCompositePoses()` iterates only active actors with a composite rig and calls `snapNextPose()` once; ordinary actors are no-ops. GameScene's visibility-confirm/resync adapter calls this method before the first resumed render, giving the later dog-trader rig an owned scene-level snap path.

Define the feedback port before `CompositeEnemyRig` so Task 5 compiles independently of Task 6:

```ts
export interface ImpactFeedbackTarget {
  getFeedbackAnchor(): Point;
  flash(durationMs: number): void;
  recoil(input: { direction: Point; distancePx: number; popScale: number; durationMs: number }): void;
  beginDeath(durationMs: 160): void;
}
```

- [ ] **Step 4: Remove BossHud and run GREEN**

Run: `npx vitest run tests/unit/EnemyLabelView.test.ts tests/unit/EnemyLabelPool.test.ts tests/unit/PresentationRules.test.ts tests/unit/PoolCaps.test.ts`

Expected: PASS; pool stays exactly 60, all four Korean names의 layout bounds가 HP·damage anchor와 겹치지 않고 boss has only actor-local HP. 실제 raster 가독성은 Integration Task 3가 검증한다.

- [ ] **Step 5: Commit**

```bash
git add src/game/enemies src/game/scenes/GameScene.ts src/game/ui/HudSystem.ts src/game/ui/BossHud.ts tests/unit/BossHud.test.ts tests/unit/EnemyLabelView.test.ts tests/unit/PresentationRules.test.ts tests/unit/PoolCaps.test.ts public/assets/characters
git commit -m "feat: attach pooled labels and hp to enemy actors"
```

### Task 6: Damage events, pooled numbers, death timing, skill VFX and reduced motion

**Files:**
- Create: `src/game/combat/DamageFeedbackPool.ts`, `src/game/combat/ImpactFeedbackSystem.ts`, `src/game/presentation/PresentationTelemetry.ts`, `tests/unit/ImpactFeedbackSystem.test.ts`
- Modify: `src/game/combat/CombatEffectPool.ts`, `src/game/enemies/EnemyActor.ts`, `src/game/enemies/EnemyActorPool.ts`, `src/game/shelter/ShelterView.ts`, `src/game/scenes/GameScene.ts`, `tests/unit/CombatEffectPool.test.ts`, `tests/unit/PoolCaps.test.ts`

**Interfaces:**
- Consumes: `DamageAppliedEvent`, shelter/skill VFX events and optional `CompositeEnemyRig` (it already implements `ImpactFeedbackTarget`); audio remains independently subscribed by its plan.
- Produces: `ImpactFeedbackSystem.handle/step/reset`, `DamageFeedbackPool.show/step/reset/snapshot`, protected `GameScene.damageFeedbackPoolForAdapters()`; reuses Task 5 `ImpactFeedbackTarget`.

- [ ] **Step 1: Write RED strength, aggregation, cap and death tests**

```ts
expect(IMPACT_STYLE).toEqual({
  light:{flashMs:45,recoilPx:2,popScale:1.03,fontPx:13,risePx:18,color:'#fff0c2'},
  medium:{flashMs:60,recoilPx:3,popScale:1.06,fontPx:17,risePx:24,color:'#f2a24a'},
  heavy:{flashMs:90,recoilPx:5,popScale:1.08,fontPx:24,risePx:32,color:'#ffe066'},
});
pool.show(hit({ targetId: 7, amount: 18, strength: 'light' }));
pool.step(100);
pool.show(hit({ targetId: 7, amount: 11, strength: 'medium', lethal: true }));
expect(pool.active()[0]).toMatchObject({ text: '29', strength: 'medium', lethal: true });
const risePool=createDamagePool(); risePool.show(hit({targetId:8,position:{x:20,y:100},strength:'heavy'}));
risePool.step(175); expect(risePool.active()[0]).toMatchObject({position:{x:20,y:84}});
const enemyTarget=fakeImpactTarget(), shelterTarget=fakeImpactTarget();
const feedback=new ImpactFeedbackSystem({enemyTarget:()=>enemyTarget,shelterTarget});
feedback.handle(hit({targetId:8,impactDirection:{x:1,y:0}}));
feedback.handle(shelterHit({impactDirection:{x:0,y:-1}}));
expect(enemyTarget.lastRecoil?.direction).toEqual({x:-1,y:0});
expect(shelterTarget.lastRecoil?.direction).toEqual({x:0,y:1});
expect(actor.stepDeath(159)).toBe('active');
expect(actor.stepDeath(1)).toBe('release');
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/ImpactFeedbackSystem.test.ts tests/unit/CombatEffectPool.test.ts`

Expected: FAIL because event-driven impact feedback and 160ms death retention do not exist.

- [ ] **Step 3: Implement number pool and cast dedupe through the Task 5 target port**

```ts
export const DAMAGE_NUMBER_CAP = 64;
export const DAMAGE_MERGE_MS = 120;
export const DAMAGE_NUMBER_LIFETIME_MS = 350;
```

Group same-target events within 120ms by `amount` sum, maximum strength, last position and lethal OR. At cap, reclaim the oldest light number first, then oldest remaining. Damage number position uses linear `startY - risePx * clamp(ageMs/350,0,1)` so stronger hits rise farther over the same lifetime. Recoil direction is exactly `-event.impactDirection`; zero vectors are rejected by the core contract. Group camera shake and composite visual burst once per `castId`; bark and Deokbae never shake. Reduced motion returns zero camera shake, half recoil distance, and `1 + (popScale-1)/2`.

Heavy cast camera feedback is `45~90ms` at intensity `0.0015~0.0035`. `shelterDamaged` uses the same strength mapping for left/right house recoil, HP-bar red flash, damage number and camera; it never routes through an enemy id.

On lethal damage, remove the actor from target lookup immediately but keep its view in a dying map for `flash → 1.12 pop → shrink` over 160ms; only then reset and return to pool. Snack fly-to-dock starts at the lethal event position and does not own reward state.

- [ ] **Step 4: Replace old skill visuals with event-timed pooled VFX**

`CombatEffectPool` keeps cap 120 and removes `scold`/`deokbaeHowl`. At `barkImpact`, start the 120° wave; at tail `skillImpact`, start 360° tail arc and dust together; aqua `skillCastStarted` tracks for 600ms, accepts one `skillTargetChanged`, then splashes only at `skillImpact`; safety uses one 300ms cast clock and pooled notice actors, stamps all live targets on the common impact event. Enemy events retain pooled readable attacks: poop projectile follows a short visual arc and leaves a cartoon stain, off-leash direct hit gets a door-push burst, breeder `attackStarted` creates a thin ground warning/charge flash and `projectileRequested/projectileHit` creates the electric wave, while dog-trader net visuals delegate to its later composite rig. If bark and tail share a step, keep both event/VFX results but choose one Huchu body animation by `tailSwipe > aquaBeam > bark`. No target owns a timer, and Phaser callbacks only advance visuals.

`PresentationTelemetry.snapshot()` returns the exact cross-plan `PresentationTelemetrySnapshot` by reading `EnemyActorPool.snapshot()`, `EnemyActorPool.labelPoolSnapshot()`, projectile view, `CombatEffectPool.snapshot()`, `DamageFeedbackPool.snapshot()` and the Scene adapter's active subscription count. `reset()` resets each producer once without allocating replacement pools. Integration's debug bridge consumes this port later; Presentation does not modify `src/game/debug/*`.

`GameScene.damageFeedbackPoolForAdapters():DamageFeedbackPool` is protected and returns the same preallocated pool used by `ImpactFeedbackSystem`; it never allocates or resets it. Integration's `E2eGameScene` may use this narrow subclass seam to feed synthetic `DamageAppliedEvent` values in the isolated `stress` scenario. Production runtime has no public/global debug mutator.

- [ ] **Step 5: Run GREEN, stress and full validation**

Run: `npx vitest run tests/unit/ImpactFeedbackSystem.test.ts tests/unit/CombatEffectPool.test.ts tests/unit/PoolCaps.test.ts`

Expected: PASS; light/medium/heavy visuals match the table, numbers merge for 120ms, death lasts exactly 160ms, safety camera/burst occurs once per cast, and reduced motion changes presentation only.

Run: `npm run assets:verify && npm run assets:review && npx vitest run tests/unit/PresentationConfig.test.ts tests/unit/AnimationManifest.test.ts tests/unit/CompanionView.test.ts tests/unit/HudV2.test.ts tests/unit/EnemyLabelView.test.ts tests/unit/ImpactFeedbackSystem.test.ts tests/unit/CombatEffectPool.test.ts tests/unit/PoolCaps.test.ts tests/unit/PresentationRules.test.ts tests/assets --testTimeout=15000 && npx playwright test tests/visual/asset-review.spec.ts`

Expected: all owned unit/asset/review commands exit 0. Full TypeScript graph, runtime pool/listener resets and mobile browser flow remain explicit Integration Task 1~4 gates after debug migration.

- [ ] **Step 6: Commit**

```bash
git add src/game/combat src/game/enemies src/game/presentation/PresentationTelemetry.ts src/game/shelter/ShelterView.ts src/game/scenes/GameScene.ts tests/unit/ImpactFeedbackSystem.test.ts tests/unit/CombatEffectPool.test.ts tests/unit/PoolCaps.test.ts
git commit -m "feat: synchronize pooled v2 impact feedback"
```

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-huchu-defense-v2-presentation.md`.

1. **Subagent-Driven (recommended)** — apply the core contract first, then dispatch one fresh worker per task and review spec compliance plus code quality between tasks.
2. **Inline Execution** — use `superpowers:executing-plans`, execute one RED/GREEN/commit task at a time, and stop at each cross-plan interface gate.
