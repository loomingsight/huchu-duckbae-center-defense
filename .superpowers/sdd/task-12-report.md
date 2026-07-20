# Task 12 구현 보고서

- 작업일: 2026-07-20
- 브랜치: `codex/huchu-defense-mvp`
- 기준 커밋: `8ca9b58b4a812cc26845577f10f19f5516e67884`
- 커밋 제목: `feat: complete waves and run results`

## 구현 결과

- `WaveSystem`이 다음 wave 번호를 단일 pending state로 소유한다. clear 판정은 번호만 예약하고, skill due가 겹치면 selection을 먼저 연 뒤 카드 선택에서만 next-wave countdown 하나를 시작한다.
- run 시작 및 reset 뒤 첫 playing tick에 `waveStarted`를 한 번 발행한다. 다음 wave countdown 완료 tick은 `startPendingNext()`와 `waveStarted`만 처리하며 world spawn은 다음 fixed tick까지 실행하지 않는다.
- `GameSession.step()`은 tick 진입 mode로 world와 UI transition을 분리한다. countdown/lost를 만든 tick은 새 timer를 차감하지 않고, 3000ms는 후속 180 tick, lost 1200ms는 후속 72 tick을 정확히 사용한다.
- Task 11의 canonical combat 순서인 wave spawn → enemy 이동 → 자동 스킬 → enemy attack → projectile → Bark를 보존했다. 기존 장기 stun과 attack-track 동기화 구현도 변경하지 않았다.
- `RunSnapshot`은 기존 numeric `skills`를 유지하면서 모든 skill level/cooldown 상태인 `skillStates`와 Bark phase/elapsed/locked target인 `barkState`를 추가했다. 전체 적·투사체 상태를 포함한 snapshot이 60fps/30fps render delta에서 일치한다.
- `finish()`는 terminal mode에서 idempotent하다. win/loss 각각 `modeChanged`, `runEnded`, `resultReady`를 한 번만 발행하며, 패배는 1200ms hold 뒤에만 `resultReady`를 낸다.
- `BossHud`는 W3 `개장수`, W5 `불법번식업자` 이름과 logical 280x12 상단 HP bar를 표시한다. 새 boss notice는 900ms fixed time만 표시하고 같은 boss render에서 재시작하지 않으며 death/reset에서 즉시 숨긴다.
- loss 확정 시 world, player, enemy, projectile, skill/effect clock은 멈춘다. shelter는 failed frame 3을 유지하고 별도 UI-only failed shake만 1200ms 진행한 뒤 Result를 연다.
- `ResultScene`은 실제 DOM `<button>`인 `다시 시작`과 outcome별 문구를 표시한다. GameScene 위에 launch/pause되어 기존 `GameSession`, TestBridge, enemy/projectile/effect actor pool을 보존한다.
- 재시작은 GameScene을 새로 만들지 않고 actor/projectile/effect를 release/reset한 뒤 기존 `session.reset(seed)`를 호출한다. 세 번 반복해도 같은 session 및 세 pool identity를 유지하며 listener/DOM을 중복 생성하지 않는다.
- `wave-schedule`은 실제 `WAVE_DEFINITIONS`, `WaveSystem`, `RunOutcomeResolver`, `UiTransitionClock`을 사용한다. E2E driver만 spawn 직후 적을 보상 없이 제거해 총 64 spawn, 네 번의 3000ms 전환, snacks 0, selection 0, shelter HP 100으로 W1~W5를 완주한다.
- `boss`, `final-enemy`, `shelter-defeat` scenario는 seed 직후 actor/HUD/failed view까지 동기 적용한다. final enemy는 실제 Bark windup/release/damage/death 경로로 승리한다.
- GameSession/GameScene의 비운영 조작은 각각 단일 `scenarioPortForE2e()` 경계 뒤 inline closure로 격리했다. production constant-fold 결과에는 즉시 throw하는 port gate만 남고 개별 hook, schedule literal, bridge 및 scenario id는 포함되지 않는다.

## RED -> GREEN 기록

1. wave pending/reset/snapshot RED
   - `TypeError: waves.setPendingNext is not a function`
   - 첫 W1 tick에 `waveStarted`가 없고 clear selection 뒤 `waveTransition`이 없었다.
   - exact initial snapshot에 `skillStates`, `barkState`가 없었다.
   - pending wave API, first-tick event, final snapshot을 구현한 뒤 focused 5 files / 59 tests GREEN
2. loss 경계 RED
   - 실제 17 off-leash shelter loss에서 `countdownState().kind`가 `null`, remaining이 `0`이었다.
   - `lostResult(1200)`와 entry-mode branch를 구현해 creation tick 비차감, 71 tick freeze, 72번째 `resultReady` 단일 발행 GREEN
3. boss/Result RED
   - `Cannot find module '../../src/game/ui/BossHud'`
   - `Cannot find module '../../src/game/scenes/ResultCopy'`
   - Boss HUD/name/notice와 Result copy/DOM scene을 구현해 unit GREEN
4. browser full-run RED
   - 초기 10개 E2E 모두 `bossBar: undefined`, shelter/final scenario unknown, `waveStarted: []`, transition 미발생으로 실패했다.
   - scenario/bridge/event/pool telemetry와 Result restart를 연결해 desktop/mobile 10/10 GREEN
5. lost UI-only hold RED
   - `TypeError: view.showFailedHold is not a function`
   - non-world branch에서 shelter shake까지 멈춰 있던 문제를 failed 전용 UI clock으로 분리했다.
   - 1199ms에는 71 tick age, 마지막 1ms에는 72번째 tick과 Result 전환을 확인해 unit 20/20 및 full-run E2E GREEN
