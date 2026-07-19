# Task 6 구현 보고서

## 결과

- 검증된 `WAVE_DEFINITIONS`를 그대로 소비하는 elapsed simulation time 기반 `WaveSystem`을 추가했다
- cap이 찬 spawn은 cursor 앞에서 보류해 요청을 유실하거나 `atMs`·순서를 바꾸지 않는다
- W5 runtime boss variant는 `start(5)`에서 RNG를 정확히 한 번 소비해 해당 wave 동안 고정한다
- `GameSession`이 `GameStateMachine`, `SeededRng`, `WaveSystem`, `simulationTicks`의 canonical owner가 됐다
- `GameScene`의 real/manual 진행을 player-first `advanceSimulationStep` 하나로 합치고 Task 5 `manualTicks`와 Scene-local state machine을 제거했다
- bridge snapshot은 `GameSession.snapshot()`을 기준으로 만들며 `wave-schedule` factory를 실제로 load한다
- `enemySpawnRequested`는 Task 7 전까지 DEV debug marker로만 표시하고 실제 enemy actor/count로 해석하지 않는다
- `waveCountdownChanged`는 중앙 `3,2,1` text 갱신 및 `remainingMs <= 0` clear만 담당한다

## TDD RED / GREEN

### WaveSystem RED

- 명령: `npm run test:unit -- tests/unit/WaveSystem.test.ts`
- 결과: exit 1, 1 suite failed / 0 tests
- exact failure: `Error: Cannot find module '../../src/game/waves/WaveSystem' imported from .../tests/unit/WaveSystem.test.ts`
- 의미: 아직 없는 deterministic wave scheduler 계약 때문에 실패함을 확인했다

### WaveSystem GREEN

- 같은 focused 명령에서 1 file / 17 tests 통과
- exact W1~W5 count, W1/W2 schedule, regular variant 교대, W3 boss gap, W4/W5 동시 path, W5 RNG, cap 보류, invalid 입력과 start 경계를 확인했다

### GameSession RED

- 명령: `npm run test:unit -- tests/unit/GameSession.test.ts`
- 결과: exit 1, 1 suite failed / 0 tests
- exact failure: `Error: Cannot find module '../../src/game/session/GameSession' imported from .../tests/unit/GameSession.test.ts`
- 의미: canonical session owner와 fixed-step snapshot 계약 부재 때문에 실패함을 확인했다

### GameSession GREEN

- WaveSystem과 함께 2 files / 24 tests 통과
- pause 무진행, 600 fixed ticks의 exact W1 request 10개, full Task 6 snapshot, invalid step/seed, reset state identity, visibility pause/resume를 확인했다

### wave-schedule bridge RED / GREEN

- RED 명령: `npm run test:e2e -- tests/e2e/wave-schedule.spec.ts --project=desktop-chromium`
- RED exact failure: `page.evaluate: RangeError: Unknown test scenario: wave-schedule`
- Scene/session/bridge/factory 연결 뒤 같은 명령에서 1 passed
- `advance(10_000)`이 request sequence `1..10`, spawnSequence `0..9`, W1 exact path/kind/variant/atMs와 snapshot `pendingSpawns: 0`, marker `activeEnemyCount: 10`을 만든다

## RNG preview 해석

- brief의 명시 테스트를 우선해 `previewBoss(5)`는 전달된 진단용 `WaveSystem` RNG를 한 번 소비해 `0.1 -> male`, `0.9 -> female`을 반환한다
- runtime 보장은 별도다. 실제 session instance는 preview를 호출하지 않으며 `start(5)`가 RNG를 정확히 한 번 소비하고 breeder variant를 고정한다
- 따라서 pause, resize, render frame 수는 runtime RNG 소비에 영향을 주지 않는다

## Task 6 경계

- spawn request marker는 실제 적 actor가 아니며 Task 7의 `EnemySystem`이 생기기 전 임시 count다
- marker가 제거되지 않는 Task 6에서는 wave clear가 발생하지 않으므로 `waveCountdownChanged` producer와 실제 next-wave countdown은 후속 full-run task 범위다
- 이번 Task에서는 event union과 Scene의 countdown 표시·clear consumer만 구현해 데이터와 후속 설계를 앞당겨 재구성하지 않았다

## 변경 파일

- `src/game/waves/WaveSystem.ts`
- `src/game/session/GameSession.ts`
- `src/game/session/RunSnapshot.ts`
- `src/game/events/GameEvents.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/debug/TestContract.ts`
- `src/game/debug/TestBridge.ts`
- `src/game/debug/ScenarioFactory.ts`
- `tests/unit/WaveSystem.test.ts`
- `tests/unit/GameSession.test.ts`
- `tests/e2e/wave-schedule.spec.ts`
- `.superpowers/sdd/task-6-report.md`

## 검증

- focused WaveSystem/GameSession: 2 files / 24 tests 통과
- focused Task 5 bridge 회귀 포함: 4 files / 30 tests 통과
- 전체 unit: 19 files / 119 tests 통과
- `npm run typecheck`: exit 0
- `npm run build`: exit 0, production bundle 생성
- Task 5 desktop/mobile + Task 6 wave E2E: 21 passed / 3 expected skipped / 0 failed
- production `dist` scan: `__HUCHU_TEST__|empty-run|wave-schedule|advanceWithoutFlush|ScenarioFactory|TestBridge` match 0
- pure WaveSystem/session scan: Phaser 및 wall-clock API match 0
- `git diff --check`: exit 0

## 우려 및 후속

- 기능상 미해결 우려는 없다
- production JS chunk가 500 kB를 넘는 기존 Vite 경고는 계속 출력되지만 build는 성공했다

---

## 독립 리뷰 수정: boss preview 결정성과 snapshot 격리

### RED

- 명령: `npm run test:unit -- tests/unit/WaveSystem.test.ts tests/unit/GameSession.test.ts`
- 결과: 2 files failed, 9 failed / 25 passed
- preview 후 start RED: W5 preview는 `female`이었지만 실제 boss는 `male`
- start 후 preview RED: start에서 고른 값은 `male`이었지만 preview는 `female`
- invalid cap RED: `0`, `-1`, `1.5`, `NaN`, `Infinity`, safe integer 초과가 모두 `expected function to throw an error, but it didn't`
- skills mutation RED: expected `[1, 1, 1]`, received `[3, 3, 3]`

### GREEN

- seeded boss variant를 wave별 cache/ensure로 선택해 `preview -> start -> step`, `start -> preview -> step` 모두 같은 variant를 사용한다
- 동일 `WaveSystem`에서 W5 RNG 소비는 호출 순서와 무관하게 총 한 번이며 dogTrader preview는 RNG를 소비하지 않는다
- `enemyCap` 생성자는 positive safe integer만 허용한다
- `GameSession.snapshot()`은 매번 새 skills 객체를 반환해 외부 mutation이 같은 session, 다른 session, reset 이후 snapshot을 오염시키지 않는다
- focused WaveSystem/GameSession: 2 files / 34 tests 통과

### 재검증

- 전체 unit: 19 files / 129 tests 통과
- `npm run build`: typecheck 포함 exit 0
- Task 5 desktop/mobile + Task 6 wave E2E: 21 passed / 3 expected skipped / 0 failed
- production debug scan과 pure WaveSystem/session wall-clock·Phaser scan: match 0
- 변경 범위: `WaveSystem`, `GameSession`, 두 unit test와 이 보고서만 수정
- `git diff --check`: exit 0
