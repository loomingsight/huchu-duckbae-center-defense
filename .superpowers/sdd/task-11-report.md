# Task 11 구현 보고서

- 작업일: 2026-07-20
- 브랜치: `codex/huchu-defense-mvp`
- 기준 커밋: `0908d2292b5e17857ada902bba9655296d3303ae`
- 커밋 제목: `feat: add automatic skills and hud`

## 구현 결과

- `SkillSystem`을 Bark를 포함한 스킬 level, 비-Bark 습득 순서, cooldown remaining/progress의 단일 원본으로 만들었다. `GameSession`의 별도 mutable skill level 사본은 제거했다.
- 새 자동 스킬은 full cooldown, 즉 0% 충전에서 시작한다. selection/countdown/visibility pause에서는 world step 자체가 멈추므로 cooldown도 진행하지 않는다.
- 대상이 없을 때 cooldown은 ready 0ms를 유지하고, 대상이 생긴 다음 fixed step에 즉시 시전한다. 큰 step은 cadence 경계를 모두 소비하며 split step과 같은 command/remaining을 낸다.
- 레벨 계산은 공용 `SKILL_DEFINITIONS`에서 파생한다. Lv2 피해 1.25배 반올림, Lv3 cooldown 0.8배 및 스킬별 범위/knockback/stun 강화를 정확히 적용한다.
- 공용 위협 정렬은 기존 `rankThreatTargets`/`selectThreatTarget`을 재사용한다. ETA, player 거리, boss, spawn sequence 기준과 dead 제외를 모든 방향성/단일 대상 스킬에 동일하게 적용한다.
- 호통치기는 70도 cone과 115/138 거리 안의 모든 적에게 피해를 주고, 일반 28/34 및 boss 반값 path progress를 absolute progress로 되돌린다.
- 아쿠아빔은 player에서 위협 대상 방향의 길이 250/300, 폭 22/26.4 선분을 사용해 경계를 포함한 모든 적을 관통한다.
- 덕배 하울링은 80x80 spatial bucket을 count 내림차순, 최소 ETA, bucket y/x 순으로 결정하고, 선택 bucket의 clamp된 평균 중심 반경 80/96 안을 공격한다.
- 안전신문고는 전역 최소 ETA 대상 하나에게 90/113 피해 후 일반 3000/3600ms, boss 1500/1800ms stun을 적용한다.
- `GameSession`은 enemy 이동 다음, enemy attack release 전에 자동 스킬을 적용한다. 피해를 먼저 처리하고 생존한 target에만 knockback/stun 및 attack track sync를 수행해 lethal death/snack을 정확히 한 번 발생시킨다.
- `EnemySystem.applyPathProgress()`는 호통의 이미 계산된 absolute progress를 distance로 재해석하지 않고 position/state를 동기화한다.
- projectile impact, Bark wave, 네 자동 스킬 효과는 lifecycle당 하나의 `CombatEffectPool` 120 actor를 공유한다. cap 이후에는 새 할당이나 crash 없이 effect를 drop하고 release/reset 뒤 actor identity를 재사용한다.
- 기존 Task 9 projectile actor 80개는 그대로 분리해 유지한다. 기존 impact의 world hit 위치, 4 frame/120ms 및 Bark 180ms fixed-step age도 shared pool 위에서 보존한다.
- 자동 스킬 effect는 scold cone fade, 판정과 같은 길이/폭의 aqua beam, 덕배 frame 4~7 8fps one-shot+ring, 신고서 낙하+stun stars로 렌더링한다. effect age는 playing fixed step에서만 진행한다.
- Bark와 자동 스킬은 이동/physics를 소유하지 않으며 Huchu 이동을 막지 않는다.
- 다섯 28x28 아이콘은 `BootScene`의 유효 game data 경로에서 cache guard와 함께 한 번만 Graphics texture로 만든다. 전투 Scene에는 `generateTexture` 호출이 없다.
- `HudSystem`은 top 한 줄 `보호소 HP n/100   WAVE n/5   간식 n`과 좌상단 skill slot을 렌더링한다. Bark는 첫 칸, 자동 스킬은 실제 습득 순서로 이어진다.
- 각 skill slot은 logical `(x=12, y=92+36n)`, 32x32, icon 최대 28x28, 9px 남은 초, 원형 cooldown mask이며 Phaser input을 설정하지 않는다.
- 기존 임시 skill text HUD는 제거하고 canonical `SkillSystem` snapshot만 실제 HUD와 debug snapshot에 공급한다.
- `all-skills`는 `src/game/debug`와 E2E 계약에만 존재한다. production skill level/cooldown 설정 hook은 추가하지 않았다.
- `all-skills` E2E는 DOM 카드 버튼을 네 번 실제 클릭해 production `selectCard()` 경로로 네 스킬을 배운다. off-leash 31명의 실제 Bark 사망 보상 62로 네 threshold를 정확히 열어 다섯 번째 selection 간섭을 막는다.
- safety 전용 HP 90 target은 다른 local skill 범위 밖에서 global Safety 90 피해로 사망한다. 최종 HP 10,000 일반 4명+boss 1명은 남아 네 cooldown/targeting/cast와 shelter safety를 실제 코드로 검증한다.
- shared effect actor reset은 inactive 상태에서 texture manager를 다시 조회하지 않는다. Phaser Scene shutdown 뒤 파괴된 sprite를 건드리던 restart 오류를 없애고 새 lifecycle pool identity로 복구한다.

