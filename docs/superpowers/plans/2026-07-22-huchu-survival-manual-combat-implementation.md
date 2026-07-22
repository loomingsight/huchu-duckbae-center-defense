# 후추 생존형 수동 전투 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보호소 중심 자동 전투를 후추 HP 기반 생존 게임으로 바꾸고, 덕배 자동 컴패니언과 왼손 수동 기술 버튼을 제공한다.

**Architecture:** 순수 `PlayerHealthSystem`과 공유 `NavigationField`를 먼저 만든 뒤 `EnemySystem`을 위치 기반 이동으로 전환한다. `GameSession`은 후추 위치·HP를 유일한 적 표적으로 사용하고 수동 행동 명령을 고정 프레임에서 소비하며, Phaser/DOM 계층은 후추 피격 연출과 2×2 기술 버튼만 담당한다.

**Tech Stack:** TypeScript 7, Phaser 4.1, Vitest 4, Vite 8, DOM/CSS conic-gradient

## Global Constraints

- 후추 최대 HP는 정확히 1,000이고 피격 반경은 24 논리 픽셀이다.
- 덕배는 HP·피격·사망 판정 없이 기존 자동 공격 주기와 피해량을 유지한다.
- 마지막 적 처치와 후추 HP 0이 같은 고정 프레임이면 패배를 우선한다.
- 내비게이션은 30×30 논리 픽셀 셀, 18×32 격자, 8방향 이웃, 대각선 비용 `sqrt(2)`를 사용한다.
- 경로장은 최대 초당 5회만 계산하고 활성 적 최대 60마리가 하나의 결과를 공유한다.
- 짖기·꼬리치기·아쿠아빔·안전신문고는 수동 시전, 자동 조준이다.
- 대상이 없거나 준비되지 않은 입력은 피해·애니메이션·쿨타임을 만들지 않는다.
- 구매 직후 기술은 시전하지 않고 정확히 1,000ms의 초기 쿨타임으로 시작한다.
- 왼쪽 아래 56×56 CSS 픽셀 원형 버튼 4개를 2×2로 배치하고 오른쪽 112×112 조이스틱을 유지한다.
- 쿨타임 중 버튼은 실제 `disabled`이며 시계형 부채꼴과 올림한 남은 초를 표시한다.
- 기존 적 수치, 후추 기술 수치, 보스 12시 출현과 웨이브 종료 프레젠테이션 게이트를 변경하지 않는다.
- E2E는 실행하지 않는다.
- 다음 사용자 소유 파일은 수정·삭제·스테이징·커밋하지 않는다.
  - `tests/visual/__snapshots__/desktop-chromium/visual/asset-review.spec.ts/asset-review.png`
  - `tests/visual/__snapshots__/mobile-chromium/visual/asset-review.spec.ts/asset-review.png`

---

## File Structure Map

### 새 순수 도메인

- `src/game/player/PlayerHealthSystem.ts`: 후추 HP 검증, 피해, 초기화.
- `src/game/world/NavigationField.ts`: 오솔길 격자, 역방향 Dijkstra, 재계산 제한과 방향 조회.
- `src/game/player/PlayerActionGate.ts`: 한 개 수동 행동 큐와 200ms 전역 시전 잠금.

### 새 프레젠테이션

- `src/game/player/PlayerHpView.ts`: 후추 발밑 HP 바와 피해 색상.
- `src/game/ui/ActionDock.ts`: 구매와 시전을 겸하는 2×2 왼손 버튼 및 쿨타임 시계 상태.
- `src/game/ui/CompanionStatusHud.ts`: 좌상단 `덕배·자동` 상태 한 줄.

### 책임 변경

- `src/game/enemies/EnemySystem.ts`: 고정 `pathProgress` 대신 공유 경로장을 읽는 실제 위치 이동.
- `src/game/combat/EnemyAttackSystem.ts`: 보호소가 아니라 매 프레임 전달된 후추 원을 공격.
- `src/game/combat/ProjectileSystem.ts`: 발사 시 조준점으로 진행하되 움직이는 후추 원과 교차할 때만 적중.
- `src/game/session/GameSession.ts`: 후추 HP, 동적 적 표적, 수동 명령과 승패의 조정자.
- `src/game/player/PlayerView.ts`: 후추 HP 바, 피격 flash/recoil과 패배 hold.
- `src/game/ui/HudSystem.ts`: `ActionDock`, `CompanionStatusHud`, 토스트 조정.

### 최종 삭제

- `src/game/shelter/ShelterSystem.ts`
- `src/game/shelter/ShelterTypes.ts`
- `src/game/shelter/ShelterView.ts`
- `src/game/ui/ShelterHpView.ts`
- `assets/source/generated/shelter-states-edit.png`
- `assets/source/generated/v2/shelter-states.png`
- `public/assets/shelter/shelter-states.png`
- `tests/unit/ShelterSystem.test.ts`
- `tests/visual/__snapshots__/desktop-chromium/e2e/gameplay-visuals.spec.ts/shelter-defeat.png`
- `tests/visual/__snapshots__/mobile-chromium/e2e/gameplay-visuals.spec.ts/shelter-defeat.png`

---

### Task 1: 후추 생명력 순수 모델

**Files:**
- Create: `src/game/player/PlayerHealthSystem.ts`
- Create: `tests/unit/PlayerHealthSystem.test.ts`
- Modify: `src/game/data/balance.ts`
- Modify: `tests/unit/Balance.test.ts`

**Interfaces:**
- Produces: `PlayerHealthSystem.currentHp`, `maximumHp`, `damage(amount)`, `reset()`
- Produces: `BALANCE.player.maxHp === 1000`, `BALANCE.player.hitRadius === 24`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { PlayerHealthSystem } from '../../src/game/player/PlayerHealthSystem';

it('후추 HP는 유효 피해만 적용하고 0에서 멈춘다', () => {
  const health = new PlayerHealthSystem(1000, 900);
  expect(health.damage(120)).toEqual({ effectiveAmount: 120, hp: 780, lethal: false });
  expect(health.damage(1000)).toEqual({ effectiveAmount: 780, hp: 0, lethal: true });
  expect(health.damage(1)).toEqual({ effectiveAmount: 0, hp: 0, lethal: true });
});

it('reset은 후추 HP를 최대값으로 되돌린다', () => {
  const health = new PlayerHealthSystem(1000, 1);
  health.reset();
  expect({ current: health.currentHp, maximum: health.maximumHp })
    .toEqual({ current: 1000, maximum: 1000 });
});
```

- [ ] **Step 2: red 확인**
  - Run: `npx vitest run tests/unit/PlayerHealthSystem.test.ts tests/unit/Balance.test.ts`
  - Expected: `PlayerHealthSystem` 모듈 부재와 `maxHp`/`hitRadius` 부재로 FAIL.

- [ ] **Step 3: 생명력 구현**

```ts
export interface PlayerDamageResult {
  readonly effectiveAmount: number;
  readonly hp: number;
  readonly lethal: boolean;
}

export class PlayerHealthSystem {
  private hp: number;

  constructor(private readonly maxHp = 1000, initialHp = maxHp) {
    if (!Number.isSafeInteger(maxHp) || !Number.isSafeInteger(initialHp)
      || maxHp <= 0 || initialHp < 0 || initialHp > maxHp) {
      throw new RangeError('Invalid player HP');
    }
    this.hp = initialHp;
  }

  get currentHp(): number { return this.hp; }
  get maximumHp(): number { return this.maxHp; }

  damage(amount: number): PlayerDamageResult {
    if (!Number.isFinite(amount)) throw new RangeError('Invalid player damage');
    if (amount <= 0 || this.hp === 0) {
      return { effectiveAmount: 0, hp: this.hp, lethal: this.hp === 0 };
    }
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    return { effectiveAmount: before - this.hp, hp: this.hp, lethal: this.hp === 0 };
  }

