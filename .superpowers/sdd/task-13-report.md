# Task 13 구현 보고서

- 작업일: 2026-07-20
- 브랜치: `codex/huchu-defense-mvp`
- 기준 커밋: `edbb7418906e4ec2e0938f5a3ecdbe1567a0b30f`
- 커밋 제목: `feat: add lifecycle and WebGL recovery`

## 구현 결과

- `VisibilityController`가 숨기기 전 `playing`, `countdown`, `skillSelection` mode를 보존한다. `playing`과 `countdown`은 실제 Phaser DOM `<button>`인 `계속하기` 확인 전까지 `visibilityPause`를 유지하고, `skillSelection`은 기존 modal과 입력을 그대로 둔 채 visible 즉시 복귀한다.
- `TestBridge.simulateVisibility()`는 더 이상 session을 직접 pause/resume하지 않는다. `GameScene.setVisibilityForTest()`를 통해 실제 controller와 DOM prompt 경로를 사용한다.
- 숨김 동안 session world, enemy, skill cooldown, Bark/투사체/스킬/shelter visual age와 countdown UI clock이 모두 멈춘다. `playing` 재개 시 world/UI가 재개되고 `countdown`은 world pause를 유지한 채 UI clock만 이어진다.
- `WebGlRecoveryController`는 canvas의 `webglcontextlost`를 `preventDefault()`하고 pre-loss mode를 보존한다. context restore 뒤 `playing`/`countdown`은 실제 `다시 그리기` 확인을 요구하고, `skillSelection`은 기존 modal로 즉시 돌아간다.
- WebGL 확인 시 current session snapshot에서 player/enemy/projectile/shelter/HUD view를 먼저 다시 동기화한 뒤 session mode와 world pause semantics를 복구한다.
- `LifecyclePauseCoordinator`가 `visibility`와 `webgl` reason을 하나의 Set으로 관리하고 최초 mode를 한 번만 보존한다. 두 reason의 발생 순서와 무관하게 마지막 reason이 해제될 때만 `playing`, `countdown`, `skillSelection`의 원 mode로 복귀한다.
- 반복 context loss마다 recovery generation을 증가시키고 restore prompt가 캡처한 generation과 현재 generation 및 `contextAvailable=true`를 함께 검사한다. 이전 prompt/callback은 현재 recovery ownership을 해제할 수 없다.
- Result의 `won`/`lost` 중 발생한 context loss는 terminal session을 바꾸지 않지만 availability를 유지한다. 같은 runtime 재시작 시 `beginSession()`이 새 run을 즉시 `visibilityPause`로 만들고 최신 restore 확인 뒤에만 진행한다.
- context lost 동안 canvas input을 차단해 renderer 정지 상태에서도 DOM recovery button이 클릭 가능하다. context가 아직 lost인 reset은 canvas input을 다시 켜지 않는다.
- context restored event만으로 canvas input을 열지 않는다. coordinator가 첫 lifecycle reason을 acquire할 때 canvas를 닫고 active joystick pointer/offset을 clear하며, 유효한 확인으로 마지막 reason이 해제된 뒤에만 input을 연다. 확인 전 gesture는 재개 후 이동으로 남지 않는다.
- canvas를 key로 한 recovery state가 `available`과 generation을 controller/scene 재생성보다 길게 유지한다. 새 `GameScene`은 renderer `gl.isContextLost()` probe를 함께 반영하고 `attach()` 직후 `beginSession()`을 호출해 lost context이면 새 session/world/UI/input을 즉시 pause한다.
- `SceneRuntimeLifecycle` disposer가 document visibility listener, canvas WebGL listener, recovery overlay와 click listener를 함께 정리한다. Scene restart 뒤 resume/restore button은 각각 1개만 생성되고 confirm 뒤 0개가 된다.
- `main.ts`가 Phaser 생성 전 임시 canvas로 `webgl2 || webgl`을 probe한다. 실패 시 canvas를 만들지 않고 WebGL 미지원 문구와 최신 지원 브라우저 안내를 렌더한다.
- `E2eBootOverrides.ts`는 WebGL probe override와 복사한 P1 첫 x만 `-1`로 바꾸는 data override 두 함수만 export한다. 두 import는 각각 exact `import.meta.env.MODE === 'e2e'` 내부 dynamic import이며 production build에는 override query 문자열, TestBridge 문자열, 별도 override chunk가 없다.
- `BootScene`은 첫 data validation 오류의 path/wave id와 실제 `다시 시도` button을 표시하며 retry에도 E2E invalid P1 override가 유지되어 Game을 시작하지 않는다.
- `PreloadScene`은 실패 event 횟수가 아니라 unique required asset key와 실제 missing texture의 합집합을 센다. retry는 이미 로드된 texture를 다시 queue하지 않고, loader listener와 overlay는 preload 시점부터 shutdown disposer로 정리한다.
- `RuntimeErrorOverlay`는 message/detail/action을 HTML escape하고 기존 element/listener를 제거한 뒤 하나만 생성한다. action listener는 overlay 전체가 아니라 실제 `<button>`에 `{ once: true }`로 연결되어 message/detail/empty 영역 click은 no-op이고 action은 정확히 한 번만 실행된다.
- resize는 기존 Phaser Scale Manager `FIT` 경로만 사용한다. logical `540x960` state를 바꾸지 않고, 기존 `VirtualJoystick`의 Phaser pointer logical `x/y`는 그대로 사용하며 native pointer만 canvas rect에서 logical 좌표로 한 번 변환한다. desktop/mobile 390x844와 기존 touch ownership E2E로 검증했다.
- Task 12의 same-session Result restart와 enemy/projectile/effect pool identity, Task 11의 combat order, Task 10의 countdown/visual freeze 계약은 production code를 변경하지 않고 전체 회귀에서 유지했다.

