# 후추덕배 디펜스 V2 보스·오디오 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여섯 경로에서 사람·트럭이 하나의 개장수 보스로 움직이고 공격하는 방향형 리그와, 합성 SFX·100BPM BGM·보스 타악기 layer가 모바일 lifecycle을 지키며 동작하는 V2 보스·오디오 slice를 만든다.

**Architecture:** `PathPoseSampler`와 8방향 resolver는 Phaser를 모르는 순수 TypeScript이며 `DogTraderRig`만 Phaser sprite 두 개를 한 gameplay enemy에 연결한다. `AudioSystem`은 사용자 입력 뒤 만든 하나의 `AudioContext`와 두 bus를 소유하고, `SfxSystem`과 `BgmSystem`은 각각 12/6 voice 상한 안에서 그 context를 공유한다. `GameScene`은 core 이벤트를 시각·오디오 adapter에 전달할 뿐 gameplay slow·피해·boss count를 다시 계산하지 않는다.

**Tech Stack:** Node.js `>=22.12.0`, TypeScript `7.0.2`, Phaser `4.1.0`, Vite `8.1.5`, Vitest `4.1.10`, Playwright `1.61.1`, Sharp `0.35.3`, Web Audio API

## Global Constraints

- 논리 해상도 `540 × 960`, `Phaser.WEBGL`, `FIT`, 중앙 정렬과 DPR 최대 2를 유지한다.
- fixed-step은 `1000 / 60ms`이고 시각·오디오는 simulation 결과를 바꾸지 않는다.
- 개장수 사람만 gameplay 위치·HP·표적·사망 이벤트를 가지며 트럭에는 physics body, enemy update, HP와 별도 timer를 만들지 않는다.
- 트럭 목표는 `P(p - 70) + N(p - 70) × traderSide × 28`; `p`는 누적 논리 픽셀이고 `traderSide`는 `P1:-1, P2:+1, P3:-1, P4:+1, P5:-1, P6:+1`이다.
- 경로 pose의 접선은 `distancePx - 8`과 `distancePx + 8`의 centered sample로 계산하고 음수 거리는 첫 segment를 선형 외삽한다.
- 방향은 8구간이며 `north, northWest, west, southWest, south`만 원본이고 `northEast, east, southEast`는 수평 mirror다. 현재 구간 경계에 12도 hysteresis를 적용한다.
- 개장수 walk는 6프레임/10fps/loop, attack은 8프레임/10fps/`eventFrame=5`/`projectileRelease`, 트럭 roll은 4프레임/10fps/loop다. 모든 frame은 `256 × 256px`다.
- 트럭은 390px 화면에서 `약 103×62px`가 되는 logical `142×86`으로 표시한다. 정사각 frame 안에서 이 폭:높이와 캐릭터용 75~85% 높이 점유율을 동시에 만족할 수 없으므로 트럭만 불투명 폭 `220~240px`, 높이 `135~155px`의 소품 검증을 사용하고 최종 표시 크기·접지를 승인 기준으로 삼는다.
- 트럭 완충은 frame-rate 독립 `1 - exp(-deltaMs / 120)`이며 spawn 첫 frame, visibility 복귀, pool 재사용 직후에는 목표 pose로 snap한다.
- 보스 방향 texture 총 예상 GPU 메모리는 mirror 중복 없이 24MiB 이하다.
- 오디오는 외부 음원과 새 runtime dependency 없이 Web Audio API로만 합성하고 시작 입력 전 `AudioContext`를 만들지 않는다.
- SFX/BGM gain 초기값은 각각 65%/28%, voice cap은 각각 12/6, 합계 18이다.
- BGM은 100BPM, 4/4, 32마디, 512개 16분음표 step, 76.8초 loop다. scheduler interval/lookahead는 `25ms`/`180ms`다.
- visibility 복귀는 저장한 fractional phase 뒤의 첫 미재생 step부터 이어가며 중복·누락·몰아 재생을 금지한다.
- 보스 layer는 두 보스 타입을 구분하지 않고 active boss count의 `0↔1` 이벤트만 소비해 다음 박자 경계에서 같은 tom/shaker layer를 켜고 끈다.
- 음소거는 두 master bus에 즉시 반영하고 `localStorage['huchu-defense:muted']`에 저장한다. context 생성/resume 실패는 overlay 없이 무음 gameplay로 끝낸다.
- presentation 계획이 generic manifest loader/build/verifier, 이름표와 피해 숫자·카메라·일반 피격 visual을 소유한다. 이 계획은 개장수 전용 entry·sprite 두 파트·공유 feedback target만 소유한다.
- core 계획이 slow 적분, attack interrupt, `DamageAppliedEvent`, `bossActiveChanged`, 사망/간식 gameplay를 소유한다. 이 계획은 그 이벤트를 소비하고 재발행하지 않는다.
- Core의 `PathSystem.positionAtExtended()`가 음수 pre-entry와 끝점 clamp의 유일한 좌표 규칙이다. 이 계획의 pose sampler는 그 메서드를 합성해 tangent/normal만 추가하며 별도 외삽 공식을 복제하지 않는다.
- legacy debug bridge 이관은 뒤의 Integration Task 1이 소유한다. 이 계획에서는 소유 unit/asset test만 실행하며 전체 `npm run typecheck`·build와 `tests/e2e/*` 수정/실행은 Integration까지 유예한다.
- 명령은 `/Users/jadon/Documents/huchu-defense/.worktrees/huchu-defense-mvp`에서 실행한다.

---

## Exact File Map

```text
Create  src/game/world/{PathPoseSampler,DirectionalFrameResolver}.ts
Create  src/game/assets/DogTraderDirectionalAssets.ts
Create  src/game/enemies/{DogTraderRig,DogTraderRigTelemetry,DogTraderAttackGeometry,PhaserDogTraderParts}.ts
Create  src/game/audio/{AudioTypes,AudioRegistry,SfxSystem,BgmSystem,AudioSystem}.ts
Create  scripts/assets/{prepare-dog-trader-sheets,approve-dog-trader-assets}.mjs
Create  tests/unit/{PathPoseSampler,DirectionalFrameResolver,DogTraderRig,DogTraderAttackGeometry,SfxSystem,BgmSystem,AudioSystem}.test.ts
Create  tests/assets/dog-trader-directional-assets.test.ts
Modify  src/game/data/pathDefinitions.ts, src/game/assets/character-animations.json
Modify  assets/source/generated-approvals.json, package.json
Modify  src/game/lifecycle/LifecyclePauseCoordinator.ts
Modify  src/game/scenes/{BootScene,TitleScene,GameScene}.ts, src/game/ui/HudSystem.ts
Create  assets/source/generated/dog-trader/{human-walk,human-attack,truck-roll}-{north,north-west,west,south-west,south}.png
Create  public/assets/characters/dog-trader/{human-walk,human-attack,truck-roll}-{north,north-west,west,south-west,south}.png
```

## Shared Interface Ledger

Core 계획에서 다음 계약을 import만 한다.

```ts
export type EnemyState = 'moving' | 'windup' | 'holding' | 'dead';
export interface DamageAppliedEvent {
  readonly type: 'damageApplied'; readonly castId: string; readonly appliedAtStep: number;
  readonly targetId: number; readonly amount: number; readonly effectiveAmount: number;
  readonly position: Point; readonly impactDirection: Point;
  readonly source: 'bark'|'deokbae'|'tailSwipe'|'aquaBeam'|'safetyReport';
  readonly strength: 'light'|'medium'|'heavy'; readonly lethal: boolean;
}
export type BossActiveChanged = {
  readonly type: 'bossActiveChanged'; readonly active: boolean; readonly activeBossCount: number;
};
```