  reset(): void { this.hp = this.maxHp; }
}
```

- [ ] **Step 4: 밸런스 계약 추가**

```ts
player: {
  speed: 150,
  opaqueHeightLogical: 72,
  maxHp: 1000,
  hitRadius: 24,
},
```

- [ ] **Step 5: green과 타입 확인**
  - Run: `npx vitest run tests/unit/PlayerHealthSystem.test.ts tests/unit/Balance.test.ts`
  - Run: `npm run typecheck`
  - Expected: 두 명령 모두 exit 0.

- [ ] **Step 6: 커밋**

```bash
git add -- src/game/player/PlayerHealthSystem.ts src/game/data/balance.ts tests/unit/PlayerHealthSystem.test.ts tests/unit/Balance.test.ts
git commit -m "feat: 후추 생명력 모델 추가"
```

---

### Task 2: 공용 동적 경로장

**Files:**
- Create: `src/game/world/NavigationField.ts`
- Create: `tests/unit/NavigationField.test.ts`
- Modify: `src/game/data/pathDefinitions.ts`
- Modify: `tests/unit/GameDataValidation.test.ts`

**Interfaces:**
- Consumes: `PATH_DEFINITIONS`, `WORLD_WIDTH`, `WORLD_HEIGHT`
- Produces: `NavigationField.step(stepMs, target): boolean`
- Produces: `NavigationField.directionFrom(position): Point`
- Produces: `NavigationField.distanceFrom(position): number`
- Produces: `NavigationField.snapshot(): { revision; recomputeCount; targetCell }`

- [ ] **Step 1: 재계산 제한 실패 테스트 작성**

```ts
const field = NavigationField.createDefault();
expect(field.step(16, { x: 270, y: 480 })).toBe(true);
expect(field.step(183, { x: 300, y: 480 })).toBe(false);
expect(field.step(1, { x: 300, y: 480 })).toBe(true);
expect(field.snapshot()).toMatchObject({ recomputeCount: 2, targetCell: { x: 10, y: 16 } });
```

- [ ] **Step 2: 결정성과 폴백 실패 테스트 작성**

```ts
const left = NavigationField.createDefault();
const right = NavigationField.createDefault();
left.step(0, { x: 511, y: 901 });
right.step(0, { x: 511, y: 901 });
expect(left.directionFrom({ x: 110, y: 0 })).toEqual(right.directionFrom({ x: 110, y: 0 }));
expect(left.distanceFrom({ x: 110, y: 0 })).toBeGreaterThan(0);
expect(left.directionFrom({ x: -100, y: -100 })).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
```

```ts
const disconnected = new NavigationField({
  A: [[0, 0], [0, 120]],
  B: [[510, 840], [510, 930]],
}, 540, 960, 30);
disconnected.step(0, { x: 510, y: 900 });
const fallback = disconnected.directionFrom({ x: 0, y: 30 });
expect(fallback.x).toBeCloseTo(510 / Math.hypot(510, 870), 10);
expect(fallback.y).toBeCloseTo(870 / Math.hypot(510, 870), 10);
```

- [ ] **Step 3: red 확인**
  - Run: `npx vitest run tests/unit/NavigationField.test.ts tests/unit/GameDataValidation.test.ts`
  - Expected: `NavigationField` 모듈 부재로 FAIL.

- [ ] **Step 4: 격자와 역방향 Dijkstra 구현**

```ts
export const NAV_CELL_SIZE = 30;
export const NAV_RECOMPUTE_INTERVAL_MS = 200;
export const NAV_TARGET_DISTANCE_PX = 15;

export interface NavigationFieldSnapshot {
  readonly revision: number;
  readonly recomputeCount: number;
  readonly targetCell: Readonly<{ x: number; y: number }> | null;
}

export class NavigationField {
  static createDefault(): NavigationField {
    return new NavigationField(PATH_DEFINITIONS, 540, 960, NAV_CELL_SIZE);
  }

  step(stepMs: number, target: Point): boolean;
  directionFrom(position: Point): Point;
  distanceFrom(position: Point): number;
  snapshot(): NavigationFieldSnapshot;
  reset(): void;
}
```

  - 18×32 셀을 만들고 오솔길 선분에서 45px 이내인 셀과 중심 반경 90px 셀을 이동 가능으로 표시한다.
  - 이웃 순서는 셀 인덱스 `y * 18 + x` 오름차순으로 정렬한다.
  - 직교 비용은 1, 대각선 비용은 `Math.SQRT2`다.
  - 후추가 통로 밖이면 가장 가까운 이동 가능 셀을 목표 셀로 선택한다.
  - 목표가 바뀌어도 마지막 계산 후 200ms가 지나지 않았으면 기존 경로장을 반환한다.
  - 적이 목표 셀에 들어오면 셀 중앙에서 멈추지 않고 저장한 실제 후추 좌표를 향해 마지막 연결 구간을 이동한다.
  - 유효 셀을 찾지 못하면 `directionFrom`은 현재 위치에서 목표 위치로 향한 정규화 벡터를 반환한다.

- [ ] **Step 5: green과 타입 확인**
  - Run: `npx vitest run tests/unit/NavigationField.test.ts tests/unit/GameDataValidation.test.ts`
  - Run: `npm run typecheck`
  - Expected: 두 명령 모두 exit 0.

- [ ] **Step 6: 커밋**

```bash
git add -- src/game/world/NavigationField.ts src/game/data/pathDefinitions.ts tests/unit/NavigationField.test.ts tests/unit/GameDataValidation.test.ts
git commit -m "feat: 공용 동적 경로장 추가"
```

---

### Task 3: 적 이동을 위치 기반 경로 추적으로 전환

**Files:**
- Create: `src/game/world/MovementTrail.ts`
- Create: `tests/unit/MovementTrail.test.ts`
- Modify: `src/game/enemies/EnemyTypes.ts`
- Modify: `src/game/enemies/EnemySystem.ts`
- Modify: `src/game/enemies/DogTraderRig.ts`
- Modify: `src/game/enemies/DogTraderAttackGeometry.ts`
- Modify: `src/game/debug/E2eEnemySystem.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `tests/unit/EnemySystem.test.ts`
- Modify: `tests/unit/DogTraderRig.test.ts`
- Modify: `tests/unit/DogTraderAttackGeometry.test.ts`
- Modify: `tests/unit/E2eEnemySystem.test.ts`
- Modify: `tests/unit/fixtures.ts`

**Interfaces:**
- Consumes: Task 2 `NavigationField`
- Produces: `EnemySystem.step(stepMs, target)`
- Produces: `EnemySnapshot.heading`, `EnemySnapshot.trailingPose`
- Produces: `MovementTrail.sampleBehind(distancePx)`
- Produces: `EnemySystem.navigationSnapshot()` for shared-field regression telemetry

- [ ] **Step 1: 실제 위치 이동 실패 테스트 작성**

```ts
const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
const before = system.snapshots()[0]!;
system.step(1000, { x: 430, y: 700 });
const after = system.snapshots()[0]!;
expect(after.position).not.toEqual(before.position);
expect(after.heading.x).toBeGreaterThan(0);
expect(after.pathProgress).toBeGreaterThan(0);
```

- [ ] **Step 2: 경로 전환 연속성과 트럭 실패 테스트 작성**

```ts
system.step(200, { x: 120, y: 760 });
const first = system.snapshots()[0]!;
system.step(200, { x: 470, y: 760 });
const second = system.snapshots()[0]!;
expect(Math.hypot(second.position.x - first.position.x, second.position.y - first.position.y))
  .toBeLessThanOrEqual((44 + 16) * 0.2 + 1e-9);
expect(second.trailingPose.position).not.toEqual(second.position);
```

```ts
const crowded = EnemySystem.withEnemies(60);
crowded.step(16, { x: 270, y: 480 });
expect(crowded.navigationSnapshot()).toMatchObject({ recomputeCount: 1 });
expect(crowded.snapshots()).toHaveLength(60);
```