## RED -> GREEN 기록

1. Step 1 visibility controller RED
   - `npm run test:unit -- tests/unit/VisibilityController.test.ts`
   - `Cannot find module '../../src/game/lifecycle/VisibilityController'`로 실패했다.
   - pre-loss mode, explicit prompt, skill modal immediate return을 구현해 최초 1 file / 3 tests GREEN, overlap gate 추가 후 최종 4 tests GREEN이다.
2. visibility/WebGL ownership RED
   - visibility pause 뒤 context lost 상태에서 `confirmResume()`이 `playing`으로 조기 복귀해 `expected visibilityPause, received playing`으로 실패했다.
   - `WebGlRecoveryController.contextAvailable` gate를 `VisibilityController`에 연결해 context restore 전 no-op, restore 뒤 resume으로 GREEN 전환했다.
3. Step 3 WebGL controller RED
   - `npm run test:unit -- tests/unit/WebGlRecoveryController.test.ts`
   - `Cannot find module '../../src/game/lifecycle/WebGlRecoveryController'`로 실패했다.
   - preventDefault, mode preservation, resync-before-resume, countdown/skillSelection semantics와 attach/detach를 구현해 최초 1 file / 4 tests GREEN이다.
4. WebGL runtime edge RED
   - context-lost busy state와 canvas input callback이 각각 `undefined`여서 unit이 실패했다.
   - lost 시 busy overlay/canvas input off, restore 시 input on/prompt 전환으로 GREEN 전환했다.
   - lost 상태에서 reset 후 canvas input이 `true`가 되는 회귀를 추가 RED로 재현하고 availability를 보존하도록 수정해 최종 WebGL 5 tests GREEN이다.
5. Step 5 browser RED
   - 최초 desktop lifecycle/error run은 9개 중 1 pass / 8 fail이었다. 실제 resume DOM, unsupported/invalid-data override, context overlay/listener가 없어 실패했다.
   - Scene/Boot/Preload/main 통합 후 desktop/mobile focused 18/18, scene restart listener/DOM focused 2/2 GREEN이다.
6. context-loss DOM pointer RED
   - renderer 정지 뒤 canvas 또는 `#game-root`가 실제 `계속하기` button click을 가로채 E2E가 timeout됐다.
   - lost 동안 canvas pointer input을 끄고 runtime overlay에 명시적 `pointer-events: auto`를 적용해 overlap E2E를 GREEN으로 전환했다.