Presentation 계획에서 `AnimationDirection`, `AnimationManifestEntry`, `animationEntry(key)`, `animationFrameAt(entry, elapsedMs)`, `buildAnimationAssets`, `verifyAnimationSheet`, `CompositeEnemyRig`, `CompositeEnemyRigFactory`, `ImpactFeedbackTarget`, `MutePort`, `HUCHU_PRESENTATION`을 import만 한다. 이 계획이 생산하는 공개 계약은 다음과 같다.
```ts
export type Direction8 = AnimationDirection;
export interface PathPose { position: Point; tangent: Point; normal: Point; headingRad: number; }
export class PathPoseSampler { readonly length: number; sampleExtended(distancePx: number): PathPose; }
export function resolveDirection8(headingRad: number, previous?: Direction8): Direction8;
export function resolveDogTraderAsset(action: 'walk'|'attack'|'truckRoll', direction: Direction8): {
  entry: AnimationManifestEntry; flipX: boolean; eventSocket?: Point;
};
export class DogTraderRig {
  render(snapshot: EnemySnapshot, deltaMs: number): void;
  snapNextPose(): void;
  humanAnchor(): Point;
  getFeedbackAnchor(): Point;
  snapshot(): DogTraderRigSnapshot;
  flash(durationMs:number):void;
  recoil(input:{direction:Point;distancePx:number;popScale:number;durationMs:number}):void;
  beginDeath(durationMs:160):void;
  reset(): void;
}
export interface DogTraderRigSnapshot {
  readonly pathId:PathId; readonly parts:2; readonly gameplayEntityCount:1;
  readonly pathProgress:number;
  readonly human:Point; readonly truck:Point; readonly followDistance:number; readonly lateralDistance:number;
  readonly humanDirection:Direction8; readonly truckDirection:Direction8;
  readonly humanFlipX:boolean; readonly truckFlipX:boolean;
}
export interface DogTraderRigTelemetrySnapshot {
  readonly active:DogTraderRigSnapshot|null;
  readonly lastSharedFeedbackParts:0|2;
  readonly lastReleaseParts:0|2;
}
export interface DogTraderRigTelemetryPort { snapshot():DogTraderRigTelemetrySnapshot; reset():void; }
export function dogTraderAttackOrigin(snapshot:EnemySnapshot):Point;
export type DogTraderRigFactory = CompositeEnemyRigFactory;
export interface AudioSnapshot {
  readonly state:'locked'|'running'|'suspended'|'silent'; readonly muted:boolean;
  readonly sfxVoices:number; readonly bgmVoices:number; readonly totalVoices:number;
  readonly transportPhaseSteps:number; readonly bossLayerActive:boolean;
}
export interface AudioTransportClock { nowSeconds():number; }
export interface BgmVoiceSink {
  scheduleBaseStep(step:number,when:number):void;
  scheduleBossStep(step:number,when:number):void;
  cancelBossStep(step:number,when:number):void;
  stopAll():void;
  readonly activeVoiceCount:number;
}
export interface BgmTransportFactory {
  create(context:AudioContext,bgmBus:GainNode):Readonly<{clock:AudioTransportClock;sink:BgmVoiceSink}>;
}
export class AudioSystem {
  constructor(createContext:()=>AudioContext,storage:StoragePort,options?:Readonly<{bgmTransportFactory?:BgmTransportFactory}>);
  unlock(): Promise<boolean>; beginRun(): void; handle(event: GameEvent): void;
  play(id:SfxId,input:{castId:string}):boolean; snapshot():AudioSnapshot;
  pauseForLifecycle(): Promise<void>; resumeForLifecycle(): Promise<void>;
  muted(): boolean; setMuted(value: boolean): void;
  subscribeMute(listener: (muted: boolean) => void): () => void;
  tickTransport():void;
  destroy(): Promise<void>;
}
```

### Task 1: 누적 거리 경로 pose와 고정 trader side

**Files:**
- Create: `src/game/world/PathPoseSampler.ts`
- Modify: `src/game/data/pathDefinitions.ts`
- Create: `tests/unit/PathPoseSampler.test.ts`

**Interfaces:**
- Consumes: Core `PathSystem.positionAtExtended(distancePx)`와 `PATH_DEFINITIONS` waypoint 배열
- Produces: `PathPoseSampler.sampleExtended(distancePx): PathPose`, `TRADER_SIDE_BY_PATH`

- [ ] **Step 1: 음수 연장·±8 tangent·여섯 side를 잠그는 실패 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import { PATH_DEFINITIONS, TRADER_SIDE_BY_PATH } from '../../src/game/data/pathDefinitions';
import { PathPoseSampler } from '../../src/game/world/PathPoseSampler';
it('첫 segment를 -70px 연장하고 corner tangent를 ±8px로 centered sample한다', () => {
  const sampler = new PathPoseSampler([[10, 20], [110, 20], [110, 120]]);
  expect(sampler.sampleExtended(-70).position).toEqual({ x: -60, y: 20 });
  const corner = sampler.sampleExtended(100);
  expect(corner.tangent.x).toBeCloseTo(Math.SQRT1_2, 10);
  expect(corner.tangent.y).toBeCloseTo(Math.SQRT1_2, 10);
  expect(corner.normal).toEqual(expect.objectContaining({
    x: expect.closeTo(-Math.SQRT1_2, 10), y: expect.closeTo(Math.SQRT1_2, 10),
  }));
});

