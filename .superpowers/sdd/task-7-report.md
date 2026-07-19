# Task 7 구현 보고서

## 결과

- `EnemySystem`을 pure fixed-step 모듈로 추가해 경로 이동, 공격 경계 clamp, 60Hz 기절, 넓백, HP, 정확히 한 번의 사망·간식 event를 결정적으로 처리했다
- public numeric input과 runtime enum/path/id 경계를 fail-fast 또는 명시적 unknown-id no-op으로 고정했고, invalid scenario seed는 적을 추가하기 전에 거부한다
- `ObjectPool`은 constructor에서 capacity만큼 eager-create하며 cap 이후 factory를 다시 호출하지 않는다. foreign·double release, reset callback, stable instance identity를 제공한다
- `EnemyActorPool`은 활성 Scene lifecycle당 60 actor를 한 번 만들고 scenario/session reset에서 같은 pool identity를 `releaseAll` 후 재사용한다. Scene shutdown에서는 Phaser가 destroy한 actor reference를 폐기하고 재시작 lifecycle에서 새 pool을 만든다
- actor는 sprite의 발을 container `(0, 0)`으로 삼고 feet y를 depth로 쓴다. `192x256` frame, 표시 높이 `82/102/106`, walk `0~3` 6fps, attack `4~7` 8fps를 snapshot time에서 순수하게 결정한다
- `30x4` HP bar는 full HP에서도 항상 보이며 `> 0.5` 초록, `>= 0.2` 노랑, 그 미만 빨강으로 그린다
- `GameSession.step` 순서는 `WaveSystem.step -> EnemySystem.spawn -> EnemySystem.step -> event flush`로 고정했고 `activeEnemyCount`는 `EnemySystem`이 canonical owner다
- Scene의 임시 spawn marker를 `enemySpawned` event와 actor pool로 교체했고, death/reset에서 actor를 초기화해 반환한다
- bridge에 `health-bar-colors`와 `enemies`, enemy pool snapshot을 추가했고 scenario의 세 seed는 실제 `EnemySystem.spawnForScenario` path projection을 통과한다

## TDD RED / GREEN

### 첫 RED: enemy/pool 모듈 부재

- 명령: `npm run test:unit -- tests/unit/EnemySystem.test.ts tests/unit/PresentationRules.test.ts tests/unit/ObjectPool.test.ts`
- 결과: exit 1, 3 suites failed / 0 tests
- exact failure: `Cannot find module '../../src/game/enemies/EnemySystem'`
- exact failure: `Cannot find module '../../src/game/enemies/EnemyHpBar'`
- exact failure: `Cannot find module '../../src/game/pooling/ObjectPool'`

### ObjectPool GREEN

- focused: 1 file / 10 tests 통과
- eager factory count, cap, foreign·double release, `releaseAll(reset)`, stable/unique `instanceId`, invalid capacity를 확인했다

### EnemySystem 확장 RED / GREEN

- 확장 RED: `EnemySystem.test.ts` 1 suite failed / 0 tests, exact failure는 동일한 module absence
- GREEN: 1 file / 13 tests 통과
- 이동, attack clamp, 180 tick stun, death/snack once, knockback, snapshot 정렬, cap, scenario projection/atomic validation, invalid numeric/enum/path/id, clear id reset을 확인했다

### Presentation 확장 RED / GREEN

- RED: `PresentationRules.test.ts` 1 suite failed / 0 tests
- exact failure: `Cannot find module '../../src/game/enemies/EnemyActor'`
- GREEN: 1 file / 20 tests 통과
- HP 임계·invalid current/max/ratio, frame/texture/height resolver, feet/depth/HP graphics, actor reset의 texture/frame/alpha/tint/visibility/active/listener, 60 actor 재사용을 확인했다

### GameSession 통합 RED / GREEN

- RED: 9 tests 중 3 failed
- exact diff: `enemySpawned` event가 expected에만 있고 실제 반환값에 없음
- exact diff: snapshot의 `enemies: []`가 expected에만 있고 실제 snapshot에 없음 2건
- GREEN: Wave spawn을 실제 enemy로 추가한 뒤 같은 tick에 `44/60` progress만큼 이동하고 requested/spawned event를 flush함을 확인했다

### 독립 review RED / GREEN

- review: Critical 0, Important 4건으로 Changes requested
- actor reset RED: expected `anims.stop=[]`, received `undefined`; sprite inactive/hidden 계약도 미충족
- Scene restart RED: typecheck exact failure `Property 'restartScene' does not exist on type 'HuchuTestBridge'`
- GREEN: reset에서 animation을 멈추고 sprite/container/HP graphics를 inactive/hidden으로 돌렸다
- GREEN: Scene shutdown은 destroyed actor pool reference를 폐기하고 restart는 새 60 actor pool을 만들며 desktop/mobile restart E2E가 통과했다
- GREEN: `WaveSystem` constructor/reset 모두 `BALANCE.caps.enemies`를 명시적으로 받고, enemy render는 simulation tick이 아닌 Phaser `update()` 당 한 번만 실행한다
- targeted re-review: Critical/Important 잔여 없음, Approved