## RED -> GREEN 기록

1. 순수 skill/targeting/HUD RED
   - `Cannot find module '../../src/game/skills/SkillSystem'`
   - `Cannot find module '../../src/game/skills/SpatialBucketTargeting'`
   - `Cannot find module '../../src/game/ui/SkillHud'`
   - `TypeError: system.applyPathProgress is not a function`
   - definitions, cooldown state, resolvers, spatial bucket, HUD model, absolute progress API 구현 후 4 files / 54 tests GREEN
2. Session integration RED
   - `TypeError: run.skillStateSnapshot is not a function`
   - auto skill boundary에서 `skillCast` event가 `undefined`
   - canonical level/order/cooldown, damage-first lifecycle, attack ordering/sync 구현 후 GameSession/EnemySystem/SkillSystem 3 files / 62 tests GREEN
3. Shared pool/icon/HUD RED
   - `Cannot find module '../../src/game/combat/CombatEffectPool'`
   - `Cannot find module '../../src/game/ui/TopHud'`
   - `Cannot find module '../../src/game/assets/SkillIconTextures'`
   - 기존 PlayerView pool은 `created: 8`, 신규 shared 계약은 `created: 120`
   - 공용 pool, Boot icon, 실제 HUD, PlayerView/ProjectileActorPool injection 구현 후 focused 10 files / 129 tests GREEN
4. Browser scenario RED
   - sandbox local bind: `Error: listen EPERM: operation not permitted 127.0.0.1:5174`
   - 승인된 실행의 첫 RED: `RangeError: Unknown test scenario: all-skills`
   - scenario/bridge 연결 후 네 번째 threshold 직전 `Expected: "skillSelection" / Received: "playing"`
   - 62명 seed 시 `Error: Enemy cap reached`
   - 44명 보상 시 final 20초가 다섯 번째 selection에서 멈춰 cast set에 `deokbaeHowl`, `scold`가 누락
   - 31명 x 2 snacks로 정확히 62를 만들고 실제 카드 네 번을 선택해 네 cast set GREEN
5. Safety target RED
   - 네 cast set 통과 뒤 shelter HP `Expected: 100 / Received: 97`
   - safety 3000ms stun이 scenario target의 장기 stun을 덮은 뒤 poop projectile이 도착한 것이 원인
   - 범위 밖 HP 90 lethal Safety target을 추가해 production damage-before-stun 동작을 유지하면서 최종 다섯 target과 shelter를 보존, desktop/mobile GREEN
6. Scene lifecycle RED
   - 관련 E2E 28개 중 24 PASS, restart/shutdown 4개 timeout
   - exact error: `TypeError: Cannot read properties of undefined (reading 'sys')` at `Sprite.setTexture` -> `CombatEffectActor.reset`
   - inactive reset의 불필요한 texture/frame mutation 제거 후 restart/shutdown 4/4 및 관련 28/28 GREEN