it('P1~P6 traderSide와 p-70 truck pose가 모두 finite다', () => {
  expect(TRADER_SIDE_BY_PATH).toEqual({ P1:-1, P2:1, P3:-1, P4:1, P5:-1, P6:1 });
  Object.entries(PATH_DEFINITIONS).forEach(([id, points]) => {
    const pose = new PathPoseSampler(points).sampleExtended(-70);
    const side = TRADER_SIDE_BY_PATH[id as keyof typeof TRADER_SIDE_BY_PATH];
    [pose.position.x + pose.normal.x * side * 28,
      pose.position.y + pose.normal.y * side * 28].forEach((value) => expect(value).toBeFinite());
  });
});
it('core extended position을 그대로 사용해 -70 pre-entry와 끝점 clamp가 일치한다',()=>{
  const points=PATH_DEFINITIONS.P1, path=new PathSystem(points), pose=new PathPoseSampler(points);
  expect(pose.sampleExtended(-70).position).toEqual(path.positionAtExtended(-70));
  const afterEnd=pose.sampleExtended(path.length+70);
  expect(afterEnd.position).toEqual(path.positionAtExtended(path.length+70));
  expect([afterEnd.tangent.x,afterEnd.tangent.y,afterEnd.normal.x,afterEnd.normal.y,afterEnd.headingRad].every(Number.isFinite)).toBe(true);
});
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/unit/PathPoseSampler.test.ts`

Expected: FAIL with `Cannot find module '../../src/game/world/PathPoseSampler'`.

- [ ] **Step 3: 최소 구현 작성**

```ts
import { PathSystem } from './PathSystem';
import type { Point } from './Geometry';
type Waypoint = Point | readonly [number, number];
export interface PathPose { readonly position: Point; readonly tangent: Point; readonly normal: Point; readonly headingRad: number; }
export class PathPoseSampler {
  private readonly path: PathSystem;
  readonly length: number;
  constructor(points: readonly Waypoint[]) {
    this.path = new PathSystem(points); this.length = this.path.length;
  }
  sampleExtended(distancePx: number): PathPose {
    if (!Number.isFinite(distancePx)) throw new RangeError('distancePx must be finite');
    const at = (d: number): Point => this.path.positionAtExtended(d);
    const position = at(distancePx); let before = at(distancePx-8), after = at(distancePx+8);
    if(Math.hypot(after.x-before.x,after.y-before.y)<1e-9){
      before=at(Math.max(0,this.length-16)); after=at(this.length);
    }
    const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy);
    const tangent={x:dx/length,y:dy/length};
    return { position, tangent, normal:{x:-tangent.y,y:tangent.x}, headingRad:Math.atan2(tangent.y,tangent.x) };
  }
}
```

`pathDefinitions.ts` 끝에 아래 exact table을 추가한다.

```ts
import type { PathId } from '../types/GameTypes';
export const TRADER_SIDE_BY_PATH: Readonly<Record<PathId, -1|1>> = {
  P1:-1, P2:1, P3:-1, P4:1, P5:-1, P6:1,
};
```

- [ ] **Step 4: GREEN 확인 및 커밋**

Run: `npx vitest run tests/unit/PathPoseSampler.test.ts`

Expected: `3 passed`.

```bash
git add src/game/world/PathPoseSampler.ts src/game/data/pathDefinitions.ts tests/unit/PathPoseSampler.test.ts
git commit -m "feat: add extended dog trader path poses"
```

### Task 2: 8방향 resolver와 실제 개장수·트럭 에셋

**Files:**
- Create: `src/game/world/DirectionalFrameResolver.ts`, `src/game/assets/DogTraderDirectionalAssets.ts`
- Create: `scripts/assets/prepare-dog-trader-sheets.mjs`, `scripts/assets/approve-dog-trader-assets.mjs`
- Create: `assets/source/generated/dog-trader/{human-walk,human-attack,truck-roll}-{north,north-west,west,south-west,south}.png` 15개
- Create: `public/assets/characters/dog-trader/{human-walk,human-attack,truck-roll}-{north,north-west,west,south-west,south}.png` 15개
- Modify: `src/game/assets/character-animations.json`, `assets/source/generated-approvals.json`, `assets/source/provenance.json`, `package.json`
- Create: `tests/unit/DirectionalFrameResolver.test.ts`, `tests/assets/dog-trader-directional-assets.test.ts`

**Interfaces:**
- Consumes: presentation의 generic animation manifest/build/verify 계약, `scripts/assets/approval-ledger.mjs`, `imagegen` skill
- Produces: `resolveDirection8`, 15 original sheet + 9 virtual mirror entry, `resolveDogTraderAsset`

- [ ] **Step 1: hysteresis·mirror·socket·GPU budget 실패 테스트 작성**

```ts
import { expect, it } from 'vitest';
import { resolveDirection8 } from '../../src/game/world/DirectionalFrameResolver';
import { DOG_TRADER_ENTRIES, resolveDogTraderAsset } from '../../src/game/assets/DogTraderDirectionalAssets';
it('경계 +12도 안에서는 west를 유지하고 넘으면 northWest로 바꾼다', () => {
  const rad=(degree:number)=>degree*Math.PI/180;
  expect(resolveDirection8(rad(-157.5+11.9), 'west')).toBe('west');
  expect(resolveDirection8(rad(-157.5+12.1), 'west')).toBe('northWest');
});
it('5 originals와 3 mirrors가 socket을 frameWidth-x로 바꾼다', () => {
  expect(resolveDogTraderAsset('attack','east')).toMatchObject({ flipX:true, eventSocket:{x:155,y:136} });
  expect(DOG_TRADER_ENTRIES.filter((e)=>e.source).length).toBe(15);
  expect(DOG_TRADER_ENTRIES.filter((e)=>e.mirrorOf).length).toBe(9);
  const bytes=DOG_TRADER_ENTRIES.filter((e)=>e.source).reduce((n,e)=>n+e.frameCount*256*256*4,0);
  expect(bytes/1024/1024).toBeLessThanOrEqual(24);
});
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/unit/DirectionalFrameResolver.test.ts tests/assets/dog-trader-directional-assets.test.ts`

Expected: FAIL with missing resolver/manifest and missing PNG paths.

- [ ] **Step 3: resolver와 directional manifest adapter 구현**

```ts
export type Direction8='north'|'northWest'|'west'|'southWest'|'south'|'northEast'|'east'|'southEast';
const ORDER: readonly Direction8[]=['east','southEast','south','southWest','west','northWest','north','northEast'];
const center=(d:Direction8)=>ORDER.indexOf(d)*Math.PI/4;
const delta=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
export function resolveDirection8(headingRad:number, previous?:Direction8):Direction8 {
  if (!Number.isFinite(headingRad)) throw new RangeError('headingRad must be finite');
  if (previous && delta(headingRad,center(previous)) <= (22.5+12)*Math.PI/180) return previous;
  return ORDER.reduce((best,next)=>delta(headingRad,center(next))<delta(headingRad,center(best))?next:best);
}
```

`DogTraderDirectionalAssets.ts`는 key를 `dog-trader-{human-walk|human-attack|truck-roll}-{direction}`로 만들고 다음 exact socket table을 검증한다.

```ts
export const ATTACK_SOCKETS = {
  north:{x:140,y:112}, northWest:{x:151,y:119}, west:{x:101,y:136},
  southWest:{x:154,y:137}, south:{x:143,y:143},
  northEast:{x:105,y:119}, east:{x:155,y:136}, southEast:{x:102,y:137},
} as const;
export const MIRROR_OF={northEast:'northWest',east:'west',southEast:'southWest'} as const;
export function resolveDogTraderAsset(action:'walk'|'attack'|'truckRoll',direction:Direction8) {
  const logical=dogTraderEntry(action,direction); const mirror=logical.mirrorOf;
  return { entry:mirror?dogTraderEntry(action,mirror):logical, flipX:mirror!==undefined,
    eventSocket:action==='attack'?ATTACK_SOCKETS[direction]:undefined };
}
```

Canonical JSON에는 원본 방향마다 walk `{6,256,256,10,true}`, attack `{8,256,256,10,false,eventFrame:5,eventKind:'projectileRelease',eventSocket}`, truckRoll `{4,256,256,10,true}`를 넣는다. mirror 세 방향은 같은 action의 `mirrorOf`만 가리키고 `source/url`을 만들지 않는다. 파일명은 Exact File Map과 key kebab-case를 1:1로 사용한다.

- [ ] **Step 4: `imagegen`으로 15개 실제 strip을 생성하고 alpha/anchor를 정규화**

먼저 `view_image`로 `assets/source/characters/enemy-trader.png`를 reference image로 연다. built-in `image_gen`을 15회 호출한다. 사람 10회에는 이 reference를, 첫 truck north 이후 truck 4회에는 생성한 north truck을 style reference로 사용한다. 공통 prompt는 다음과 같다.

```text
Use case: stylized-concept
Asset type: 후추덕배 디펜스 256px frame sprite strip
Style: 아기자기한 2D illustration, 명암 2단계, 머리:몸 1:1; human source outline은 불투명 단색 5px, truck source outline은 4~5px로 그려 최종 390px 표시에서 1.5~2px가 되게 함
Canvas: 정확히 한 줄, 동일 크기 cell, [walk 6 | attack 8 | truck roll 4] consecutive frames
Background: perfectly flat solid #ff00ff chroma key, no shadow, gradient, texture, text, logo, watermark
Human invariants: 모자 쓴 가상 60대 남성, 포획망, 실제 인물 아님, 피와 사실적 폭력 없음
Truck invariants: 브랜드 없는 파란 소형 1톤 트럭, 사람이나 글자 혼입 없음
Motion: loop 첫/마지막 연결, 발 또는 바퀴 접지점 고정, silhouette 크기 변화 없음
```

호출별로 action `human walk 6`, `human net attack 8 with release on frame 6`, `truck wheel roll 4`와 방향 `north/north-west/west/south-west/south`를 명시하고 반환물을 `tmp/imagegen/dog-trader/chroma/` 아래의 각 stem과 동일한 `.png`에 저장한다. installed helper를 exact stem 15개에 적용한다.

```bash
TRADER_STEMS=(human-walk-north human-walk-north-west human-walk-west human-walk-south-west human-walk-south human-attack-north human-attack-north-west human-attack-west human-attack-south-west human-attack-south truck-roll-north truck-roll-north-west truck-roll-west truck-roll-south-west truck-roll-south)
for stem in "${TRADER_STEMS[@]}"; do python3 /Users/jadon/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input "tmp/imagegen/dog-trader/chroma/$stem.png" --out "tmp/imagegen/dog-trader/alpha/$stem.png" --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill; done
```

`prepare-dog-trader-sheets.mjs`는 각 input을 frameCount 등분해 character별 largest common trim을 사용한다. 사람은 불투명 높이 `204px`, 발 중심 `(128,254)`에 비율 보존 composite한다. 트럭은 최종 `142×86` logical 표시에서 390px 기준 약 `103×62px`가 되도록 원본 비율을 보존해 최대 `240×150`에 넣고 바퀴 접지 중심을 `(128,254)`에 맞춘다. 트럭은 폭 우선 소품이므로 character용 75~85% 높이 점유 검사를 적용하지 않고, 대신 불투명 폭 `220~240px`, 높이 `135~155px`, 접지/중심 안정성과 최종 표시 크기를 검증한다. package script `assets:prepare:dog-trader`로 15개 exact source PNG를 쓴다.

- [ ] **Step 5: asset review, 명시적 승인, build/verify GREEN**

Run: `npm run assets:prepare:dog-trader && npm run assets:build && npm run assets:review`

Expected: review sheet에서 사람 silhouette 높이 75~85%, 사람 발/트럭 접지 y ±2px, 중심 이동 ±3px, 트럭 불투명 폭 220~240px·높이 135~155px, 최종 390px human/truck outline 중앙값 1.5~2px, attack frame 5 socket이 손에 닿고 다른 캐릭터 혼입이 없다. 이 검토 결과를 사용자에게 보여 승인받은 뒤에만 `approve-dog-trader-assets.mjs`가 15개 SHA-256을 `generated-approvals.json`에 기록한다.

`approve-dog-trader-assets.mjs`는 Presentation의 shared ledger helper로 기존 approvals/provenance를 read-modify-write하고 자기 15개 source key만 upsert한다. generic 18개와 모든 unrelated key를 보존하고 전체 key를 stable lexical sort한 뒤 같은 directory temp file→atomic rename으로 교체한다. `dog-trader-directional-assets.test.ts`는 generic/foreign seed entry 보존, 15개 upsert, stable order와 두 번 실행 idempotence를 temp ledger에서 검증한다.

Run: `node scripts/assets/approve-dog-trader-assets.mjs && npm run assets:verify && npx vitest run tests/unit/DirectionalFrameResolver.test.ts tests/assets/dog-trader-directional-assets.test.ts`

Expected: asset verification exit 0 and all tests PASS. 승인 script는 15개 source hash와 `provider:imagegen`, reference path, 생성일을 provenance에도 기록한다.

```bash
git add package.json scripts/assets/prepare-dog-trader-sheets.mjs scripts/assets/approve-dog-trader-assets.mjs src/game/assets src/game/world/DirectionalFrameResolver.ts assets/source/generated/dog-trader assets/source/generated-approvals.json assets/source/provenance.json public/assets/characters/dog-trader tests/unit/DirectionalFrameResolver.test.ts tests/assets/dog-trader-directional-assets.test.ts
git commit -m "feat: add directional dog trader assets"
```

### Task 3: 사람·트럭 단일 gameplay lifecycle 리그

**Files:**
- Create: `src/game/enemies/DogTraderRig.ts`, `src/game/enemies/DogTraderRigTelemetry.ts`, `src/game/enemies/DogTraderAttackGeometry.ts`, `src/game/enemies/PhaserDogTraderParts.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Create: `tests/unit/DogTraderRig.test.ts`, `tests/unit/DogTraderRigTelemetry.test.ts`, `tests/unit/DogTraderAttackGeometry.test.ts`
- Modify: `tests/unit/EnemyAttackSystem.test.ts`

