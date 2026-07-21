# Boss Arrival and Wave End Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보스 대기 공백을 제거하고 등장 진동·총 40% 속도·웨이브 종료 연출 순서를 구현한다.

**Architecture:** `WaveSystem`이 활성 적 0명일 때 다음 보스를 조기 방출하고, `GameScene`은 논리 종료와 프레젠테이션 종료를 `WaveEndPresentationGate`로 분리한다. 보스 진동 규칙과 종료 게이트는 Phaser와 분리된 순수 모듈로 둔다.

**Tech Stack:** TypeScript 7, Phaser 4, Vitest 4, Vite 8

## Global Constraints

- 개장수와 불법번식업자는 12시 P3에서 출현한다.
- 개장수 속도는 35, 불법번식업자 속도는 32.2다.
- 보스 HP·피해량·공격 주기와 패턴은 변경하지 않는다.
- 웨이브 종료 UI는 사망 actor, 피해량 숫자와 간식 비행 효과가 모두 사라진 뒤 표시한다.
- 패배 흐름은 변경하지 않는다.
- E2E와 시각 스냅샷 테스트는 실행하지 않는다.

---

### Task 1: 보스 조기 출현과 즉시 화면 진입

**Files:**
- Modify: `tests/unit/WaveSystem.test.ts`
- Modify: `tests/unit/EnemySystem.test.ts`
- Modify: `src/game/waves/WaveSystem.ts`
- Modify: `src/game/enemies/EnemySystem.ts`

**Interfaces:**
- Consumes: `WaveSystem.step(stepMs, activeEnemies)`와 `EnemySystem.spawn(request)`
- Produces: 다음 예약 spawn이 보스이고 `activeEnemies===0`이면 조기 요청, 개장수 기본 `pathProgress===0`

- [ ] **Step 1: 실패 테스트 작성**
  - 미래 시각의 다음 항목이 보스일 때 활성 적 1명은 대기하고 0명이 되는 호출에서 보스가 한 번만 반환되는 테스트를 추가한다.
  - 개장수 기본 진행도가 0이고 트럭 오프셋용 음수 진행도까지 넉백되지 않는 테스트로 기존 -70 기대를 교체한다.
- [ ] **Step 2: red 확인**
  - Run: `npx vitest run tests/unit/WaveSystem.test.ts tests/unit/EnemySystem.test.ts`
  - Expected: 조기 보스 요청과 개장수 진행도 0 기대가 실패한다.
- [ ] **Step 3: 최소 구현**
  - `WaveSystem.step`의 도달 조건에 `isBoss(scheduled) && activeEnemies===0 && requests.length===0`을 허용한다.
  - `EnemySystem.minimumProgress`가 모든 종류에 0을 반환하도록 한다.
- [ ] **Step 4: green 확인**
  - Run: `npx vitest run tests/unit/WaveSystem.test.ts tests/unit/EnemySystem.test.ts`
  - Expected: PASS

### Task 2: 보스 속도와 등장 진동

**Files:**
- Create: `src/game/presentation/BossSpawnFeedback.ts`
- Create: `tests/unit/BossSpawnFeedback.test.ts`
- Modify: `src/game/data/balance.ts`
- Modify: `src/game/enemies/EnemyActor.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `tests/unit/Balance.test.ts`
- Modify: `tests/unit/DogTraderRig.test.ts`
- Modify: `tests/unit/GameScenePresentationAdapter.test.ts`

**Interfaces:**
- Produces: `bossSpawnFeedback(kind, reducedMotion): { durationMs: number; intensity: number } | null`

- [ ] **Step 1: 실패 테스트 작성**
  - 두 보스는 진동 파라미터, 일반 적과 reduced-motion은 `null`을 반환하도록 테스트한다.
  - 밸런스 35/32.2와 보스 이동 애니메이션 배율 1.4를 기대하도록 기존 테스트를 변경한다.
  - `enemySpawned` 처리에서 actor 획득 뒤 camera shake를 호출하는 Scene 배선 테스트를 추가한다.
- [ ] **Step 2: red 확인**
  - Run: `npx vitest run tests/unit/BossSpawnFeedback.test.ts tests/unit/Balance.test.ts tests/unit/DogTraderRig.test.ts tests/unit/GameScenePresentationAdapter.test.ts`
  - Expected: 모듈 부재와 이전 속도 기대 때문에 FAIL
- [ ] **Step 3: 최소 구현**
  - 보스 피드백 순수 함수를 만들고 `GameScene`의 `enemySpawned` 분기에 연결한다.
  - 보스 실제 속도와 이동 애니메이션 배율을 총 1.4배로 변경한다.
- [ ] **Step 4: green 확인**
  - 위 Vitest 명령이 PASS인지 확인한다.

### Task 3: 웨이브 종료 프레젠테이션 게이트

**Files:**
- Create: `src/game/presentation/WaveEndPresentationGate.ts`
- Create: `tests/unit/WaveEndPresentationGate.test.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `tests/unit/GameSceneRenderFrame.test.ts`
- Modify: `tests/unit/GameScenePresentationAdapter.test.ts`

**Interfaces:**
- Produces: `defer(intent)`, `releaseIf(settled)`, `blocking`, `reset()`
- Consumes: `EnemyActorPool.dyingCount`, `DamageFeedbackPool.snapshot().active`, `CombatEffectPool.effectAges('snackFly')`

- [ ] **Step 1: 실패 테스트 작성**
  - 게이트가 미정리 상태에서 UI 의도를 보관하고 정리 후 정확히 한 번 반환하며 충돌 의도를 거부하는 테스트를 추가한다.
  - Scene이 non-world step에서 프레젠테이션을 진행하고 countdown/result UI를 게이트를 통해서만 표시하는 배선 테스트를 추가한다.
- [ ] **Step 2: red 확인**
  - Run: `npx vitest run tests/unit/WaveEndPresentationGate.test.ts tests/unit/GameSceneRenderFrame.test.ts tests/unit/GameScenePresentationAdapter.test.ts`
  - Expected: 게이트 모듈 부재와 Scene 즉시 표시 때문에 FAIL
- [ ] **Step 3: 최소 구현**
  - 순수 게이트를 추가하고 reset에 연결한다.
  - 보류 중에는 `combatEffects`, `impactFeedback`, `enemyActors`만 step한다.
  - 세 활성 상태가 모두 0일 때 countdown을 렌더하거나 최종 승리 Result Scene을 연다.
- [ ] **Step 4: green 확인**
  - 위 Vitest 명령이 PASS인지 확인한다.

### Task 4: 전체 검증과 배포

**Files:**
- Modify: `docs/backlog.md`

- [ ] **Step 1: 백로그 완료 근거 기록**
  - HD-BL-012와 HD-BL-013을 완료 섹션으로 옮기고 실제 구현 근거를 기록한다.
- [ ] **Step 2: 정적·단위 검증**
  - Run: `npm run test:unit`
  - Run: `npm run typecheck`
  - Run: `npm run build`
  - Run: `git diff --check`
  - Expected: 모두 exit 0. E2E는 실행하지 않는다.
- [ ] **Step 3: 논리 단위 커밋과 푸시**
  - 기능, 테스트·문서 변경을 검토하고 `main`에 fast-forward 가능한 커밋으로 푸시한다.
- [ ] **Step 4: Pages 확인**
  - GitHub Actions `Deploy GitHub Pages` 성공과 공개 HTML/JS/CSS HTTP 200을 확인한다.
