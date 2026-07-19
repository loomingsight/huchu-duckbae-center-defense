# Task 10 구현 보고서

- 작업일: 2026-07-20
- 브랜치: `codex/huchu-defense-mvp`
- 기준 커밋: `9e32acc254dc4684070b9833298bf7a25f2e849f`
- 커밋 제목: `feat: add snack skill selection`

## 구현 결과

- `ProgressionSystem`을 간식 수치의 단일 소스로 두고 `[8, 22, 40, 62, 88]` threshold cursor, 초과 간식 보존, selection backlog를 구현했다.
- 첫 threshold는 즉시 열고, 두 번째부터는 `playing`이면서 active enemy가 있는 전투 시간 5초만 누적한다. selection/countdown/visibility pause/won/lost 및 적 없는 시간은 지연에 포함하지 않는다.
- 적 사망 lifecycle의 `snackEarned`만 `ProgressionSystem.addSnacks()`로 전달한다. reset은 간식, threshold cursor, open request, combat delay를 run 초기값으로 복구한다.
- `SkillCardPicker`는 max level 후보를 제외하고 seeded RNG로 서로 다른 카드 최대 3장을 선택한다. 배우지 않은 스킬이 있으면 unlock을 최소 1장 보장하고, 최종 카드 순서도 같은 RNG로 결정한다.
- `GameSession`은 mutable skill levels와 선택 시점의 stored cards를 소유한다. snapshot과 card 조회는 복사본을 반환하고 reset은 Bark Lv1, 나머지 Lv0으로 복구한다.
- production `selectCard()` 한 경로가 level 변경, BarkSystem Lv2 반영 및 cycle reset, progression resolve, cards clear, `skillLearned`, 3초 countdown 전환을 함께 처리한다. Bark Lv2 실제 자동 피해 13을 브라우저까지 확인했다.
- 웨이브 종료와 selection이 같은 tick이면 selection을 먼저 열고 pending next wave를 보존한다. 선택 후 `nextWave` countdown 하나만 3000ms 진행하고 정확히 wave 2를 시작한다.
- `UiTransitionClock`은 countdown fixed-step만 소비하며 2999ms에는 running, 마지막 1ms에 completed가 된다. visibility pause에서는 남은 시간을 보존한다.
- `WorldPauseController`는 canonical `GameStateMachine`을 `sync()`해 world mode gate와 Arcade physics pause/resume를 정렬한다. production 호출과 단위 테스트가 같은 `state transition -> sync` 경로를 사용한다.
- `SkillSelectionModal`은 dim layer, 제목 `간식으로 스킬 배우기`, distinct DOM button, 44px 이상 pointer 영역, 한 번만 accept, idempotent destroy를 구현한다.
- `CountdownOverlay`는 같은 Phaser canvas overlay에서 `3,2,1`과 `다음 웨이브 3,2,1`을 fixed-step 남은 시간으로 표시한다.
- 좌상단 HUD는 선택 직후 mutable level을 반영한다. Task 10의 cooldown debug snapshot은 새 스킬을 포함해 0%이며 실제 비-Bark 자동 스킬/cooldown HUD는 계획상 Task 11 소유다.
- selection/countdown 동안 player, enemies, projectiles, Bark wave, projectile impact, shelter shake, off-leash effect, world animation clock이 모두 멈춘다. off-leash의 기존 Phaser tween도 120ms fixed-step age/alpha로 전환했다.
- `SceneRuntimeLifecycle`은 같은 generation의 visibility listener, test bridge, modal disposer를 모두 보존하고 shutdown에서 한 번씩 정리한다. scenario reset과 Scene restart에서 stale modal/listener를 남기지 않는다.
- manual TestBridge는 playing/countdown만 fixed tick으로 진행하고 selection/visibility pause의 입력 시간을 scheduler remainder에 섞지 않는다. countdown이 끝나면 같은 tick 경로로 playing을 재개한다.
- `skill-selection` scenario는 테스트용 snack/effect 주입 없이 HP 10, snack 2인 적 4명을 실제 production Bark로 처치해 정확히 간식 8을 만든다. 자연 공격 timing으로 projectile, impact, shelter, off-leash, Bark effect를 활성화한다.
- `skill-selection-wave-clear` scenario는 같은 실제 보상 경로로 wave clear와 selection 충돌을 만들고 single next-wave overlay/countdown seam을 검증한다.
- E2E bridge는 계속 `import.meta.env.MODE === 'e2e'` 안의 동적 import로만 설치된다. production session/scene에는 Task 10 snack, card-priority, effect injection hook이나 분기가 없다.

## RED -> GREEN 기록

1. Progression RED
   - `Cannot find module '../../src/game/progression/ProgressionSystem'`
   - 모듈 생성 후 핵심 2 tests GREEN
2. Progression 방어성 RED
   - `progression.reset is not a function`
   - NaN threshold, infinite delay, invalid step/context가 거부되지 않음
   - reset, finite/safe-integer 검증, threshold 입력 복사, snack overflow 방어 후 16 tests GREEN
3. Picker RED
   - `Cannot find module '../../src/game/progression/SkillCardPicker'`
   - distinct 3장, unlock 보장, max level 제외, 후보 부족, five-threshold fixture 구현 후 GREEN
4. Session 통합 RED
   - 간식 8 보상 뒤 기대 `skillSelection` 대신 `playing`
   - progression/cards/mutable levels/Bark/select/countdown/outcome seam 연결 후 GREEN
5. Pause/clock RED
   - `WorldPauseController`, `UiTransitionClock` 모듈 부재
   - canonical mode sync, idempotent runtime pause, exact 2999+1, visibility preservation 구현 후 GREEN