**Interfaces:**
- Consumes: core `EnemySnapshot`; presentation `ImpactFeedbackTarget`; Tasks 1~2 pose/assets
- Produces: 한 enemyId에 속한 두 sprite, 공유 feedback/death/reset, pure hand-socket `AttackOriginResolver`, actor pool 내부를 노출하지 않는 read-only `DogTraderRigTelemetryPort`

- [ ] **Step 1: follow pose·damping·snap·shared feedback·attack origin 실패 테스트 작성**

```ts
it('truck은 p-70/side28을 120ms damping하고 reset 뒤 첫 frame은 snap한다', () => {
  const visual=new FakeDogTraderParts(); const rig=createRig(visual); const enemy=dogTraderSnapshot('P1',100);
  rig.render(enemy,16); const first=visual.lastTruck; expect(first).toEqual(visual.lastTruckTarget);
  expect(rig.snapshot()).toMatchObject({pathId:'P1',parts:2,gameplayEntityCount:1,followDistance:70,lateralDistance:-28});
  rig.render({...enemy,pathProgress:120},120); expect(visual.lastTruck.x).toBeCloseTo(first.x+(visual.lastTruckTarget.x-first.x)*(1-Math.exp(-1)),6);
  rig.snapNextPose(); rig.render({...enemy,pathProgress:140},16); expect(visual.lastTruck).toEqual(visual.lastTruckTarget);
});
it('feedback과 pool reset은 두 part에 적용되고 HP/target은 하나다', () => {
  const visual=new FakeDogTraderParts(); const rig=createRig(visual);
  rig.flash(90); rig.recoil({direction:{x:-1,y:0},distancePx:5,popScale:1.08,durationMs:90});
  expect(rig.getFeedbackAnchor()).toEqual(rig.humanAnchor());
  rig.beginDeath(160); rig.reset();
  expect(visual.calls).toEqual(['flash-human','flash-truck','recoil-human','recoil-truck','death-human','death-truck','reset-human','reset-truck']);
});
it('dogTrader는 frame5인 500ms에 손 socket에서 projectile을 release한다',()=>{
  const origin=dogTraderAttackOrigin(dogTraderSnapshot('P2',180));
  const attack=attackSystemFor('dogTrader',{projectileOrigin:dogTraderAttackOrigin});
  expect(attack.step(499,dogTraderSnapshot('P2',180)).some(e=>e.type==='projectileRequested')).toBe(false);
  expect(attack.step(1,dogTraderSnapshot('P2',180)).find(e=>e.type==='projectileRequested'))
    .toMatchObject({from:origin,projectileKind:'net'});
});
it('pathProgress -70의 사람과 -140의 트럭은 P1~P6 진입 경계 밖에 있다',()=>{
  for(const pathId of PATH_IDS){
    const rig=createRig(new FakeDogTraderParts()); rig.render(dogTraderSnapshot(pathId,-70),0);
    const snapshot=rig.snapshot();
    expect(snapshot.human).toEqual(DEFAULT_PATH_POSE_SAMPLERS[pathId].sampleExtended(-70).position);
    expect(isOutsideWorld(snapshot.human,540,960)).toBe(true);
    expect(isOutsideWorld(snapshot.truck,540,960)).toBe(true);
  }
});
it('telemetry는 실제 active rig와 두 part 공유 feedback/release를 보존한다',()=>{
  const telemetry=new DogTraderRigTelemetry(), rig=createRig(new FakeDogTraderParts(),telemetry);
  rig.render(dogTraderSnapshot('P1',40),0); rig.flash(90); rig.recoil({direction:{x:-1,y:0},distancePx:5,popScale:1.08,durationMs:90});
  expect(telemetry.snapshot()).toMatchObject({active:{pathId:'P1'},lastSharedFeedbackParts:2,lastReleaseParts:0});
  rig.beginDeath(160); rig.reset();
  expect(telemetry.snapshot()).toMatchObject({active:null,lastSharedFeedbackParts:2,lastReleaseParts:2});
});
it('windup/holding 중 트럭 바퀴는 멈추고 차체 idle만 1px 안에서 움직인다',()=>{
  const visual=new FakeDogTraderParts(), rig=createRig(visual);
  rig.render({...dogTraderSnapshot('P3',120),state:'windup',animationElapsedMs:0},16);
  const first=visual.lastTruckRender;
  rig.render({...dogTraderSnapshot('P3',120),state:'holding',animationElapsedMs:240},16);
  expect(visual.lastTruckRender.frame).toBe(first.frame);
  expect(Math.abs(visual.lastTruckRender.bodyIdleY)).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/unit/DogTraderRig.test.ts tests/unit/DogTraderRigTelemetry.test.ts tests/unit/DogTraderAttackGeometry.test.ts tests/unit/EnemyAttackSystem.test.ts`