- [ ] **Step 3: red 확인**
  - Run: `npx vitest run tests/unit/MovementTrail.test.ts tests/unit/EnemySystem.test.ts tests/unit/DogTraderRig.test.ts tests/unit/DogTraderAttackGeometry.test.ts tests/unit/E2eEnemySystem.test.ts`
  - Expected: 새 스냅샷 필드와 `step(stepMs, target)` 부재로 FAIL.

- [ ] **Step 4: 이동 스냅샷과 trail 구현**

```ts
export interface MovementPose {
  readonly position: Point;
  readonly heading: Point;
}

export interface EnemySnapshot {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
  readonly state: EnemyState;
  readonly pathId: PathId;
  readonly pathProgress: number;
  readonly position: Point;
  readonly heading: Point;
  readonly trailingPose: MovementPose;
  readonly etaMs: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly spawnSequence: number;
  readonly isBoss: boolean;
  readonly moveSpeedMultiplier: number;
  readonly slowRemainingMs: number;
  readonly dashCooldownRemainingMs: number;
  readonly animationElapsedMs: number;
}
```

```ts
export class MovementTrail {
  push(position: Point, heading: Point): void;
  sampleBehind(distancePx: number): MovementPose;
  reset(position: Point, heading: Point): void;
}
```

  - `MovementTrail`은 최근 140px의 궤적만 보관하고 인접 점의 선형 보간으로 70px 뒤 pose를 반환한다.
  - `pathProgress`는 더 이상 경로 인덱스가 아니라 누적 실제 이동 거리로 정의한다.

- [ ] **Step 5: EnemySystem에 공유 경로장 연결**

```ts
step(stepMs: number, target: Point): void {
  this.navigation.step(stepMs, target);
  for (const enemy of this.enemies.values()) {
    enemy.heading = normalizedOrFallback(
      this.navigation.directionFrom(enemy.position),
      enemy.heading,
    );
    if (enemy.state !== 'moving') continue;
    const distance = movementSpeed(enemy) * enemy.moveSpeedMultiplier * stepMs / 1000;
    enemy.position = clampWorld(addScaled(enemy.position, enemy.heading, distance));
    enemy.pathProgress += distance;
    enemy.trail.push(enemy.position, enemy.heading);
  }
}
```

  - spawn 위치는 기존 `pathId` 첫 점을 사용한다.
  - `etaMs`는 `navigation.distanceFrom(position) / effectiveSpeed * 1000`으로 계산한다.
  - 오프리시 보너스 16px/s, 감속 경계와 걷기 애니메이션 시간은 유지한다.
  - `GameSession`은 이 단계에서 기존 동작 보존을 위해 `{ x: 270, y: 480 }`을 target으로 전달하고 Task 4에서 후추 좌표로 교체한다.

- [ ] **Step 6: 개장수 rig를 trajectory 기반으로 변경**

```ts
const humanPosition = snapshot.position;
const behind = snapshot.trailingPose;
const normal = { x: -behind.heading.y, y: behind.heading.x };
const side = TRADER_SIDE_BY_PATH[snapshot.pathId];
const truckTarget = {
  x: behind.position.x + normal.x * side * 28,
  y: behind.position.y + normal.y * side * 28,
};
const humanHeading = Math.atan2(snapshot.heading.y, snapshot.heading.x);
```

  - `DogTraderAttackGeometry`는 path sampler 대신 `snapshot.position`, `snapshot.heading`과 방향별 손 socket을 사용한다.
  - 트럭의 120ms damping, 70px 후행 거리, 28px 측면 간격과 방향별 flip은 유지한다.

- [ ] **Step 7: green과 타입 확인**
  - Run: `npx vitest run tests/unit/MovementTrail.test.ts tests/unit/EnemySystem.test.ts tests/unit/DogTraderRig.test.ts tests/unit/DogTraderAttackGeometry.test.ts tests/unit/E2eEnemySystem.test.ts`
  - Run: `npm run typecheck`
  - Expected: 두 명령 모두 exit 0.

- [ ] **Step 8: 커밋**

```bash
git add -- src/game/world/MovementTrail.ts src/game/enemies/EnemyTypes.ts src/game/enemies/EnemySystem.ts src/game/enemies/DogTraderRig.ts src/game/enemies/DogTraderAttackGeometry.ts src/game/debug/E2eEnemySystem.ts src/game/session/GameSession.ts tests/unit/MovementTrail.test.ts tests/unit/EnemySystem.test.ts tests/unit/DogTraderRig.test.ts tests/unit/DogTraderAttackGeometry.test.ts tests/unit/E2eEnemySystem.test.ts tests/unit/fixtures.ts
git commit -m "feat: 적 이동을 동적 경로로 전환"
```

---

### Task 4: 적 공격·투사체·승패를 후추 대상으로 전환

**Files:**
- Create: `src/game/player/PlayerHpView.ts`
- Create: `tests/unit/PlayerHpView.test.ts`
- Modify: `src/game/player/PlayerTypes.ts`
- Modify: `src/game/player/PlayerView.ts`
- Modify: `src/game/combat/EnemyAttackSystem.ts`
- Modify: `src/game/combat/ProjectileSystem.ts`
- Modify: `src/game/combat/ProjectileActorPool.ts`
- Modify: `src/game/combat/ImpactFeedbackSystem.ts`
- Modify: `src/game/combat/DamageFeedbackPool.ts`
- Modify: `src/game/events/GameEvents.ts`
- Modify: `src/game/session/RunSnapshot.ts`
- Modify: `src/game/session/RunOutcomeResolver.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/audio/AudioTypes.ts`
- Modify: `src/game/audio/AudioRegistry.ts`
- Modify: `src/game/audio/AudioSystem.ts`
- Modify: `src/game/debug/E2eGameSession.ts`
- Modify: `src/game/debug/E2eAudioStressLoadController.ts`
- Modify: `src/game/debug/ScenarioSessionPort.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `tests/unit/EnemyAttackSystem.test.ts`
- Modify: `tests/unit/ProjectileSystem.test.ts`
- Modify: `tests/unit/ProjectileActorPool.test.ts`
- Modify: `tests/unit/ImpactFeedbackSystem.test.ts`
- Modify: `tests/unit/GameSession.test.ts`
- Modify: `tests/unit/RunOutcomeResolver.test.ts`
- Modify: `tests/unit/RunFactory.test.ts`
- Modify: `tests/unit/SimulationResolution.test.ts`
- Modify: `tests/unit/PlayerViewImpactAction.test.ts`
- Modify: `tests/unit/AudioSystem.test.ts`
- Modify: `tests/unit/SfxSystem.test.ts`
- Modify: `tests/unit/E2eAudioStressLoadController.test.ts`
- Modify: `tests/unit/EnemyLabelPool.test.ts`
- Modify: `tests/unit/TargetingSystem.test.ts`
- Modify: `tests/unit/GameScenePresentationAdapter.test.ts`
- Modify: `tests/unit/GameSceneRenderFrame.test.ts`
- Modify: `tests/e2e/audio.spec.ts`

**Interfaces:**
- Consumes: `PlayerHealthSystem`, 위치 기반 `EnemySystem`
- Produces: `PlayerTargetSnapshot`, `PlayerDamageRequest`, `playerDamaged`
- Produces: `RunSnapshot.playerHp`, `RunSnapshot.playerMaxHp`
- Produces: 회피 가능한 `ProjectileSystem.step(stepMs, target)`

- [ ] **Step 1: 이동 회피와 피해 실패 테스트 작성**

```ts
const attackTarget = { position: { x: 270, y: 480 }, radius: 24 };
const system = new ProjectileSystem(4);
system.spawn(projectile({ from: { x: 270, y: 300 }, to: attackTarget.position }));
expect(system.step(400, { position: { x: 400, y: 480 }, radius: 24 })
  .some(({ type }) => type === 'playerDamageRequested')).toBe(false);