6. Modal/lifecycle RED
   - modal/overlay 모듈 부재
   - 두 disposer attach 시 기존 bridge가 즉시 dispose되어 기대 `[]` 대신 `['bridge']`
   - generation별 disposer Set, modal single accept/destroy, overlay cleanup 구현 후 GREEN
7. 브라우저 RED
   - sandbox local bind: `Error: listen EPERM: operation not permitted 127.0.0.1:5174`
   - 승인된 sandbox 외부 실행에서 `RangeError: Unknown test scenario: skill-selection`
   - scenario/session/scene/bridge 연결 후 desktop/mobile GREEN
8. 모바일 pointer RED
   - button 실측 높이 기대 44px 이상, 실제 `35.3889`
   - logical min-height를 64px로 보정해 mobile/desktop GREEN
9. 완전 정지 관측 RED
   - active projectile impact를 요구했을 때 기대 1개, 실제 0개
   - 처음에는 scenario effect seed로 관측을 고정했고, 리뷰 수정에서는 자연 projectile/impact timing으로 대체해 주입 hook 없이 GREEN
10. Production isolation 리뷰 RED
    - production bundle scan에서 `addSnacksForScenario`, `setSkillCardPriorityForScenario`, `Scenario priority card`가 7 matches
    - effect 주입 API도 일반 Scene에 남아 독립 리뷰가 Important 1건을 제기
    - snack/card-priority/effect hook과 priority state/branch를 모두 제거하고 실제 Bark 보상 및 seeded picker 순서로 대체
11. Seeded order/wave-clear RED
    - seed 7의 첫 카드 기대 `bark:2`, 실제 `deokbaeHowl:1`
    - 신규 wave-clear scenario는 `TestScenarioId`에 없어 TypeScript `TS2345`
    - unlock 보장 뒤 seeded final shuffle, 자연 보상 wave-clear scenario, production `sync()` controller test로 GREEN
12. 리뷰 재검증
    - 독립 focused re-review: Critical 0 / Important 0 / verdict Ready
    - 남은 Canvas overlay 문구 관측 Minor는 실제 `CountdownOverlay.render()` unit과 E2E의 `kind: nextWave`, 3000ms, 2999+1, wave 2 전환 조합으로 검증했다.

## 변경 파일

### 신규

- `src/game/progression/ProgressionTypes.ts`
- `src/game/progression/ProgressionSystem.ts`
- `src/game/progression/SkillCardPicker.ts`
- `src/game/skills/SkillTypes.ts`
- `src/game/lifecycle/WorldPauseController.ts`
- `src/game/ui/UiTransitionClock.ts`
- `src/game/ui/SkillSelectionModal.ts`
- `src/game/ui/CountdownOverlay.ts`
- `tests/unit/ProgressionSystem.test.ts`
- `tests/unit/SkillCardPicker.test.ts`
- `tests/unit/WorldPauseController.test.ts`
- `tests/unit/UiTransitionClock.test.ts`
- `tests/unit/SkillSelectionModal.test.ts`
- `tests/unit/CountdownOverlay.test.ts`
- `tests/e2e/skill-selection.spec.ts`
- `.superpowers/sdd/task-10-report.md`

### 수정

- `src/game/session/GameSession.ts`
- `src/game/events/GameEvents.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/scenes/SceneRuntimeLifecycle.ts`
- `src/game/debug/ScenarioFactory.ts`
- `src/game/debug/TestBridge.ts`
- `src/game/debug/TestContract.ts`
- `src/game/combat/ProjectileActorPool.ts`
- `src/game/player/PlayerView.ts`
- `src/game/shelter/ShelterView.ts`
- `tests/unit/fixtures.ts`
- `tests/unit/GameSession.test.ts`
- `tests/unit/TestBridgeLifecycle.test.ts`
- `tests/e2e/helpers.ts`

`RunSnapshot`은 이미 snacks와 skill levels 필드를 소유하고 있어 schema 변경 없이 `GameSession.snapshot()`의 source만 progression/mutable levels로 교체했다.

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| focused picker/controller/session unit | PASS, 3 files / 24 tests |
| `npm run test:unit` | PASS, 34 files / 349 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, TypeScript 및 Vite production build |
| `npm run test:e2e -- tests/e2e/skill-selection.spec.ts` | PASS, desktop/mobile 8 tests |
| `npm run test:e2e` | PASS, 51 tests / desktop-only 3 skipped |
| production/source Task 10 snack, priority, effect hook scan | 0 matches, `rg` exit 1 |
| production `__HUCHU_TEST__`, `TestBridge`, scenario id scan | 0 matches, `rg` exit 1 |
| progression/picker/UI clock Phaser, wall-clock, random, tween scan | 0 matches, `rg` exit 1 |
| Task 10 Scene/modal/overlay/controller wall-clock/tween scan | 0 matches, `rg` exit 1 |
| Task 10 production unsafe type scan | 0 matches, `rg` exit 1 |
| source/test secret pattern scan | 0 matches, `rg` exit 1 |
| 독립 focused code review | Critical 0 / Important 0 / Ready |
| `git diff --check` | PASS |

## 남은 경고

- Vite production build는 Phaser를 포함한 단일 JS chunk 약 1.43MB에 대해 500kB 초과 경고를 출력한다. build exit는 0이며 기존 bundle-splitting 항목이다.
- Playwright는 `FORCE_COLOR` 때문에 `NO_COLOR`가 무시된다는 경고를 출력한다. 전체 51 tests는 통과했다.
- `CountdownOverlay`는 Phaser Canvas text라 DOM locator로 문구를 읽을 수 없다. label/render unit과 cross-layer countdown state 및 정확한 전환 E2E를 결합해 검증했다.
- 기능상 미해결 Critical/Important 이슈는 없다.