Expected: FAIL with missing `DogTraderRig`, `DogTraderRigTelemetry`, negative pre-entry visual seam and dog trader projectile origin still equal to feet.

- [ ] **Step 3: 리그 최소 구현**

```ts
const TRUCK_BACK_PX=70, TRUCK_SIDE_PX=28, DAMPING_MS=120;
render(snapshot:EnemySnapshot,deltaMs:number):void {
  const path=this.samplers[snapshot.pathId]; const human=path.sampleExtended(snapshot.pathProgress);
  const behind=path.sampleExtended(snapshot.pathProgress-TRUCK_BACK_PX);
  const side=TRADER_SIDE_BY_PATH[snapshot.pathId];
  const target={x:behind.position.x+behind.normal.x*side*TRUCK_SIDE_PX,
    y:behind.position.y+behind.normal.y*side*TRUCK_SIDE_PX};
  const snap=this.needsSnap; const a=snap?1:1-Math.exp(-deltaMs/DAMPING_MS);
  this.truck={x:this.truck.x+(target.x-this.truck.x)*a,y:this.truck.y+(target.y-this.truck.y)*a};
  const humanHeading=snapshot.state==='moving'?human.headingRad
    :Math.atan2(480-human.position.y,270-human.position.x);
  this.humanDirection=resolveDirection8(humanHeading,snapshot.state==='moving'?this.humanDirection:undefined);
  if (snapshot.state==='moving') this.truckDirection=resolveDirection8(behind.headingRad,this.truckDirection);
  this.visual.renderHuman(human.position,this.humanDirection,snapshot.state,snapshot.animationElapsedMs);
  this.visual.renderTruck(this.truck,this.truckDirection,{
    rolling:snapshot.state==='moving', elapsedMs:snapshot.animationElapsedMs,
  }); this.needsSnap=false;
}
export function dogTraderAttackOrigin(snapshot:EnemySnapshot):Point {
  const feet=DEFAULT_PATH_POSE_SAMPLERS[snapshot.pathId].sampleExtended(snapshot.pathProgress).position;
  const direction=resolveDirection8(Math.atan2(480-feet.y,270-feet.x));
  const resolved=resolveDogTraderAsset('attack',direction); const socket=resolved.eventSocket!;
  const scale=HUCHU_PRESENTATION.bossOpaqueHeightLogical/resolved.entry.opaqueHeightPx;
  return {x:feet.x+(socket.x-128)*scale,y:feet.y+(socket.y-256)*scale};
}
```

`DEFAULT_PATH_POSE_SAMPLERS`는 `PATH_DEFINITIONS`로 module load 때 한 번만 만들고 함수는 class 밖의 pure `DogTraderAttackGeometry.ts`에 둔다. `PhaserDogTraderParts`는 사람/트럭 sprite를 각각 `origin(0.5,1)`과 자신의 y depth로 렌더하고 generic `animationFrameAt`을 사용한다. 사람은 `bossOpaqueHeightLogical=100`, 트럭은 `truckDisplayLogical=142×86`을 사용한다. `DogTraderRig`는 Presentation의 `CompositeEnemyRig`를 구현하고 `getFeedbackAnchor()`는 `humanAnchor()`를 그대로 반환해 피해 숫자·이름표·HP를 사람 파트에만 붙인다. `flash/recoil/beginDeath`는 두 visual part에 같은 cast feedback을 한 번씩 전달한다. pool의 단일 `release(enemyId)`가 rig의 두 part를 reset한다. visibility 확인 버튼 직전과 `resyncViewFromSnapshot()`은 Presentation이 제공한 `EnemyActorPool.snapCompositePoses()`를 호출한다.

GameScene은 protected `sessionDependencies():GameSessionDependencies`에서 `projectileOriginByKind:{dogTrader:dogTraderAttackOrigin}`을 반환하고 production `createSession(seed)`가 그 dependency를 `GameSession.create({seed},deps)`에 전달한다. 같은 Scene은 `CompositeEnemyRigFactory`도 Presentation seam에 주입한다. Integration의 `E2eGameScene.createSession`은 이 hook을 그대로 forward해야 하며 Core `EnemyAttackSystem` 자체는 수정하지 않는다. dogTrader는 core의 `attackImpactMs('boss')=500`을 사용한다.

`PathPoseSampler.sampleExtended()`는 Core의 `PathSystem.positionAtExtended()`를 사용하므로 dogTrader spawn `pathProgress=-70`에서 사람은 `P(-70)`, 트럭은 `P(-140)+N(-140)×side×28`이다. 여섯 path의 첫 waypoint가 화면 경계에 있으므로 두 part 모두 첫 표시에서 viewport 밖이고 자연스럽게 진입한다.

`PhaserDogTraderParts.renderTruck(...,{rolling,elapsedMs})`는 moving일 때만 `truck-roll`의 4프레임/10fps를 진행한다. `windup/holding`에서는 진입 직전의 wheel frame을 고정하고 `sin(elapsedMs/180)×1px` 이하의 차체-only idle offset만 적용한다. 트럭 pose와 direction도 마지막 이동 값을 유지하며 이 idle은 gameplay 좌표나 공격 origin을 바꾸지 않는다.

`DogTraderRig.snapshot()`은 마지막 render의 실제 `pathProgress`, 사람/트럭 좌표, signed `lateralDistance=TRADER_SIDE_BY_PATH[pathId]*28`, 두 resolved direction과 각 asset resolver의 `flipX`를 복사한다. `followDistance=70`, `parts=2`, `gameplayEntityCount=1`은 상수지만 Integration은 좌표를 독립 sampler로 다시 계산해 함께 검증한다.

`DogTraderRigTelemetry`는 factory가 active rig를 register하고 단일 pool release가 unregister하는 typed registry다. `DogTraderRig`의 공유 `flash/recoil` 경로가 두 part에 적용된 뒤 `lastSharedFeedbackParts=2`, `beginDeath/reset` release가 끝난 뒤 `lastReleaseParts=2`를 기록한다. `snapshot()`은 active rig snapshot 또는 null과 이 두 read-only counter만 복사하며 sprite, Phaser object, mutable registry를 노출하지 않는다. `GameScene.dogTraderRigTelemetry():DogTraderRigTelemetrySnapshot`은 이 port에만 위임한다. Integration debug bridge는 이 공개 메서드를 소비하고 actor pool 내부 rig를 역탐색하지 않는다.

- [ ] **Step 4: GREEN, 통합 확인, 커밋**

Run: `npx vitest run tests/unit/DogTraderRig.test.ts tests/unit/DogTraderRigTelemetry.test.ts tests/unit/DogTraderAttackGeometry.test.ts tests/unit/EnemyAttackSystem.test.ts`

Expected: all PASS; dogTrader 사망 event/HP/enemyId는 하나이고 두 visual part만 함께 사라진다.

```bash
git add src/game/enemies/DogTraderRig.ts src/game/enemies/DogTraderRigTelemetry.ts src/game/enemies/DogTraderAttackGeometry.ts src/game/enemies/PhaserDogTraderParts.ts src/game/scenes/GameScene.ts tests/unit/DogTraderRig.test.ts tests/unit/DogTraderRigTelemetry.test.ts tests/unit/DogTraderAttackGeometry.test.ts tests/unit/EnemyAttackSystem.test.ts
git commit -m "feat: render dog trader as a shared two-part rig"
```