6. 전체 E2E 회귀 RED
   - 새 `waveStarted`/`enemySpawned` canonical logging으로 기존 absolute sequence 기대 4건이 바뀌었다.
   - Scene shutdown 중 `BossHud.destroy() -> hide() -> Text.setText()`가 이미 teardown 중인 texture를 갱신해 `Cannot read properties of null (reading 'drawImage')`와 restart timeout 2건을 만들었다.
   - 기존 event-order 테스트를 확장된 union과 보상 없는 auto-clear 계약으로 갱신했다. Boss destroy는 render mutation 없이 listener/object만 파괴하도록 수정해 관련 E2E 30/30, 전체 E2E GREEN
7. 독립 리뷰: 승리 restart maintainer 누수 RED
   - `wave-schedule` 승리 뒤 Result에서 재시작하면 bridge의 `waveAutoClear`가 남아 첫 W1 적도 즉시 제거됐다.
   - 재현 snapshot은 `activeEnemyCount: 0`, enemy actor pool `active: 0`이었다.
   - GameScene의 session-reset lifecycle hook에 bridge-owned maintainer cleanup을 연결했다. 승리 restart 뒤 첫 tick의 session enemy/pool/event가 모두 1인 desktop/mobile 회귀 테스트로 GREEN
8. 독립 리뷰: production scenario hook 누출
   - 초기 production bundle에 `useWaveScheduleForScenario`, `damageShelterForScenario`, `spawnEnemyForScenario`, `removeEnemyWithoutReward` 구현이 남았다.
   - 개별 method를 단일 `scenarioPortForE2e()` inline closure로 통합했다. production build scan에서 개별 hook, scenario id, held schedule, test bridge가 0건임을 확인해 GREEN

## 변경 파일

### 신규

- `src/game/scenes/ResultCopy.ts`
- `src/game/ui/BossHud.ts`
- `tests/e2e/full-run.spec.ts`
- `tests/unit/BossHud.test.ts`
- `tests/unit/ResultScene.test.ts`
- `tests/unit/RunFactory.test.ts`
- `tests/unit/SimulationResolution.test.ts`
- `.superpowers/sdd/task-12-report.md`

### 수정

- `src/game/debug/ScenarioFactory.ts`
- `src/game/debug/ScenarioSessionPort.ts`
- `src/game/debug/TestBridge.ts`
- `src/game/debug/TestContract.ts`
- `src/game/events/GameEvents.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/scenes/ResultScene.ts`
- `src/game/session/GameSession.ts`
- `src/game/session/RunSnapshot.ts`
- `src/game/shelter/ShelterView.ts`
- `src/game/ui/CountdownOverlay.ts`
- `src/game/ui/HudSystem.ts`
- `src/game/waves/WaveSystem.ts`
- `tests/e2e/combat.spec.ts`
- `tests/e2e/wave-schedule.spec.ts`
- `tests/unit/CombatSystem.test.ts`
- `tests/unit/CountdownOverlay.test.ts`
- `tests/unit/EnemyAttackSystem.test.ts`
- `tests/unit/GameSession.test.ts`
- `tests/unit/ProjectileSystem.test.ts`
- `tests/unit/ShelterSystem.test.ts`
- `tests/unit/WaveSystem.test.ts`

기존 `RunOutcomeResolver`와 우선순위 테스트는 이미 Task 2/기존 코드에서 shelter loss → final win → non-final clear+skill due 계약을 충족해 구현을 중복 수정하지 않았다.

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| `npm run test:unit -- tests/unit/RunOutcomeResolver.test.ts tests/unit/RunFactory.test.ts tests/unit/SimulationResolution.test.ts tests/unit/BossHud.test.ts tests/unit/ResultScene.test.ts tests/unit/WaveSystem.test.ts tests/unit/CountdownOverlay.test.ts tests/unit/ShelterSystem.test.ts tests/unit/GameSession.test.ts tests/unit/TestBridgeLifecycle.test.ts` | PASS, 10 files / 89 tests |
| `npm run test:unit` | PASS, 44 files / 419 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, TypeScript 및 Vite production build, JS 1,449.42kB |
| `npm run assets:verify` | PASS |
| `npm run assets:review` | PASS |
| `tests/e2e/full-run.spec.ts` in full E2E | PASS, desktop/mobile 12 tests |
| event/shutdown focused E2E | PASS, desktop/mobile 30 tests |
| `npm run test:e2e` | PASS, 67 tests / desktop-only 3 skipped, 70 total |
| production bundle `__HUCHU_TEST__`/scenario id/개별 hook/schedule scan | 0 matches, `rg` exit 1 |
| staged `src/game`/`tests` diff `any`/ignore/eval/credential/private-key pattern scan | 0 matches, `rg` exit 1 |
| `git diff --check` | PASS |

## 남은 경고

- Vite production build는 Phaser를 포함한 단일 JS chunk 약 1.45MB에 대해 500kB 초과 경고를 출력한다. build exit는 0이며 기존 bundle-splitting 항목이다.
- Playwright는 `FORCE_COLOR` 때문에 `NO_COLOR`가 무시된다는 경고를 출력한다. 브라우저 테스트 결과에는 영향이 없다.
- 첫 fresh 전체 E2E 실행에서 한 desktop page의 Vite module load가 일회성 `SyntaxError: Unexpected identifier 'GameObject'`를 내 Title 진입 전에 timeout됐다. 같은 케이스 단독 재실행 1/1과 이어진 전체 suite 재실행 67 pass / 3 skip은 모두 통과했다.
- 독립 코드 리뷰 결과는 Critical 0 / Important 2 / Minor 0이었다. 두 Important는 위 7, 8번 회귀와 production scan으로 닫았고 reviewer 재검토에서도 추가 blocker가 없었다.