```

```ts
expect(resolvePostStep({ playerHp: 0, wave: 5, active: 0, pending: 0 }))
  .toEqual({ mode: 'lost' });
expect(resolvePostStep({ playerHp: 1, wave: 5, active: 0, pending: 0 }))
  .toEqual({ mode: 'won' });
```

- [ ] **Step 2: 공격 시점 사거리 실패 테스트 작성**

```ts
const started = attack.step(250, enemyInRange, attackTarget);
const missed = attack.step(250, enemyInRange, {
  position: { x: 500, y: 800 },
  radius: 24,
});
expect(started.some(({ type }) => type === 'attackStarted')).toBe(true);
expect(missed.some(({ type }) => type === 'playerDamageRequested')).toBe(false);
expect(missed.some(({ type }) => type === 'attackCancelled')).toBe(true);
```

```ts
const snapshot = run.snapshot();
expect(snapshot).toMatchObject({ playerHp: 1000, playerMaxHp: 1000 });
expect(snapshot).not.toHaveProperty('shelterHp');
expect(snapshot.companion).toMatchObject({ companion: 'deokbae', active: true });
expect(snapshot.companion).not.toHaveProperty('hp');
```

- [ ] **Step 3: red 확인**
  - Run: `npx vitest run tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts tests/unit/RunOutcomeResolver.test.ts tests/unit/GameSession.test.ts tests/unit/ImpactFeedbackSystem.test.ts tests/unit/PlayerViewImpactAction.test.ts`
  - Expected: player target/event/snapshot API 부재로 FAIL.

- [ ] **Step 4: 공격과 투사체 계약 교체**

```ts
export interface PlayerTargetSnapshot {
  readonly position: Point;
  readonly radius: number;
}

export interface PlayerDamageRequest {
  readonly type: 'playerDamageRequested';
  readonly castId: string;
  readonly sourceEnemyId: number;
  readonly sourceEnemyKind: EnemyKind;
  readonly amount: number;
  readonly position: Point;
  readonly impactDirection: Point;
  readonly strength: 'medium' | 'heavy';
}
```

```ts
step(stepMs: number, enemy: EnemySnapshot, target: PlayerTargetSnapshot): readonly EnemyAttackEvent[];
step(stepMs: number, target: PlayerTargetSnapshot): readonly ProjectileEvent[];
```

  - `EnemyAttackSystem`은 매 step 후추 원과의 거리를 계산한다.
  - 근접 오프리시 공격은 release 프레임의 target 위치에만 `playerDamageRequested`를 만든다.
  - 원거리 공격의 속도 벡터는 발사 시 target 위치로 고정한다.
  - `ProjectileSystem`은 매 step `previous→next` 선분과 현재 후추 원의 최초 교차점을 계산한다.
  - 투사체가 조준점을 지나도 후추 원과 교차하지 않았으면 lifetime까지 유지한 뒤 해제한다.
  - `ProjectileSnapshot`에 발사 시점의 `target`을 복사해 넣고 `ProjectileActorPool`의 똥 포물선 계산도 고정 보호소 좌표가 아닌 그 값을 사용한다.

- [ ] **Step 5: GameSession과 승패 교체**

```ts
const target = {
  position: { x: player.x, y: player.y },
  radius: BALANCE.player.hitRadius,
};
this.enemies.step(FIXED_STEP_MS, target.position);
this.stepEnemyAttacks(target, playerRequests);
this.stepProjectiles(target, playerRequests);
this.applyPlayerDamage(playerRequests, appliedAtStep);
```

```ts
this.eventBuffer.push({
  type: 'playerDamaged',
  castId: request.castId,
  appliedAtStep,
  sourceEnemyId: request.sourceEnemyId,
  sourceEnemyKind: request.sourceEnemyKind,
  amount: request.amount,
  effectiveAmount: result.effectiveAmount,
  hp: result.hp,
  maxHp: this.playerHealth.maximumHp,
  lethal: result.lethal,
  position: { ...request.position },
  impactDirection: { ...request.impactDirection },
  strength: request.strength,
});
```

  - `GameSessionDependencies.shelter`를 `playerHealth?: PlayerHealthSystem`으로 교체한다.
  - reset은 `playerHealth.reset()`을 호출한다.
  - `RunSnapshot`의 shelter 필드를 `playerHp`, `playerMaxHp`로 교체한다.
  - `RunOutcomeResolver` 입력을 `playerHp`로 바꾸고 패배 우선을 유지한다.
  - `E2eGameSession.prepareTerminalTie`는 player HP를 160으로 만든 뒤 같은 step에 160 피해가 들어오게 구성한다.

- [ ] **Step 6: 후추 HP와 피격 프레젠테이션 구현**

```ts
export class PlayerHpView {
  render(current: number, maximum: number, x: number, footY: number): void;
  flashRed(durationMs: number): void;
  step(stepMs: number): void;
  reset(current: number, maximum: number, x: number, footY: number): void;
  destroy(): void;
}
```

```ts
export class PlayerView implements ImpactFeedbackTarget {
  getFeedbackAnchor(): Point;
  flash(durationMs: number): void;
  recoil(input: RecoilInput): void;
  beginDeath(durationMs: 160): void;
  showDefeatedHold(): void;
  renderHealth(current: number, maximum: number): void;
}
```

  - HP bar 폭 72, 높이 6을 후추 발 위치에서 10px 아래에 그리고 숫자 텍스트는 만들지 않는다.
  - 비율 `>=0.67`, `>=0.34`, `>0`, `0`에 초록·노랑·빨강·회색을 사용한다.
  - `ImpactFeedbackSystemOptions.shelterTarget`을 `playerTarget`으로 교체하고 `playerDamaged`를 player damage number와 flash/recoil에 전달한다.
  - `DamageFeedbackPool.targetKind`를 `'enemy' | 'player'`로 바꾸고 `showPlayer`를 제공한다.
  - 꼬리치기 recoil 방향은 `event.position - event.origin`으로 계산하고 보호소 중심 참조를 제거한다.
  - `GameScene`은 `PlayerView`를 impact feedback보다 먼저 만들고 `playerDamaged`를 전달한다.
  - lost 모드에서 `playerView.showDefeatedHold()`를 호출하고 1,200ms 동안 마지막 피격 자세를 유지한다.

- [ ] **Step 7: 피격 사운드 이름 교체**

```ts
export type SfxId =
  | 'barkHuchu'
  | 'barkDeokbae'
  | 'hitLight'
  | 'hitHeavy'
  | 'huchuHit'
  | 'tailSwipe'
  | 'aquaCharge'
  | 'aquaImpact'
  | 'noticePaper'
  | 'noticeStamp'
  | 'skillLearned'
  | 'electricCharge'
  | 'electricImpact';