7. 기존 visibility E2E 계약 갱신
   - 첫 전체 E2E는 79 pass / 3 skip / 8 fail이었다. 8건은 모두 기존 테스트가 visible 직후 자동 resume을 기대해 실제 `visibilityPause`를 받은 동일 원인이었다.
   - combat/countdown/manual-clock 4개 테스트가 실제 `계속하기`를 클릭하도록 갱신했고 desktop/mobile focused 8/8, 전체 87 pass / 3 skip / 0 fail로 전환했다.
8. 전체 unit Boot mock 회귀
   - 첫 전체 unit은 45 files green, `GameDataValidation`의 기존 Boot text mock 1건이 새 Phaser DOM lifecycle의 `events.once` 부재로 실패했다.
   - mock과 assertion을 실제 DOM retry overlay 계약으로 갱신해 최종 46 files / 429 tests GREEN이다.
9. 자체 diff audit
   - context lost 중 reset의 canvas input 재활성화와 Preload create 전 shutdown의 loader listener cleanup 창 두 건을 발견했다.
   - 각각 unit RED→GREEN과 preload 시점 shutdown disposer 이동으로 닫았다. 추가 blocker는 없었다.
10. 독립 리뷰 Critical 1: 중첩 pause ownership RED
   - `playing`, `countdown`, `skillSelection`의 WebGL→visibility / visibility→WebGL 6개 unit 순열이 공유 coordinator 부재로 `Cannot find module '../../src/game/lifecycle/LifecyclePauseCoordinator'` RED였다.
   - production E2E에서도 WebGL→visibility/playing 순열이 `expected visibilityPause, received playing`으로 조기 재개됐다.
   - 단일 reason Set과 original mode를 관리하는 coordinator를 두 controller와 `GameScene`에 공유해 focused desktop 6순열 및 desktop/mobile 전체 순열을 GREEN으로 전환했다.
11. 독립 리뷰 Critical 2: stale WebGL confirmation RED
   - 두 번째 loss 뒤 `needsConfirmation`이 `true`로 남아 `expected false, received true`인 unit RED를 확인했다.
   - loss/reset generation invalidation, availability와 captured/current generation 일치 검사를 추가했다. 반복 loss browser prompt 폐기까지 GREEN이다.
12. 독립 리뷰 Critical 3: terminal restart context RED
   - terminal context loss 뒤 새 run을 pause할 API가 없어 unit이 `controller.beginSession is not a function`으로 RED였다.
   - `GameScene.resetSession()`이 session/world reset 뒤 `beginSession()`으로 unavailable context를 새 run에 다시 적용하도록 수정했다. Result restart E2E에서 restore 확인 전 simulation clock 고정을 검증했다.
13. 독립 리뷰 Important 1: overlay action target RED
   - 실제 button `click`을 dispatch해도 action이 0회인 unit RED를 확인했다. 기존 구현은 Phaser DOMElement 전체에 listener를 연결했다.
   - 실제 button native listener로 변경하고 destroy cleanup 및 once semantics를 추가했다. unit과 resume/restore/retry message 영역 E2E가 GREEN이다.
14. 2차 재리뷰 Critical 1: restore 확인 전 input leak RED
   - unit에서 restored 직후 canvas input 기대 `false`, 실제 `true`였고 coordinator의 nested final-release gate 기대 `false`, 실제 `undefined`였다.
   - actual desktop Chromium에서 restore prompt 중 joystick pointerdown/move 뒤 confirm하고 1초 진행했을 때 player x가 기대 `270`, 실제 `420`으로 이동했다.
   - 첫 reason acquire 시 input disable과 `VirtualJoystick.clearInput()`, 마지막 reason release 시에만 enable하도록 바꿨다. 동일 Chromium 테스트는 confirm 뒤 x=270을 유지하고 fresh gesture 뒤에만 이동하며, nested 순열은 final confirm 전 `pointer-events: none`을 유지한다.