### Task 4: Web Audio SFX graph, 12 voice cap와 무음 실패

**Files:**
- Create: `src/game/audio/AudioTypes.ts`, `src/game/audio/AudioRegistry.ts`, `src/game/audio/SfxSystem.ts`, `src/game/audio/AudioSystem.ts`
- Create: `tests/unit/SfxSystem.test.ts`, `tests/unit/AudioSystem.test.ts`

**Interfaces:**
- Consumes: `DamageAppliedEvent`, browser `AudioContext`, storage
- Produces: 지연 생성 context, `AudioSnapshot`, 65% SFX bus, priority/preemption, cast dedupe, mute subscription

- [ ] **Step 1: 지연 생성·12 cap·우선순위·mute·실패 RED 테스트 작성**

```ts
it('unlock 전 context가 없고 SFX는 12개를 넘지 않는다', async () => {
  const fake=new FakeAudioContext(); let factoryCalls=0;
  const audio=new AudioSystem(()=>{factoryCalls+=1;return fake;}, memoryStorage());
  expect(factoryCalls).toBe(0); expect(fake.createdNodes).toBe(0); await audio.unlock();
  expect(factoryCalls).toBe(1);
  const ids:SfxId[]=['barkHuchu','barkDeokbae','hitLight','hitHeavy','tailSwipe','aquaCharge','aquaImpact','noticePaper','noticeStamp','skillLearned','electricCharge','electricImpact'];
  ids.forEach((id,i)=>audio.play(id,{castId:`cap:${i}`}));
  expect(audio.snapshot()).toMatchObject({sfxVoices:12,bgmVoices:0,totalVoices:12});
});
it('보스/보호소 cue가 꽉 찬 낮은 priority pool을 선점하고 resume 실패는 reject하지 않는다', async () => {
  const fake=new FakeAudioContext(); const lowIds=SFX_IDS.filter(id=>id!=='shelterWood').slice(0,12);
  const sfx=new SfxSystem(fake,testRegistry({priority0:lowIds,priority3:['shelterWood']}));
  lowIds.forEach((id,i)=>sfx.play(id,{castId:`low:${i}`}));
  expect(sfx.play('shelterWood',{castId:'shelter'})).toBe(true); expect(sfx.snapshot().voiceCount).toBe(12);
  const audio=new AudioSystem(()=>fake,memoryStorage()); await audio.unlock();
  fake.resumeError=new Error('blocked'); await expect(audio.resumeForLifecycle()).resolves.toBeUndefined();
});
it('canonical event를 cue로 route하고 같은 cast의 다중 피해음을 한 번만 낸다', async()=>{
  const h=createAudioHarness(); await h.audio.unlock();
  h.audio.handle(barkImpact({castId:'bark:9',targetIds:[1,2,3]}));
  h.audio.handle(damageApplied({castId:'bark:9',targetId:1,strength:'light'}));
  h.audio.handle(damageApplied({castId:'bark:9',targetId:2,strength:'light'}));
  expect(h.playedIds()).toEqual(['barkHuchu','hitLight']);
});
it('안전신문고 도장은 대상 수만큼 최대 3회이고 heavy hit은 cast당 한 번이다',async()=>{
  const h=createAudioHarness(); await h.audio.unlock();
  h.audio.handle(skillImpact({castId:'safety:4',skillId:'safetyReport',targets:[target(1),target(2),target(3),target(4)]}));
  h.audio.handle(damageApplied({castId:'safety:4',targetId:1,strength:'heavy'}));
  h.audio.handle(damageApplied({castId:'safety:4',targetId:2,strength:'heavy'}));
  h.advanceAudioMs(90);
  expect(h.playedIds().filter(id=>id==='noticeStamp')).toHaveLength(3);
  expect(h.playedIds().filter(id=>id==='hitHeavy')).toHaveLength(1);
  expect(h.playedAt('noticeStamp')).toEqual([0,45,90]);
});
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/unit/SfxSystem.test.ts tests/unit/AudioSystem.test.ts`

Expected: FAIL with missing audio modules.

- [ ] **Step 3: registry와 SFX 구현**

```ts
export type SfxId='barkHuchu'|'barkDeokbae'|'hitLight'|'hitHeavy'|'tailSwipe'|'aquaCharge'|'aquaImpact'|'noticePaper'|'noticeStamp'|'shelterWood'|'skillLearned'|'electricCharge'|'electricImpact';
export const SFX_IDS=['barkHuchu','barkDeokbae','hitLight','hitHeavy','tailSwipe','aquaCharge','aquaImpact','noticePaper','noticeStamp','shelterWood','skillLearned','electricCharge','electricImpact'] as const satisfies readonly SfxId[];
export const AUDIO_REGISTRY:Record<SfxId,SfxDefinition>={
  barkHuchu:{priority:0,minGapMs:120,maxPerCast:1,tone:['triangle',150,95,120],noise:['bandpass',620,80]},
  barkDeokbae:{priority:0,minGapMs:120,maxPerCast:1,tone:['triangle',230,160,100],noise:['bandpass',900,65]},
  hitLight:{priority:0,minGapMs:35,maxPerCast:1,tone:['sine',95,65,70],noise:['highpass',1500,25]},
  hitHeavy:{priority:2,minGapMs:60,maxPerCast:1,tone:['sine',80,42,150],noise:['lowpass',900,55]},
  tailSwipe:{priority:2,minGapMs:120,maxPerCast:1,tone:['sine',120,70,130],noise:['bandpass',1100,120]},
  aquaCharge:{priority:2,minGapMs:200,maxPerCast:1,tone:['sine',330,660,600]},
  aquaImpact:{priority:2,minGapMs:120,maxPerCast:1,tone:['sine',120,60,140],noise:['lowpass',1800,180]},
  noticePaper:{priority:2,minGapMs:120,maxPerCast:1,noise:['bandpass',2200,100]},
  noticeStamp:{priority:2,minGapMs:45,maxPerCast:3,tone:['sine',90,50,110],noise:['lowpass',700,45]},
  shelterWood:{priority:3,minGapMs:80,maxPerCast:1,tone:['sine',130,72,120],noise:['bandpass',520,70]},
  skillLearned:{priority:1,minGapMs:250,maxPerCast:1,chime:[659,784,988]},
  electricCharge:{priority:3,minGapMs:180,maxPerCast:1,tone:['sawtooth',180,520,300],noise:['highpass',2400,220]},
  electricImpact:{priority:3,minGapMs:120,maxPerCast:1,tone:['sine',75,38,180],noise:['highpass',1800,130]},
};
```

`SfxSystem.play`은 active가 12면 incoming보다 낮은 priority의 가장 오래된 voice만 `stop()`/`disconnect()`하고, 없으면 drop한다. tone/noise/chime node는 종료 즉시 disconnect한다. cast별 `maxPerCast`, id별 `minGapMs`, castId hash 기반 `0.97~1.03` pitch를 적용한다. `AudioSystem`은 constructor에서 context를 만들지 않고 `unlock()` 안에서 하나만 만들며 SFX/BGM gain과 mute gain을 분리한다. context 생성·resume 예외는 catch해 disabled no-op으로 바꾼다. `createAudioHarness()`는 production `AudioSystem`에 같은 `SfxPort`를 주입하되 fake clock과 재생된 `SfxId/delayMs`만 기록해 routing을 waveform 구현과 분리해 검증한다.

- [ ] **Step 4: damage/cast routing과 GREEN, 커밋**

`AudioSystem.handle()`은 아래 exact event routing을 사용하며 target 수가 0이어도 cast event의 공격음은 유지한다.