```

  - `shelterWood` 정의와 분기를 같은 합성 파라미터의 `huchuHit`으로 이름만 바꾼다.
  - `AudioSystem.handle(playerDamaged)`가 `huchuHit`을 cast당 1회 재생한다.
  - `E2eAudioStressLoadController`의 12-voice burst에서도 `shelterWood`를 `huchuHit`으로 교체해 기존 voice budget을 유지한다.

- [ ] **Step 8: green과 타입 확인**
  - Run: `npx vitest run tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts tests/unit/ProjectileActorPool.test.ts tests/unit/RunOutcomeResolver.test.ts tests/unit/GameSession.test.ts tests/unit/CompanionSystem.test.ts tests/unit/ImpactFeedbackSystem.test.ts tests/unit/PlayerHpView.test.ts tests/unit/PlayerViewImpactAction.test.ts tests/unit/AudioSystem.test.ts tests/unit/SfxSystem.test.ts tests/unit/E2eAudioStressLoadController.test.ts tests/unit/EnemyLabelPool.test.ts tests/unit/TargetingSystem.test.ts tests/unit/GameScenePresentationAdapter.test.ts tests/unit/GameSceneRenderFrame.test.ts`
  - Run: `npm run typecheck`
  - Expected: 두 명령 모두 exit 0.

- [ ] **Step 9: 커밋**

```bash
git add -- \
  src/game/player/PlayerHpView.ts src/game/player/PlayerTypes.ts src/game/player/PlayerView.ts \
  src/game/combat/EnemyAttackSystem.ts src/game/combat/ProjectileSystem.ts src/game/combat/ProjectileActorPool.ts src/game/combat/ImpactFeedbackSystem.ts src/game/combat/DamageFeedbackPool.ts \
  src/game/events/GameEvents.ts src/game/session/RunSnapshot.ts src/game/session/RunOutcomeResolver.ts src/game/session/GameSession.ts src/game/scenes/GameScene.ts \
  src/game/audio/AudioTypes.ts src/game/audio/AudioRegistry.ts src/game/audio/AudioSystem.ts \
  src/game/debug/E2eGameSession.ts src/game/debug/E2eAudioStressLoadController.ts src/game/debug/ScenarioSessionPort.ts src/game/debug/TestContract.ts \
  tests/unit/PlayerHpView.test.ts tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts tests/unit/ProjectileActorPool.test.ts tests/unit/ImpactFeedbackSystem.test.ts tests/unit/GameSession.test.ts tests/unit/RunOutcomeResolver.test.ts tests/unit/RunFactory.test.ts tests/unit/SimulationResolution.test.ts tests/unit/PlayerViewImpactAction.test.ts tests/unit/AudioSystem.test.ts tests/unit/SfxSystem.test.ts tests/unit/E2eAudioStressLoadController.test.ts tests/unit/EnemyLabelPool.test.ts tests/unit/TargetingSystem.test.ts tests/unit/GameScenePresentationAdapter.test.ts tests/unit/GameSceneRenderFrame.test.ts tests/e2e/audio.spec.ts
git commit -m "feat: 적 공격 대상을 후추로 전환"
```

---

### Task 5: 후추 기술을 명령 기반 수동 시전으로 전환

**Files:**
- Create: `src/game/player/PlayerActionGate.ts`
- Create: `tests/unit/PlayerActionGate.test.ts`
- Modify: `src/game/types/GameTypes.ts`
- Modify: `src/game/combat/BarkSystem.ts`
- Modify: `src/game/skills/SkillTypes.ts`
- Modify: `src/game/skills/SkillSystem.ts`
- Modify: `src/game/session/RunSnapshot.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/events/GameEvents.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `src/game/debug/TestBridge.ts`
- Modify: `src/game/debug/ScenarioSessionPort.ts`
- Modify: `tests/unit/BarkSystem.test.ts`
- Modify: `tests/unit/SkillSystem.test.ts`
- Modify: `tests/unit/GameSession.test.ts`
- Modify: `tests/unit/TestBridgeLifecycle.test.ts`

**Interfaces:**
- Produces: `PlayerActionId = 'bark' | PurchasableSkillId`
- Produces: `GameSession.queuePlayerAction(actionId)`
- Produces: `RunSnapshot.actionStates`
- Produces: `playerActionRejected` with exact reason

- [ ] **Step 1: 행동 큐 실패 테스트 작성**

```ts
const gate = new PlayerActionGate();
expect(gate.queue('bark')).toEqual({ status: 'queued', actionId: 'bark' });
expect(gate.queue('aquaBeam')).toEqual({ status: 'queueBusy', actionId: 'aquaBeam' });
expect(gate.consume(0)).toBe('bark');
gate.accept(0);
expect(gate.queue('tailSwipe')).toEqual({ status: 'queued', actionId: 'tailSwipe' });
expect(gate.consume(199)).toBeNull();
expect(gate.consume(200)).toBe('tailSwipe');
```

- [ ] **Step 2: 수동 시전 실패 테스트 작성**

```ts
const bark = new BarkSystem();
expect(bark.step(250, contextWithEnemy).some(({ type }) => type === 'barkStarted')).toBe(false);
expect(bark.requestCast(contextWithEnemy)).toMatchObject({ status: 'started' });
expect(bark.step(250, contextWithEnemy).some(({ type }) => type === 'barkImpact')).toBe(true);
```

```ts
const skills = new SkillSystem();
skills.learn('aquaBeam', 0);
expect(skills.snapshot('aquaBeam')).toMatchObject({
  learned: true,
  ready: false,
  cooldownRemainingMs: 1000,
});
skills.step(1000, contextWithEnemy);
expect(skills.snapshot('aquaBeam').ready).toBe(true);
expect(skills.requestCast('aquaBeam', 1000, contextWithEnemy).status).toBe('started');
```

```ts
const safety = new SkillSystem();
safety.learn('safetyReport', 0);
safety.step(1000, contextWithoutEnemies);
const beforeNoTarget = safety.snapshot('safetyReport');
expect(safety.requestCast('safetyReport', 1000, contextWithoutEnemies))
  .toEqual({ status: 'noTarget', events: [] });
expect(safety.snapshot('safetyReport')).toEqual(beforeNoTarget);
```

- [ ] **Step 3: red 확인**
  - Run: `npx vitest run tests/unit/PlayerActionGate.test.ts tests/unit/BarkSystem.test.ts tests/unit/SkillSystem.test.ts tests/unit/GameSession.test.ts`
  - Expected: 큐와 `requestCast` API 부재, 기존 자동 시전 때문에 FAIL.

- [ ] **Step 4: 행동 타입과 전역 잠금 구현**

```ts
export type PlayerActionId = 'bark' | PurchasableSkillId;
export type PlayerActionQueueResult =
  | { readonly status: 'queued'; readonly actionId: PlayerActionId }
  | { readonly status: 'queueBusy'; readonly actionId: PlayerActionId };
```

```ts
export class PlayerActionGate {
  queue(actionId: PlayerActionId): PlayerActionQueueResult;
  consume(nowMs: number): PlayerActionId | null;
  accept(nowMs: number): void; // next start is nowMs + 200
  reset(): void;
}
```

- [ ] **Step 5: BarkSystem과 SkillSystem을 명시적 request로 변경**

```ts
export type CastRequestResult =
  | { readonly status: 'started'; readonly events: readonly SkillTimelineEvent[] }
  | { readonly status: 'noTarget' | 'notReady' | 'notLearned'; readonly events: readonly [] };

requestCast(
  skillId: PurchasableSkillId,
  nowMs: number,
  context: SkillContext,
): CastRequestResult;

step(nowMs: number, context: SkillContext): readonly SkillTimelineEvent[]; // pending impact만 진행
```

  - `BarkSystem.step`에서 자동 `start` 호출을 제거하고 `requestCast(context)`가 성공할 때만 windup을 시작한다.
  - 짖기 정상 쿨타임은 기존 800ms를 유지하고 공용 `ActionSnapshot` 형태로 남은 시간과 progress를 제공한다.
  - `SkillSystem.step`에서 `AUTO_SKILL_IDS` ready 순회를 제거한다.
  - `learn(skillId, nowMs)`는 구매 시전 이벤트 없이 해당 기술 쿨타임을 정확히 1,000ms로 설정한다.
  - `requestCast`가 성공할 때만 기존 기술별 쿨타임을 시작한다.
  - 대상 없음과 준비 안 됨은 pending cast, sequence, cooldown을 변경하지 않는다.
  - `SkillSystem.test.ts`의 꼬리치기 범위 전체 타격, 아쿠아빔 최고 HP 자동 조준, 안전신문고 활성 적 전체 스냅샷 기대는 수동 `requestCast` 호출 뒤에도 기존 대상 선정 순서를 그대로 검증한다.

- [ ] **Step 6: GameSession 명령 소비 연결**