15. 2차 재리뷰 Critical 2: scene restart recovery truth RED
   - context loss 중 `restartScene()` 뒤 새 controller가 `available=true`로 시작해 desktop/mobile 모두 기대 `visibilityPause`, 실제 `playing`이었다.
   - canvas-keyed WeakMap recovery truth와 actual renderer `isContextLost()` probe를 새 controller에 주입하고 create 시 `beginSession()` gate를 실행했다. desktop/mobile scene restart는 simulation clock 고정, restore prompt 1개, 확인 전 pause를 모두 검증해 GREEN이다.

## 변경 파일

### 신규

- `src/game/debug/E2eBootOverrides.ts`
- `src/game/lifecycle/VisibilityController.ts`
- `src/game/lifecycle/WebGlRecoveryController.ts`
- `src/game/lifecycle/LifecyclePauseCoordinator.ts`
- `src/game/ui/RuntimeErrorOverlay.ts`
- `tests/e2e/error-recovery.spec.ts`
- `tests/e2e/lifecycle.spec.ts`
- `tests/unit/VisibilityController.test.ts`
- `tests/unit/WebGlRecoveryController.test.ts`
- `tests/unit/RuntimeErrorOverlay.test.ts`
- `tests/unit/LifecyclePauseCoordinator.test.ts`
- `.superpowers/sdd/task-13-report.md`

### 수정

- `src/game/assets/assetManifest.ts`
- `src/game/scenes/BootScene.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/player/VirtualJoystick.ts`
- `src/game/scenes/PreloadScene.ts`
- `src/main.ts`
- `src/styles.css`
- `tests/e2e/combat.spec.ts`
- `tests/e2e/skill-selection.spec.ts`
- `tests/e2e/title-and-input.spec.ts`
- `tests/unit/GameDataValidation.test.ts`
- `tests/unit/RequiredAssetStatus.test.ts`

기존 `UiTransitionClock`, `VirtualJoystick`, `createGame`, `TestBridge`는 이미 필요한 clock pause, logical/native 단일 변환, Scale Manager, Scene port 경계를 제공했다. 동작 중복을 피하고 `GameScene`의 port 연결만 바꿨다.

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| `npm run test:unit -- tests/unit/WebGlRecoveryController.test.ts tests/unit/LifecyclePauseCoordinator.test.ts` | PASS, 2 files / 9 tests |
| `npm run test:unit` | PASS, 48 files / 440 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, TypeScript 및 Vite production build, JS 1,458.70 kB / gzip 381.19 kB |
| `npm run assets:verify` | PASS |
| `npm run assets:review` | PASS |
| `tests/e2e/error-recovery.spec.ts` | PASS, desktop/mobile 28 tests |
| scene restart listener/DOM focused E2E | PASS, desktop/mobile 2 tests |
| 기존 visibility explicit-button focused E2E | PASS, desktop/mobile 8 tests |
| `npm run test:e2e` | PASS, 105 tests / desktop-only mobile input 3 skipped / 108 total |
| production bundle override/query/TestBridge scan | 0 matches, `rg` exit 1; `dist`는 app JS/CSS/index 3 files만 존재 |
| override query 문자열의 runtime source scan | 0 matches outside `E2eBootOverrides.ts`, `rg` exit 1 |
| changed-scope risk scan (`TODO`, ignore, `any`, eval, debug log, unsafe innerHTML) | 0 matches, `rg` exit 1 |
| changed-scope credential/private-key scan | 0 matches, `rg` exit 1 |
| `git diff --check` | PASS |

## 남은 경고

- Vite production build는 Phaser를 포함한 단일 JS chunk 1,458.70 kB에 대해 500 kB 초과 경고를 출력한다. build exit는 0이며 기존 bundle-splitting 항목이다.
- Playwright는 `FORCE_COLOR` 때문에 `NO_COLOR`가 무시된다는 경고를 출력한다. 최종 desktop/mobile 결과에는 영향이 없다.
- 전체 E2E의 3 skip은 desktop project에서 의도적으로 제외한 mobile touch 전용 테스트다. 같은 세 테스트는 mobile project에서 모두 통과했다.
