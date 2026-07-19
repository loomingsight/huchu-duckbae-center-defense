# Task 8 구현 보고서 — 위협도 자동 조준과 기본 짖기

## 결과

- `TargetingSystem`은 살아 있는 사거리 내 적을 ETA → 플레이어 거리 → boss → spawnSequence 순으로 정렬하고, 완전 동률은 input order를 보존한다
- `rankThreatTargets`의 생략 range와 `+Infinity`는 이후 전장 전체 정렬용 sentinel로 허용하고, NaN·음수·`-Infinity`·비숫자는 거부한다
- `CombatSystem`은 한 apply batch에서 같은 attack-target pair만 dedupe하며 같은 cast의 multi-target과 다음 batch 재사용은 허용한다
- `BarkSystem`은 pure `ready → windup → cooldown` 상태 머신으로 250ms release, level 1/2의 650ms cadence, level 3의 520ms cadence를 처리한다
- windup target lock, release 생존 gate, cadence 경계의 stale-target 생존 gate, 여러 경계를 넘는 큰 step의 overshoot, reset 재현성을 고정했다
- `GameSession`은 spawn/move → target → bark → combat → lifecycle flush 순으로 실제 `EnemySystem`을 연결한다
- cast마다 `bark:1`, `bark:2` 형식의 deterministic unique attackId를 만들고 reset에서 sequence를 초기화한다
- release visual event와 내부 damage command를 분리하고, lethal target도 pre-damage 위치를 visual event에 보존한다
- `EnemySystem.damage()`의 lethal delete를 통해 `enemyDied`와 `snackEarned`가 정확히 한 번 발생하고 `RunSnapshot.snacks`에 한 번만 누적된다
- `PlayerView`는 이동 중에도 snapshot 위치를 적용하며 frames 4~7을 8fps one-shot resolver로 표시한다. animation callback은 사용하지 않는다
- 짖기 파동은 capacity 8의 eager fixed pool에서만 acquire하고, 180ms simulation age로 radius와 alpha를 계산하며 70도 cone 안에서 표시한다
- scenario reset은 같은 effect pool을 재사용하고 Scene shutdown/restart는 기존 Phaser object reference를 폐기한 뒤 새 lifecycle pool을 만든다
- `bark-targeting`은 실제 `GameSession`·`EnemySystem` 적 두 명으로 target 선택, HP, HP bar, snacks, combat event sequence를 노출한다

## TDD RED / GREEN

### Targeting 모듈 부재 RED

- 명령: `npm run test:unit -- tests/unit/TargetingSystem.test.ts`
- 결과: exit 1, `Cannot find module '../../src/game/combat/TargetingSystem'`, 1 failed suite / 0 tests
- GREEN: spawnSequence 뒤 stable input-order tie, range boundary/dead exclusion, default `+Infinity`, invalid player/range/enemy input, 원본 불변성 통과

### Combat 모듈 부재 RED

- 명령: `npm run test:unit -- tests/unit/CombatSystem.test.ts`
- 결과: exit 1, `Cannot find module '../../src/game/combat/CombatSystem'`, 1 failed suite / 0 tests
- GREEN: batch-local pair dedupe, same-cast multi-target, colon attackId 충돌 방지, atomic validation, 입력 불변성 통과

### Bark 모듈 부재 RED

- 명령: `npm run test:unit -- tests/unit/BarkSystem.test.ts`
- 결과: exit 1, `Cannot find module '../../src/game/combat/BarkSystem'`, 1 failed suite / 0 tests
- GREEN: 250/650/520ms 경계, target lock/alive, level 2 damage 13, large-step split 동등성, reset·invalid input 통과

### GameSession 통합 RED

- 명령: `npm run test:unit -- tests/unit/CombatSystem.test.ts`
- 결과: 4 failed / 14 passed
- exact 증상: target HP expected 25 / received 35, lethal enemy가 남음, bark attackId 배열 expected `['bark:1','bark:2']` / received `[]`, resume 뒤 release count expected 1 / received 0
- GREEN: 실제 EnemySystem HP 35→25, death/snack once, attackId reset 재현, pause simulation release 통과

### PlayerView effect RED

- 명령: `npm run test:unit -- tests/unit/BarkSystem.test.ts`
- 결과: 7 failed / 23 passed
- exact 증상: `barkWaveVisualAt is not a function`, `view.effectPoolSnapshot is not a function`
- GREEN: 70도 cone, simulation-age alpha, fixed cap, 이동 중 attack frame, reset/destroy 수명 통과

### 브라우저 scenario RED

- 명령: `npm run test:e2e -- tests/e2e/combat.spec.ts --project=desktop-chromium`
- 결과: 3 failed, exact error `RangeError: Unknown test scenario: bark-targeting`
- GREEN: desktop/mobile combat 8 passed

### 독립 리뷰 RED / GREEN