## 변경 파일

- `src/game/enemies/EnemyTypes.ts`
- `src/game/enemies/EnemySystem.ts`
- `src/game/enemies/EnemyActor.ts`
- `src/game/enemies/EnemyActorPool.ts`
- `src/game/enemies/EnemyHpBar.ts`
- `src/game/pooling/ObjectPool.ts`
- `src/game/session/GameSession.ts`
- `src/game/session/RunSnapshot.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/events/GameEvents.ts`
- `src/game/debug/ScenarioFactory.ts`
- `src/game/debug/TestBridge.ts`
- `src/game/debug/TestContract.ts`
- `tests/unit/EnemySystem.test.ts`
- `tests/unit/PresentationRules.test.ts`
- `tests/unit/ObjectPool.test.ts`
- `tests/unit/GameSession.test.ts`
- `tests/e2e/health-bar-colors.spec.ts`
- `.superpowers/sdd/task-7-report.md`

## 검증

- focused pure/presentation/session unit: 통과
- 전체 unit: 22 files / 173 tests 통과
- `npm run typecheck`: exit 0
- `npm run build`: exit 0, production bundle 생성
- Task 5 input + Task 6 wave + Task 7 health desktop/mobile E2E: 27 passed / 3 expected skipped / 0 failed
- health canvas에서 full/yellow/red bar pixel을 실제 확인하고 pool `created=60, active=3, available=57`을 확인했다
- scenario reset/reload 후 enemy pool `instanceId`, `created=60`이 변하지 않고 active `3 -> 0 -> 3`으로 복구되는 것을 desktop/mobile에서 확인했다
- Scene restart 후 pool `instanceId`가 바뀌 새 60 actor pool로 health scenario가 복구되는 것을 desktop/mobile에서 확인했다
- production `dist` scan: `__HUCHU_TEST__|empty-run|wave-schedule|health-bar-colors|enemyPool|advanceWithoutFlush|restartScene|ScenarioFactory|TestBridge` match 0
- pure `EnemySystem`/`ObjectPool` scan: Phaser, `Date`, `performance`, `requestAnimationFrame`, timer API match 0
- changed source/test scan: `any`, `@ts-ignore`, `@ts-expect-error` match 0
- `git diff --check`: exit 0

## 우려 및 후속

- 기능상 미해결 우려는 없다
- sandbox 내 최초 Playwright 실행은 `Error: listen EPERM: operation not permitted 127.0.0.1:5174`로 Vite bind가 차단됐고, 허용된 로컬 서버 경로로 재실행해 통과했다
- production JS chunk가 500kB를 넘는 기존 Vite 경고는 계속 출력되지만 build는 성공했다

---

## 최종 독립 review: enemy state·pool reference 불변식

### RED

- 명령: `npm run test:unit -- tests/unit/EnemySystem.test.ts tests/unit/ObjectPool.test.ts`
- 결과: 2 files failed, 8 failed / 25 passed
- `setState(0, 'stunned'|'dead'|'unknown')`이 `RangeError`를 던지지 않아 2건 실패
- duplicate reference factory를 거부하지 않아 1건 실패
- `null|undefined|number|string|boolean` factory 결과를 거부하지 않아 5건 실패
- type RED: `setState` parameter가 아직 `EnemyState`라 expected 공격 3-state union과 비교해 `TS2344`, `dead|stunned` 추가 허용이 발견됨

### GREEN

- `setState` 이름은 Task 9 plan 호환을 위해 유지하고 parameter/runtime allowlist를 `moving|windup|holding`으로 제한했다
- `stunned|dead|unknown` state는 JS cast에서도 active enemy/HP/reward를 바꾸기 전에 `RangeError`로 거부한다
- valid unknown enemy id는 no-op이지만 state와 `animationElapsedMs`는 enemy lookup 전에 검증하므로 invalid input은 unknown id에서도 `RangeError`다
- `ObjectPool<T extends object>`로 제한하고 eager factory 결과가 non-null unique reference인지 constructor에서 검증한다
- duplicate/non-reference factory 실패는 pool `instanceId` counter를 소비하지 않는다
- TypeScript `object`에 포함되는 함수는 non-null unique reference이므로 허용하고 테스트로 계약을 고정했다

### review-fix 검증

- focused 4 files: 62/62 통과
- 전체 unit: 22 files / 183 tests 통과
- `npm run typecheck`: exit 0
- `npm run build`: exit 0
- Task 5 input + wave + health/reset/restart desktop/mobile E2E, `--workers=2`: 27 passed / 3 expected skipped / 0 failed
- 첫 5-worker 실행에서 Vite 초기 응답 `SyntaxError: Unexpected token '.'`, `Unexpected end of JSON input`으로 2건이 실패했지만 두 테스트 각각의 단독 재현은 통과했고 2-worker 전체 재실행도 통과했다. 애플리케이션/테스트 우회 수정은 하지 않았다
- production debug scan, pure dependency scan, unsafe type scan: match 0
- `git diff --check`: exit 0