```ts
queuePlayerAction(actionId: PlayerActionId): PlayerActionQueueResult {
  if (this.stateMachine.current() !== 'playing') {
    return { status: 'queueBusy', actionId };
  }
  return this.playerActions.queue(actionId);
}
```

```ts
const actionId = this.playerActions.consume(this.simulationTimeMs());
if (actionId !== null) {
  const result = actionId === 'bark'
    ? this.bark.requestCast({ origin, enemies })
    : this.skills.requestCast(actionId, this.simulationTimeMs(), { player: origin, enemies });
  if (result.status === 'started') this.playerActions.accept(this.simulationTimeMs());
  else this.eventBuffer.push({ type: 'playerActionRejected', actionId, reason: result.status });
}
```

  - 수동 행동을 처리한 뒤 Bark/Skill pending 타임라인을 진행한다.
  - 덕배 `CompanionSystem.step`은 기존처럼 매 고정 프레임 자동으로 실행한다.
  - `RunSnapshot.actionStates`는 bark, tailSwipe, aquaBeam, safetyReport 네 상태를 모두 제공한다.
  - `TestBridge`에 `castAction(id)`를 추가하되 E2E 파일은 타입 검사만 통과시키고 실행하지 않는다.

- [ ] **Step 7: green과 타입 확인**
  - Run: `npx vitest run tests/unit/PlayerActionGate.test.ts tests/unit/BarkSystem.test.ts tests/unit/SkillSystem.test.ts tests/unit/GameSession.test.ts tests/unit/TestBridgeLifecycle.test.ts`
  - Run: `npm run typecheck`
  - Expected: 두 명령 모두 exit 0.

- [ ] **Step 8: 커밋**

```bash
git add -- src/game/player/PlayerActionGate.ts src/game/types/GameTypes.ts src/game/combat/BarkSystem.ts src/game/skills/SkillTypes.ts src/game/skills/SkillSystem.ts src/game/session/RunSnapshot.ts src/game/session/GameSession.ts src/game/events/GameEvents.ts src/game/debug/TestContract.ts src/game/debug/TestBridge.ts src/game/debug/ScenarioSessionPort.ts tests/unit/PlayerActionGate.test.ts tests/unit/BarkSystem.test.ts tests/unit/SkillSystem.test.ts tests/unit/GameSession.test.ts tests/unit/TestBridgeLifecycle.test.ts
git commit -m "feat: 후추 기술 수동 시전 전환"
```

---

### Task 6: 왼손 기술 버튼과 쿨타임 시계

**Files:**
- Create: `src/game/ui/ActionDock.ts`
- Create: `src/game/ui/CompanionStatusHud.ts`
- Create: `tests/unit/ActionDock.test.ts`
- Create: `tests/unit/CompanionStatusHud.test.ts`
- Delete: `src/game/ui/SkillDock.ts`
- Delete: `src/game/ui/AutoSkillHud.ts`
- Modify: `src/game/ui/HudSystem.ts`
- Modify: `src/game/ui/HudLayout.ts`
- Modify: `src/game/ui/SkillIconSvg.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/styles.css`
- Modify: `tests/unit/HudV2.test.ts`
- Modify: `tests/unit/MobileLayoutCss.test.ts`
- Modify: `tests/unit/GameSceneRenderFrame.test.ts`
- Modify: `tests/unit/createGameConfig.test.ts`
- Modify: `tests/unit/TestBridgeLifecycle.test.ts`

**Interfaces:**
- Consumes: `RunSnapshot.actionStates`, `queuePlayerAction`, `queueSkillPurchase`
- Produces: `ActionButtonModel`, `ActionDockSnapshot`
- Produces: 좌상단 `덕배·자동` 한 행

- [ ] **Step 1: 버튼 상태 실패 테스트 작성**

```ts
const models = actionButtons(runSnapshot({
  snacks: 30,
  learnedSkills: { tailSwipe: false, aquaBeam: true, safetyReport: false },
  actionStates: {
    bark: actionState({ ready: true, progress: 1 }),
    tailSwipe: actionState({ learned: false, ready: false, progress: 0 }),
    aquaBeam: actionState({ learned: true, ready: false, cooldownRemainingMs: 2400, progress: 0.76 }),
    safetyReport: actionState({ learned: false, ready: false, progress: 0 }),
  },
}));
expect(models.map(({ id, mode, disabled, remainingSeconds }) => ({ id, mode, disabled, remainingSeconds })))
  .toEqual([
    { id: 'bark', mode: 'cast', disabled: false, remainingSeconds: 0 },
    { id: 'tailSwipe', mode: 'buy', disabled: false, remainingSeconds: 0 },
    { id: 'aquaBeam', mode: 'cooldown', disabled: true, remainingSeconds: 3 },
    { id: 'safetyReport', mode: 'locked', disabled: true, remainingSeconds: 0 },
  ]);
```

- [ ] **Step 2: DOM과 CSS 실패 테스트 작성**

```ts
expect(button.disabled).toBe(true);
expect(button.style.getPropertyValue('--cooldown-angle')).toBe('86.4deg');
expect(button.querySelector('.action-button__remaining')?.textContent).toBe('3');
expect(button.getAttribute('aria-label')).toBe('아쿠아빔, 쿨타임 3초');
```

  - `MobileLayoutCss.test.ts`는 `.action-dock`이 left/bottom safe-area를 사용하고 `.virtual-joystick`이 right에 남는지 검증한다.
  - `.action-button`의 width/height 56px, `.action-dock`의 2열 grid, joystick 112px를 정확히 검증한다.

- [ ] **Step 3: red 확인**
  - Run: `npx vitest run tests/unit/ActionDock.test.ts tests/unit/CompanionStatusHud.test.ts tests/unit/HudV2.test.ts tests/unit/MobileLayoutCss.test.ts tests/unit/GameSceneRenderFrame.test.ts tests/unit/createGameConfig.test.ts`
  - Expected: 새 HUD 모듈과 CSS selector 부재로 FAIL.

- [ ] **Step 4: ActionDock 모델과 입력 분기 구현**

```ts
export interface ActionButtonModel {
  readonly id: PlayerActionId;
  readonly mode: 'cast' | 'buy' | 'locked' | 'queued' | 'cooldown';
  readonly disabled: boolean;
  readonly affordable: boolean;
  readonly cooldownAngleDeg: number;
  readonly remainingSeconds: number;
  readonly accessibleName: string;
}
```

```ts
private activate(actionId: PlayerActionId): void {
  const model = this.models.find(({ id }) => id === actionId);
  if (model === undefined || model.disabled) return;
  if (model.mode === 'buy') {
    const result = this.queuePurchase(actionId as PurchasableSkillId);
    if (result.status === 'queued') this.queuedSkillId = actionId as PurchasableSkillId;
    return;
  }
  this.queueAction(actionId);
}
```

  - 렌더 순서는 bark, tailSwipe, aquaBeam, safetyReport다.
  - 구매 성공 handler는 반드시 `return`해 같은 탭에서 시전하지 않게 한다.
  - `cooldownAngleDeg`는 `(1 - progress) * 360`, 남은 초는 `Math.ceil(cooldownRemainingMs / 1000)`이다.
  - noTarget `playerActionRejected`만 `HudSystem.showNoTarget()`으로 `대상이 없어요` 토스트를 700ms 표시한다.

- [ ] **Step 5: CSS 쿨타임 시계 구현**

```css
.action-dock {
  position: absolute;
  left: max(12px, env(safe-area-inset-left));
  bottom: max(14px, env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: repeat(2, 56px);
  grid-template-rows: auto repeat(2, 56px);
  gap: 7px;
  pointer-events: auto;
}
.action-button {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  touch-action: manipulation;
}
.action-button__cooldown {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: conic-gradient(rgba(42, 34, 28, .72) var(--cooldown-angle), transparent 0);
  pointer-events: none;
}
```

  - `prefers-reduced-motion`에서는 ready pulse를 제거하고 테두리 색만 변경한다.
  - 간식 수는 grid 첫 행 전체를 차지한다.
  - 기존 bottom skill dock 높이를 제거하고 joystick bottom은 safe-area + 16px로 단순화한다.