- 최초 review: Critical 0, Important 2, Changes requested
- stale target RED: expected `[]`, received `barkStarted → barkReleased → barkStarted`
- 수정: Bark start가 ready와 cadence 경계 모두에서 주입된 `isAlive`를 확인하도록 변경
- HP bar 수정: debug의 합성 `visible` schema 외에 실제 canvas logical pixel `(257, 537)`이 yellow `0xf2ca45`인지 desktop/mobile에서 확인
- targeted re-review: Critical/Important 잔여 없음, Ready

## 변경 파일

- `src/game/combat/{CombatTypes,CombatSystem,TargetingSystem,BarkSystem}.ts`
- `src/game/session/GameSession.ts`
- `src/game/events/GameEvents.ts`
- `src/game/player/PlayerView.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/debug/{TestContract,TestBridge,ScenarioFactory}.ts`
- `tests/unit/{fixtures,CombatSystem,TargetingSystem,BarkSystem}.ts`
- `tests/e2e/combat.spec.ts`
- `.superpowers/sdd/task-8-report.md`

`EnemySystem.ts`의 기존 lethal delete와 `damage/has/snapshots` 계약이 Task 8 요구를 충족해 추가 변경하지 않았다.

## 최종 검증

- focused unit: 3 files / 68 tests 통과
- 전체 unit: 25 files / 251 tests 통과
- `npm run build`: typecheck 및 production build exit 0
- desktop E2E: 16 passed / 3 expected mobile-only skipped / 0 failed
- mobile E2E: 19 passed / 0 failed
- Task 8 combat E2E: desktop/mobile 8 passed
- production scan: `__HUCHU_TEST__`, 4개 scenario id, debug bridge/port 문자열 match 0
- pure combat scan: Phaser, Date/performance, RAF/timer, Math.random match 0
- changed source/test unsafe type scan: `any`, `@ts-ignore`, `@ts-expect-error` match 0
- `git diff --check`: 출력 없음

## 남은 사항

- 기능상 미해결 Critical/Important는 없다
- production build의 기존 Phaser 500kB 초과 chunk 경고와 Playwright의 `NO_COLOR`/`FORCE_COLOR` 경고는 비차단으로 유지된다
- sandbox 최초 E2E server bind는 `listen EPERM: operation not permitted 127.0.0.1:5174`였고, 승인된 로컬 서버 실행 경로에서 desktop/mobile을 검증했다
- 전체 38-case 단일 E2E 실행은 도구의 30초 출력 한계로 summary가 잘려, 동일 전체 suite를 desktop 19개와 mobile 19개로 분리해 각각 exit 0을 확인했다

## 후속 리뷰 수정 — stable targeting과 cadence accessor

### Stable tie RED / GREEN

- RED 명령: `npm run test:unit -- tests/unit/TargetingSystem.test.ts -t "stable sort"`
- RED 결과: expected `[8, 7]`, received `[7, 8]`, 1 failed / 19 skipped
- 수정: comparator의 비계약 `id` tie-break를 제거해 ETA → distance → boss → spawnSequence가 모두 같으면 JavaScript stable sort의 input order를 유지한다
- GREEN: 첫 입력 `[id8, id7]`의 결과 `[8, 7]`, 기존 원본 배열·enemy object·position 불변성 테스트 유지

### Fixed-tick snapshot 제거 RED / GREEN

- RED 명령: `npm run test:unit -- tests/unit/BarkSystem.test.ts tests/unit/GameSession.test.ts -t "accessor|readonly number"`
- RED 결과: `bark.cadenceDurationMs is not a function`, `run.barkCadenceMs is not a function`, 2 failed / 40 skipped
- 수정: `BarkSystem.cadenceDurationMs()`가 현재 level의 cadence 단일값을 제공하고 `GameSession.barkCadenceMs()`가 이를 위임한다
- `GameScene.advanceCombatVisuals()`는 fixed tick마다 `session.snapshot()`으로 전체 enemy snapshot 정렬·할당하지 않고 scalar cadence만 읽는다
- level 1의 650ms와 `setLevel(3)` 이후 520ms를 검증해 이후 skill level 변경도 accessor에 즉시 반영됨을 고정했다
- GREEN 명령: `npm run test:unit -- tests/unit/TargetingSystem.test.ts tests/unit/BarkSystem.test.ts tests/unit/GameSession.test.ts`
- GREEN 결과: 3 files / 62 tests 통과

### 후속 최종 검증

- 전체 unit: 25 files / 254 tests 통과
- `npm run build`: TypeScript `tsc --noEmit` 및 Vite production build exit 0
- combat E2E: desktop/mobile 8 passed / 0 failed
- production debug scan: `__HUCHU_TEST__`, 4개 scenario id, debug bridge/port 문자열 match 0
- pure combat scan: Phaser, Date/performance, RAF/timer, `Math.random` match 0
- fixed-tick 경로 scan: `advanceCombatVisuals()`는 `session.barkCadenceMs()`만 사용하며 `session.snapshot()` 호출 없음
- `git diff --check`: 출력 없음
- 기존 Phaser 500kB 초과 chunk 경고와 Playwright `NO_COLOR`/`FORCE_COLOR` 경고만 비차단으로 유지된다