| Core event | SFX |
| --- | --- |
| `barkImpact` | `barkHuchu` 1회 |
| `companionAttack` | `barkDeokbae` 1회 |
| `skillCastStarted(aquaBeam)` | `aquaCharge` 1회 |
| `skillCastStarted(safetyReport)` | `noticePaper` 1회 |
| `skillImpact(tailSwipe)` | `tailSwipe` 1회 |
| `skillImpact(aquaBeam)` | `aquaImpact` 1회 |
| `skillImpact(safetyReport)` | 한 cast scheduler가 `noticeStamp`를 대상 수만큼 0/45/90ms에 최대 3회와, 대상이 있으면 `hitHeavy` 1회를 예약 |
| `skillPurchaseResolved(status=learned)` | `skillLearned` 1회 |
| `attackStarted` for `illegalBreeder` | `electricCharge` 1회 |
| `projectileHit(projectileKind=electric)` | `electricImpact` 1회 |
| `damageApplied` | `strength=light/medium`은 cast당 `hitLight` 1회, `strength=heavy`는 `hitHeavy` 1회; 위 safety heavy hit과 `castId`로 dedupe |
| `shelterDamaged` | `shelterWood` 1회 |

도장 세 번은 여러 `damageApplied` 호출에 기대지 않고 `skillImpact` 하나에서 예약하므로 `minGapMs=45`와 충돌하지 않는다. `AudioSnapshot`은 context 실패 시 `state:'silent'`, voice 0을 반환한다.

Run: `npx vitest run tests/unit/SfxSystem.test.ts tests/unit/AudioSystem.test.ts`

Expected: all PASS; snapshot의 SFX/BGM/total cap이 `12/0/12`이고 실패 context에서도 gameplay exception이 없다.

```bash
git add src/game/audio tests/unit/SfxSystem.test.ts tests/unit/AudioSystem.test.ts
git commit -m "feat: add synthesized capped combat audio"
```

### Task 5: 512-step BGM, fractional visibility 복구와 Scene 통합

**Files:**
- Create: `src/game/audio/BgmSystem.ts`
- Modify: `src/game/audio/AudioTypes.ts`, `src/game/audio/AudioRegistry.ts`, `src/game/audio/AudioSystem.ts`
- Modify: `src/game/lifecycle/LifecyclePauseCoordinator.ts`
- Modify: `src/game/scenes/BootScene.ts`, `src/game/scenes/TitleScene.ts`, `src/game/scenes/GameScene.ts`, `src/game/ui/HudSystem.ts`
- Create: `tests/unit/BgmSystem.test.ts`
- Modify: `tests/unit/LifecyclePauseCoordinator.test.ts`

**Interfaces:**
- Consumes: `bossActiveChanged`, presentation `MutePort`, Task 4 shared context/buses
- Produces: 100BPM transport, injectable `AudioTransportClock`/`BgmVoiceSink`, public `AudioSystem.tickTransport()`, shared boss percussion layer, lifecycle pause/resume, first-bar restart/fade

- [ ] **Step 1: 512 wrap·박자 경계·fractional resume RED 테스트 작성**

```ts
it('100BPM 512 step transport phase는 76.8초에 wrap하고 BGM voice는 6 이하이다', () => {
  const h=createBgmHarness(); h.bgm.beginRun(); h.advance(76.8);
  expect(h.bgm.snapshot().transportPhaseSteps).toBeCloseTo(0,9);
  expect(h.bgm.snapshot().voiceCount).toBeLessThanOrEqual(6);
});
it('5.4 step pause는 step6을 0.09초 뒤 시작하며 hidden note를 몰아 재생하지 않는다', async () => {
  const h=createBgmHarness(); h.bgm.beginRun(); h.clock.currentTime=.81; await h.bgm.pause();
  expect(h.bgm.snapshot()).toMatchObject({transportPhaseSteps:5.4,lastStartedStep:5});
  h.clock.currentTime=10; await h.bgm.resume();
  expect(h.bgm.snapshot()).toMatchObject({nextStepIndex:6,nextNoteTime:10.09});
});
it('두 boss type은 lookahead 안에서도 다음 4-step beat timestamp에만 전환한다', () => {
  const h=createBgmHarness(); h.bgm.beginRun(); h.clock.currentTime=.45; h.bgm.setBossActive(true); h.runSchedulerAt(.45);
  expect(h.bgm.snapshot().bossLayerActive).toBe(false);
  expect(h.scheduledBossTransitions()).toContainEqual({step:4,when:.6,active:true});
  h.runSchedulerAt(.6); expect(h.bgm.snapshot().bossLayerActive).toBe(true);
  h.clock.currentTime=1.05; h.bgm.setBossActive(false); h.runSchedulerAt(1.05);
  expect(h.scheduledBossTransitions()).toContainEqual({step:8,when:1.2,active:false});
  h.runSchedulerAt(1.2); expect(h.bgm.snapshot().bossLayerActive).toBe(false);
});
it('base beat가 lookahead에 먼저 예약된 뒤 온 boss event도 같은 다음 beat에 합류한다',()=>{
  const h=createBgmHarness(); h.bgm.beginRun();
  h.runSchedulerAt(.45); // base step 4 at .60 is already queued
  h.clock.currentTime=.50; h.bgm.setBossActive(true);
  expect(h.scheduledBossTransitions()).toContainEqual({step:4,when:.6,active:true});
  expect(h.scheduledBossSteps().filter(({step})=>step===4)).toHaveLength(1);
});
it('boss가 켜진 bar downbeat는 실제 동시 BGM voice 6개를 만든다',()=>{
  const h=createBgmHarness(); h.bgm.beginRun(); h.clock.currentTime=.01; h.bgm.setBossActive(true); h.advanceToNextBarDownbeat();
  expect(h.bgm.snapshot().voiceCount).toBe(6);
});
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run tests/unit/BgmSystem.test.ts tests/unit/LifecyclePauseCoordinator.test.ts`

Expected: FAIL with missing `BgmSystem` and audio lifecycle callback.

- [ ] **Step 3: scheduler와 정확한 resume 공식 구현**

```ts
export const STEP_SECONDS=.15, TRANSPORT_STEPS=512, LOOKAHEAD_SECONDS=.18, SCHEDULER_MS=25;
setBossActive(active:boolean):void {
  if(active===this.requestedBossActive)return;
  this.requestedBossActive=active;
  const now=this.clock.nowSeconds();
  const phase=(now-this.transportOrigin)/STEP_SECONDS;
  const absoluteBeatStep=Math.ceil(phase/4)*4;
  const step=((absoluteBeatStep%TRANSPORT_STEPS)+TRANSPORT_STEPS)%TRANSPORT_STEPS;
  const when=this.transportOrigin+absoluteBeatStep*STEP_SECONDS;
  this.replaceBossTransition({step,when,active});
  if(active)this.scheduleBossBeatOnce(step,when);
  else this.cancelBossBeatIfScheduled(step,when);
}
pause():void {
  const now=this.clock.nowSeconds();
  this.transportPhaseSteps=((now-this.transportOrigin)/STEP_SECONDS%512+512)%512;
  this.lastStartedStep=Math.floor(this.transportPhaseSteps); this.stopScheduledSources(); this.clearTimer();
}
resume():void {
  const now=this.clock.nowSeconds();
  const whole=Math.floor(this.transportPhaseSteps), fraction=this.transportPhaseSteps-whole;
  this.nextStepIndex=(whole+1)%512;
  this.nextNoteTime=now+(1-fraction)*STEP_SECONDS;
  this.transportOrigin=this.nextStepIndex===0?this.nextNoteTime
    :this.nextNoteTime-this.nextStepIndex*STEP_SECONDS;
  this.startTimer();
}
private schedule():void {
  const now=this.clock.nowSeconds();
  this.applyAudibleBossTransitions(now);
  while(this.nextNoteTime < now+LOOKAHEAD_SECONDS) {
    this.scheduleBaseScore(this.nextStepIndex,this.nextNoteTime);
    if(this.nextStepIndex%4===0 && this.bossActiveAt(this.nextNoteTime))
      this.scheduleBossBeatOnce(this.nextStepIndex,this.nextNoteTime);
    this.nextStepIndex=(this.nextStepIndex+1)%TRANSPORT_STEPS; this.nextNoteTime+=STEP_SECONDS;
  }
}
```