7. Full unit 회귀 RED
   - invalid data Boot test에서 `TypeError: Cannot read properties of undefined (reading 'exists')`
   - game data 검증 성공 뒤에만 icon texture를 만드는 순서로 고쳐 invalid Boot 경로와 icon cache test 22/22 GREEN

## 변경 파일

### 신규

- `src/game/assets/SkillIconTextures.ts`
- `src/game/combat/CombatEffectPool.ts`
- `src/game/skills/skillDefinitions.ts`
- `src/game/skills/SkillSystem.ts`
- `src/game/skills/SpatialBucketTargeting.ts`
- `src/game/ui/HudSystem.ts`
- `src/game/ui/TopHud.ts`
- `src/game/ui/SkillHud.ts`
- `tests/unit/CombatEffectPool.test.ts`
- `tests/unit/SharedCombatEffectsIntegration.test.ts`
- `tests/unit/SkillHudModel.test.ts`
- `tests/unit/SkillIconTextures.test.ts`
- `tests/unit/SkillSystem.test.ts`
- `tests/unit/SpatialBucketTargeting.test.ts`
- `.superpowers/sdd/task-11-report.md`

### 수정

- `src/game/assets/AssetKeys.ts`
- `src/game/combat/ProjectileActorPool.ts`
- `src/game/debug/ScenarioFactory.ts`
- `src/game/debug/TestBridge.ts`
- `src/game/debug/TestContract.ts`
- `src/game/enemies/EnemySystem.ts`
- `src/game/events/GameEvents.ts`
- `src/game/player/PlayerView.ts`
- `src/game/scenes/BootScene.ts`
- `src/game/scenes/GameScene.ts`
- `src/game/session/GameSession.ts`
- `tests/e2e/combat.spec.ts`
- `tests/e2e/skill-selection.spec.ts`
- `tests/unit/BarkSystem.test.ts`
- `tests/unit/EnemySystem.test.ts`
- `tests/unit/GameSession.test.ts`
- `tests/unit/ProjectileSystem.test.ts`
- `tests/unit/fixtures.ts`

기존 `SkillTypes`는 Task 10에서 이미 필요한 `SkillLevels`/`SkillCard` 계약을 소유했고, 기존 `TargetingSystem`도 Task 11의 공용 위협 정렬을 충족해 중복 변경하지 않았다.

## 최종 검증

| 검증 | 결과 |
| --- | --- |
| focused skill/session/shared pool/HUD unit | PASS, 10 files / 129 tests |
| `npm run test:unit` | PASS, 40 files / 402 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, TypeScript 및 Vite production build |
| `npm run assets:verify` | PASS |
| `npm run assets:review` | PASS |
| all-skills 실제 카드 focused E2E | PASS, desktop/mobile 2 tests |
| skill-selection + combat E2E | PASS, desktop/mobile 28 tests |
| `npm run test:e2e` | PASS, 55 tests / desktop-only 3 skipped |
| production bundle debug/test scenario scan | 0 matches, `rg` exit 1 |
| production source `all-skills`/skill setter hook scan | 0 matches, `rg` exit 1 |
| pure skill Phaser/wall-clock/random/timer scan | 0 matches, `rg` exit 1 |
| texture generation/call-site scan | `SkillIconTextures` definition + `BootScene` call only |
| unsafe type/eval/secret pattern scan | 0 matches, `rg` exit 1 |
| `git diff --check` | PASS |

## 남은 경고

- Vite production build는 Phaser를 포함한 단일 JS chunk 약 1.44MB에 대해 500kB 초과 경고를 출력한다. build exit는 0이며 기존 bundle-splitting 항목이다.
- Playwright는 `FORCE_COLOR` 때문에 `NO_COLOR`가 무시된다는 경고를 출력한다. 전체 55 tests는 통과했다.
- 독립 리뷰는 thread slot 제한 때문에 구현 agent 내부에서 새로 dispatch하지 못했고 parent가 기존 review agent를 재사용해 별도로 수행한다.
- 구현 agent의 diff audit과 전체 검증 기준으로 기능상 미해결 오류는 없다.