- [ ] **Step 6: HudSystem과 Scene 연결**

```ts
this.hud = new HudSystem({
  root,
  queueSkillPurchase: (skillId) => this.session.queueSkillPurchase(skillId),
  queuePlayerAction: (actionId) => this.session.queuePlayerAction(actionId),
  mutePort,
});
```

  - `CompanionStatusHud`는 companion cooldown과 관계없이 `덕배·자동`을 항상 표시하고 `ready` data 속성만 갱신한다.
  - `GameScene.applySessionEvents`는 `playerActionRejected/noTarget`을 HUD에 전달한다.
  - `SNACK_DOCK_TARGET`을 왼쪽 버튼 묶음의 간식 표시 중심 `{ x: 48, y: 790 }`으로 변경한다.

- [ ] **Step 7: green과 타입 확인**
  - Run: `npx vitest run tests/unit/ActionDock.test.ts tests/unit/CompanionStatusHud.test.ts tests/unit/HudV2.test.ts tests/unit/MobileLayoutCss.test.ts tests/unit/GameSceneRenderFrame.test.ts tests/unit/createGameConfig.test.ts tests/unit/TestBridgeLifecycle.test.ts`
  - Run: `npm run typecheck`
  - Expected: 두 명령 모두 exit 0.

- [ ] **Step 8: 커밋**

```bash
git add -- src/game/ui/ActionDock.ts src/game/ui/CompanionStatusHud.ts src/game/ui/SkillDock.ts src/game/ui/AutoSkillHud.ts src/game/ui/HudSystem.ts src/game/ui/HudLayout.ts src/game/ui/SkillIconSvg.ts src/game/scenes/GameScene.ts src/styles.css tests/unit/ActionDock.test.ts tests/unit/CompanionStatusHud.test.ts tests/unit/HudV2.test.ts tests/unit/MobileLayoutCss.test.ts tests/unit/GameSceneRenderFrame.test.ts tests/unit/createGameConfig.test.ts tests/unit/TestBridgeLifecycle.test.ts
git commit -m "feat: 왼손 기술 버튼과 쿨타임 추가"
```

---

### Task 7: 보호소 런타임·에셋·문구 제거

**Files:**
- Delete: `src/game/shelter/ShelterSystem.ts`
- Delete: `src/game/shelter/ShelterTypes.ts`
- Delete: `src/game/shelter/ShelterView.ts`
- Delete: `src/game/ui/ShelterHpView.ts`
- Delete: `tests/unit/ShelterSystem.test.ts`
- Delete: `assets/source/generated/shelter-states-edit.png`
- Delete: `assets/source/generated/v2/shelter-states.png`
- Delete: `public/assets/shelter/shelter-states.png`
- Delete: `tests/visual/__snapshots__/desktop-chromium/e2e/gameplay-visuals.spec.ts/shelter-defeat.png`
- Delete: `tests/visual/__snapshots__/mobile-chromium/e2e/gameplay-visuals.spec.ts/shelter-defeat.png`
- Modify: `src/game/assets/AssetKeys.ts`
- Modify: `src/game/assets/assetManifest.ts`
- Modify: `src/game/presentation/PresentationConfig.ts`
- Modify: `src/game/scenes/PreloadScene.ts`
- Modify: `src/game/scenes/TitleScene.ts`
- Modify: `src/game/scenes/ResultCopy.ts`
- Modify: `src/game/scenes/ResultScene.ts`
- Modify: `src/game/data/balance.ts`
- Modify: `assets/source/generated-approvals.json`
- Modify: `scripts/assets/manifest.mjs`
- Modify: `scripts/assets/prepare-v2-character-sheets.mjs`
- Modify: `scripts/assets/approve-v2-character-assets.mjs`
- Modify: `scripts/assets/build-assets.mjs`
- Modify: `scripts/assets/verify-assets.mjs`
- Modify: `scripts/assets/render-asset-review.mjs`
- Modify: `tests/assets/asset-pipeline.test.ts`
- Modify: `tests/assets/asset-validation.test.ts`
- Modify: `tests/unit/AnimationManifest.test.ts`
- Modify: `tests/unit/RequiredAssetStatus.test.ts`
- Modify: `tests/unit/PresentationConfig.test.ts`
- Modify: `tests/unit/GameDataValidation.test.ts`
- Modify: `tests/unit/Balance.test.ts`
- Modify: `tests/unit/ResultScene.test.ts`
- Modify: `tests/unit/createGameConfig.test.ts`
- Modify: `tests/unit/TestBridgeLifecycle.test.ts`
- Modify: `tests/unit/PathSystem.test.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/error-recovery.spec.ts`
- Modify: `tests/e2e/full-run.spec.ts`
- Modify: `tests/e2e/gameplay-visuals.spec.ts`
- Modify: `tests/e2e/mobile-layout.spec.ts`
- Modify: `tests/e2e/title-and-input.spec.ts`
- Modify: `tests/e2e/wave-schedule.spec.ts`
- Modify: `tests/visual/asset-review.spec.ts`

**Interfaces:**
- Removes: `AssetKeys.shelter`, `BALANCE.shelter`, shelter manifest/build/verify/review contracts
- Produces: 보호소 없는 시작·승리·패배·재시작 copy

- [ ] **Step 1: 보호소 의존성 실패 테스트 작성**

```ts
it('라이브 소스와 에셋 파이프라인에 보호소 식별자가 없다', () => {
  for (const file of liveSourceFiles()) {
    expect(source(file), file).not.toMatch(/shelter|Shelter|보호소/);
  }
});
```

```ts
expect(resultMessage('won')).toBe('후추와 덕배가 끝까지 살아남았어요!');
expect(resultMessage('lost')).toBe('후추가 쓰러졌어요');
expect(resultButtonLabel()).toBe('다시 도전하기');
```

- [ ] **Step 2: red 확인**
  - Run: `npx vitest run tests/assets/asset-pipeline.test.ts tests/assets/asset-validation.test.ts tests/unit/AnimationManifest.test.ts tests/unit/RequiredAssetStatus.test.ts tests/unit/ResultScene.test.ts tests/unit/createGameConfig.test.ts`
  - Expected: 보호소 manifest/build/review와 이전 copy 기대 때문에 FAIL.

- [ ] **Step 3: 런타임과 copy 제거**

```ts
export function resultMessage(outcome: RunResult): string {
  return outcome === 'won'
    ? '후추와 덕배가 끝까지 살아남았어요!'
    : '후추가 쓰러졌어요';
}

export function resultButtonLabel(): '다시 도전하기' {
  return '다시 도전하기';
}
```

  - `TitleScene` 버튼을 `함께 출발하기`로 변경한다.
  - `AssetKeys.shelter`, preload row, `HUCHU_PRESENTATION.shelterOpaqueHeightLogical`, `BALANCE.shelter`를 삭제한다.
  - shelter 소스·런타임 PNG와 네 TypeScript 파일을 삭제한다.

- [ ] **Step 4: 에셋 파이프라인 제거**

  - `scripts/assets/manifest.mjs`에서 `shelterAsset`, `outlinePolicy.shelterPx`를 삭제한다.
  - `prepare-v2-character-sheets.mjs`에서 shelter normalization 호출을 삭제한다.
  - `approve-v2-character-assets.mjs`는 17개 캐릭터 source만 승인하고 shelter reference를 만들지 않는다.
  - `generated-approvals.json`에서 `assets/source/generated/shelter-states-edit.png` 행을 삭제한다.
  - `build-assets.mjs`에서 `buildShelterBuffer`, `buildShelter`, build 호출을 삭제한다.
  - `verify-assets.mjs`에서 shelter 검증·freshness·필수 source와 완료 로그를 삭제한다.
  - `render-asset-review.mjs`의 shelter data, `shelter-hp-and-skill-dock`, map overlay를 삭제하고 `labels-hp-and-damage-numbers`는 유지한다.
  - `tests/visual/asset-review.spec.ts`는 캐릭터·적 이름·HP·피해 숫자만 검증하고 두 사용자 소유 snapshot은 갱신하지 않는다.