모든 시간 읽기는 `AudioTransportClock.nowSeconds()`를 사용한다. production clock은 단일 `AudioContext.currentTime`을 읽고 production `BgmVoiceSink`가 실제 node를 예약한다. `AudioSystem`은 `unlock()`에서 context/bus가 생긴 뒤 optional `BgmTransportFactory.create(context,bgmBus)`를 정확히 한 번 호출하며, 옵션이 없으면 production factory를 쓴다. 이 factory seam은 Integration의 switchable realtime/manual adapter만 소비하고 context를 시작 입력 전에 만들지 않는다. 기본 25ms timer와 Integration의 manual 가속 port는 모두 같은 public `AudioSystem.tickTransport()`를 호출하며, `BgmSystem.tick()` 외부에서 score cursor를 변경하지 않는다.

`setBossActive(active)`는 단순히 다음 `schedule()`까지 pending flag를 보관하지 않는다. 현재 transport phase에서 `nextBeatStep=Math.ceil(phase/4)*4`와 그 절대 timestamp를 계산하고 transition을 즉시 queue한다. 그 beat의 base note가 lookahead로 이미 예약됐어도 `bossBeatScheduled` key로 boss-only source를 그 timestamp에 추가/취소한다. 동일 `(step,when)` key는 한 번만 예약하고 반대 전환이면 `BgmVoiceSink.cancelBossStep()`으로 아직 들리지 않은 boss source만 제거한다. 이 방식으로 `.45`에 step 4 base를 prequeue하고 `.50`에 boss가 등장해도 `.60` step 4에서 켜지며 step 8까지 늦어지지 않는다.

`scheduledBossLayerActive`는 lookahead 안의 미래 note 예약에만 사용한다. `{step,when,active}` queue는 `when <= clock.nowSeconds()`인 transition만 `applyAudibleBossTransitions()`로 public `bossLayerActive`에 반영하므로 아직 들리지 않은 상태를 snapshot이 먼저 노출하지 않는다. pause/reset은 예약 source, `bossBeatScheduled`와 transition queue를 함께 비우고 현재 fractional phase에서 다시 만든다.

고정 score는 32개 C-major-pentatonic bar root table `[60,60,65,67,60,69,67,65]`을 네 번 명시해 step `0/4/8/12` kalimba, step `0/8` marimba bass, 짝수 step filtered shaker event로 확장한다. 각 16-step bar의 step 0에는 짧은 airy pluck를 하나 더 두어 base voice가 정확히 4개이고, boss active downbeat의 tom+boss shaker 2개와 합쳐 실제 동시 `voiceCount=6`이 되게 한다. oscillator/noise node는 끝나면 즉시 disconnect하고 다른 겹침에서 합계가 6이면 낮은 shaker부터 생략한다.

- [ ] **Step 4: Title/Game/lifecycle/mute 연결**

`BootScene`은 context를 만들지 않는 `AudioSystem`만 Phaser registry에 설치한다. `TitleScene`의 `보호소 지키기` click handler는 `await audio.unlock(); audio.beginRun(); scene.start('Game')` 순서다. `GameScene.applySessionEvents`는 모든 `GameEvent`를 `audio.handle(event)`에 정확히 한 번 전달한다. `AudioSystem.handle` 내부가 `bossActiveChanged`를 BGM에 전달하므로 Scene에서 두 번째 전달을 하지 않는다. run result는 600ms fade, restart는 첫 마디부터 `beginRun()`한다.

`LifecyclePauseCoordinator`는 첫 pause reason acquire에 `setAudioLifecyclePaused?.(true)`, 마지막 reason release에 `setAudioLifecyclePaused?.(false)`를 한 번 호출한다. GameScene adapter는 이를 `pauseForLifecycle()`/`resumeForLifecycle()`에 연결한다. 숨김 중 scheduled source는 모두 stop/disconnect한 뒤 suspend하며 사용자 확인 click에서만 resume한다. Hud `MutePort`는 다음 exact adapter다.

```ts
const mutePort:MutePort={
  muted:()=>this.audio.muted(),
  toggle:()=>this.audio.setMuted(!this.audio.muted()),
  subscribe:(listener)=>this.audio.subscribeMute(listener),
};
```

- [ ] **Step 5: GREEN, 전체 검증, 커밋**

Run: `npx vitest run tests/unit/BgmSystem.test.ts tests/unit/AudioSystem.test.ts tests/unit/LifecyclePauseCoordinator.test.ts`

Expected: PASS with `512 steps`, `76.8 seconds`, `nextStepIndex 6`, `nextNoteTime 10.09`, prequeued step 4 late boss transition exactly once, max BGM voices 6.

Run: `npx vitest run tests/unit/BgmSystem.test.ts tests/unit/AudioSystem.test.ts tests/unit/LifecyclePauseCoordinator.test.ts tests/unit/SfxSystem.test.ts tests/unit/DogTraderRig.test.ts tests/unit/DogTraderAttackGeometry.test.ts tests/unit/DirectionalFrameResolver.test.ts tests/unit/PathPoseSampler.test.ts && npm run assets:verify`

Expected: owned unit/asset checks exit 0; 시작 전 context 없음, 시작 뒤 BGM running, mute persist, fractional resume 중 note burst 0, boss layer next-beat 전환이 PASS. Browser lifecycle와 전체 compile/build는 Integration Task 1~2에서 검증한다.

```bash
git add src/game/audio src/game/lifecycle/LifecyclePauseCoordinator.ts src/game/scenes/BootScene.ts src/game/scenes/TitleScene.ts src/game/scenes/GameScene.ts src/game/ui/HudSystem.ts tests/unit/BgmSystem.test.ts tests/unit/AudioSystem.test.ts tests/unit/LifecyclePauseCoordinator.test.ts
git commit -m "feat: integrate resumable boss-layered game audio"
```

## Self-Review Report

- Spec coverage: `PathPoseSampler -70/±8`, P1~P6 side, 8방향/12도, 5 originals+3 mirrors, eventSocket, 사람+트럭 단일 lifecycle, 120ms damping/snap, 공유 feedback/attack origin, 실제 imagegen PNG 승격, SFX 12/BGM 6, 100BPM/512/25ms/180ms/fractional resume, 두 보스 공용 layer, Title/Game/lifecycle/mute/failure를 Tasks 1~5에 각각 연결했다.
- Ownership check: generic label/damage visual/manifest pipeline은 presentation 계약을 consume만 하고, slow/damage/boss count gameplay는 core 이벤트를 consume만 한다.
- Placeholder scan: 금지 패턴 0건이며 생성물 hash만 승인 뒤 전용 script가 실제 bytes에서 계산한다.
- Type consistency: `Direction8`, `PathPose`, `DogTraderRig`, `AudioSystem`, `DamageAppliedEvent`, `BossActiveChanged`, `MutePort` 이름과 signature를 ledger와 모든 Task에서 동일하게 사용했다.
- Verification closure: 각 Task에 RED 명령/예상 실패, GREEN 명령/예상 결과와 독립 commit을 두었고 마지막 Task가 소유 unit/asset 범위를 닫는다. 전체 typecheck/build/browser lifecycle은 debug bridge가 이관된 뒤 Integration Task 1~2에서 닫는다.

Plan complete and saved to `docs/superpowers/plans/2026-07-20-huchu-defense-v2-boss-audio.md`. 구현 시 `superpowers:subagent-driven-development`로 Task별 fresh worker와 review gate를 사용하는 것을 권장한다.