- [ ] **Step 5: debug와 E2E 소스 타입 계약 정리**

  - `tests/e2e/helpers.ts`의 `finalShelterHp`를 `finalPlayerHp`로 바꾸고 `playerDamaged`를 집계한다.
  - full-run 동시 종료 기대를 `playerDamaged.hp === 0`으로 바꾼다.
  - `gameplay-visuals.spec.ts`에서 `shelter-defeat` 시나리오 행을 제거하고 해당 snapshot 두 개를 삭제한다.
  - mobile layout은 후추 발밑 HP와 왼손 ActionDock을 검증한다.
  - title/input 테스트는 `함께 출발하기`, result 테스트는 `다시 도전하기`를 사용한다.
  - E2E 명령은 실행하지 않고 `npm run typecheck`로 소스 호환만 확인한다.

- [ ] **Step 6: 에셋·단위 green 확인**
  - Run: `npx vitest run tests/assets/asset-pipeline.test.ts tests/assets/asset-validation.test.ts tests/unit/AnimationManifest.test.ts tests/unit/RequiredAssetStatus.test.ts tests/unit/PresentationConfig.test.ts tests/unit/GameDataValidation.test.ts tests/unit/Balance.test.ts tests/unit/PathSystem.test.ts tests/unit/ResultScene.test.ts tests/unit/createGameConfig.test.ts tests/unit/TestBridgeLifecycle.test.ts`
  - Run: `npm run assets:verify`
  - Run: `npm run assets:review`
  - Run: `npm run typecheck`
  - Expected: 네 명령 모두 exit 0이고 사용자 소유 snapshot 두 개의 hash가 실행 전과 같다.

- [ ] **Step 7: 보호소 식별자 정적 확인**
  - Run: `rg -n "shelter|Shelter|보호소" src scripts/assets tests --glob '!tests/visual/__snapshots__/desktop-chromium/visual/asset-review.spec.ts/asset-review.png' --glob '!tests/visual/__snapshots__/mobile-chromium/visual/asset-review.spec.ts/asset-review.png'`
  - Expected: 출력 없음.

- [ ] **Step 8: 커밋**

```bash
git add -- \
  src/game/shelter/ShelterSystem.ts src/game/shelter/ShelterTypes.ts src/game/shelter/ShelterView.ts src/game/ui/ShelterHpView.ts \
  src/game/assets/AssetKeys.ts src/game/assets/assetManifest.ts src/game/presentation/PresentationConfig.ts src/game/scenes/PreloadScene.ts src/game/scenes/TitleScene.ts src/game/scenes/ResultCopy.ts src/game/scenes/ResultScene.ts src/game/data/balance.ts \
  assets/source/generated/shelter-states-edit.png assets/source/generated/v2/shelter-states.png public/assets/shelter/shelter-states.png assets/source/generated-approvals.json \
  scripts/assets/manifest.mjs scripts/assets/prepare-v2-character-sheets.mjs scripts/assets/approve-v2-character-assets.mjs scripts/assets/build-assets.mjs scripts/assets/verify-assets.mjs scripts/assets/render-asset-review.mjs \
  tests/unit/ShelterSystem.test.ts tests/assets/asset-pipeline.test.ts tests/assets/asset-validation.test.ts tests/unit/AnimationManifest.test.ts tests/unit/RequiredAssetStatus.test.ts tests/unit/PresentationConfig.test.ts tests/unit/GameDataValidation.test.ts tests/unit/Balance.test.ts tests/unit/ResultScene.test.ts tests/unit/createGameConfig.test.ts tests/unit/TestBridgeLifecycle.test.ts tests/unit/PathSystem.test.ts \
  tests/e2e/helpers.ts tests/e2e/error-recovery.spec.ts tests/e2e/full-run.spec.ts tests/e2e/gameplay-visuals.spec.ts tests/e2e/mobile-layout.spec.ts tests/e2e/title-and-input.spec.ts tests/e2e/wave-schedule.spec.ts tests/visual/asset-review.spec.ts \
  tests/visual/__snapshots__/desktop-chromium/e2e/gameplay-visuals.spec.ts/shelter-defeat.png tests/visual/__snapshots__/mobile-chromium/e2e/gameplay-visuals.spec.ts/shelter-defeat.png
git commit -m "refactor: 보호소 런타임과 에셋 제거"
```

---

### Task 8: 전체 회귀 검증과 백로그 완료

**Files:**
- Modify: `docs/backlog.md`

**Interfaces:**
- Consumes: Task 1~7 전체 구현
- Produces: HD-BL-014 완료 근거와 로컬 검증 증거

- [ ] **Step 1: 전체 단위·에셋 테스트 실행**
  - Run: `npm run test:unit`
  - Expected: 모든 `tests/unit`과 `tests/assets` 테스트 PASS.

- [ ] **Step 2: 정적·프로덕션 검증 실행**
  - Run: `npm run typecheck`
  - Run: `npm run build`
  - Run: `git diff --check`
  - Expected: 세 명령 모두 exit 0.

- [ ] **Step 3: E2E 제외와 사용자 snapshot 보존 확인**
  - Run: `git status --short`
  - Expected: E2E 실행 결과 파일이 없고, 사용자 소유 asset-review snapshot 두 개는 구현 전 상태와 동일한 변경 상태로 남아 있으며 스테이징되지 않았다.
  - `npm run test:e2e`, `npm run test:visual:candidates`, Playwright 명령은 실행하지 않는다.

- [ ] **Step 4: 백로그 완료 근거 기록**

```md
### HD-BL-014 후추 생존·덕배 컴패니언·수동 전투 전환

- 상태: 완료 (2026-07-22)
- 구현 근거: 후추 HP 1,000과 패배 우선 승패, 최대 5Hz 공용 경로장, 움직이는 후추 대상 적 공격·투사체 회피, 덕배 자동 공격, 네 수동 기술과 2×2 왼손 쿨타임 버튼을 적용했다. 보호소 런타임·에셋·문구 의존성을 제거했고 단위·에셋 테스트, 타입 검사, 프로덕션 빌드와 diff 검사를 통과했다. E2E와 사용자 소유 시각 snapshot은 제외했다.
```

- [ ] **Step 5: 최종 diff 범위 확인**
  - Run: `git diff --stat 0bbd4ef..HEAD`
  - Run: `git diff -- docs/backlog.md`
  - Run: `git diff --name-only --cached`
  - Expected: 첫 출력에는 Task 1~7의 커밋된 구현·테스트 파일만, 두 번째에는 HD-BL-014 완료 기록만 보이며 cached 출력은 비어 있다. 두 사용자 소유 asset-review snapshot은 어느 커밋에도 없다.

- [ ] **Step 6: 문서 커밋**

```bash
git add -- docs/backlog.md
test "$(git diff --cached --name-only)" = "docs/backlog.md"
git commit -m "docs: 후추 생존형 전환 백로그 완료"
```

- [ ] **Step 7: 최종 상태 기록**
  - Run: `git log --oneline -10`
  - Run: `git status --short`
  - Expected: Task 1~8 커밋이 순서대로 보이고 남은 변경은 사용자 소유 asset-review snapshot 두 개뿐이다.

## Execution Boundary

- 이 계획은 로컬 구현·검증·커밋까지 포함한다.
- 원격 push, GitHub Pages 배포와 공개 URL 검증은 사용자가 별도로 요청한 뒤 수행한다.
