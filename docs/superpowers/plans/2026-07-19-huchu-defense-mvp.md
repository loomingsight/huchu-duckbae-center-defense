# 후추 디펜스 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 후추를 직접 움직여 중앙 보호소를 지키고, 간식으로 자동 스킬을 배우며 5개 웨이브를 승리 또는 패배까지 완주할 수 있는 세로형 웹 MVP를 만든다.

**Architecture:** 순수 TypeScript 규칙 계층이 결정적 고정 스텝 시뮬레이션과 모든 판정을 소유하고, Phaser 계층은 입력·렌더링·애니메이션·오브젝트 풀을 어댑트한다. `GameScene`은 시스템을 조립하되 도메인 규칙을 가지지 않으며, E2E 전용 수동 시계·시드·시나리오 브리지를 통해 브라우저 검증을 재현 가능하게 만든다.

**Tech Stack:** Node.js `>=22.12.0`, `@types/node` `22.20.1`, TypeScript `7.0.2`, Phaser `4.1.0`, Vite `8.1.5`, Vitest `4.1.10`, Playwright `1.61.1`, Sharp `0.35.3`

Phaser는 승인된 설계를 재해석하지 않고 `4.1.0`으로 고정한다. 나머지 pin은 구현 계획 작성일의 공식 패키지 정보를 기준으로 하며, 구현 중 임의로 major/minor를 올리지 않는다: [Phaser versions](https://www.npmjs.com/package/phaser?activeTab=versions), [Vite](https://www.npmjs.com/package/vite), [Vitest](https://www.npmjs.com/package/vitest), [Playwright](https://www.npmjs.com/package/%40playwright/test?activeTab=versions), [TypeScript](https://www.npmjs.com/package/typescript), [Sharp](https://www.npmjs.com/package/sharp), [Node types](https://www.npmjs.com/package/%40types/node?activeTab=versions).

## Global Constraints

- 논리 및 backing-store 해상도는 항상 `540 × 960`, 렌더러는 `Phaser.WEBGL`, Scale은 `FIT`과 `CENTER_BOTH`다. 브라우저 DPR로 backing-store를 늘리지 않는다.
- 시뮬레이션은 `1000 / 60ms` 고정 스텝이며 한 렌더 프레임의 catch-up은 최대 5스텝이다.
- 고정 스텝 횟수는 정수 tick으로 저장하고 `simulationMs = ticks * 1000 / 60` 순서로 계산한다. duration 경계 비교는 공통 `reachedDuration`을 사용해 부동소수 누적으로 한 tick 늦어지지 않게 한다.
- 순수 규칙 모듈은 Phaser를 import하지 않고 `Math.random()`, `Date.now()`, `performance.now()`를 직접 호출하지 않는다.
- `skillSelection`, `countdown`, `visibilityPause`, `won`, `lost`에서는 월드 시뮬레이션 시간이 흐르지 않는다. 스킬 선택 중 Scene 자체를 pause하지 않아 카드 입력은 살아 있어야 한다.
- 공격 판정 시점은 애니메이션 이벤트가 아니라 시뮬레이션 시작 후 `250ms`다. 애니메이션은 그 결과를 표현한다.
- 한 스텝의 후처리 우선순위는 `피해 → 사망·간식 → 패배 → 승리 → 비최종 웨이브 종료 → 스킬 학습`이며 종료 전환은 idempotent다.
- 적 60, 투사체 80, 파티클 120을 넘지 않는다. 적·투사체·이펙트는 사전 할당 풀을 사용한다.
- 런타임과 CI는 `.superpowers` 파일을 직접 읽지 않는다. 승인본을 `assets/source`에 승격하고 `public/assets`만 로드한다.
- 똥 안 줍는 보호자 남녀의 상단 걷기 행은 승인된 v2를 유지하고 하단만 `집기 → 조준 → 투척 → 복귀`로 교체한다.
- 오디오는 MVP에서 제외한다. 사실적인 폭력, 피, 신체 훼손과 실제 인물을 연상시키는 표식도 넣지 않는다.
- 모든 테스트와 명령은 저장소 루트 `/Users/jadon/Documents/huchu-defense`에서 실행한다.

## Exact File Structure

```text
.
├── .editorconfig
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── assets/source/
│   ├── provenance.json
│   ├── characters/
│   │   ├── huchu.png
│   │   ├── deokbae.png
│   │   ├── enemy-poop-male-base.png
│   │   ├── enemy-poop-female-base.png
│   │   ├── enemy-offleash-male.png
│   │   ├── enemy-offleash-female.png
│   │   ├── enemy-trader.png
│   │   ├── enemy-breeder-male.png
│   │   └── enemy-breeder-female.png
│   ├── generated/
│   │   ├── enemy-poop-male-throw-edit.png
│   │   ├── enemy-poop-female-throw-edit.png
│   │   ├── map-background-edit.png
│   │   └── shelter-states-edit.png
│   └── map/map-option-a-simple-v2.png
├── public/assets/
│   ├── characters/*.png
│   ├── map/map-background.webp
│   └── shelter/shelter-states.png
├── scripts/assets/
│   ├── manifest.mjs
│   ├── build-assets.mjs
│   ├── verify-assets.mjs
│   └── render-asset-review.mjs
├── src/
│   ├── main.ts
│   ├── styles.css
│   ├── vite-env.d.ts
│   └── game/
│       ├── constants.ts
│       ├── GameConfigSpec.ts
│       ├── createGame.ts
│       ├── types/GameTypes.ts
│       ├── assets/AssetKeys.ts
│       ├── assets/assetManifest.ts
│       ├── core/FixedStepClock.ts
│       ├── core/GameMode.ts
│       ├── core/GameStateMachine.ts
│       ├── core/SeededRng.ts
│       ├── core/TypedEventBus.ts
│       ├── data/balance.ts
│       ├── data/pathDefinitions.ts
│       ├── data/waveDefinitions.ts
│       ├── data/validateGameData.ts
│       ├── debug/TestContract.ts
│       ├── debug/TestBridge.ts
│       ├── debug/ManualStepScheduler.ts
│       ├── debug/ScenarioFactory.ts
│       ├── debug/ScenarioSessionPort.ts
│       ├── debug/E2eBootOverrides.ts
│       ├── events/GameEvents.ts
│       ├── session/GameSession.ts
│       ├── session/RunOutcomeResolver.ts
│       ├── session/RunSnapshot.ts
│       ├── scenes/BootScene.ts
│       ├── scenes/PreloadScene.ts
│       ├── scenes/TitleScene.ts
│       ├── scenes/GameScene.ts
│       ├── scenes/ResultScene.ts
│       ├── world/Geometry.ts
│       ├── world/AnimationFrameResolver.ts
│       ├── world/MapView.ts
│       ├── world/PathSystem.ts
│       ├── world/DebugPathOverlay.ts
│       ├── player/PlayerTypes.ts
│       ├── player/InputVector.ts
│       ├── player/PlayerController.ts
│       ├── player/PlayerView.ts
│       ├── player/KeyboardInput.ts
│       ├── player/VirtualJoystick.ts
│       ├── waves/WaveTypes.ts
│       ├── waves/WaveSystem.ts
│       ├── enemies/EnemyTypes.ts
│       ├── enemies/EnemySystem.ts
│       ├── enemies/EnemyActor.ts
│       ├── enemies/EnemyActorPool.ts
│       ├── enemies/EnemyHpBar.ts
│       ├── combat/CombatTypes.ts
│       ├── combat/CombatSystem.ts
│       ├── combat/TargetingSystem.ts
│       ├── combat/BarkSystem.ts
│       ├── combat/EnemyAttackSystem.ts
│       ├── combat/ProjectileSystem.ts
│       ├── combat/ProjectileActorPool.ts
│       ├── shelter/ShelterTypes.ts
│       ├── shelter/ShelterSystem.ts
│       ├── shelter/ShelterView.ts
│       ├── progression/ProgressionTypes.ts
│       ├── progression/ProgressionSystem.ts
│       ├── progression/SkillCardPicker.ts
│       ├── skills/SkillTypes.ts
│       ├── skills/skillDefinitions.ts
│       ├── skills/SkillSystem.ts
│       ├── skills/SpatialBucketTargeting.ts
│       ├── pooling/ObjectPool.ts
│       ├── ui/HudSystem.ts
│       ├── ui/TopHud.ts
│       ├── ui/SkillHud.ts
│       ├── ui/BossHud.ts
│       ├── ui/SkillSelectionModal.ts
│       ├── ui/CountdownOverlay.ts
│       ├── ui/UiTransitionClock.ts
│       ├── ui/RuntimeErrorOverlay.ts
│       └── lifecycle/
│           ├── VisibilityController.ts
│           ├── WorldPauseController.ts
│           └── WebGlRecoveryController.ts
└── tests/
    ├── assets/asset-pipeline.test.ts
    ├── unit/fixtures.ts
    ├── unit/*.test.ts
    ├── e2e/helpers.ts
    ├── e2e/title-and-input.spec.ts
    ├── e2e/combat.spec.ts
    ├── e2e/skill-selection.spec.ts
    ├── e2e/lifecycle.spec.ts
    ├── e2e/error-recovery.spec.ts
    ├── e2e/gameplay-visuals.spec.ts
    ├── e2e/test-bridge.spec.ts
    ├── e2e/full-run.spec.ts
    ├── performance/performance.spec.ts
    ├── visual/asset-review.spec.ts
    └── visual/__snapshots__/**/*.png
```

## Shared Interface Ledger

```ts
export type GameMode =
  | 'playing'
  | 'skillSelection'
  | 'countdown'
  | 'visibilityPause'
  | 'won'
  | 'lost';
export type PathId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
export type EnemyKind =
  | 'poopGuardian'
  | 'offLeashGuardian'
  | 'dogTrader'
  | 'illegalBreeder';
export type EnemyVariant = 'male' | 'female';
export type EnemyState = 'moving' | 'windup' | 'holding' | 'stunned' | 'dead';
export type SkillId = 'bark' | 'scold' | 'aquaBeam' | 'deokbaeHowl' | 'safetyReport';
export type SkillLevel = 0 | 1 | 2 | 3;

export interface RandomSource { next(): number; }
export interface GameClock { nowMs(): number; }
export interface EventSink { emit(event: GameEvent): void; }
```

`GameSession`이 순수 규칙 계층의 단일 진입점이다.

위 type의 canonical owner는 `GameMode → src/game/core/GameMode.ts`, 나머지 `PathId/EnemyKind/EnemyVariant/EnemyState/SkillId/SkillLevel → src/game/types/GameTypes.ts`다. feature 폴더는 재선언하지 않고 이 파일에서 type-only import한다.

```ts
export class GameSession {
  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[];
  selectCard(cardId: string): readonly GameEvent[];
  requestVisibilityPause(): void;
  requestVisibilityResume(): void;
  snapshot(): RunSnapshot;
  reset(seed: number): void;
}
```

E2E 전용 계약은 빌드 모드와 URL 양쪽으로 잠근다.

```ts
export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
}

declare global {
  interface Window { __HUCHU_TEST__?: HuchuTestBridge; }
}
```

`HuchuTestBridge`는 `vite --mode e2e`이면서 URL에 `?e2e=1&seed=424242&clock=manual`이 모두 있을 때만 `window.__HUCHU_TEST__`로 노출한다. 프로덕션 빌드는 해당 전역을 만들지 않는다.

## Specification Traceability

| 설계 절 | 구현 Task |
| --- | --- |
| 1~2 목표·MVP 범위 | 1~15 전체 |
| 3 화면과 조작 | 1, 5, 13 |
| 4 한 판의 흐름 | 6, 10, 12 |
| 5 맵과 보호소 | 3, 4, 9 |
| 6 후추와 기본 짖기 | 5, 8 |
| 7 스킬 학습과 자동 스킬 | 10, 11 |
| 8 적·HP·공격 | 7, 9, 12 |
| 9 웨이브 | 4, 6, 12 |
| 10 HUD | 7, 11, 12 |
| 11 비주얼과 에셋 | 3, 7, 9, 14 |
| 12~13 구조와 데이터 흐름 | 2, 4, 6~12 |
| 14 정지와 오류 처리 | 3, 10, 13 |
| 15 성능 | 7, 9, 11, 14 |
| 16 테스트 전략 | 각 Task의 실패 테스트와 Task 14 |
| 17 완료 기준 1~10 | 14 자동 gate와 15 사용자 acceptance |
| 18 기술 선택 | 1의 Phaser WebGL 셸 |

완료 기준은 각각 `완주→12/15`, `적 HP bar→7/14`, `똥 투척→9/14`, `스킬 선택→10/14`, `자동 스킬→11/14`, `승인 에셋 애니메이션→3/14`, `보스→12/14`, `테스트·성능→14/15`, `보호소 분리 에셋→3/14`, `적 외형·투척 행→3/14`에 대응한다.

---

### Task 1: WebGL 프로젝트 셸과 시작 화면

**Files:**
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `index.html`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/vite-env.d.ts`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `src/game/constants.ts`
- Create: `src/game/GameConfigSpec.ts`
- Create: `src/game/createGame.ts`
- Create: `src/game/scenes/BootScene.ts`
- Create: `src/game/scenes/PreloadScene.ts`
- Create: `src/game/scenes/TitleScene.ts`
- Create: `src/game/scenes/GameScene.ts`
- Create: `src/game/scenes/ResultScene.ts`
- Test: `tests/unit/createGameConfig.test.ts`
- Test: `tests/e2e/title-and-input.spec.ts`

**Interfaces:**
- Consumes: WebGL 지원 여부
- Produces: `createGameConfig()`, 5개 Scene key, 고정 `540 × 960` backing-store canvas, 시작 버튼

- [ ] **Step 1: Phaser 설정 계약의 실패 테스트를 작성한다.**

```ts
// tests/unit/createGameConfig.test.ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG_SPEC } from '../../src/game/GameConfigSpec';

describe('GAME_CONFIG_SPEC', () => {
  it('Node 환경에서 Phaser import 없이 고정 backing-store WebGL 계약을 고정한다', () => {
    expect(GAME_CONFIG_SPEC).toEqual({
      width: 540, height: 960, renderer: 'WEBGL', scaleMode: 'FIT', autoCenter: 'CENTER_BOTH',
    });
  });
});
```

- [ ] **Step 2: 테스트를 실행해 모듈 부재 실패를 확인한다.**

Run: `npm test -- --run tests/unit/createGameConfig.test.ts`

Expected: `package.json` 또는 `src/game/createGame.ts`가 없어 실패한다.

- [ ] **Step 3: 정확한 도구 버전과 최소 Vite/Phaser 셸을 구현한다.**

```json
{
  "name": "huchu-defense",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "vite",
    "dev:e2e": "vite --mode e2e --host 127.0.0.1 --port 5174 --strictPort",
    "typecheck": "tsc --noEmit",
    "build": "npm run typecheck && vite build",
    "test": "vitest",
    "test:unit": "vitest run",
    "test:e2e": "playwright test --grep-invert @perf",
    "test:perf": "playwright test tests/performance --grep @perf --workers=1",
    "test:all": "npm run assets:verify && npm run assets:review && npm run test:unit && npm run build && npm run test:e2e",
    "assets:build": "node scripts/assets/build-assets.mjs",
    "assets:verify": "node scripts/assets/verify-assets.mjs",
    "assets:review": "node scripts/assets/render-asset-review.mjs"
  },
  "dependencies": { "phaser": "4.1.0" },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@types/node": "22.20.1",
    "sharp": "0.35.3",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10"
  }
}
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'performance/**/*.spec.ts', 'visual/**/*.spec.ts'],
  snapshotPathTemplate: '{testDir}/visual/__snapshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 } },
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
  ],
});
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node", "vitest/globals"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": false
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
export default defineConfig({ server: { host: '127.0.0.1', port: 5173 }, preview: { host: '127.0.0.1', port: 4173 } });

// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/assets/**/*.test.ts'],
    globals: true,
    environment: 'node',
    restoreMocks: true,
    coverage: { reporter: ['text', 'html'] },
  },
});
```

```html
<!-- index.html -->
<!doctype html>
<html lang="ko">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>후추 디펜스</title></head>
  <body><main id="game-root" aria-label="후추 디펜스 게임"></main><script type="module" src="/src/main.ts"></script></body>
</html>
```

```ts
// src/main.ts
import './styles.css';
import { createGame } from './game/createGame';
createGame();
```

```css
/* src/styles.css */
:root { font-family: system-ui, sans-serif; color: #34291f; background: #213c2b; }
* { box-sizing: border-box; }
html, body, #game-root { width: 100%; height: 100%; margin: 0; overflow: hidden; overscroll-behavior: none; touch-action: none; }
#game-root { display: grid; place-items: center; min-height: 100dvh; }
.primary-game-button { min-width: 188px; min-height: 52px; border: 0; border-radius: 14px; padding: 12px 20px; color: white; background: #3d7c45; font: 700 24px system-ui, sans-serif; cursor: pointer; }
```

```text
# .gitignore
node_modules/
dist/
test-results/
playwright-report/
coverage/
.cache/

# .editorconfig
root = true
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

```ts
// src/game/constants.ts
export const WORLD_WIDTH = 540;
export const WORLD_HEIGHT = 960;
export const SIMULATION_HZ = 60;
export const FIXED_STEP_MS = 1000 / SIMULATION_HZ;
export const TIME_EPSILON_MS = 1e-7;
export const simulationMsFromTicks = (ticks: number) => ticks * 1000 / SIMULATION_HZ;
export const reachedDuration = (elapsedMs: number, targetMs: number) => elapsedMs + TIME_EPSILON_MS >= targetMs;
export const subtractDuration = (remainingMs: number, stepMs: number) => {
  const next = remainingMs - stepMs;
  return next <= TIME_EPSILON_MS ? 0 : next;
};

// src/game/GameConfigSpec.ts
export const GAME_CONFIG_SPEC = {
  width: 540, height: 960, renderer: 'WEBGL', scaleMode: 'FIT', autoCenter: 'CENTER_BOTH',
} as const;

// src/game/createGame.ts
import Phaser from 'phaser';
import { GAME_CONFIG_SPEC } from './GameConfigSpec';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.WEBGL,
    parent: 'game-root',
    width: GAME_CONFIG_SPEC.width,
    height: GAME_CONFIG_SPEC.height,
    backgroundColor: '#8fc66b',
    dom: { createContainer: true },
    render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, PreloadScene, TitleScene, GameScene, ResultScene],
  };
}

export function createGame(): Phaser.Game {
  return new Phaser.Game(createGameConfig());
}
```

```ts
// src/game/scenes/TitleScene.ts
import Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create(): void {
    this.add.text(270, 310, '후추 디펜스', {
      fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: '#34291f',
    }).setOrigin(0.5);
    const start = this.add.dom(270, 570).createFromHTML(
      '<button type="button" class="primary-game-button">보호소 지키기</button>',
    );
    start.addListener('click').on('click', () => this.scene.start('Game'));
  }
}
```

```ts
// src/game/scenes/BootScene.ts
import Phaser from 'phaser';
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create(): void { this.scene.start('Preload'); }
}

// src/game/scenes/PreloadScene.ts
import Phaser from 'phaser';
export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload'); }
  create(): void { this.scene.start('Title'); }
}

// src/game/scenes/GameScene.ts
import Phaser from 'phaser';
export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  create(): void {}
}

// src/game/scenes/ResultScene.ts
import Phaser from 'phaser';
export class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }
  create(): void { document.querySelector('#game-root')?.setAttribute('data-scene', 'Result'); }
}
```

`BootScene`은 WebGL renderer를 확인한 뒤 `Preload`로, `PreloadScene`은 Task 3 이전에는 즉시 `Title`로 이동한다. `GameScene`은 `game-scene-ready` data attribute를 설정하고, `ResultScene`은 `won|lost`를 받아 재시작 버튼을 만든다. 시작·카드·재시작·재개·재시도처럼 사용자가 누르는 UI는 Phaser DOMElement 안의 실제 `<button>`으로 만들어 Playwright role과 최소 44px 터치 영역을 동시에 보장한다. `src/styles.css`는 body 스크롤과 overscroll을 막고 `#game-root`와 Phaser DOM container를 `100dvh` 중앙 정렬한다.

- [ ] **Step 4: 의존성을 설치하고 단위 테스트·타입·빌드를 통과시킨다.**

Run: `npm install && npx playwright install chromium`

Run: `npm run test:unit && npm run build`

Expected: 테스트 1개 이상 통과, TypeScript 오류 0개, `dist/index.html` 생성.

- [ ] **Step 5: 시작 화면 브라우저 smoke test를 먼저 실패시키고 구현과 연결한다.**

```ts
// tests/e2e/title-and-input.spec.ts
import { expect, test } from '@playwright/test';

test('시작 버튼으로 GameScene에 진입한다', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveJSProperty('width', 540);
  await expect(canvas).toHaveJSProperty('height', 960);
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-scene', 'Game');
  await expect(page.locator('#game-root')).toHaveAttribute('data-renderer', 'webgl');
});
```

Run: `npm run test:e2e -- tests/e2e/title-and-input.spec.ts`

Expected first run: Scene/renderer data attribute가 없어 실패. `GameScene.create()`에서 root의 `data-scene='Game'`과 `data-renderer = this.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'other'`를 설정한 뒤 통과.

- [ ] **Step 6: Task 1을 커밋한다.**

```bash
git add .editorconfig .gitignore index.html package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts src tests/unit/createGameConfig.test.ts tests/e2e/title-and-input.spec.ts docs/superpowers/plans/2026-07-19-huchu-defense-mvp.md
git commit -m "chore: scaffold Phaser web game"
```

---

### Task 2: 결정적 시계·난수·상태 머신

**Files:**
- Create: `src/game/core/FixedStepClock.ts`
- Create: `src/game/core/GameMode.ts`
- Create: `src/game/core/GameStateMachine.ts`
- Create: `src/game/core/SeededRng.ts`
- Create: `src/game/core/TypedEventBus.ts`
- Create: `src/game/types/GameTypes.ts`
- Create: `src/game/events/GameEvents.ts`
- Create: `src/game/session/RunOutcomeResolver.ts`
- Test: `tests/unit/FixedStepClock.test.ts`
- Test: `tests/unit/SeededRng.test.ts`
- Test: `tests/unit/GameStateMachine.test.ts`
- Test: `tests/unit/RunOutcomeResolver.test.ts`

**Interfaces:**
- Consumes: 렌더 delta, seed, 전환 요청, 스텝 종료 판정 입력
- Produces: 최대 5개 고정 스텝, 재현 가능한 난수, 검증된 `GameMode`, 단 하나의 종료 결과

- [ ] **Step 1: 고정 스텝과 같은 seed 계약을 실패 테스트로 고정한다.**

```ts
// tests/unit/FixedStepClock.test.ts
import { FixedStepClock } from '../../src/game/core/FixedStepClock';

it('긴 렌더 프레임도 최대 5스텝만 따라잡는다', () => {
  const clock = new FixedStepClock(1000 / 60, 5);
  expect(clock.consume(1000)).toHaveLength(5);
});

// tests/unit/SeededRng.test.ts
import { SeededRng } from '../../src/game/core/SeededRng';

it('같은 seed는 같은 수열을 만든다', () => {
  const a = new SeededRng(424242);
  const b = new SeededRng(424242);
  expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
});
```

Run: `npm run test:unit -- tests/unit/FixedStepClock.test.ts tests/unit/SeededRng.test.ts`

Expected: 두 모듈을 찾지 못해 실패.

- [ ] **Step 2: 누적 오차를 보존하는 고정 시계와 주입형 RNG를 구현한다.**

```ts
// src/game/core/FixedStepClock.ts
import { reachedDuration, subtractDuration } from '../constants';

export class FixedStepClock {
  private accumulatorMs = 0;
  constructor(private readonly stepMs: number, private readonly maxCatchUp: number) {}

  consume(deltaMs: number): readonly number[] {
    this.accumulatorMs += Math.min(deltaMs, this.stepMs * this.maxCatchUp);
    const steps: number[] = [];
    while (reachedDuration(this.accumulatorMs, this.stepMs) && steps.length < this.maxCatchUp) {
      steps.push(this.stepMs);
      this.accumulatorMs = subtractDuration(this.accumulatorMs, this.stepMs);
    }
    return steps;
  }

  reset(): void { this.accumulatorMs = 0; }
}
```

```ts
// src/game/core/SeededRng.ts
export interface RandomSource { next(): number; }

export class SeededRng implements RandomSource {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 0x6d2b79f5; }

  next(): number {
    let t = this.state += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
```

- [ ] **Step 3: 정지 상태와 종료 우선순위를 실패 테스트로 작성한다.**

```ts
// tests/unit/GameStateMachine.test.ts
import { GameStateMachine } from '../../src/game/core/GameStateMachine';

it.each(['skillSelection', 'countdown', 'visibilityPause', 'won', 'lost'] as const)(
  '%s에서는 월드가 진행되지 않는다',
  (mode) => expect(new GameStateMachine(mode).canStepWorld()).toBe(false),
);

// tests/unit/RunOutcomeResolver.test.ts
import { resolvePostStep, RunOutcomeResolver } from '../../src/game/session/RunOutcomeResolver';

it('같은 스텝에 모두 참이면 패배를 한 번만 확정한다', () => {
  const resolver = new RunOutcomeResolver();
  const input = { shelterHp: 0, wave: 5, active: 0, pending: 0, skillDue: true };
  expect(resolver.resolve(input)).toEqual({ mode: 'lost' });
  expect(resolver.resolve(input)).toEqual({ mode: 'lost' });
  expect(resolver.transitionCount).toBe(1);
});
```

Run: `npm run test:unit -- tests/unit/GameStateMachine.test.ts tests/unit/RunOutcomeResolver.test.ts`

Expected: 상태 머신과 resolver 부재로 실패.

- [ ] **Step 4: 상태 전환 표와 idempotent 종료 resolver를 구현한다.**

```ts
// src/game/core/GameMode.ts
export type GameMode = 'playing' | 'skillSelection' | 'countdown' |
  'visibilityPause' | 'won' | 'lost';

// src/game/types/GameTypes.ts
export type PathId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
export type EnemyKind = 'poopGuardian' | 'offLeashGuardian' | 'dogTrader' | 'illegalBreeder';
export type EnemyVariant = 'male' | 'female';
export type EnemyState = 'moving' | 'windup' | 'holding' | 'stunned' | 'dead';
export type SkillId = 'bark' | 'scold' | 'aquaBeam' | 'deokbaeHowl' | 'safetyReport';
export type SkillLevel = 0 | 1 | 2 | 3;

// src/game/core/GameStateMachine.ts
import type { GameMode } from './GameMode';

const WORLD_MODES = new Set<GameMode>(['playing']);
export class GameStateMachine {
  private resumeState: GameMode | null = null;
  constructor(private mode: GameMode = 'playing') {}
  current(): GameMode { return this.mode; }
  canStepWorld(): boolean { return WORLD_MODES.has(this.mode); }
  transition(next: GameMode): void {
    if (this.mode === 'won' || this.mode === 'lost') return;
    this.mode = next;
  }
  hide(): void { this.resumeState = this.mode; this.mode = 'visibilityPause'; }
  resume(): GameMode { this.mode = this.resumeState ?? 'playing'; this.resumeState = null; return this.mode; }
  reset(mode: GameMode = 'playing'): void { this.mode = mode; this.resumeState = null; }
}
```

```ts
// src/game/session/RunOutcomeResolver.ts
export interface PostStepInput {
  readonly shelterHp: number;
  readonly wave: number;
  readonly active: number;
  readonly pending: number;
  readonly skillDue: boolean;
}
export interface PostStepResolution {
  readonly mode: 'lost' | 'won' | 'skillSelection' | 'countdown' | 'playing';
  readonly nextWave?: number;
  readonly countdownKind?: 'nextWave';
}

export function resolvePostStep(input: PostStepInput): PostStepResolution {
  if (input.shelterHp <= 0) return { mode: 'lost' };
  const waveClear = input.active === 0 && input.pending === 0;
  if (waveClear && input.wave === 5) return { mode: 'won' };
  if (waveClear && input.wave < 5) {
    const transition = { nextWave: input.wave + 1, countdownKind: 'nextWave' as const };
    return input.skillDue
      ? { mode: 'skillSelection', ...transition }
      : { mode: 'countdown', ...transition };
  }
  if (input.skillDue) return { mode: 'skillSelection' };
  return { mode: 'playing' };
}

export class RunOutcomeResolver {
  private outcome: 'won' | 'lost' | null = null;
  transitionCount = 0;
  resolve(input: PostStepInput): PostStepResolution {
    if (this.outcome !== null) return { mode: this.outcome };
    const next = resolvePostStep(input);
    if (next.mode === 'won' || next.mode === 'lost') {
      this.outcome = next.mode;
      this.transitionCount += 1;
    }
    return next;
  }
  reset(): void { this.outcome = null; this.transitionCount = 0; }
}
```

`TypedEventBus`는 `GameEvent['type']`를 key로 하고 구독 해제 함수를 반환한다. `GameEvents.ts`에는 이후 Task가 확장할 discriminated union을 정의하되 Task 2에서는 `modeChanged`, `runEnded`만 둔다.

- [ ] **Step 5: 전체 단위 테스트와 정적 검사를 통과시킨다.**

Run: `npm run test:unit && npm run typecheck`

Expected: core 테스트 전체 통과, `Math.random|Date.now|performance.now`가 `src/game/core`, `data`, `combat`, `progression`, `skills`, `waves`에 없음.

Run: `(cd src/game && rg "Math\.random|Date\.now|performance\.now" . --glob 'core/**' --glob 'data/**' --glob 'combat/**' --glob 'progression/**' --glob 'skills/**' --glob 'waves/**')`

Expected: 출력 없음.

- [ ] **Step 6: Task 2를 커밋한다.**

```bash
git add src/game/core src/game/types src/game/events src/game/session/RunOutcomeResolver.ts tests/unit
git commit -m "feat: add deterministic game core"
```

---

### Task 3: 승인 에셋 승격·수정·결정적 빌드

**Files:**
- Create: `assets/source/provenance.json`
- Create: `assets/source/characters/*.png`
- Create: `assets/source/generated/*.png`
- Create: `assets/source/map/map-option-a-simple-v2.png`
- Create: `scripts/assets/manifest.mjs`
- Create: `scripts/assets/build-assets.mjs`
- Create: `scripts/assets/verify-assets.mjs`
- Create: `scripts/assets/render-asset-review.mjs`
- Create: `public/assets/characters/*.png`
- Create: `public/assets/map/map-background.webp`
- Create: `public/assets/shelter/shelter-states.png`
- Create: `src/game/assets/AssetKeys.ts`
- Create: `src/game/assets/assetManifest.ts`
- Modify: `src/game/scenes/PreloadScene.ts`
- Test: `tests/assets/asset-pipeline.test.ts`

**Interfaces:**
- Consumes: 승인된 9개 RGBA 캐릭터 시트, 승인 맵, 4개 수동 승인 ImageGen 편집본
- Produces: `768 × 512` 4×2 캐릭터 시트 9개, `941 × 1672` WebP 배경, `1024 × 256` 4×1 보호소 시트, SHA-256 provenance, Phaser asset manifest

- [ ] **Step 1: 산출물 계약 테스트를 먼저 작성하고 파일 부재 실패를 확인한다.**

```ts
// tests/assets/asset-pipeline.test.ts
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const characters = [
  'huchu', 'deokbae', 'enemy-poop-male', 'enemy-poop-female',
  'enemy-offleash-male', 'enemy-offleash-female', 'enemy-trader',
  'enemy-breeder-male', 'enemy-breeder-female',
];

describe('runtime assets', () => {
  it.each(characters)('%s는 4×2 RGBA 시트다', async (name) => {
    const meta = await sharp(`public/assets/characters/${name}.png`).metadata();
    expect(meta).toMatchObject({ width: 768, height: 512, channels: 4, format: 'png' });
  });
  it('보호소는 4×1 RGBA 시트다', async () => {
    const meta = await sharp('public/assets/shelter/shelter-states.png').metadata();
    expect(meta).toMatchObject({ width: 1024, height: 256, channels: 4, format: 'png' });
  });
  it('맵은 승인 해상도의 WebP다', async () => {
    const meta = await sharp('public/assets/map/map-background.webp').metadata();
    expect(meta).toMatchObject({ width: 941, height: 1672, format: 'webp' });
  });
});
```

Run: `npm run test:unit -- tests/assets/asset-pipeline.test.ts`

Expected: `public/assets` 파일 부재로 실패.

- [ ] **Step 2: 승인본을 버전 고정 source 디렉터리로 복사하고 해시를 기록한다.**

아래 매핑을 그대로 사용한다. `*-chroma-v2.png`, `enemy-poop-*-v3.png`는 RGB 또는 잘못된 공격 행이므로 복사하지 않는다.

```text
.superpowers/brainstorm/98371-1784435992/content/huchu-animation-v2.png
  -> assets/source/characters/huchu.png
.superpowers/brainstorm/98371-1784435992/content/deokbae-animation-v2.png
  -> assets/source/characters/deokbae.png
.superpowers/brainstorm/98371-1784435992/content/enemy-poop-male-v2.png
  -> assets/source/characters/enemy-poop-male-base.png
.superpowers/brainstorm/98371-1784435992/content/enemy-poop-female-v2.png
  -> assets/source/characters/enemy-poop-female-base.png
.superpowers/brainstorm/98371-1784435992/content/enemy-offleash-male-v2.png
  -> assets/source/characters/enemy-offleash-male.png
.superpowers/brainstorm/98371-1784435992/content/enemy-offleash-female-v2.png
  -> assets/source/characters/enemy-offleash-female.png
.superpowers/brainstorm/98371-1784435992/content/enemy-trader-v2.png
  -> assets/source/characters/enemy-trader.png
.superpowers/brainstorm/98371-1784435992/content/enemy-breeder-male-v2.png
  -> assets/source/characters/enemy-breeder-male.png
.superpowers/brainstorm/98371-1784435992/content/enemy-breeder-female-v2.png
  -> assets/source/characters/enemy-breeder-female.png
.superpowers/brainstorm/98371-1784435992/content/map-option-a-simple-v2.png
  -> assets/source/map/map-option-a-simple-v2.png
```

`assets/source/provenance.json`은 source 상대경로, 원본 상대경로, `sha256`을 가진 배열이다. 해시는 `shasum -a 256` 결과를 그대로 기록하고 `scripts/assets/verify-assets.mjs`에서 다시 비교한다.

- [ ] **Step 3: ImageGen으로 정확히 네 편집본을 만들고 각각 육안 승인한다.**

이 단계에서는 `imagegen` 스킬을 사용한다. 생성 뒤 `view_image`로 한 장씩 확인하며, 잘림·다른 인물 혼입·프레임 흔들림이 하나라도 있으면 같은 프롬프트로 수정한다.

```text
[남성 투척 행]
참조 이미지의 4×2 투명 스프라이트 시트에서 상단 걷기 행과 남성 캐릭터의 얼굴, 의상,
몸 비율, 조명, 외곽선은 픽셀 위치까지 보존한다. 하단 네 프레임만 왼쪽부터 집기,
보호소 방향 조준, 짧게 던지는 자세, 원래 자세로 복귀로 교체한다. 전신과 소품은 셀 안에
완전히 들어오며 다른 사람이나 신체 일부가 섞이지 않는다. 투사체와 궤적은 넣지 않는다.
투명 배경, 4열×2행, 1536×1024 RGBA.
```

```text
[여성 투척 행]
참조 이미지의 4×2 투명 스프라이트 시트에서 상단 걷기 행과 여성 캐릭터의 얼굴, 의상,
몸 비율, 조명, 외곽선은 픽셀 위치까지 보존한다. 하단 네 프레임만 왼쪽부터 집기,
보호소 방향 조준, 짧게 던지는 자세, 원래 자세로 복귀로 교체한다. 전신과 소품은 셀 안에
완전히 들어오며 다른 사람이나 신체 일부가 섞이지 않는다. 투사체와 궤적은 넣지 않는다.
투명 배경, 4열×2행, 1536×1024 RGBA.
```

```text
[보호소 제거 맵]
승인 맵의 중앙 보호소와 그 보호소 자체의 그림자·발판만 제거하고 주변 잔디로 자연스럽게
복원한다. 여섯 갈래 오솔길, 울타리, 꽃, 나무, 전체 구도, 색, 카메라 시점은 바꾸지 않는다.
새 건물이나 캐릭터를 추가하지 않는다. 원본과 동일한 941×1672 세로 구도.
```

```text
[보호소 상태 시트]
승인 맵 중앙 보호소와 동일한 건물, 시점, 조명, 색을 투명 배경의 4열 시트로 만든다.
왼쪽부터 정상, 경미 손상, 심각 손상, 방어 실패다. 네 프레임은 같은 바닥 중심점과 같은
크기를 공유하고 잔디, 꽃, 길, 캐릭터는 포함하지 않는다. 사실적 파괴나 불꽃 대신 만화식
균열과 처짐만 사용한다. 4열×1행 RGBA.
```

승인된 결과를 각각 `assets/source/generated/enemy-poop-male-throw-edit.png`, `enemy-poop-female-throw-edit.png`, `map-background-edit.png`, `shelter-states-edit.png`로 저장한다.

- [ ] **Step 4: Sharp 기반 빌드 manifest와 검증기를 구현한다.**

```js
// scripts/assets/manifest.mjs
export const characterSheets = [
  { key: 'huchu', source: 'assets/source/characters/huchu.png' },
  { key: 'deokbae', source: 'assets/source/characters/deokbae.png' },
  { key: 'enemy-poop-male', source: 'assets/source/characters/enemy-poop-male-base.png', attackEdit: 'assets/source/generated/enemy-poop-male-throw-edit.png' },
  { key: 'enemy-poop-female', source: 'assets/source/characters/enemy-poop-female-base.png', attackEdit: 'assets/source/generated/enemy-poop-female-throw-edit.png' },
  { key: 'enemy-offleash-male', source: 'assets/source/characters/enemy-offleash-male.png' },
  { key: 'enemy-offleash-female', source: 'assets/source/characters/enemy-offleash-female.png' },
  { key: 'enemy-trader', source: 'assets/source/characters/enemy-trader.png' },
  { key: 'enemy-breeder-male', source: 'assets/source/characters/enemy-breeder-male.png' },
  { key: 'enemy-breeder-female', source: 'assets/source/characters/enemy-breeder-female.png' },
];
export const characterOutput = (key) => `public/assets/characters/${key}.png`;
export const mapAsset = {
  source: 'assets/source/map/map-option-a-simple-v2.png',
  edit: 'assets/source/generated/map-background-edit.png',
  output: 'public/assets/map/map-background.webp',
  width: 941, height: 1672, centerX: 470.5, centerY: 806, radiusX: 120, radiusY: 155, feather: 12,
};
export const shelterAsset = {
  source: 'assets/source/generated/shelter-states-edit.png',
  output: 'public/assets/shelter/shelter-states.png',
  cellWidth: 256, cellHeight: 256, anchorX: 128, anchorY: 224,
};
```

```js
// scripts/assets/build-assets.mjs
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { characterOutput, characterSheets, mapAsset, shelterAsset } from './manifest.mjs';

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const pngOptions = { compressionLevel: 9, palette: false };

async function resizedRow(source, top) {
  return sharp(source).extract({ left: 0, top, width: 1536, height: 512 })
    .ensureAlpha().resize(768, 256, { kernel: sharp.kernel.lanczos3 }).png(pngOptions).toBuffer();
}

export async function buildCharacter(entry) {
  const output = characterOutput(entry.key);
  if (entry.attackEdit === undefined) {
    await sharp(entry.source).ensureAlpha().resize(768, 512, { kernel: sharp.kernel.lanczos3 })
      .png(pngOptions).toFile(output);
    return;
  }
  const [top, bottom] = await Promise.all([resizedRow(entry.source, 0), resizedRow(entry.attackEdit, 512)]);
  await sharp({ create: { width: 768, height: 512, channels: 4, background: transparent } })
    .composite([{ input: top, left: 0, top: 0 }, { input: bottom, left: 0, top: 256 }])
    .png(pngOptions).toFile(output);
}

async function mapMask() {
  const core = `<svg width="${mapAsset.width}" height="${mapAsset.height}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${mapAsset.centerX}" cy="${mapAsset.centerY}" rx="${mapAsset.radiusX}" ry="${mapAsset.radiusY}" fill="white"/>
  </svg>`;
  const outer = `<svg width="${mapAsset.width}" height="${mapAsset.height}" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="${mapAsset.centerX}" cy="${mapAsset.centerY}" rx="${mapAsset.radiusX + mapAsset.feather}" ry="${mapAsset.radiusY + mapAsset.feather}" fill="white"/>
  </svg>`;
  const blurred = await sharp(Buffer.from(core)).blur(mapAsset.feather / 3).png().toBuffer();
  return sharp(blurred).composite([{ input: Buffer.from(outer), blend: 'dest-in' }]).png().toBuffer();
}

export async function buildMaskedMapBuffer() {
  const [mask, edit] = await Promise.all([
    mapMask(),
    sharp(mapAsset.edit).resize(mapAsset.width, mapAsset.height, { fit: 'fill' }).ensureAlpha().png().toBuffer(),
  ]);
  const maskedEdit = await sharp(edit).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return sharp(mapAsset.source).ensureAlpha()
    .composite([{ input: maskedEdit, left: 0, top: 0, blend: 'over' }])
    .removeAlpha().png().toBuffer();
}

export async function buildMap() {
  const lossless = await buildMaskedMapBuffer();
  await sharp(lossless).webp({ quality: 85, effort: 6, smartSubsample: true }).toFile(mapAsset.output);
}

async function extractShelterFrames() {
  const metadata = await sharp(shelterAsset.source).metadata();
  if (metadata.width === undefined || metadata.height === undefined || metadata.width % 4 !== 0) {
    throw new Error('shelter-states-edit.png must contain four equal columns');
  }
  const sourceCellWidth = metadata.width / 4;
  return Promise.all(Array.from({ length: 4 }, async (_, index) => {
    const result = await sharp(shelterAsset.source)
      .extract({ left: index * sourceCellWidth, top: 0, width: sourceCellWidth, height: metadata.height })
      .ensureAlpha().trim({ background: transparent, threshold: 8 }).png().toBuffer({ resolveWithObject: true });
    if (result.info.width === 0 || result.info.height === 0) throw new Error(`shelter frame ${index} is empty`);
    return result;
  }));
}

export async function buildShelter() {
  const frames = await extractShelterFrames();
  const maxWidth = Math.max(...frames.map((frame) => frame.info.width));
  const maxHeight = Math.max(...frames.map((frame) => frame.info.height));
  const scale = Math.min(224 / maxWidth, 208 / maxHeight);
  const composites = await Promise.all(frames.map(async (frame, index) => {
    const width = Math.max(1, Math.round(frame.info.width * scale));
    const height = Math.max(1, Math.round(frame.info.height * scale));
    const input = await sharp(frame.data).resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png(pngOptions).toBuffer();
    return {
      input,
      left: index * shelterAsset.cellWidth + shelterAsset.anchorX - Math.round(width / 2),
      top: shelterAsset.anchorY - height,
    };
  }));
  await sharp({ create: { width: 1024, height: 256, channels: 4, background: transparent } })
    .composite(composites).png(pngOptions).toFile(shelterAsset.output);
}

export async function main() {
  await Promise.all([
    mkdir('public/assets/characters', { recursive: true }),
    mkdir('public/assets/map', { recursive: true }),
    mkdir('public/assets/shelter', { recursive: true }),
  ]);
  for (const entry of characterSheets) await buildCharacter(entry);
  await Promise.all([buildMap(), buildShelter()]);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

일반 시트와 투척 시트의 두 행은 각각 Lanczos3로 축소하므로 승인된 걷기 행에 공격 행 픽셀이 섞이지 않는다. 투사체 release frame은 index `6`이다. 맵은 중앙 타원 마스크만 바꾸고 보호소 네 frame은 동일 scale과 `(128,224)` anchor를 사용한다.

```js
// scripts/assets/verify-assets.mjs
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { buildMaskedMapBuffer } from './build-assets.mjs';
import { characterOutput, characterSheets, mapAsset, shelterAsset } from './manifest.mjs';

const failures = [];
const fail = (file, reason, details = {}) => failures.push({ file, reason, ...details });

async function rgbaPixels(file, extract) {
  let pipeline = sharp(file);
  if (extract !== undefined) pipeline = pipeline.extract(extract);
  return pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function alphaBounds(data, width, height, threshold = 8) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return undefined;
  return {
    x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1,
    margins: { left: minX, right: width - 1 - maxX, top: minY, bottom: height - 1 - maxY },
  };
}

async function verifyCharacter(entry) {
  const file = characterOutput(entry.key);
  const metadata = await sharp(file).metadata();
  if (metadata.width !== 768 || metadata.height !== 512 || metadata.channels !== 4 || metadata.format !== 'png') {
    fail(file, 'expected 768x512 RGBA PNG', { metadata });
    return;
  }
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const frame = await rgbaPixels(file, { left: column * 192, top: row * 256, width: 192, height: 256 });
      const bbox = alphaBounds(frame.data, 192, 256);
      if (bbox === undefined) fail(file, 'empty frame', { row, column });
      else if (Math.min(...Object.values(bbox.margins)) < 3) fail(file, 'frame needs 3px transparent margin', { row, column, bbox, margins: bbox.margins });
    }
  }
  if (entry.attackEdit !== undefined) {
    const expectedTopPng = await sharp(entry.source).extract({ left: 0, top: 0, width: 1536, height: 512 })
      .ensureAlpha().resize(768, 256, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();
    const [expectedTop, actualTop, oldBottom, actualBottom] = await Promise.all([
      rgbaPixels(expectedTopPng),
      rgbaPixels(file, { left: 0, top: 0, width: 768, height: 256 }),
      rgbaPixels(await sharp(entry.source).extract({ left: 0, top: 512, width: 1536, height: 512 })
        .ensureAlpha().resize(768, 256, { kernel: sharp.kernel.lanczos3 }).png().toBuffer()),
      rgbaPixels(file, { left: 0, top: 256, width: 768, height: 256 }),
    ]);
    if (!expectedTop.data.equals(actualTop.data)) fail(file, 'approved walk row changed');
    let difference = 0;
    for (let index = 0; index < oldBottom.data.length; index += 1) difference += Math.abs(oldBottom.data[index] - actualBottom.data[index]);
    if (difference / oldBottom.data.length < 5) fail(file, 'attack row is too similar to rejected whistle row');
  }
}

async function verifyShelter() {
  const file = shelterAsset.output;
  const metadata = await sharp(file).metadata();
  if (metadata.width !== 1024 || metadata.height !== 256 || metadata.channels !== 4 || metadata.format !== 'png') {
    fail(file, 'expected 1024x256 RGBA PNG', { metadata });
    return;
  }
  for (let column = 0; column < 4; column += 1) {
    const frame = await rgbaPixels(file, { left: column * 256, top: 0, width: 256, height: 256 });
    const bbox = alphaBounds(frame.data, 256, 256);
    if (bbox === undefined) { fail(file, 'empty shelter frame', { row: 0, column }); continue; }
    const anchorY = bbox.y + bbox.height;
    if (Math.abs(anchorY - shelterAsset.anchorY) > 2) fail(file, 'shelter ground anchor differs', { row: 0, column, bbox, anchorY });
    if (Math.min(bbox.margins.left, bbox.margins.right, bbox.margins.top, bbox.margins.bottom) < 16) {
      fail(file, 'shelter needs 16px transparent margin', { row: 0, column, bbox, margins: bbox.margins });
    }
  }
}

function outsideEditMask(x, y) {
  const rasterGuard = 2;
  const dx = (x - mapAsset.centerX) / (mapAsset.radiusX + mapAsset.feather + rasterGuard);
  const dy = (y - mapAsset.centerY) / (mapAsset.radiusY + mapAsset.feather + rasterGuard);
  return dx * dx + dy * dy > 1;
}

async function verifyMap() {
  const metadata = await sharp(mapAsset.output).metadata();
  if (metadata.width !== mapAsset.width || metadata.height !== mapAsset.height || metadata.format !== 'webp') {
    fail(mapAsset.output, 'unexpected map dimensions or codec', { metadata });
    return;
  }
  const [source, lossless, encoded] = await Promise.all([
    sharp(mapAsset.source).removeAlpha().raw().toBuffer(),
    sharp(await buildMaskedMapBuffer()).removeAlpha().raw().toBuffer(),
    sharp(mapAsset.output).removeAlpha().raw().toBuffer(),
  ]);
  const errors = [];
  for (let y = 0; y < mapAsset.height; y += 1) {
    for (let x = 0; x < mapAsset.width; x += 1) {
      if (!outsideEditMask(x, y)) continue;
      const offset = (y * mapAsset.width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        if (source[offset + channel] !== lossless[offset + channel]) {
          fail(mapAsset.output, 'lossless composite changed a pixel outside the edit mask', { x, y, channel });
          return;
        }
        errors.push(Math.abs(source[offset + channel] - encoded[offset + channel]));
      }
    }
  }
  errors.sort((a, b) => a - b);
  const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const p99 = errors.at(Math.floor(errors.length * 0.99)) ?? 0;
  if (mean > 3 || p99 > 12) fail(mapAsset.output, 'WebP drift outside edit mask exceeds tolerance', { mean, p99 });
}

async function verifyProvenance() {
  const entries = JSON.parse(await readFile('assets/source/provenance.json', 'utf8'));
  for (const entry of entries) {
    const actual = createHash('sha256').update(await readFile(entry.source)).digest('hex');
    if (actual !== entry.sha256) fail(entry.source, 'SHA-256 differs from provenance', { expected: entry.sha256, actual });
  }
}

await mkdir('.cache/asset-review', { recursive: true });
try {
  await verifyProvenance();
  for (const entry of characterSheets) await verifyCharacter(entry);
  await Promise.all([verifyShelter(), verifyMap()]);
} catch (error) {
  fail('asset-pipeline', error instanceof Error ? error.message : String(error));
}
await writeFile('.cache/asset-review/asset-report.json', `${JSON.stringify({ failures }, null, 2)}\n`);
if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exitCode = 1;
}
```

- [ ] **Step 5: 빌드·검증·리뷰 산출물을 실행하고 육안 검수한다.**

```js
// scripts/assets/render-asset-review.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { characterOutput, characterSheets, mapAsset, shelterAsset } from './manifest.mjs';

const outputDir = '.cache/asset-review';
await mkdir(outputDir, { recursive: true });

const checkerboard = (width, height) => Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse">
    <rect width="32" height="32" fill="#f1f5f9"/><path d="M0 0h16v16H0zM16 16h16v16H16z" fill="#cbd5e1"/>
  </pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>
</svg>`);

async function renderContactSheet() {
  const width = 768;
  const height = 512 * characterSheets.length;
  const composites = await Promise.all(characterSheets.map(async (entry, index) => ({
    input: await readFile(characterOutput(entry.key)), left: 0, top: index * 512,
  })));
  await sharp(checkerboard(width, height)).composite(composites)
    .png().toFile(`${outputDir}/sprite-contact-sheet.png`);
}

async function renderAnimationHtml() {
  const sheets = await Promise.all(characterSheets.map(async (entry) => ({
    key: entry.key,
    url: `data:image/png;base64,${(await readFile(characterOutput(entry.key))).toString('base64')}`,
  })));
  const encoded = JSON.stringify(sheets).replaceAll('<', '\\u003c');
  const html = `<!doctype html><meta charset="utf-8"><title>후추 디펜스 에셋 리뷰</title>
  <style>body{font:14px system-ui;background:#334155;color:white}main{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  article{background:#0f172a;padding:12px;border-radius:8px}canvas{width:192px;height:256px;max-width:100%;background:repeating-conic-gradient(#e2e8f0 0 25%,#94a3b8 0 50%) 50%/24px 24px;image-rendering:auto}</style>
  <button type="button" id="pause">프레임 정지</button><main id="root"></main><script>const sheets=${encoded};const root=document.querySelector('#root');let paused=false;const painters=[];
  document.querySelector('#pause').addEventListener('click',()=>{paused=true;for(const paint of painters)paint(0)});
  for(const sheet of sheets){const article=document.createElement('article');article.dataset.sheet=sheet.key;const title=document.createElement('h2');title.textContent=sheet.key;
  const walk=document.createElement('canvas');walk.width=192;walk.height=256;walk.dataset.animation='walk';const attack=walk.cloneNode();attack.dataset.animation='attack';article.append(title,'걷기 ',walk,'공격 ',attack);root.append(article);
  const image=new Image();image.src=sheet.url;image.onload=()=>{let start=performance.now();const paintFrames=(elapsed)=>{
  const paint=(canvas,row,fps)=>{const frame=Math.floor(elapsed/(1000/fps))%4;canvas.getContext('2d').clearRect(0,0,192,256);canvas.getContext('2d').drawImage(image,frame*192,row*256,192,256,0,0,192,256)};
  paint(walk,0,6);paint(attack,1,8);walk.dataset.ready='true';attack.dataset.ready='true'};painters.push(paintFrames);const draw=(now)=>{paintFrames(paused?0:now-start);if(!paused)requestAnimationFrame(draw)};requestAnimationFrame(draw)}}<\/script>`;
  await writeFile(`${outputDir}/sprite-animation-review.html`, html);
}

async function renderMapOverlay() {
  const background = await sharp(mapAsset.output).resize(540, 960, { fit: 'fill' }).png().toBuffer();
  const shelter = await sharp(shelterAsset.output).extract({ left: 0, top: 0, width: 256, height: 256 })
    .resize({ height: 96, fit: 'contain' }).png().toBuffer({ resolveWithObject: true });
  const scale = shelter.info.height / 256;
  await sharp(background).composite([{
    input: shelter.data,
    left: 270 - Math.round(shelter.info.width / 2),
    top: 480 - Math.round(shelterAsset.anchorY * scale),
  }]).png().toFile(`${outputDir}/map-shelter-overlay.png`);
}

async function renderMapHeatmap() {
  const [source, output] = await Promise.all([
    sharp(mapAsset.source).removeAlpha().raw().toBuffer(),
    sharp(mapAsset.output).removeAlpha().raw().toBuffer(),
  ]);
  const heat = Buffer.alloc(source.length);
  for (let offset = 0; offset < source.length; offset += 3) {
    const difference = Math.min(255, Math.max(
      Math.abs(source[offset] - output[offset]),
      Math.abs(source[offset + 1] - output[offset + 1]),
      Math.abs(source[offset + 2] - output[offset + 2]),
    ) * 8);
    heat[offset] = difference; heat[offset + 1] = 0; heat[offset + 2] = 255 - difference;
  }
  await sharp(heat, { raw: { width: mapAsset.width, height: mapAsset.height, channels: 3 } })
    .png().toFile(`${outputDir}/map-diff-heatmap.png`);
}

await Promise.all([renderContactSheet(), renderAnimationHtml(), renderMapOverlay(), renderMapHeatmap()]);
```

Run: `npm run assets:build && npm run assets:verify && npm run assets:review`

Expected:

- `.cache/asset-review/sprite-contact-sheet.png`
- `.cache/asset-review/sprite-animation-review.html` (걷기 6fps, 공격 8fps)
- `.cache/asset-review/map-shelter-overlay.png` (`540×960`, 보호소 `(270,480)`)
- `.cache/asset-review/map-diff-heatmap.png`
- `.cache/asset-review/asset-report.json` (`failures: []`)

`sprite-animation-review.html`은 외부 상대경로 없이 이미지와 스타일을 data URL로 내장해 Playwright의 `page.setContent`에서도 동일하게 렌더되어야 한다.
`.cache/asset-review/`는 `.gitignore`에 추가하고 Playwright `outputDir`인 `test-results/`와 분리한다. 따라서 test runner가 시작하며 outputDir을 정리해도 review 입력 HTML과 수동 검수 PNG는 보존된다.

체커보드·셀 경계 리뷰에서 신체 잘림, 다른 인물 혼입, 투척 순서, 보호소 중복, 초록 후광과 프레임 흔들림이 없어야 한다.

- [ ] **Step 6: Phaser manifest와 preload 실패 계약을 연결한다.**

```ts
// src/game/assets/AssetKeys.ts
export const AssetKeys = {
  map: 'map-background', shelter: 'shelter-states', huchu: 'huchu', deokbae: 'deokbae',
  poopMale: 'enemy-poop-male', poopFemale: 'enemy-poop-female',
  offLeashMale: 'enemy-offleash-male', offLeashFemale: 'enemy-offleash-female',
  trader: 'enemy-trader', breederMale: 'enemy-breeder-male', breederFemale: 'enemy-breeder-female',
} as const;
```

```ts
// src/game/assets/assetManifest.ts
import { AssetKeys } from './AssetKeys';

export const imageAssets = [
  { key: AssetKeys.map, url: '/assets/map/map-background.webp' },
] as const;
export const spriteSheetAssets = [
  { key: AssetKeys.shelter, url: '/assets/shelter/shelter-states.png', frameWidth: 256, frameHeight: 256 },
  { key: AssetKeys.huchu, url: '/assets/characters/huchu.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.deokbae, url: '/assets/characters/deokbae.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.poopMale, url: '/assets/characters/enemy-poop-male.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.poopFemale, url: '/assets/characters/enemy-poop-female.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.offLeashMale, url: '/assets/characters/enemy-offleash-male.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.offLeashFemale, url: '/assets/characters/enemy-offleash-female.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.trader, url: '/assets/characters/enemy-trader.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.breederMale, url: '/assets/characters/enemy-breeder-male.png', frameWidth: 192, frameHeight: 256 },
  { key: AssetKeys.breederFemale, url: '/assets/characters/enemy-breeder-female.png', frameWidth: 192, frameHeight: 256 },
] as const;
```

```ts
// src/game/scenes/PreloadScene.ts (Task 3 완성본)
import Phaser from 'phaser';
import { imageAssets, spriteSheetAssets } from '../assets/assetManifest';

export class PreloadScene extends Phaser.Scene {
  private failedFiles = 0;
  constructor() { super('Preload'); }

  init(): void { this.failedFiles = 0; }
  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    imageAssets.forEach((asset) => this.load.image(asset.key, asset.url));
    spriteSheetAssets.forEach(({ key, url, frameWidth, frameHeight }) => {
      this.load.spritesheet(key, url, { frameWidth, frameHeight });
    });
  }
  create(): void {
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onLoadError, this);
    if (this.failedFiles === 0) { this.scene.start('Title'); return; }
    this.add.text(270, 390, `필수 그림 ${this.failedFiles}개를 불러오지 못했어요`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#5b2117', align: 'center', wordWrap: { width: 440 },
    }).setOrigin(0.5);
    const retry = this.add.dom(270, 530).createFromHTML(
      '<button type="button" class="primary-game-button">다시 시도</button>',
    );
    retry.addListener('click').once('click', () => this.scene.restart());
  }
  private onLoadError(): void { this.failedFiles += 1; }
}
```

하나라도 실패하면 `Title`로 넘어가지 않으며 실제 DOM `<button>`의 높이는 44px 이상이다.

Run: `npm run test:unit -- tests/assets/asset-pipeline.test.ts && npm run build`

Expected: asset 계약과 빌드 통과.

- [ ] **Step 7: Task 3을 커밋한다.**

```bash
git add assets/source public/assets scripts/assets src/game/assets src/game/scenes/PreloadScene.ts tests/assets
git commit -m "feat: prepare validated game assets"
```

---

### Task 4: 밸런스·경로·웨이브 데이터 검증

**Files:**
- Create: `src/game/world/Geometry.ts`
- Create: `src/game/world/PathSystem.ts`
- Create: `src/game/data/balance.ts`
- Create: `src/game/data/pathDefinitions.ts`
- Create: `src/game/data/waveDefinitions.ts`
- Create: `src/game/data/validateGameData.ts`
- Create: `src/game/waves/WaveTypes.ts`
- Modify: `src/game/scenes/BootScene.ts`
- Test: `tests/unit/PathSystem.test.ts`
- Test: `tests/unit/GameDataValidation.test.ts`

**Interfaces:**
- Consumes: 6개 경로 웨이포인트, 적·스킬 밸런스, 5개 웨이브 정의
- Produces: 검증된 `PathId`, 거리·위치·남은 도달 시간 계산, 시작 전 오류 목록

- [ ] **Step 1: 경로 보간과 잘못된 데이터 실패 테스트를 작성한다.**

```ts
// tests/unit/PathSystem.test.ts
import { PATH_DEFINITIONS } from '../../src/game/data/pathDefinitions';
import { distance } from '../../src/game/world/Geometry';
import { PathSystem } from '../../src/game/world/PathSystem';

it('진행도를 경로 위치와 남은 보호소 도달 시간으로 바꾼다', () => {
  const path = new PathSystem(PATH_DEFINITIONS.P1);
  expect(path.positionAt(0)).toEqual({ x: 110, y: 0 });
  expect(path.positionAt(path.length)).toEqual({ x: 270, y: 430 });
  expect(path.eta(path.length - 44, 44)).toBeCloseTo(1, 5);
  const attackProgress = path.firstProgressWithinCircle({ x: 270, y: 480 }, 38 + 48);
  expect(distance(path.positionAt(attackProgress), { x: 270, y: 480 })).toBeCloseTo(86, 5);
  expect(new PathSystem([[0, 0], [100, 0]]).closestProgressTo({ x: 60, y: 20 })).toBe(60);
});

// tests/unit/GameDataValidation.test.ts
import { PATH_DEFINITIONS } from '../../src/game/data/pathDefinitions';
import { validateGameData } from '../../src/game/data/validateGameData';

it('맵 밖 웨이포인트와 알 수 없는 경로를 모두 보고한다', () => {
  const errors = validateGameData({
    paths: { ...PATH_DEFINITIONS, P1: [[-1, 0], [270, 430]] },
    waves: [{ wave: 1, spawns: [{ atMs: 0, pathId: 'PX', kind: 'poopGuardian', variant: 'male' }] }],
  });
  expect(errors).toEqual(expect.arrayContaining([
    expect.stringContaining('P1'), expect.stringContaining('PX'),
  ]));
});
```

Run: `npm run test:unit -- tests/unit/PathSystem.test.ts tests/unit/GameDataValidation.test.ts`

Expected: 데이터 및 시스템 모듈 부재로 실패.

- [ ] **Step 2: exact path definitions와 선분 누적 거리 계산을 구현한다.**

```ts
// src/game/data/pathDefinitions.ts
export const PATH_DEFINITIONS = {
  P1: [[110, 0], [116, 75], [138, 159], [222, 214], [264, 265], [270, 350], [270, 430]],
  P2: [[430, 0], [424, 75], [402, 159], [318, 214], [276, 265], [270, 350], [270, 430]],
  P3: [[270, 0], [270, 110], [270, 220], [270, 340], [270, 430]],
  P4: [[0, 482], [90, 482], [170, 445], [220, 420], [240, 447], [220, 480]],
  P5: [[540, 482], [450, 482], [370, 445], [320, 420], [300, 447], [320, 480]],
  P6: [[270, 960], [270, 875], [270, 790], [270, 704], [270, 625], [270, 530]],
} as const;
```

```ts
// src/game/world/Geometry.ts
export interface Point { readonly x: number; readonly y: number; }
export const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const lerpPoint = (a: Point, b: Point, ratio: number): Point => ({
  x: a.x + (b.x - a.x) * ratio,
  y: a.y + (b.y - a.y) * ratio,
});
```

```ts
// src/game/world/PathSystem.ts
import { clamp, distance, lerpPoint, type Point } from './Geometry';

type Waypoint = Point | readonly [number, number];
const asPoint = (value: Waypoint): Point => Array.isArray(value)
  ? { x: value[0], y: value[1] }
  : value as Point;

export class PathSystem {
  private readonly points: readonly Point[];
  private readonly cumulative: readonly number[];
  readonly length: number;

  constructor(waypoints: readonly Waypoint[]) {
    if (waypoints.length < 2) throw new RangeError('A path needs at least two waypoints');
    this.points = waypoints.map(asPoint);
    const cumulative = [0];
    for (let index = 1; index < this.points.length; index += 1) {
      cumulative.push(cumulative.at(-1)! + distance(this.points[index - 1]!, this.points[index]!));
    }
    this.cumulative = cumulative;
    this.length = cumulative.at(-1)!;
    if (this.length === 0) throw new RangeError('A path must have non-zero length');
  }

  positionAt(progress: number): Point {
    const value = clamp(progress, 0, this.length);
    if (value === this.length) return { ...this.points.at(-1)! };
    const segment = this.cumulative.findIndex((end, index) => index > 0 && value <= end);
    const startDistance = this.cumulative[segment - 1]!;
    const segmentLength = this.cumulative[segment]! - startDistance;
    return lerpPoint(this.points[segment - 1]!, this.points[segment]!, (value - startDistance) / segmentLength);
  }

  eta(progress: number, speedPerSecond: number): number {
    if (speedPerSecond <= 0) return Number.POSITIVE_INFINITY;
    return (this.length - clamp(progress, 0, this.length)) / speedPerSecond;
  }
  knockBack(progress: number, pathDistance: number): number {
    return clamp(progress - Math.max(0, pathDistance), 0, this.length);
  }
  closestProgressTo(point: Point): number {
    let bestProgress = 0; let bestDistanceSquared = Number.POSITIVE_INFINITY;
    for (let index = 1; index < this.points.length; index += 1) {
      const start = this.points[index - 1]!; const end = this.points[index]!;
      const dx = end.x - start.x; const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
      const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
      const distanceSquared = (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2;
      const progress = this.cumulative[index - 1]! + Math.sqrt(lengthSquared) * ratio;
      if (distanceSquared < bestDistanceSquared || (distanceSquared === bestDistanceSquared && progress < bestProgress)) {
        bestDistanceSquared = distanceSquared; bestProgress = progress;
      }
    }
    return bestProgress;
  }
  firstProgressWithinCircle(center: Point, radius: number): number {
    if (radius < 0) throw new RangeError('Circle radius must be non-negative');
    for (let index = 1; index < this.points.length; index += 1) {
      const start = this.points[index - 1]!;
      const end = this.points[index]!;
      if (distance(start, center) <= radius) return this.cumulative[index - 1]!;
      const dx = end.x - start.x; const dy = end.y - start.y;
      const fx = start.x - center.x; const fy = start.y - center.y;
      const a = dx * dx + dy * dy;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - radius * radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) continue;
      const root = Math.sqrt(discriminant);
      const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
        .filter((ratio) => ratio >= 0 && ratio <= 1).sort((left, right) => left - right);
      if (candidates.length > 0) {
        return this.cumulative[index - 1]! + candidates[0]! * Math.sqrt(a);
      }
    }
    if (distance(this.points.at(-1)!, center) <= radius) return this.length;
    throw new RangeError(`Path never enters circle radius ${radius}`);
  }
}
```

```ts
// src/game/waves/WaveTypes.ts
import type { EnemyKind, EnemyVariant, PathId } from '../types/GameTypes';

export interface ScheduledSpawn {
  readonly atMs: number;
  readonly pathId: PathId;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant | 'seeded';
}
export interface WaveDefinition {
  readonly wave: number;
  readonly spawns: readonly ScheduledSpawn[];
}
export interface EnemySpawnRequest extends Omit<ScheduledSpawn, 'variant'> {
  readonly variant: EnemyVariant;
  readonly spawnSequence: number;
}
```

`PathSystem`은 순수 TypeScript이며 Phaser helper를 import하지 않는다. `eta` 단위는 초이므로 enemy snapshot을 만들 때만 `×1000`해 `etaMs`로 바꾼다.

- [ ] **Step 3: 밸런스와 5개 웨이브를 단일 데이터 파일로 옮긴다.**

```ts
// src/game/data/balance.ts
export const BALANCE = {
  shelter: { maxHp: 100, x: 270, y: 480, hitRadius: 38 },
  player: { speed: 150, height: 72 },
  snackThresholds: [8, 22, 40, 62, 88],
  pendingSkillCombatDelayMs: 5000,
  waveCountdownMs: 3000,
  attackReleaseMs: 250,
  enemies: {
    poopGuardian: { hp: 35, speed: 44, damage: 3, attackIntervalMs: 1800, range: 48, snack: 1 },
    offLeashGuardian: { hp: 65, speed: 38, damage: 6, attackIntervalMs: 1600, range: 32, snack: 2 },
    dogTrader: { hp: 600, speed: 25, damage: 14, attackIntervalMs: 2200, range: 64, snack: 12 },
    illegalBreeder: { hp: 1000, speed: 23, damage: 18, attackIntervalMs: 2000, range: 88, snack: 20 },
  },
  caps: { enemies: 60, projectiles: 80, particles: 120 },
} as const;
```

`waveDefinitions.ts`는 다음 생성 이벤트를 펼친 readonly 배열로 만든다.

```text
W1: P1/P2 교대, poop 10, 1000ms 간격
W2: P1~P4 순환, quota가 남은 동안 poop 1 → offLeash 2 순서로 시도하고 소진 종류는 건너뜀, 최종 kind 순서 P,O,O,P,O,O,P,O,O,P,O,O,P,P, 총 14, 900ms 간격
W3: P2/P4/P6 순환 offLeash 6, 1000ms 간격, 마지막 일반 적 2000ms 뒤 P3 trader 1
W4: P1~P6 순환, 1100ms마다 2명, 8묶음 poop+offLeash 후 offLeash+offLeash, 총 18
W5: P1/P2/P5/P6 순환, 1100ms마다 2명, 6묶음 poop+offLeash 후 offLeash+offLeash, 마지막 일반 적 2000ms 뒤 P3 breeder 1
```

일반 적 variant는 male/female을 번갈아 고정하고 최종 보스 variant만 `RandomSource`로 고른다. 한 이벤트의 두 적은 다른 경로를 사용한다.

```ts
// src/game/data/waveDefinitions.ts
import type { EnemyKind, EnemyVariant, PathId } from '../types/GameTypes';
import type { ScheduledSpawn, WaveDefinition } from '../waves/WaveTypes';

const variantCursor: Record<'poopGuardian' | 'offLeashGuardian', number> = {
  poopGuardian: 0, offLeashGuardian: 0,
};
const regular = (atMs: number, pathId: PathId, kind: keyof typeof variantCursor): ScheduledSpawn => {
  const variant: EnemyVariant = variantCursor[kind]++ % 2 === 0 ? 'male' : 'female';
  return { atMs, pathId, kind, variant };
};
const boss = (atMs: number, pathId: 'P3', kind: Extract<EnemyKind, 'dogTrader' | 'illegalBreeder'>): ScheduledSpawn => ({
  atMs, pathId, kind, variant: kind === 'illegalBreeder' ? 'seeded' : 'male',
});

const w1Paths = ['P1', 'P2'] as const;
const w2Paths = ['P1', 'P2', 'P3', 'P4'] as const;
const w2Kinds = [
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
  'poopGuardian', 'poopGuardian',
] as const;
const w3Paths = ['P2', 'P4', 'P6'] as const;
const w4Paths = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
const w5Paths = ['P1', 'P2', 'P5', 'P6'] as const;

const w4 = Array.from({ length: 9 }, (_, event) => {
  const kinds = event < 8
    ? (['poopGuardian', 'offLeashGuardian'] as const)
    : (['offLeashGuardian', 'offLeashGuardian'] as const);
  return kinds.map((kind, slot) => regular(event * 1100, w4Paths[(event * 2 + slot) % w4Paths.length]!, kind));
}).flat();
const w5Regular = Array.from({ length: 7 }, (_, event) => {
  const kinds = event < 6
    ? (['poopGuardian', 'offLeashGuardian'] as const)
    : (['offLeashGuardian', 'offLeashGuardian'] as const);
  return kinds.map((kind, slot) => regular(event * 1100, w5Paths[(event * 2 + slot) % w5Paths.length]!, kind));
}).flat();

export const WAVE_DEFINITIONS = [
  { wave: 1, spawns: Array.from({ length: 10 }, (_, index) => regular(index * 1000, w1Paths[index % 2]!, 'poopGuardian')) },
  { wave: 2, spawns: w2Kinds.map((kind, index) => regular(index * 900, w2Paths[index % 4]!, kind)) },
  { wave: 3, spawns: [
    ...Array.from({ length: 6 }, (_, index) => regular(index * 1000, w3Paths[index % 3]!, 'offLeashGuardian')),
    boss(7000, 'P3', 'dogTrader'),
  ] },
  { wave: 4, spawns: w4 },
  { wave: 5, spawns: [...w5Regular, boss(8600, 'P3', 'illegalBreeder')] },
] as const satisfies readonly WaveDefinition[];
```

- [ ] **Step 4: 모든 데이터 불변식을 검증하고 시작 전에 호출한다.**

```ts
// src/game/data/validateGameData.ts
import type { EnemyKind, EnemyVariant } from '../types/GameTypes';

type RawSpawn = {
  readonly atMs: number;
  readonly pathId: string;
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant | 'seeded';
};
type RawWave = { readonly wave: number; readonly spawns: readonly RawSpawn[] };
export type GameDataInput = {
  readonly paths: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  readonly waves: readonly RawWave[];
};

const REQUIRED_PATHS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
const BOSS_BY_WAVE = new Map<number, EnemyKind>([[3, 'dogTrader'], [5, 'illegalBreeder']]);
const isBoss = (kind: EnemyKind) => kind === 'dogTrader' || kind === 'illegalBreeder';

export function validateGameData({ paths, waves }: GameDataInput): readonly string[] {
  const errors: string[] = [];
  for (const pathId of REQUIRED_PATHS) {
    if (paths[pathId] === undefined) errors.push(`path ${pathId}: missing`);
  }
  for (const [pathId, points] of Object.entries(paths)) {
    if (points.length < 2) errors.push(`path ${pathId}: needs at least two waypoints`);
    points.forEach(([x, y], index) => {
      if (x < 0 || x > 540 || y < 0 || y > 960) {
        errors.push(`path ${pathId}[${index}]: waypoint (${x},${y}) is outside 540x960`);
      }
    });
  }

  waves.forEach((wave, waveIndex) => {
    const label = `wave ${wave.wave || waveIndex + 1}`;
    if (wave.spawns.length > 60) errors.push(`${label}: ${wave.spawns.length} exceeds enemy cap 60`);
    let previousAtMs = -1;
    const pathsAtTime = new Map<number, Set<string>>();
    for (const [spawnIndex, spawn] of wave.spawns.entries()) {
      if (spawn.atMs < previousAtMs) errors.push(`${label}[${spawnIndex}]: atMs is not ascending`);
      previousAtMs = spawn.atMs;
      if (paths[spawn.pathId] === undefined) errors.push(`${label}[${spawnIndex}]: unknown path ${spawn.pathId}`);
      const used = pathsAtTime.get(spawn.atMs) ?? new Set<string>();
      if (used.has(spawn.pathId)) errors.push(`${label}[${spawnIndex}]: duplicate path ${spawn.pathId} at ${spawn.atMs}ms`);
      used.add(spawn.pathId);
      pathsAtTime.set(spawn.atMs, used);

      if (isBoss(spawn.kind)) {
        if (spawn.pathId !== 'P3') errors.push(`${label}[${spawnIndex}]: boss must use P3`);
        if (BOSS_BY_WAVE.get(wave.wave) !== spawn.kind) errors.push(`${label}[${spawnIndex}]: invalid boss ${spawn.kind}`);
      }
    }
    const expectedBoss = BOSS_BY_WAVE.get(wave.wave);
    const bosses = wave.spawns.filter((spawn) => isBoss(spawn.kind));
    if (expectedBoss !== undefined && (bosses.length !== 1 || bosses.at(0)!.kind !== expectedBoss)) {
      errors.push(`${label}: expected exactly one ${expectedBoss}`);
    }
  });
  return errors;
}
```

`BootScene.create()`는 `validateGameData({ paths: PATH_DEFINITIONS, waves: WAVE_DEFINITIONS })`를 호출한다. 오류가 있으면 첫 오류를 `잘못된 게임 데이터: ...`로 표시하고 `PreloadScene`을 시작하지 않는다. 위 구현은 6개 path, 좌표 범위, 2점 이상, spawn path, 시간 오름차순, 동시 spawn 경로 중복, 적 cap, P3 및 W3/W5 boss 불변식을 한 번에 검사한다.

Run: `npm run test:unit -- tests/unit/PathSystem.test.ts tests/unit/GameDataValidation.test.ts && npm run typecheck`

Expected: 모든 테스트 통과.

- [ ] **Step 5: Task 4를 커밋한다.**

```bash
git add src/game/world/Geometry.ts src/game/world/PathSystem.ts src/game/data src/game/waves/WaveTypes.ts src/game/scenes/BootScene.ts tests/unit/PathSystem.test.ts tests/unit/GameDataValidation.test.ts
git commit -m "feat: add map paths and validated game data"
```

---

### Task 5: 후추 이동·입력·E2E 수동 시계

**Files:**
- Create: `src/game/player/PlayerTypes.ts`
- Create: `src/game/player/InputVector.ts`
- Create: `src/game/player/PlayerController.ts`
- Create: `src/game/player/PlayerView.ts`
- Create: `src/game/player/KeyboardInput.ts`
- Create: `src/game/player/VirtualJoystick.ts`
- Create: `src/game/world/MapView.ts`
- Create: `src/game/world/DebugPathOverlay.ts`
- Create: `src/game/world/AnimationFrameResolver.ts`
- Create: `src/game/debug/TestContract.ts`
- Create: `src/game/debug/TestBridge.ts`
- Create: `src/game/debug/ManualStepScheduler.ts`
- Create: `src/game/debug/ScenarioFactory.ts`
- Create: `src/game/debug/ScenarioSessionPort.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `tests/e2e/title-and-input.spec.ts`
- Create: `tests/e2e/helpers.ts`
- Test: `tests/unit/InputVector.test.ts`
- Test: `tests/unit/PlayerController.test.ts`
- Test: `tests/unit/AnimationFrameResolver.test.ts`
- Test: `tests/unit/ManualStepScheduler.test.ts`

**Interfaces:**
- Consumes: WASD/방향키, pointer drag, fixed `stepMs`, logical bounds
- Produces: 정규화된 `MovementIntent`, clamp된 `PlayerSnapshot`, 6fps walk/idle animation, E2E `empty-run` snapshot

- [ ] **Step 1: 키보드 대각선·조이스틱 dead zone·맵 경계 계약을 실패 테스트로 작성한다.**

```ts
// tests/unit/InputVector.test.ts
import { joystickVector, keyboardVector } from '../../src/game/player/InputVector';

it('키보드 대각선을 단위 벡터로 정규화한다', () => {
  const intent = keyboardVector({ left: false, right: true, up: true, down: false });
  expect(intent.x).toBeCloseTo(Math.SQRT1_2, 15);
  expect(intent.y).toBeCloseTo(-Math.SQRT1_2, 15);
  expect(intent.magnitude).toBe(1);
});

it('조이스틱 반지름 15% 이하는 0이고 나머지는 0~1로 재매핑한다', () => {
  expect(joystickVector({ x: 10, y: 0 }, 100)).toEqual({ x: 0, y: 0, magnitude: 0 });
  const half = joystickVector({ x: 57.5, y: 0 }, 100);
  expect(half.x).toBeCloseTo(0.5, 15);
  expect(half.y).toBe(0);
  expect(half.magnitude).toBeCloseTo(0.5, 15);
});

// tests/unit/PlayerController.test.ts
import { PlayerController } from '../../src/game/player/PlayerController';

it('150px/s로 이동하고 논리 맵 경계를 넘지 않는다', () => {
  const player = new PlayerController({ x: 539, y: 959 });
  player.step(1000, { x: 1, y: 1, magnitude: 1 });
  expect(player.snapshot()).toMatchObject({ x: 540, y: 960 });
});
```

Run: `npm run test:unit -- tests/unit/InputVector.test.ts tests/unit/PlayerController.test.ts`

Expected: player 모듈 부재로 실패.

- [ ] **Step 2: 순수 입력 벡터와 이동 controller를 구현한다.**

```ts
// src/game/player/InputVector.ts
export type MovementIntent = { x: number; y: number; magnitude: number };

export function keyboardVector(keys: { left: boolean; right: boolean; up: boolean; down: boolean }): MovementIntent {
  const x = Number(keys.right) - Number(keys.left);
  const y = Number(keys.down) - Number(keys.up);
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0, magnitude: 0 } : { x: x / length, y: y / length, magnitude: 1 };
}

export function joystickVector(offset: { x: number; y: number }, radius: number): MovementIntent {
  const raw = Math.min(Math.hypot(offset.x, offset.y) / radius, 1);
  if (raw <= 0.15) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = (raw - 0.15) / 0.85;
  const length = Math.hypot(offset.x, offset.y);
  return { x: (offset.x / length) * magnitude, y: (offset.y / length) * magnitude, magnitude };
}
```

```ts
// src/game/player/PlayerTypes.ts
export interface PlayerSnapshot { readonly x: number; readonly y: number; }
```

```ts
// src/game/player/PlayerController.ts
import type { MovementIntent } from './InputVector';
import type { PlayerSnapshot } from './PlayerTypes';

export class PlayerController {
  constructor(private position: { x: number; y: number }) {}
  step(stepMs: number, intent: MovementIntent): void {
    const distance = 150 * (stepMs / 1000);
    this.position.x = PhaserMathClamp(this.position.x + intent.x * distance, 0, 540);
    this.position.y = PhaserMathClamp(this.position.y + intent.y * distance, 0, 960);
  }
  snapshot(): PlayerSnapshot { return { ...this.position }; }
}
const PhaserMathClamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
```

순수 controller에서 Phaser helper를 import하지 않는다.

```ts
// tests/unit/AnimationFrameResolver.test.ts
import { loopFrame, oneShotFrame } from '../../src/game/world/AnimationFrameResolver';

it('walk 6fps loop와 attack 8fps one-shot frame을 wall clock 없이 계산한다', () => {
  expect([0, 167, 334, 501].map((ms) => loopFrame(ms, 6, 0, 4))).toEqual([0, 1, 2, 3]);
  expect([0, 125, 250, 375, 900].map((ms) => oneShotFrame(ms, 8, 4, 4))).toEqual([4, 5, 6, 7, 7]);
});

it('60Hz 15 tick의 부동소수 누적도 정확히 release frame 6이다', () => {
  const elapsed = Array.from({ length: 15 }, () => 1000 / 60).reduce((total, value) => total + value, 0);
  expect(oneShotFrame(elapsed, 8, 4, 4)).toBe(6);
});
```

```ts
// src/game/world/AnimationFrameResolver.ts
import { TIME_EPSILON_MS } from '../constants';

export const loopFrame = (elapsedMs: number, fps: number, start: number, count: number) =>
  start + Math.floor((elapsedMs + TIME_EPSILON_MS) / (1000 / fps)) % count;
export const oneShotFrame = (elapsedMs: number, fps: number, start: number, count: number) =>
  start + Math.min(count - 1, Math.floor((elapsedMs + TIME_EPSILON_MS) / (1000 / fps)));
export const attackFrameAt = (elapsedMs: number) => oneShotFrame(elapsedMs, 8, 4, 4);
export const idleBreathScale = (elapsedMs: number) => 1 + Math.sin(elapsedMs / 700) * 0.008;
```

`PlayerView`는 source frame `192×256` spritesheet를 표시 높이 72로 scale한다. Phaser AnimationState와 tween wall clock을 쓰지 않고 snapshot의 `worldAnimationMs`, 이동 여부, bark elapsed로 pure resolver를 호출해 frame과 idle scale을 직접 설정한다. `worldAnimationMs`는 playing fixed step에서만 증가하며 depth는 `feetY`다.

- [ ] **Step 3: 키보드와 44px 이상 터치 조이스틱 어댑터를 구현한다.**

```ts
// src/game/player/KeyboardInput.ts
import Phaser from 'phaser';
import { keyboardVector, type MovementIntent } from './InputVector';

type WasdKeys = Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

export class KeyboardInput {
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd: WasdKeys;

  constructor(scene: Phaser.Scene) {
    if (scene.input.keyboard === null) throw new Error('Keyboard input is unavailable');
    this.keyboard = scene.input.keyboard;
    this.cursors = this.keyboard.createCursorKeys();
    this.wasd = this.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
    }) as WasdKeys;
  }

  read(): MovementIntent {
    return keyboardVector({
      left: this.cursors.left.isDown || this.wasd.a.isDown,
      right: this.cursors.right.isDown || this.wasd.d.isDown,
      up: this.cursors.up.isDown || this.wasd.w.isDown,
      down: this.cursors.down.isDown || this.wasd.s.isDown,
    });
  }

  destroy(): void {
    [...Object.values(this.wasd), ...Object.values(this.cursors)].forEach((key) => {
      if (key !== undefined) this.keyboard.removeKey(key.keyCode, false);
    });
  }
}
```

```ts
// src/game/player/VirtualJoystick.ts
import Phaser from 'phaser';
import { joystickVector, type MovementIntent } from './InputVector';

export class VirtualJoystick {
  private readonly center = { x: 78, y: 862 };
  private readonly radius = 48;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private activePointerId: number | null = null;
  private offset = { x: 0, y: 0 };

  constructor(private readonly scene: Phaser.Scene) {
    this.base = scene.add.circle(this.center.x, this.center.y, this.radius, 0x1f2937, 0.28)
      .setScrollFactor(0).setDepth(2000).setInteractive();
    this.knob = scene.add.circle(this.center.x, this.center.y, 22, 0xffffff, 0.52)
      .setScrollFactor(0).setDepth(2001);
    this.base.on('pointerdown', this.onPointerDown);
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerup', this.onPointerUp);
    scene.input.on('gameout', this.onGameOut);
  }

  read(): MovementIntent { return joystickVector(this.offset, this.radius); }

  relayout(): void {
    this.base.setPosition(this.center.x, this.center.y);
    this.updateOffset(this.offset.x, this.offset.y);
  }

  destroy(): void {
    this.base.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('gameout', this.onGameOut);
    this.base.destroy();
    this.knob.destroy();
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.activePointerId !== null) return;
    this.activePointerId = pointer.id;
    this.updateFromPointer(pointer);
  };
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.activePointerId) this.updateFromPointer(pointer);
  };
  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.activePointerId) this.release();
  };
  private readonly onGameOut = (): void => { this.release(); };

  private updateFromPointer(pointer: Phaser.Input.Pointer): void {
    this.updateOffset(pointer.x - this.center.x, pointer.y - this.center.y);
  }
  private updateOffset(x: number, y: number): void {
    const length = Math.hypot(x, y);
    const scale = length > this.radius ? this.radius / length : 1;
    this.offset = { x: x * scale, y: y * scale };
    this.knob.setPosition(this.center.x + this.offset.x, this.center.y + this.offset.y);
  }
  private release(): void {
    this.activePointerId = null;
    this.updateOffset(0, 0);
  }
}
```

`VirtualJoystick`은 활성 pointer 하나만 소유하며 release/gameout 때 중심으로 돌아간다. resize 뒤에도 logical 좌표 `(78,862)`를 다시 적용한다. 키보드 입력이 0이 아니면 키보드가 우선한다.

```ts
// GameScene update 조립의 핵심
const deltaSteps = this.fixedClock.consume(delta);
for (const stepMs of deltaSteps) {
  if (!this.stateMachine.canStepWorld()) continue;
  const keyboard = this.keyboardInput.read();
  const intent = keyboard.magnitude > 0 ? keyboard : this.virtualJoystick.read();
  this.playerController.step(stepMs, intent);
}
this.playerView.render(this.playerController.snapshot());
```

- [ ] **Step 4: production에서 닫힌 E2E 수동 시계 계약을 구현한다.**

```ts
// src/game/debug/TestContract.ts
import type { GameMode } from '../core/GameMode';

export type TestScenarioId = 'empty-run';
export interface GameDebugSnapshot {
  mode: GameMode;
  player: { x: number; y: number };
  simulationMs: number;
}
export type GameDebugEvent = {
  sequence: number;
  atMs: number;
  type: 'modeChanged' | 'playerMoved';
};
export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
}
declare global {
  interface Window { __HUCHU_TEST__?: HuchuTestBridge; }
}
```

```ts
// src/game/debug/ScenarioSessionPort.ts (Task 5 초기 골격, 이후 Task가 확장)
import type { EnemyKind, EnemyState, EnemyVariant, PathId } from '../types/GameTypes';

export interface ScenarioEnemySeed {
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
  readonly pathId: PathId;
  readonly placement: { readonly kind: 'attackBoundary' } | { readonly kind: 'worldPoint'; readonly x: number; readonly y: number };
  readonly currentHp?: number;
  readonly maxHp?: number;
  readonly state?: EnemyState;
  readonly stunnedMs?: number;
}
```

```ts
// src/game/debug/ScenarioFactory.ts (Task 5 초기 골격)
export interface PlayerOnlyScenarioRuntime {
  resetManualScheduler(): void;
  resetEventLog(): void;
  resetPlayer(x: number, y: number): void;
}
export function loadEmptyRun(runtime: PlayerOnlyScenarioRuntime): void {
  runtime.resetManualScheduler();
  runtime.resetEventLog();
  runtime.resetPlayer(270, 650);
}
```

Task 6부터 이 factory/port를 새로 만들지 않고 아래 순서로 확장한다: Task 6 `wave-schedule`, Task 7 `health-bar-colors`, Task 8 `bark-targeting`, Task 9 `poop-attack|boss`, Task 10 `skill-selection`, Task 11 `all-skills`, Task 12 `final-enemy|shelter-defeat`와 완성된 session bootstrap, Task 14 `stress`와 최종 reset/view-pool 계약. 각 Task 종료 시 그 시점 union의 모든 id를 실제 factory가 만들 수 있어야 한다.

```ts
// tests/e2e/helpers.ts
import type { Page } from '@playwright/test';
import type { GameDebugSnapshot, TestScenarioId } from '../../src/game/debug/TestContract';

export async function openScenario(page: Page, scenario: TestScenarioId): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&clock=manual');
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await page.waitForFunction(() => window.__HUCHU_TEST__ !== undefined);
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  await loadScenario(page, scenario);
}
export const loadScenario = (page: Page, scenario: TestScenarioId) =>
  page.evaluate((id) => window.__HUCHU_TEST__!.loadScenario(id), scenario);
export const advance = (page: Page, ms: number) => page.evaluate((value) => window.__HUCHU_TEST__!.advance(value), ms);
export const snapshot = (page: Page) => page.evaluate(() => window.__HUCHU_TEST__!.snapshot()) as Promise<GameDebugSnapshot>;
export const events = (page: Page, sequence = 0) => page.evaluate((value) => window.__HUCHU_TEST__!.eventsSince(value), sequence);
```

`installTestBridge`는 `import.meta.env.MODE === 'e2e'`, `e2e=1`, `clock=manual` 세 조건을 모두 검사하고 `seed` query를 정수로 파싱한다. Task 5에는 아직 `GameSession`이 없으므로 bridge가 호출하는 Scene port를 `advancePlayerOnlyStep(FIXED_STEP_MS)`로 한정한다. 이 port는 현재 keyboard/joystick intent로 `PlayerController.step`과 Task 5 전용 정수 `manualTicks += 1`만 수행하며 snapshot은 `simulationMsFromTicks(manualTicks)`를 반환한다. bridge는 `requestedMs += ms`, `targetTicks = floor((requestedMs * SIMULATION_HZ + TIME_EPSILON_MS) / 1000)`를 계산하고 `emittedTicks`가 target에 닿을 때까지 step한다. 따라서 `advance(250|1200|3000|5000)`은 각각 정확히 `15|72|180|300` step이며 부동소수 잔여가 없다. `advance`는 step 뒤 다음 render flush까지 기다리는 일반 assertion API다. `advanceWithoutFlush`는 같은 scheduler와 Scene port를 동기 호출하되 render를 기다리지 않는 `@perf` 전용 API이며, stress scenario가 아니면 throw한다. 조건이 하나라도 없으면 `window.__HUCHU_TEST__`를 만들지 않는다.

```ts
// src/game/debug/ManualStepScheduler.ts
import { SIMULATION_HZ, TIME_EPSILON_MS } from '../constants';

export class ManualStepScheduler {
  private requestedMs = 0;
  private emittedTicks = 0;
  take(durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new RangeError('advance duration must be finite and non-negative');
    this.requestedMs += durationMs;
    const targetTicks = Math.floor(this.requestedMs * SIMULATION_HZ / 1000 + TIME_EPSILON_MS);
    const count = targetTicks - this.emittedTicks;
    this.emittedTicks = targetTicks;
    return count;
  }
  reset(): void { this.requestedMs = 0; this.emittedTicks = 0; }
}

// tests/unit/ManualStepScheduler.test.ts
import { ManualStepScheduler } from '../../src/game/debug/ManualStepScheduler';

it('긴 호출과 잘게 나눈 호출이 같은 정확한 tick 수를 만든다', () => {
  expect(new ManualStepScheduler().take(5000)).toBe(300);
  const split = new ManualStepScheduler();
  expect(split.take(1)).toBe(0);
  expect(split.take(249)).toBe(15);
  expect(split.take(950)).toBe(57);
  expect(split.take(1800)).toBe(108);
  expect(split.take(2000)).toBe(120);
});
```

`TestBridge.advance`는 `for (let tick = scheduler.take(ms); tick > 0; tick -= 1) scene.advancePlayerOnlyStep(FIXED_STEP_MS)`를 실행하고 마지막에 render flush 하나를 기다린다.

```ts
// GameScene.create()의 e2e-only 설치
if (import.meta.env.MODE === 'e2e') {
  void import('../debug/TestBridge').then(({ installTestBridge }) => installTestBridge(this));
}
```

production 코드에는 TestBridge 정적 import를 두지 않는다. Vite production build에서 위 조건이 false로 접혀 debug chunk와 scenario 문자열이 생성되지 않아야 한다.

`GameScene.update`는 `clock=manual`일 때 `FixedStepClock.consume(delta)`와 `advancePlayerOnlyStep`을 자동 호출하지 않고 현재 player snapshot만 렌더한다. 실시간 mode에서는 반대로 TestBridge가 step하지 않고 update의 fixed clock이 player port를 호출한다. `tests/e2e/title-and-input.spec.ts`는 1초 real wall time을 기다리지 않은 상태에서 snapshot `simulationMs===0`인지 확인한 뒤 `advance(1000)` 후 정확히 `1000`인지 확인해 이중 진행을 막는다.

- [ ] **Step 5: 브라우저에서 키보드와 터치 이동을 재현한다.**

```ts
// tests/e2e/title-and-input.spec.ts 추가
import { advance, openScenario, snapshot } from './helpers';

test('키보드로 후추가 150px/s 이동한다', async ({ page }) => {
  await page.goto('/?e2e=1&seed=424242&clock=manual');
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await page.waitForFunction(() => window.__HUCHU_TEST__ !== undefined);
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  const before = await page.evaluate(() => window.__HUCHU_TEST__!.snapshot().player);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.__HUCHU_TEST__!.advance(1000));
  await page.keyboard.up('ArrowRight');
  const after = await page.evaluate(() => window.__HUCHU_TEST__!.snapshot().player);
  expect(after.x - before.x).toBeCloseTo(150, 0);
});

test('mobile touch pointer drag가 조이스틱 최대 속도로 이동한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await openScenario(page, 'empty-run');
  const before = await snapshot(page);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const scale = box.width / 540;
  const base = { x: box.x + 78 * scale, y: box.y + 862 * scale };
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: base.x, clientY: base.y, bubbles: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: base.x + 48 * scale, clientY: base.y, bubbles: true });
  await advance(page, 1000);
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: base.x + 48 * scale, clientY: base.y, bubbles: true });
  expect((await snapshot(page)).player.x - before.player.x).toBeGreaterThanOrEqual(145);
  expect((await snapshot(page)).player.x - before.player.x).toBeLessThanOrEqual(151);
});
```

Run: `npm run test:unit -- tests/unit/InputVector.test.ts tests/unit/PlayerController.test.ts tests/unit/AnimationFrameResolver.test.ts && npm run test:e2e -- tests/e2e/title-and-input.spec.ts`

Expected: 단위·키보드·터치 케이스 통과. 일반 `/`에서는 `window.__HUCHU_TEST__`가 `undefined`.

- [ ] **Step 6: Task 5를 커밋한다.**

```bash
git add src/game/player src/game/world/MapView.ts src/game/world/DebugPathOverlay.ts src/game/world/AnimationFrameResolver.ts src/game/debug src/game/scenes/GameScene.ts tests
git commit -m "feat: add Huchu movement controls"
```

---

### Task 6: 결정적 웨이브 스케줄과 GameSession

**Files:**
- Create: `src/game/waves/WaveSystem.ts`
- Create: `src/game/session/GameSession.ts`
- Create: `src/game/session/RunSnapshot.ts`
- Modify: `src/game/events/GameEvents.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `src/game/debug/TestBridge.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Test: `tests/unit/WaveSystem.test.ts`
- Test: `tests/unit/GameSession.test.ts`

**Interfaces:**
- Consumes: 검증된 `WAVE_DEFINITIONS`, injected RNG, `stepMs`, 현재 활성 적 수
- Produces: 순번·kind·variant·path가 고정된 `enemySpawnRequested`, wave countdown/clear 상태, `RunSnapshot`

- [ ] **Step 1: 정확한 웨이브 수·보스 시점·동시 cap 테스트를 작성한다.**

```ts
// tests/unit/WaveSystem.test.ts
import { SeededRng } from '../../src/game/core/SeededRng';
import { WAVE_DEFINITIONS } from '../../src/game/data/waveDefinitions';
import { WaveSystem } from '../../src/game/waves/WaveSystem';

it.each([
  [1, 10], [2, 14], [3, 7], [4, 18], [5, 15],
])('wave %i는 정확히 %i명을 예약한다', (wave, expected) => {
  expect(WAVE_DEFINITIONS.at(wave - 1)!.spawns).toHaveLength(expected);
});

it('wave 3 보스는 마지막 일반 적 2초 뒤 P3에서 나온다', () => {
  const wave = WAVE_DEFINITIONS.at(2)!;
  const boss = wave.spawns.at(-1)!;
  const lastRegular = wave.spawns.at(-2)!;
  expect(boss).toMatchObject({ kind: 'dogTrader', pathId: 'P3' });
  expect(boss.atMs - lastRegular.atMs).toBe(2000);
});

it('W1/W2의 exact path·kind schedule과 regular variant 교대를 지킨다', () => {
  expect(WAVE_DEFINITIONS.at(0)!.spawns.map(({ pathId, kind }) => [pathId, kind])).toEqual(
    Array.from({ length: 10 }, (_, index) => [index % 2 === 0 ? 'P1' : 'P2', 'poopGuardian']),
  );
  expect(WAVE_DEFINITIONS.at(1)!.spawns.map(({ kind }) => kind)).toEqual([
    'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
    'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
    'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
    'poopGuardian', 'offLeashGuardian', 'offLeashGuardian',
    'poopGuardian', 'poopGuardian',
  ]);
  for (const kind of ['poopGuardian', 'offLeashGuardian'] as const) {
    const variants = WAVE_DEFINITIONS.flatMap((wave) => wave.spawns).filter((spawn) => spawn.kind === kind).map((spawn) => spawn.variant);
    expect(variants.every((variant, index) => variant === (index % 2 === 0 ? 'male' : 'female'))).toBe(true);
  }
});

it.each([4, 5])('W%i의 동시 spawn은 2명이며 같은 path를 쓰지 않는다', (waveNumber) => {
  const regular = WAVE_DEFINITIONS.at(waveNumber - 1)!.spawns.filter((spawn) => !['dogTrader', 'illegalBreeder'].includes(spawn.kind));
  for (const atMs of new Set(regular.map((spawn) => spawn.atMs))) {
    const spawns = regular.filter((spawn) => spawn.atMs === atMs);
    expect(spawns).toHaveLength(2);
    expect(new Set(spawns.map((spawn) => spawn.pathId)).size).toBe(2);
  }
});

it('W5 boss variant는 injected RNG 하나로 고르고 P3에 둔다', () => {
  const male = new WaveSystem(WAVE_DEFINITIONS, { next: () => 0.1 }).previewBoss(5);
  const female = new WaveSystem(WAVE_DEFINITIONS, { next: () => 0.9 }).previewBoss(5);
  expect(male).toMatchObject({ kind: 'illegalBreeder', variant: 'male', pathId: 'P3' });
  expect(female).toMatchObject({ kind: 'illegalBreeder', variant: 'female', pathId: 'P3' });
});

it('활성 적 cap이 차면 spawn을 보류하고 유실하지 않는다', () => {
  const system = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(1));
  system.start(1);
  expect(system.step(10_000, 60)).toEqual([]);
  expect(system.step(0, 59)).toHaveLength(1);
});
```

Run: `npm run test:unit -- tests/unit/WaveSystem.test.ts`

Expected: `WaveSystem` 부재로 실패.

- [ ] **Step 2: elapsed simulation time만 사용하는 WaveSystem을 구현한다.**

```ts
// src/game/waves/WaveSystem.ts
import { reachedDuration } from '../constants';
import type { RandomSource } from '../core/SeededRng';
import type { EnemySpawnRequest, ScheduledSpawn, WaveDefinition } from './WaveTypes';

export class WaveSystem {
  private elapsedMs = 0;
  private cursor = 0;
  private currentWaveIndex = 0;
  private sequence = 0;
  private started = false;
  private finalBossVariant: 'male' | 'female' = 'male';

  constructor(
    private readonly definitions: readonly WaveDefinition[],
    private readonly rng: RandomSource,
    private readonly enemyCap = 60,
  ) {}

  start(waveNumber: number): void {
    const index = waveNumber - 1;
    if (this.definitions.at(index) === undefined) throw new RangeError(`Unknown wave ${waveNumber}`);
    this.currentWaveIndex = index;
    this.elapsedMs = 0;
    this.cursor = 0;
    this.started = true;
    if (waveNumber === 5) this.finalBossVariant = this.rng.next() < 0.5 ? 'male' : 'female';
  }

  previewBoss(waveNumber: number): EnemySpawnRequest {
    const definition = this.definitions.at(waveNumber - 1);
    const scheduled = definition?.spawns.find((spawn) => spawn.kind === 'dogTrader' || spawn.kind === 'illegalBreeder');
    if (scheduled === undefined) throw new RangeError(`Wave ${waveNumber} has no boss`);
    const variant = scheduled.kind === 'illegalBreeder' ? (this.rng.next() < 0.5 ? 'male' : 'female') : 'male';
    return { ...scheduled, variant, spawnSequence: 0 };
  }

  step(stepMs: number, activeEnemies: number): readonly EnemySpawnRequest[] {
    if (!this.started) throw new Error('WaveSystem.start must be called first');
    this.elapsedMs += stepMs;
    const requests: EnemySpawnRequest[] = [];
    const spawns = this.definitions.at(this.currentWaveIndex)!.spawns;
    while (this.cursor < spawns.length) {
      const scheduled: ScheduledSpawn = spawns.at(this.cursor)!;
      if (!reachedDuration(this.elapsedMs, scheduled.atMs) || activeEnemies + requests.length >= this.enemyCap) break;
      const variant = scheduled.variant === 'seeded' ? this.finalBossVariant : scheduled.variant;
      requests.push({ ...scheduled, variant, spawnSequence: this.sequence++ });
      this.cursor += 1;
    }
    return requests;
  }

  get current(): number { return this.currentWaveIndex + 1; }
  get pendingCount(): number { return this.definitions.at(this.currentWaveIndex)!.spawns.length - this.cursor; }
  get elapsed(): number { return this.elapsedMs; }
}
```

한 spawn event의 두 요청은 동일 `atMs`를 갖는다. W5 breeder variant는 wave 시작 시 RNG를 한 번만 소비해 고정하고, pause·resize·render frame 수는 RNG 수열에 영향을 주지 않는다.

- [ ] **Step 3: GameSession이 유일한 순수 시뮬레이션 진입점인지 테스트한다.**

```ts
// tests/unit/GameSession.test.ts
import { GameSession } from '../../src/game/session/GameSession';

it('정지 중에는 simulationMs와 wave elapsed가 증가하지 않는다', () => {
  const run = GameSession.create({ seed: 424242 });
  run.forceModeForTest('skillSelection');
  run.step(1000 / 60, { x: 270, y: 650 });
  expect(run.snapshot()).toMatchObject({ simulationMs: 0, mode: 'skillSelection' });
});
```

`GameSession.create({seed})`는 RNG, state machine, wave system, player-independent rules를 조립한다. `step`은 `canStepWorld()`가 true일 때만 simulation time과 systems를 진행하고 그 스텝에서 발생한 typed events를 readonly 배열로 반환한다. `RunSnapshot`은 `mode`, `simulationMs`, `wave`, `pendingSpawns`, `activeEnemyCount`, `shelterHp`, `snacks`, `skills`를 포함한다.

```ts
// src/game/session/RunSnapshot.ts (Task 6 상태)
import type { GameMode } from '../core/GameMode';
import type { SkillId, SkillLevel } from '../types/GameTypes';
export interface RunSnapshot {
  readonly mode: GameMode;
  readonly simulationMs: number;
  readonly wave: number;
  readonly pendingSpawns: number;
  readonly activeEnemyCount: number;
  readonly activeProjectileCount: number;
  readonly shelterHp: number;
  readonly snacks: number;
  readonly skills: Readonly<Record<SkillId, SkillLevel>>;
}

// src/game/events/GameEvents.ts (Task 6 상태)
import type { GameMode } from '../core/GameMode';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
export type GameEvent =
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'runEnded'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
  | { readonly type: 'waveCountdownChanged'; readonly remainingMs: number };
```

```ts
// src/game/session/GameSession.ts (Task 6 완성본)
import { FIXED_STEP_MS, TIME_EPSILON_MS, simulationMsFromTicks } from '../constants';
import { GameStateMachine } from '../core/GameStateMachine';
import type { GameMode } from '../core/GameMode';
import { SeededRng } from '../core/SeededRng';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import { WaveSystem } from '../waves/WaveSystem';
import type { RunSnapshot } from './RunSnapshot';

export class GameSession {
  private readonly stateMachine = new GameStateMachine('playing');
  private waves: WaveSystem;
  private simulationTicks = 0;
  private readonly spawnMarkers: EnemySpawnRequest[] = [];

  private constructor(seed: number) {
    this.waves = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(seed));
    this.waves.start(1);
  }
  static create(input: { readonly seed: number }): GameSession { return new GameSession(input.seed); }

  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[] {
    void player;
    if (!this.stateMachine.canStepWorld()) return [];
    if (Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) throw new RangeError('GameSession requires one fixed step');
    this.simulationTicks += 1;
    const requests = this.waves.step(FIXED_STEP_MS, this.spawnMarkers.length);
    this.spawnMarkers.push(...requests);
    return requests.map((request) => ({ type: 'enemySpawnRequested' as const, request }));
  }
  snapshot(): RunSnapshot {
    return {
      mode: this.stateMachine.current(), simulationMs: simulationMsFromTicks(this.simulationTicks),
      wave: this.waves.current, pendingSpawns: this.waves.pendingCount,
      activeEnemyCount: this.spawnMarkers.length, activeProjectileCount: 0,
      shelterHp: 100, snacks: 0,
      skills: { bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
    };
  }
  forceModeForTest(mode: GameMode): void { this.stateMachine.transition(mode); }
  modeStateForControllers(): GameStateMachine { return this.stateMachine; }
  reset(seed: number): void {
    this.stateMachine.reset('playing');
    this.waves = new WaveSystem(WAVE_DEFINITIONS, new SeededRng(seed));
    this.waves.start(1);
    this.spawnMarkers.length = 0;
    this.simulationTicks = 0;
  }
}
```

`GameStateMachine` 인스턴스의 canonical owner는 항상 `GameSession`이다. `WorldPauseController`만 `session.modeStateForControllers()`로 받은 같은 객체를 사용하고, `VisibilityController`와 `WebGlRecoveryController`에는 `GameSession` 자체를 `VisibilitySessionPort`로 전달한다. controller가 별도 state를 만들면 안 된다. `reset()`은 state 객체를 교체하지 않고 내부 mode만 reset하므로 이미 연결된 controller도 새 run snapshot과 계속 같은 mode를 본다.

Task 6에서 `GameScene.advancePlayerOnlyStep`을 `advanceSimulationStep`으로 교체한다. 이 port는 player를 먼저 갱신한 뒤 그 snapshot을 `GameSession.step`에 전달하고, bridge의 `simulationMs`도 Task 5 로컬 counter가 아니라 `GameSession.snapshot()`에서 읽는다. 실시간 update와 manual bridge 모두 이 단일 port만 호출하며 둘 중 하나만 활성화된다.

- [ ] **Step 4: `GameScene`이 GameSession event만 렌더 객체에 반영하도록 바꾼다.**

`enemySpawnRequested` event는 다음 Task 전까지 debug marker만 만들고, `waveCountdownChanged`는 중앙 `3,2,1` text를 갱신한다. 테스트 브리지 시나리오에 `'wave-schedule'`을 추가해 `advance(10_000)` 후 event sequence와 요청 수를 조회할 수 있게 한다.

Run: `npm run test:unit -- tests/unit/WaveSystem.test.ts tests/unit/GameSession.test.ts && npm run typecheck`

Expected: 모든 wave/session 테스트 통과.

- [ ] **Step 5: Task 6을 커밋한다.**

```bash
git add src/game/waves src/game/session src/game/events/GameEvents.ts src/game/scenes/GameScene.ts src/game/debug tests/unit/WaveSystem.test.ts tests/unit/GameSession.test.ts
git commit -m "feat: add deterministic wave scheduling"
```

---

### Task 7: 적 생명주기·경로 이동·항상 보이는 HP 바

**Files:**
- Create: `src/game/enemies/EnemyTypes.ts`
- Create: `src/game/enemies/EnemySystem.ts`
- Create: `src/game/enemies/EnemyActor.ts`
- Create: `src/game/enemies/EnemyActorPool.ts`
- Create: `src/game/enemies/EnemyHpBar.ts`
- Create: `src/game/pooling/ObjectPool.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/session/RunSnapshot.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Test: `tests/unit/EnemySystem.test.ts`
- Test: `tests/unit/PresentationRules.test.ts`
- Test: `tests/unit/ObjectPool.test.ts`

**Interfaces:**
- Consumes: `EnemySpawnRequest`, PathSystem, fixed step, damage command
- Produces: `EnemySnapshot`, path progress, `enemyDied` 한 번, 30×4 HP bar, 재사용 actor

- [ ] **Step 1: 이동·사망 1회·HP 색상·고정 풀 계약을 실패 테스트로 작성한다.**

```ts
// tests/unit/EnemySystem.test.ts
import { EnemySystem } from '../../src/game/enemies/EnemySystem';

it('속도만큼 경로 진행도를 늘린다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  system.step(1000);
  expect(system.snapshots().at(0)!.pathProgress).toBeCloseTo(44, 5);
});

it('HP 0 이하에서 사망·간식을 정확히 한 번 발생시킨다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  expect(system.damage(0, 100).map((e) => e.type)).toEqual(['enemyDied', 'snackEarned']);
  expect(system.damage(0, 100)).toEqual([]);
});

it('3000ms 기절은 60Hz 정확히 180 tick 뒤 풀린다', () => {
  const system = EnemySystem.withSingleEnemy({ kind: 'poopGuardian', pathId: 'P1' });
  system.stun(0, 3000);
  for (let tick = 0; tick < 179; tick += 1) system.step(1000 / 60);
  expect(system.snapshots().at(0)!.state).toBe('stunned');
  system.step(1000 / 60);
  expect(system.snapshots().at(0)!.state).toBe('moving');
});

// tests/unit/PresentationRules.test.ts
import { enemyHpColor } from '../../src/game/enemies/EnemyHpBar';

it.each([[0.51, 0x39a852], [0.5, 0xf2ca45], [0.2, 0xf2ca45], [0.19, 0xd94b43]])(
  'HP ratio %f의 색은 %i다', (ratio, color) => expect(enemyHpColor(ratio)).toBe(color),
);

// tests/unit/ObjectPool.test.ts
import { ObjectPool } from '../../src/game/pooling/ObjectPool';

it('cap 이후 새 객체를 생성하지 않는다', () => {
  const pool = new ObjectPool(2, () => ({ id: Symbol() }));
  expect([pool.acquire(), pool.acquire(), pool.acquire()].filter(Boolean)).toHaveLength(2);
  expect(pool.createdCount).toBe(2);
});
```

Run: `npm run test:unit -- tests/unit/EnemySystem.test.ts tests/unit/PresentationRules.test.ts tests/unit/ObjectPool.test.ts`

Expected: enemy/pool 모듈 부재로 실패.

- [ ] **Step 2: feet 기반 순수 적 상태와 60개 고정 pool을 구현한다.**

```ts
// src/game/enemies/EnemyTypes.ts
import type { EnemyKind, EnemyState, EnemyVariant, PathId } from '../types/GameTypes';

export interface EnemySnapshot {
  id: number;
  kind: EnemyKind;
  variant: EnemyVariant;
  state: EnemyState;
  pathId: PathId;
  pathProgress: number;
  position: { x: number; y: number };
  etaMs: number;
  currentHp: number;
  maxHp: number;
  spawnSequence: number;
  isBoss: boolean;
  stunnedMs: number;
  animationElapsedMs: number;
}
```

```ts
// src/game/pooling/ObjectPool.ts
let nextPoolInstanceId = 1;
export interface PoolSnapshot {
  readonly instanceId: number;
  readonly created: number;
  readonly active: number;
  readonly available: number;
}
export class ObjectPool<T> {
  private readonly availableItems: T[];
  private readonly activeItems = new Set<T>();
  private readonly instanceId = nextPoolInstanceId++;
  constructor(readonly capacity: number, factory: () => T) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('Pool capacity must be positive');
    this.availableItems = Array.from({ length: capacity }, factory);
  }
  acquire(): T | undefined {
    const item = this.availableItems.pop();
    if (item !== undefined) this.activeItems.add(item);
    return item;
  }
  release(item: T): boolean {
    if (!this.activeItems.delete(item)) return false;
    this.availableItems.push(item);
    return true;
  }
  releaseAll(reset?: (item: T) => void): void {
    for (const item of [...this.activeItems]) { reset?.(item); this.release(item); }
  }
  get createdCount(): number { return this.capacity; }
  snapshot(): PoolSnapshot {
    return {
      instanceId: this.instanceId,
      created: this.capacity,
      active: this.activeItems.size,
      available: this.availableItems.length,
    };
  }
}
```

```ts
// src/game/enemies/EnemySystem.ts
import { subtractDuration } from '../constants';
import { BALANCE } from '../data/balance';
import { PATH_DEFINITIONS } from '../data/pathDefinitions';
import type { ScenarioEnemySeed } from '../debug/ScenarioSessionPort';
import type { EnemyKind, EnemyState, PathId } from '../types/GameTypes';
import { PathSystem } from '../world/PathSystem';
import type { EnemySpawnRequest } from '../waves/WaveTypes';
import type { EnemySnapshot } from './EnemyTypes';

export type EnemyLifecycleEvent =
  | { readonly type: 'enemyDied'; readonly enemyId: number }
  | { readonly type: 'snackEarned'; readonly enemyId: number; readonly amount: number };
type MutableEnemy = Omit<EnemySnapshot, 'position' | 'etaMs'> & {
  speed: number; snack: number; attackRange: number; attackProgress: number; path: PathSystem;
};

export class EnemySystem {
  private readonly enemies = new Map<number, MutableEnemy>();
  private nextId = 0;
  constructor(private readonly paths: Readonly<Record<PathId, PathSystem>>) {}

  static createDefault(): EnemySystem {
    return new EnemySystem(Object.fromEntries(
      Object.entries(PATH_DEFINITIONS).map(([id, points]) => [id, new PathSystem(points)]),
    ) as Record<PathId, PathSystem>);
  }
  static withSingleEnemy(input: { kind: EnemyKind; pathId: PathId }): EnemySystem {
    const system = EnemySystem.createDefault();
    system.spawn({ atMs: 0, kind: input.kind, pathId: input.pathId, variant: 'male', spawnSequence: 0 });
    return system;
  }

  spawn(request: EnemySpawnRequest): number {
    if (this.enemies.size >= BALANCE.caps.enemies) throw new Error('Enemy cap reached');
    const stats = BALANCE.enemies[request.kind];
    const id = this.nextId++;
    const path = this.paths[request.pathId];
    const attackProgress = path.firstProgressWithinCircle(
      { x: BALANCE.shelter.x, y: BALANCE.shelter.y },
      BALANCE.shelter.hitRadius + stats.range,
    );
    this.enemies.set(id, {
      id, kind: request.kind, variant: request.variant, state: 'moving', pathId: request.pathId,
      pathProgress: 0, currentHp: stats.hp, maxHp: stats.hp, spawnSequence: request.spawnSequence,
      isBoss: request.kind === 'dogTrader' || request.kind === 'illegalBreeder', stunnedMs: 0,
      animationElapsedMs: 0, speed: stats.speed, snack: stats.snack, attackRange: stats.range,
      path, attackProgress,
    });
    return id;
  }

  spawnForScenario(seed: ScenarioEnemySeed): { readonly enemyId: number; readonly request: EnemySpawnRequest } {
    const request: EnemySpawnRequest = {
      atMs: 0, kind: seed.kind, variant: seed.variant, pathId: seed.pathId, spawnSequence: this.nextId,
    };
    const enemyId = this.spawn(request);
    const enemy = this.enemies.get(enemyId)!;
    enemy.pathProgress = seed.placement.kind === 'attackBoundary'
      ? enemy.attackProgress
      : enemy.path.closestProgressTo({ x: seed.placement.x, y: seed.placement.y });
    if (seed.maxHp !== undefined) enemy.maxHp = seed.maxHp;
    if (seed.currentHp !== undefined) enemy.currentHp = seed.currentHp;
    if (enemy.currentHp <= 0 || enemy.currentHp > enemy.maxHp) throw new RangeError('Invalid scenario enemy HP');
    enemy.state = seed.state ?? 'moving';
    enemy.stunnedMs = seed.stunnedMs ?? 0;
    enemy.animationElapsedMs = 0;
    return { enemyId, request };
  }

  removeWithoutReward(enemyId: number): void { this.enemies.delete(enemyId); }

  step(stepMs: number): void {
    for (const enemy of this.enemies.values()) {
      if (enemy.state === 'stunned') {
        enemy.stunnedMs = subtractDuration(enemy.stunnedMs, stepMs);
        if (enemy.stunnedMs === 0) { enemy.state = 'moving'; enemy.animationElapsedMs = 0; }
        continue;
      }
      if (enemy.state !== 'moving') { enemy.animationElapsedMs += stepMs; continue; }
      enemy.pathProgress = Math.min(enemy.attackProgress, enemy.pathProgress + enemy.speed * stepMs / 1000);
      enemy.animationElapsedMs += stepMs;
    }
  }

  damage(id: number, amount: number): readonly EnemyLifecycleEvent[] {
    const enemy = this.enemies.get(id);
    if (enemy === undefined || amount <= 0 || enemy.state === 'dead') return [];
    enemy.currentHp = Math.max(0, enemy.currentHp - amount);
    if (enemy.currentHp > 0) return [];
    enemy.state = 'dead';
    this.enemies.delete(id);
    return [{ type: 'enemyDied', enemyId: id }, { type: 'snackEarned', enemyId: id, amount: enemy.snack }];
  }
  setState(id: number, state: EnemyState, animationElapsedMs = 0): void {
    const enemy = this.enemies.get(id); if (enemy === undefined) return;
    const preserveAttackElapsed = enemy.state === 'windup' && state === 'holding';
    enemy.state = state;
    if (!preserveAttackElapsed) enemy.animationElapsedMs = animationElapsedMs;
  }
  knockBack(id: number, distance: number): void {
    const enemy = this.enemies.get(id); if (enemy === undefined) return;
    enemy.pathProgress = enemy.path.knockBack(enemy.pathProgress, distance);
    enemy.state = 'moving'; enemy.animationElapsedMs = 0;
  }
  stun(id: number, durationMs: number): void {
    const enemy = this.enemies.get(id); if (enemy === undefined) return;
    enemy.state = 'stunned'; enemy.stunnedMs = Math.max(0, durationMs); enemy.animationElapsedMs = 0;
  }
  snapshots(): readonly EnemySnapshot[] {
    return [...this.enemies.values()].map((enemy) => {
      const movingEtaMs = Math.max(0, enemy.attackProgress - enemy.pathProgress) / enemy.speed * 1000;
      return {
        id: enemy.id, kind: enemy.kind, variant: enemy.variant, state: enemy.state, pathId: enemy.pathId,
        pathProgress: enemy.pathProgress, position: enemy.path.positionAt(enemy.pathProgress),
        etaMs: enemy.state === 'windup' || enemy.state === 'holding' ? 0
          : movingEtaMs + (enemy.state === 'stunned' ? enemy.stunnedMs : 0),
        currentHp: enemy.currentHp, maxHp: enemy.maxHp, spawnSequence: enemy.spawnSequence,
        isBoss: enemy.isBoss, stunnedMs: enemy.stunnedMs, animationElapsedMs: enemy.animationElapsedMs,
      };
    });
  }
  get activeCount(): number { return this.enemies.size; }
  has(id: number): boolean { return this.enemies.has(id); }
  clear(): void { this.enemies.clear(); this.nextId = 0; }
}
```

`EnemyActorPool`은 `ObjectPool<EnemyActor>`를 capacity 60으로 만들고 factory에서 Phaser container를 한 번만 생성한다. actor pool reset은 texture, frame, alpha, tint, HP bar, active/visible과 listener를 초기값으로 돌린 뒤 release한다.

Task 7의 `EnemySystem`은 `attackProgress`에 clamp한 뒤에도 state를 `moving`으로 유지한다. Task 9에서 `EnemyAttackSystem`만 `attackStarted|attackCancelled|attackHolding`을 결정하고 `GameSession`이 그 event를 `EnemySystem.setState`에 반영하므로 공격 상태 소유자는 하나다.

- [ ] **Step 3: 적 스프라이트와 작은 HP 바를 actor container로 구현한다.**

```ts
// src/game/enemies/EnemyHpBar.ts
import Phaser from 'phaser';

export function enemyHpColor(ratio: number): number {
  return ratio > 0.5 ? 0x39a852 : ratio >= 0.2 ? 0xf2ca45 : 0xd94b43;
}
export class EnemyHpBar {
  constructor(private readonly graphics: Phaser.GameObjects.Graphics) {}
  render(current: number, max: number): void {
    const ratio = Math.max(0, current / max);
    this.graphics.clear().fillStyle(0x2a241f, 0.75).fillRect(-15, -2, 30, 4)
      .fillStyle(enemyHpColor(ratio), 1).fillRect(-15, -2, 30 * ratio, 4);
    this.graphics.setVisible(true);
  }
}
```

`EnemyActor`는 container origin을 발로 두고 sprite frame size `192×256`를 사용한다. Phaser 자동 애니메이션 대신 EnemySnapshot의 `animationElapsedMs`와 state로 walk frame 0~3 6fps 또는 attack frame 4~7 8fps를 pure resolver에서 골라 직접 `setFrame`한다. 종류별 표시 높이는 일반 82, trader 102, breeder 106 논리 픽셀로 고정한다. HP bar는 머리 bbox 위 4px, 크기 30×4이며 full HP에서도 항상 visible이다. container depth는 feet y만 사용하고 HP bar는 depth 계산에 포함하지 않는다.

- [ ] **Step 4: GameSession과 Scene의 spawn/move/despawn event를 연결한다.**

`GameSession.step` 순서는 `WaveSystem → EnemySystem.move → event flush`다. `GameScene`은 spawn event에 actor를 acquire하고 매 render마다 snapshot으로 위치·frame·HP bar를 갱신한다. `enemyDied`에서 actor를 reset한 뒤 release한다. reset은 texture, frame, alpha, tint, animation, HP bar, active/visible, event listener를 초기화한다.

테스트 브리지에 `'health-bar-colors'` 시나리오와 `enemies` snapshot 배열을 추가한다.

Run: `npm run test:unit -- tests/unit/EnemySystem.test.ts tests/unit/PresentationRules.test.ts tests/unit/ObjectPool.test.ts && npm run typecheck`

Expected: 모든 테스트 통과, pool created count는 전투 내내 60.

- [ ] **Step 5: Task 7을 커밋한다.**

```bash
git add src/game/enemies src/game/pooling src/game/session src/game/scenes/GameScene.ts src/game/debug tests/unit
git commit -m "feat: add enemy lifecycle and hp bars"
```

---

### Task 8: 위협도 자동 조준과 기본 짖기

**Files:**
- Create: `src/game/combat/CombatTypes.ts`
- Create: `src/game/combat/CombatSystem.ts`
- Create: `src/game/combat/TargetingSystem.ts`
- Create: `src/game/combat/BarkSystem.ts`
- Modify: `src/game/enemies/EnemySystem.ts`
- Modify: `src/game/player/PlayerView.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/events/GameEvents.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Test: `tests/unit/CombatSystem.test.ts`
- Test: `tests/unit/TargetingSystem.test.ts`
- Test: `tests/unit/BarkSystem.test.ts`
- Create: `tests/unit/fixtures.ts`
- Test: `tests/e2e/combat.spec.ts`

**Interfaces:**
- Consumes: 후추 위치, 살아 있는 적 snapshot, bark level, fixed step
- Produces: 결정적 target id, 250ms release damage 10/13, 0.65/0.52초 cadence, snack event, bark visual event

`tests/unit/fixtures.ts`는 이 Task에서 만들고 이후 Task가 새 도메인 builder를 같은 파일에 추가한다.

```ts
// tests/unit/fixtures.ts (Task 8 초기 내용)
import type { EnemySnapshot } from '../../src/game/enemies/EnemyTypes';

export function enemy(overrides: Partial<EnemySnapshot> = {}): EnemySnapshot {
  return {
    id: 7, kind: 'poopGuardian', variant: 'male', state: 'moving', pathId: 'P1',
    pathProgress: 10, position: { x: 100, y: 100 }, etaMs: 1000,
    currentHp: 35, maxHp: 35, spawnSequence: 0, isBoss: false, stunnedMs: 0, animationElapsedMs: 0,
    ...overrides,
  };
}
export const candidate = (overrides: Partial<EnemySnapshot> = {}) =>
  enemy({ id: 7, position: { x: 100, y: 100 }, ...overrides });
```

- [ ] **Step 1: 위협도 정렬과 사거리 제외 테스트를 작성한다.**

```ts
// tests/unit/TargetingSystem.test.ts
import { selectThreatTarget } from '../../src/game/combat/TargetingSystem';
import { enemy } from './fixtures';

it('ETA → player 거리 → boss → spawn 순으로 대상을 고른다', () => {
  const target = selectThreatTarget({ x: 200, y: 200 }, [
    enemy({ id: 1, etaMs: 500, position: { x: 230, y: 200 }, isBoss: false, spawnSequence: 1 }),
    enemy({ id: 2, etaMs: 500, position: { x: 230, y: 200 }, isBoss: true, spawnSequence: 2 }),
    enemy({ id: 3, etaMs: 400, position: { x: 340, y: 200 }, isBoss: false, spawnSequence: 0 }),
  ], 150);
  expect(target?.id).toBe(3);
});

it('사거리 밖 적만 있으면 undefined다', () => {
  expect(selectThreatTarget({ x: 0, y: 0 }, [enemy({ position: { x: 151, y: 0 } })], 150)).toBeUndefined();
});
```

Run: `npm run test:unit -- tests/unit/TargetingSystem.test.ts`

Expected: targeting 모듈 부재로 실패.

- [ ] **Step 2: stable comparator와 CombatSystem을 구현한다.**

```ts
// src/game/combat/TargetingSystem.ts
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import { distance, type Point } from '../world/Geometry';

interface TargetCandidate extends EnemySnapshot { readonly distanceToPlayer: number; }
export function compareThreat(a: TargetCandidate, b: TargetCandidate): number {
  return a.etaMs - b.etaMs ||
    a.distanceToPlayer - b.distanceToPlayer ||
    Number(b.isBoss) - Number(a.isBoss) ||
    a.spawnSequence - b.spawnSequence;
}

export function selectThreatTarget(player: Point, enemies: readonly EnemySnapshot[], range: number): EnemySnapshot | undefined {
  return rankThreatTargets(player, enemies, range).at(0);
}

export function rankThreatTargets(player: Point, enemies: readonly EnemySnapshot[], range = Number.POSITIVE_INFINITY): readonly EnemySnapshot[] {
  return enemies.filter((enemy) => enemy.state !== 'dead' && distance(player, enemy.position) <= range)
    .map((enemy) => ({ ...enemy, distanceToPlayer: distance(player, enemy.position) }))
    .sort(compareThreat);
}
```

`CombatSystem.applyDamage`는 command를 enemy system에 전달하고 같은 스텝의 damage를 모두 적용한 뒤 death/snack event를 flush한다. 이미 dead인 id, 0 이하 피해와 같은 attack id 재적용은 무시한다.

```ts
// tests/unit/CombatSystem.test.ts
import { CombatSystem } from '../../src/game/combat/CombatSystem';

it('한 cast의 서로 다른 target은 모두 적용하고 같은 attack-target 쌍만 한 번 처리한다', () => {
  const applied: number[] = [];
  const combat = new CombatSystem({
    damage: (targetId, amount) => { applied.push(amount); return [{ type: 'enemyDied', enemyId: targetId }, { type: 'snackEarned', enemyId: targetId, amount: 2 }]; },
  });
  expect(combat.applyDamage([
    { attackId: 'bark:1', targetId: 7, amount: 10 },
    { attackId: 'bark:1', targetId: 7, amount: 10 },
    { attackId: 'bark:1', targetId: 8, amount: 10 },
    { attackId: 'invalid', targetId: 7, amount: 0 },
  ])).toHaveLength(4);
  expect(applied).toEqual([10, 10]);
});
```

```ts
// src/game/combat/CombatSystem.ts
import type { EnemyLifecycleEvent } from '../enemies/EnemySystem';

export interface DamageCommand {
  readonly attackId: string;
  readonly targetId: number;
  readonly amount: number;
}
export interface DamageTarget {
  damage(targetId: number, amount: number): readonly EnemyLifecycleEvent[];
}
export class CombatSystem {
  constructor(private readonly targets: DamageTarget) {}
  applyDamage(commands: readonly DamageCommand[]): readonly EnemyLifecycleEvent[] {
    const processed = new Set<string>();
    const events: EnemyLifecycleEvent[] = [];
    for (const command of commands) {
      const dedupeKey = `${command.attackId}:${command.targetId}`;
      if (command.amount <= 0 || processed.has(dedupeKey)) continue;
      processed.add(dedupeKey);
      events.push(...this.targets.damage(command.targetId, command.amount));
    }
    return events;
  }
}
```

- [ ] **Step 3: attack release가 애니메이션과 무관하게 250ms인지 실패 테스트로 고정한다.**

```ts
// tests/unit/BarkSystem.test.ts
import { BarkSystem } from '../../src/game/combat/BarkSystem';
import { candidate } from './fixtures';

it('target이 있을 때 250ms에 한 번 피해를 내고 650ms cadence를 지킨다', () => {
  const bark = new BarkSystem(1);
  expect(bark.step(0, candidate())).toEqual([{ type: 'barkStarted', targetId: 7 }]);
  expect(bark.step(249, candidate())).toEqual([]);
  expect(bark.step(1, candidate())).toEqual([
    { type: 'barkReleased', targetId: 7 },
    { type: 'damageRequested', targetId: 7, amount: 10, source: 'bark' },
  ]);
  expect(bark.step(399, candidate())).toEqual([]);
  expect(bark.step(1, candidate())).toEqual([{ type: 'barkStarted', targetId: 7 }]);
  expect(bark.step(249, candidate())).toEqual([]);
  expect(bark.step(1, candidate()).find((event) => event.type === 'damageRequested'))
    .toMatchObject({ targetId: 7, amount: 10 });
});

it('target이 없으면 cooldown 완료 상태를 유지한다', () => {
  const bark = new BarkSystem(1);
  bark.step(650, undefined);
  expect(bark.snapshot().ready).toBe(true);
});

it('level 2는 피해 13, level 3은 시작 간격 520ms를 사용한다', () => {
  const levelTwo = new BarkSystem(1);
  levelTwo.setLevel(2);
  levelTwo.step(0, candidate());
  expect(levelTwo.step(250, candidate()).find((event) => event.type === 'damageRequested')).toMatchObject({ amount: 13 });
  const levelThree = new BarkSystem(3);
  levelThree.step(0, candidate());
  levelThree.step(250, candidate());
  expect(levelThree.step(269, candidate())).toEqual([]);
  expect(levelThree.step(1, candidate())).toEqual([{ type: 'barkStarted', targetId: 7 }]);
});
```

```ts
// src/game/combat/BarkSystem.ts
import { reachedDuration } from '../constants';
import type { SkillLevel } from '../types/GameTypes';
import type { EnemySnapshot } from '../enemies/EnemyTypes';

export type BarkEvent =
  | { readonly type: 'barkStarted'; readonly targetId: number }
  | { readonly type: 'barkReleased'; readonly targetId: number }
  | { readonly type: 'damageRequested'; readonly targetId: number; readonly amount: number; readonly source: 'bark' };

export class BarkSystem {
  private phase: 'ready' | 'windup' | 'cooldown' = 'ready';
  private cycleElapsedMs = 0;
  private lockedTargetId: number | null = null;
  constructor(private level: SkillLevel) {
    if (level < 1) throw new RangeError('Bark starts at level 1');
  }
  step(
    stepMs: number,
    target: EnemySnapshot | undefined,
    isAlive: (enemyId: number) => boolean = (enemyId) => target?.id === enemyId && target.state !== 'dead',
  ): readonly BarkEvent[] {
    const events: BarkEvent[] = [];
    if (this.phase === 'ready') {
      if (target === undefined) return events;
      this.phase = 'windup'; this.cycleElapsedMs = 0; this.lockedTargetId = target.id;
      events.push({ type: 'barkStarted', targetId: target.id });
    }
    this.cycleElapsedMs += stepMs;
    if (this.phase === 'windup' && reachedDuration(this.cycleElapsedMs, 250)) {
      if (this.lockedTargetId !== null) {
        events.push({ type: 'barkReleased', targetId: this.lockedTargetId });
        if (isAlive(this.lockedTargetId)) events.push({ type: 'damageRequested', targetId: this.lockedTargetId, amount: this.damage, source: 'bark' });
      }
      this.phase = 'cooldown';
    }
    if (reachedDuration(this.cycleElapsedMs, this.cadenceMs)) {
      this.phase = 'ready'; this.cycleElapsedMs = 0; this.lockedTargetId = null;
      if (target !== undefined && target.state !== 'dead') {
        this.phase = 'windup'; this.lockedTargetId = target.id;
        events.push({ type: 'barkStarted', targetId: target.id });
      }
    }
    return events;
  }
  setLevel(level: SkillLevel): void { if (level < 1) throw new RangeError('Bark level must be at least 1'); this.level = level; }
  snapshot(): { readonly ready: boolean; readonly phase: 'ready' | 'windup' | 'cooldown'; readonly elapsedMs: number } {
    return { ready: this.phase === 'ready', phase: this.phase, elapsedMs: this.cycleElapsedMs };
  }
  private get damage(): number { return this.level >= 2 ? 13 : 10; }
  private get cadenceMs(): number { return this.level >= 3 ? 520 : 650; }
}
```

`BarkSystem`은 `ready → windup → cooldown` 상태를 가진다. ready에서 사거리 150 이내 target을 한 번 선택해 lock하고 `barkStarted`, 250ms 뒤 target이 살아 있으면 현재 거리와 무관하게 `damageRequested`와 `barkReleased`, 시작 후 650ms에 다시 ready다. 짖기는 투사체가 아니며 공격 중 후추 이동 때문에 빗나가지 않는다. level 2 damage 13, level 3 cadence 520ms다.

`GameSession`은 매 tick 현재 `selectThreatTarget` 후보를 넘기되 `BarkSystem`은 `ready` 진입 또는 cadence 경계에서만 그 후보를 lock한다. release 생존 판정에는 `(id) => enemies.has(id)`를 주입한다. 따라서 windup 중 더 위협적인 새 적이 생겨도 최초 lock 대상이 살아 있으면 그대로 맞고, cooldown이 끝난 tick에는 한 tick 지연 없이 새 후보를 잡는다.

- [ ] **Step 4: 후추 4프레임 짖기와 파동을 event-driven으로 표현한다.**

`barkStarted`에서 BarkSystem snapshot의 attack elapsed를 0으로 만들고 `PlayerView`가 pure resolver로 frames 4~7을 8fps one-shot 표시한다. `barkReleased`에서 target 방향 70도 이하의 짧은 파동 effect를 pool에서 acquire하며 effect alpha도 simulation age 함수로 계산한다. 시각 frame이나 complete callback이 damage를 호출해서는 안 된다. 이동은 attack 중에도 계속 적용한다.

- [ ] **Step 5: 브라우저에서 자동 조준·HP 감소·단 한 번 보상을 검증한다.**

```ts
// tests/e2e/combat.spec.ts
import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('기본 짖기가 자동 조준해 HP를 줄이고 HP 바를 계속 표시한다', async ({ page }) => {
  await openScenario(page, 'bark-targeting');
  const before = await snapshot(page);
  await advance(page, 250);
  const after = await snapshot(page);
  expect(after.enemies.at(0)!.currentHp).toBe(before.enemies.at(0)!.currentHp - 10);
  expect(after.enemies.at(0)!.hpBar).toMatchObject({ visible: true, width: 30, height: 4 });
});
```

테스트 브리지에 `'bark-targeting'` 시나리오, enemy HP, snacks, event sequence를 추가한다.

Run: `npm run test:unit -- tests/unit/CombatSystem.test.ts tests/unit/TargetingSystem.test.ts tests/unit/BarkSystem.test.ts && npm run test:e2e -- tests/e2e/combat.spec.ts`

Expected: 기본 짖기 250ms release와 HP bar 테스트 통과.

- [ ] **Step 6: Task 8을 커밋한다.**

```bash
git add src/game/combat src/game/enemies/EnemySystem.ts src/game/player/PlayerView.ts src/game/session src/game/events src/game/debug tests
git commit -m "feat: add automatic bark combat"
```

---

### Task 9: 보호소·적 공격·투사체·기절

**Files:**
- Create: `src/game/shelter/ShelterTypes.ts`
- Create: `src/game/shelter/ShelterSystem.ts`
- Create: `src/game/shelter/ShelterView.ts`
- Create: `src/game/combat/EnemyAttackSystem.ts`
- Create: `src/game/combat/ProjectileSystem.ts`
- Create: `src/game/combat/ProjectileActorPool.ts`
- Modify: `src/game/enemies/EnemySystem.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/events/GameEvents.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `tests/unit/fixtures.ts`
- Test: `tests/unit/ShelterSystem.test.ts`
- Test: `tests/unit/EnemyAttackSystem.test.ts`
- Test: `tests/unit/ProjectileSystem.test.ts`
- Modify: `tests/e2e/combat.spec.ts`

**Interfaces:**
- Consumes: enemy feet, shelter circle `(270,480,r=38)`, attack timer, stun/knockback, projectile fixed step
- Produces: 4단계 shelter state, windup/cancel/release, pooled poop/net/electric projectile, shelter damage 한 번

```ts
// tests/unit/fixtures.ts에 Task 9에서 추가
// 파일 상단 imports에도 다음을 추가한다.
import { EnemyAttackSystem } from '../../src/game/combat/EnemyAttackSystem';
import { BALANCE } from '../../src/game/data/balance';
import type { EnemyKind } from '../../src/game/types/GameTypes';

export const inRangeEnemy = (overrides: Partial<EnemySnapshot> = {}) =>
  enemy({ id: 1, position: { x: 270, y: 550 }, pathProgress: 77, ...overrides });
export const outOfRangeEnemy = (overrides: Partial<EnemySnapshot> = {}) =>
  enemy({ id: 1, position: { x: 270, y: 570 }, pathProgress: 76, ...overrides });
export const attackSystemFor = (kind: EnemyKind) => new EnemyAttackSystem({
  kind,
  balance: BALANCE.enemies[kind],
  shelter: { center: { x: 270, y: 480 }, radius: 38 },
});
```

- [ ] **Step 1: 보호소 단계와 원 경계 공격 거리 테스트를 작성한다.**

```ts
// tests/unit/ShelterSystem.test.ts
import { shelterVisualState } from '../../src/game/shelter/ShelterSystem';

it.each([[100, 'healthy'], [67, 'healthy'], [66, 'damaged'], [34, 'damaged'], [33, 'critical'], [1, 'critical'], [0, 'failed']] as const)(
  'HP %i는 %s 프레임이다', (hp, state) => expect(shelterVisualState(hp, 100)).toBe(state),
);

// tests/unit/EnemyAttackSystem.test.ts
import { distanceToShelterBoundary } from '../../src/game/combat/EnemyAttackSystem';
import { EnemySystem } from '../../src/game/enemies/EnemySystem';
import { attackFrameAt } from '../../src/game/world/AnimationFrameResolver';
import { attackSystemFor, inRangeEnemy, outOfRangeEnemy } from './fixtures';

it('발에서 보호소 원 경계까지의 거리를 사용한다', () => {
  expect(distanceToShelterBoundary({ x: 270, y: 566 }, { x: 270, y: 480 }, 38)).toBe(48);
});
```

Run: `npm run test:unit -- tests/unit/ShelterSystem.test.ts tests/unit/EnemyAttackSystem.test.ts`

Expected: shelter/attack 모듈 부재로 실패.

- [ ] **Step 2: 보호소 HP와 4프레임 view를 구현한다.**

```ts
// src/game/shelter/ShelterTypes.ts
export type ShelterVisualState = 'healthy' | 'damaged' | 'critical' | 'failed';
```

```ts
// src/game/shelter/ShelterSystem.ts
import type { ShelterVisualState } from './ShelterTypes';

export interface ShelterDamageEvent {
  readonly type: 'shelterDamaged';
  readonly hp: number;
  readonly visual: ShelterVisualState;
}

export function shelterVisualState(hp: number, maxHp: number): ShelterVisualState {
  const ratio = hp / maxHp;
  return ratio >= 0.67 ? 'healthy' : ratio >= 0.34 ? 'damaged' : ratio > 0 ? 'critical' : 'failed';
}
export class ShelterSystem {
  private hp: number;
  constructor(private readonly maxHp = 100, initialHp = maxHp) {
    if (maxHp <= 0 || initialHp < 0 || initialHp > maxHp) throw new RangeError('Invalid shelter HP');
    this.hp = initialHp;
  }
  get currentHp(): number { return this.hp; }
  damage(amount: number): readonly ShelterDamageEvent[] {
    if (this.hp <= 0 || amount <= 0) return [];
    this.hp = Math.max(0, this.hp - amount);
    return [{ type: 'shelterDamaged', hp: this.hp, visual: shelterVisualState(this.hp, this.maxHp) }];
  }
  reset(): void { this.hp = this.maxHp; }
}
```

`ShelterView`는 `shelter-states` frame 0~3을 `(270,480)` 바닥 중심으로 두고 표시 높이 77로 고정한다. 피격 시 120ms 좌우 shake, frame 전환은 동일 origin `(0.5, 224/256)`을 유지한다.

- [ ] **Step 3: windup 취소·250ms release·stun freeze 테스트를 작성한다.**

```ts
// tests/unit/EnemyAttackSystem.test.ts
it('release 전 범위 밖이면 공격을 취소한다', () => {
  const attack = attackSystemFor('poopGuardian');
  attack.step(249, inRangeEnemy());
  expect(attack.step(1, outOfRangeEnemy())).toEqual([{ type: 'attackCancelled', enemyId: 1 }]);
});

it('기절은 windup을 취소하고 interval을 처음부터 다시 센다', () => {
  const attack = attackSystemFor('offLeashGuardian');
  attack.step(200, inRangeEnemy());
  attack.stun(1, 3000);
  expect(attack.step(3000, inRangeEnemy())).toEqual([]);
  expect(attack.snapshot(1)).toMatchObject({ state: 'moving', cooldownMs: 1600 });
});

it('release 뒤 holding 상태로 위치를 고정하고 시작 시각 기준 interval에 다음 windup을 연다', () => {
  const attack = attackSystemFor('offLeashGuardian');
  const target = inRangeEnemy({ pathProgress: 77 });
  expect(attack.step(250, target).map((event) => event.type)).toEqual(['attackStarted', 'shelterDamageRequested', 'attackHolding']);
  expect(attack.snapshot(1)).toMatchObject({ state: 'holding', pathProgress: 77 });
  expect(attack.step(1349, target)).toEqual([]);
  expect(attack.step(1, target)).toEqual([{ type: 'attackStarted', enemyId: 1 }]);
  expect(attack.snapshot(1).state).toBe('windup');
});

it.each([
  ['poopGuardian', 'projectileRequested', 'poop', 220, 3],
  ['offLeashGuardian', 'shelterDamageRequested', undefined, undefined, 6],
  ['dogTrader', 'projectileRequested', 'net', 240, 14],
  ['illegalBreeder', 'projectileRequested', 'electric', 260, 18],
] as const)('%s는 250ms release에 고유 공격을 한 번 만든다', (kind, type, projectileKind, speed, damage) => {
  const attack = attackSystemFor(kind);
  const before = attack.step(249, inRangeEnemy());
  expect(before.some((event) => event.type === type)).toBe(false);
  const released = attack.step(1, inRangeEnemy()).find((event) => event.type === type)!;
  if (projectileKind === undefined) expect(released).toMatchObject({ damage });
  else expect(released).toMatchObject({ projectileKind, speed, damage, lifeMs: 1200 });
});

it('8fps 공격 frame은 0.25초 release에서 sheet frame 6이다', () => {
  expect([0, 125, 250, 375].map(attackFrameAt)).toEqual([4, 5, 6, 7]);
});

it('windup에서 holding으로 바뀔 때 release frame의 elapsed를 보존한다', () => {
  const stepMs = 1000 / 60;
  const enemies = EnemySystem.withSingleEnemy({ kind: 'offLeashGuardian', pathId: 'P1' });
  const attack = attackSystemFor('offLeashGuardian');
  let released = false;
  for (let tick = 0; tick < 15; tick += 1) {
    enemies.step(stepMs);
    for (const event of attack.step(stepMs, inRangeEnemy())) {
      if (event.type === 'attackStarted') enemies.setState(0, 'windup', stepMs);
      if (event.type === 'attackHolding') enemies.setState(0, 'holding');
      if (event.type === 'shelterDamageRequested') released = true;
    }
  }
  expect(released).toBe(true);
  expect(enemies.snapshots().at(0)!.animationElapsedMs).toBeCloseTo(250, 8);
  expect(attackFrameAt(enemies.snapshots().at(0)!.animationElapsedMs)).toBe(6);
});
```

`EnemyAttackSystem`이 `moving → windup → holding → windup`의 공격 상태와 시작 시각 간 interval을 단독 소유하고, `EnemySystem`은 전달받은 state로 이동 여부만 결정한다. GameSession의 순서는 `spawn → EnemySystem.moveClamped → EnemyAttackSystem.step → projectile step`이다. 범위에 도달한 moving 적은 즉시 windup, 250ms release 뒤 holding, 최초 attack start부터 interval이 찼을 때 범위 안이면 다음 windup으로 간다. holding 중 넉백으로 범위 밖이면 moving으로 돌아간다. 즉시형 off-leash는 shelter damage command, 원거리 poop/trader/breeder는 각각 speed 220/240/260, life 1200ms projectile command를 낸다. 기절은 진행 중 windup/holding과 animation을 취소하고 remaining stun 동안 이동·cooldown·animation time을 모두 freeze한다.

```ts
// src/game/combat/EnemyAttackSystem.ts
import { reachedDuration, subtractDuration } from '../constants';
import type { EnemyKind, EnemyState } from '../types/GameTypes';
import type { Point } from '../world/Geometry';
import type { EnemySnapshot } from '../enemies/EnemyTypes';

type ProjectileKind = 'poop' | 'net' | 'electric';
type AttackBalance = { readonly damage: number; readonly attackIntervalMs: number; readonly range: number };
type ShelterCircle = { readonly center: Point; readonly radius: number };
export type EnemyAttackEvent =
  | { readonly type: 'attackStarted' | 'attackCancelled' | 'attackHolding'; readonly enemyId: number }
  | { readonly type: 'shelterDamageRequested'; readonly enemyId: number; readonly damage: number }
  | { readonly type: 'projectileRequested'; readonly enemyId: number; readonly projectileKind: ProjectileKind; readonly from: Point; readonly to: Point; readonly speed: number; readonly damage: number; readonly lifeMs: 1200 };
type AttackTrack = {
  phase: Extract<EnemyState, 'moving' | 'windup' | 'holding' | 'stunned'>;
  cycleMs: number; windupMs: number; stunMs: number; pathProgress: number;
};

export const distanceToShelterBoundary = (feet: Point, center: Point, radius: number) =>
  Math.max(0, Math.hypot(feet.x - center.x, feet.y - center.y) - radius);

export class EnemyAttackSystem {
  private readonly tracks = new Map<number, AttackTrack>();
  constructor(private readonly config: { kind: EnemyKind; balance: AttackBalance; shelter: ShelterCircle }) {}

  step(stepMs: number, enemy: EnemySnapshot): readonly EnemyAttackEvent[] {
    const track = this.tracks.get(enemy.id) ?? {
      phase: 'moving', cycleMs: 0, windupMs: 0, stunMs: 0, pathProgress: enemy.pathProgress,
    };
    this.tracks.set(enemy.id, track); track.pathProgress = enemy.pathProgress;
    if (track.phase === 'stunned') {
      track.stunMs = subtractDuration(track.stunMs, stepMs);
      if (track.stunMs === 0) { track.phase = 'moving'; track.cycleMs = 0; track.windupMs = 0; }
      return [];
    }
    const inRange = distanceToShelterBoundary(enemy.position, this.config.shelter.center, this.config.shelter.radius)
      <= this.config.balance.range + 1e-9;
    const events: EnemyAttackEvent[] = [];
    if ((track.phase === 'windup' || track.phase === 'holding') && !inRange) {
      track.phase = 'moving'; track.cycleMs = 0; track.windupMs = 0;
      return [{ type: 'attackCancelled', enemyId: enemy.id }];
    }
    if (track.phase === 'moving') {
      if (!inRange) return [];
      track.phase = 'windup'; track.cycleMs = 0; track.windupMs = 0;
      events.push({ type: 'attackStarted', enemyId: enemy.id });
    }
    track.cycleMs += stepMs;
    if (track.phase === 'windup') {
      track.windupMs += stepMs;
      if (reachedDuration(track.windupMs, 250)) {
        if (this.config.kind === 'offLeashGuardian') {
          events.push({ type: 'shelterDamageRequested', enemyId: enemy.id, damage: this.config.balance.damage });
        } else {
          const projectile = this.projectileFor(this.config.kind);
          events.push({
            type: 'projectileRequested', enemyId: enemy.id, projectileKind: projectile.kind,
            from: enemy.position, to: this.config.shelter.center, speed: projectile.speed,
            damage: this.config.balance.damage, lifeMs: 1200,
          });
        }
        track.phase = 'holding';
        events.push({ type: 'attackHolding', enemyId: enemy.id });
      }
    }
    if (track.phase === 'holding' && reachedDuration(track.cycleMs, this.config.balance.attackIntervalMs)) {
      track.phase = 'windup'; track.cycleMs = 0; track.windupMs = 0;
      events.push({ type: 'attackStarted', enemyId: enemy.id });
    }
    return events;
  }
  stun(enemyId: number, durationMs: number, pathProgress = 0): void {
    const track = this.tracks.get(enemyId) ?? {
      phase: 'moving' as const, cycleMs: 0, windupMs: 0, stunMs: 0, pathProgress,
    };
    this.tracks.set(enemyId, track);
    track.phase = 'stunned'; track.stunMs = durationMs; track.cycleMs = 0; track.windupMs = 0;
  }
  interrupt(enemyId: number): void {
    const track = this.tracks.get(enemyId); if (track === undefined) return;
    track.phase = 'moving'; track.stunMs = 0; track.cycleMs = 0; track.windupMs = 0;
  }
  snapshot(enemyId: number): { readonly state: AttackTrack['phase']; readonly cooldownMs: number; readonly pathProgress: number } {
    const track = this.tracks.get(enemyId); if (track === undefined) throw new RangeError(`Unknown attack enemy ${enemyId}`);
    return {
      state: track.phase,
      cooldownMs: track.phase === 'stunned' || track.phase === 'moving'
        ? this.config.balance.attackIntervalMs
        : Math.max(0, this.config.balance.attackIntervalMs - track.cycleMs),
      pathProgress: track.pathProgress,
    };
  }
  remove(enemyId: number): void { this.tracks.delete(enemyId); }
  clear(): void { this.tracks.clear(); }
  private projectileFor(kind: EnemyKind): { kind: ProjectileKind; speed: number } {
    if (kind === 'poopGuardian') return { kind: 'poop', speed: 220 };
    if (kind === 'dogTrader') return { kind: 'net', speed: 240 };
    if (kind === 'illegalBreeder') return { kind: 'electric', speed: 260 };
    throw new Error('Off-leash attacks are immediate and have no projectile');
  }
}
```

- [ ] **Step 4: projectile 충돌과 풀 반환을 실패 테스트 후 구현한다.**

```ts
// tests/unit/ProjectileSystem.test.ts
import { ProjectileSystem } from '../../src/game/combat/ProjectileSystem';

it('보호소 원에 닿을 때 피해를 한 번 적용하고 풀로 반환한다', () => {
  const projectiles = new ProjectileSystem(80);
  projectiles.spawn({ id: 1, kind: 'poop', from: { x: 270, y: 566 }, to: { x: 270, y: 480 }, speed: 220, damage: 3, lifeMs: 1200 });
  const events = projectiles.step(500);
  expect(events.filter((event) => event.type === 'shelterDamageRequested')).toHaveLength(1);
  expect(projectiles.activeCount).toBe(0);
  expect(projectiles.step(500)).toEqual([]);
});

it('cap 이후 투사체는 새 객체 생성이나 crash 없이 drop event로 끝난다', () => {
  const projectiles = new ProjectileSystem(1);
  const input = { id: 1, kind: 'poop' as const, from: { x: 270, y: 566 }, to: { x: 270, y: 480 }, speed: 220, damage: 3, lifeMs: 1200 };
  projectiles.spawn(input);
  expect(projectiles.spawn({ ...input, id: 2 })).toEqual([
    { type: 'projectileDropped', projectileId: 2, kind: 'poop', reason: 'capacity' },
  ]);
  expect(projectiles.activeCount).toBe(1);
  expect(projectiles.poolSnapshot().created).toBe(1);
});
```

`ProjectileSystem`은 normalized 방향으로 선형 이동하되 poop view만 포물선 visual offset과 회전을 적용한다. 규칙상의 hit는 feet/world 위치와 shelter circle overlap으로 계산한다. 명중 또는 1200ms 만료 즉시 inactive로 바꾸고 반환 event를 한 번 낸다. Scene 시작 시 actor 80개를 preallocate한다.

```ts
// src/game/combat/ProjectileSystem.ts
import { reachedDuration } from '../constants';
import { ObjectPool, type PoolSnapshot } from '../pooling/ObjectPool';
import type { Point } from '../world/Geometry';

export type ProjectileKind = 'poop' | 'net' | 'electric';
export interface ProjectileSpawn {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly from: Point;
  readonly to: Point;
  readonly speed: number;
  readonly damage: number;
  readonly lifeMs: number;
}
export interface ProjectileSnapshot {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  readonly damage: number;
  readonly lifeMs: number;
}
export type ProjectileEvent =
  | { readonly type: 'projectileSpawned'; readonly projectileId: number; readonly kind: ProjectileKind }
  | { readonly type: 'projectileDropped'; readonly projectileId: number; readonly kind: ProjectileKind; readonly reason: 'capacity' }
  | { readonly type: 'projectileHit'; readonly projectileId: number; readonly kind: ProjectileKind }
  | { readonly type: 'shelterDamageRequested'; readonly projectileId: number; readonly damage: number };

interface MutableProjectile {
  id: number; kind: ProjectileKind; position: Point; velocity: Point;
  target: Point; speed: number; damage: number; ageMs: number; lifeMs: number;
}

function pointToSegmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x; const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const projection = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + dx * projection), point.y - (from.y + dy * projection));
}

export class ProjectileSystem {
  private readonly pool: ObjectPool<MutableProjectile>;
  private readonly active = new Set<MutableProjectile>();
  constructor(capacity: number, private readonly shelterRadius = 38) {
    this.pool = new ObjectPool(capacity, () => ({
      id: -1, kind: 'poop', position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
      target: { x: 0, y: 0 }, speed: 0, damage: 0, ageMs: 0, lifeMs: 0,
    }));
  }
  spawn(input: ProjectileSpawn): readonly ProjectileEvent[] {
    const dx = input.to.x - input.from.x; const dy = input.to.y - input.from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0 || input.speed <= 0 || input.lifeMs <= 0) throw new RangeError('Invalid projectile');
    const projectile = this.pool.acquire();
    if (projectile === undefined) return [{ type: 'projectileDropped', projectileId: input.id, kind: input.kind, reason: 'capacity' }];
    Object.assign(projectile, {
      id: input.id, kind: input.kind, position: { ...input.from },
      velocity: { x: dx / length * input.speed, y: dy / length * input.speed }, target: { ...input.to },
      speed: input.speed, damage: input.damage, ageMs: 0, lifeMs: input.lifeMs,
    });
    this.active.add(projectile);
    return [{ type: 'projectileSpawned', projectileId: input.id, kind: input.kind }];
  }
  step(stepMs: number): readonly ProjectileEvent[] {
    const events: ProjectileEvent[] = [];
    for (const projectile of [...this.active]) {
      const previous = projectile.position;
      const next = {
        x: previous.x + projectile.velocity.x * stepMs / 1000,
        y: previous.y + projectile.velocity.y * stepMs / 1000,
      };
      projectile.position = next;
      projectile.ageMs += stepMs;
      const hit = pointToSegmentDistance(projectile.target, previous, next) <= this.shelterRadius + 1e-9;
      if (hit) {
        events.push(
          { type: 'projectileHit', projectileId: projectile.id, kind: projectile.kind },
          { type: 'shelterDamageRequested', projectileId: projectile.id, damage: projectile.damage },
        );
      }
      if (hit || reachedDuration(projectile.ageMs, projectile.lifeMs)) this.release(projectile);
    }
    return events;
  }
  snapshots(): readonly ProjectileSnapshot[] {
    return [...this.active].map((projectile) => ({
      id: projectile.id, kind: projectile.kind, x: projectile.position.x, y: projectile.position.y,
      speed: projectile.speed, damage: projectile.damage, lifeMs: projectile.lifeMs,
    }));
  }
  get activeCount(): number { return this.active.size; }
  poolSnapshot(): PoolSnapshot { return this.pool.snapshot(); }
  clear(): void { for (const projectile of [...this.active]) this.release(projectile); }
  private release(projectile: MutableProjectile): void {
    this.active.delete(projectile);
    this.pool.release(projectile);
  }
}
```

`ProjectileSnapshot.lifeMs`는 남은 시간이 아니라 spawn 계약의 총 lifetime(항상 1200)을 뜻한다. 만료 판정에는 내부 `ageMs`를 사용하며 debug snapshot은 위치 변화로 같은-tick 진행을 관찰한다.

- [ ] **Step 5: 적별 4프레임 공격과 effect를 연결한다.**

- poop: frame 6에서 작은 갈색 만화 projectile, 짧은 포물선 회전, hit stain fade
- off-leash: frame 6에서 근거리 목줄 arc, 즉시 피해
- trader: frame 6에서 net shockwave projectile speed 240
- breeder: frame 6에서 과장된 청록 electric pulse speed 260

이 목록을 구현할 때 release source는 simulation event이며 frame 6 listener는 시각 동기화 검사용으로만 사용한다. 후추와의 physics overlap callback은 등록하지 않는다.

- [ ] **Step 6: 브라우저에서 단거리 똥 투척의 생성과 명중을 분리 검증한다.**

```ts
// tests/e2e/combat.spec.ts 추가
test('똥 공격은 250ms에 투사체를 만들고 도착 때 보호소를 한 번 때린다', async ({ page }) => {
  await openScenario(page, 'poop-attack');
  const hp = (await snapshot(page)).shelterHp;
  await advance(page, 249);
  expect((await snapshot(page)).projectiles).toHaveLength(0);
  await advance(page, 1);
  expect((await snapshot(page)).projectiles).toHaveLength(1);
  expect((await snapshot(page)).shelterHp).toBe(hp);
  await advance(page, 500);
  expect((await snapshot(page)).shelterHp).toBe(hp - 3);
});

test('개장수는 250ms에 speed 240 포획망을 만들고 보호소에 14 피해를 준다', async ({ page }) => {
  await openScenario(page, 'boss');
  const hp = (await snapshot(page)).shelterHp;
  await advance(page, 250);
  expect((await snapshot(page)).projectiles.at(0)!).toMatchObject({ kind: 'net', speed: 240, lifeMs: 1200 });
  await advance(page, 500);
  expect((await snapshot(page)).shelterHp).toBe(hp - 14);
});
```

테스트 브리지 `TestScenarioId`에 `'poop-attack' | 'boss'`를 이 Task에서 먼저 추가하고 projectile snapshot, shelterHp를 노출한다. Task 9의 `'boss'` factory는 in-range 개장수 한 명과 HP 100 shelter만 만들며 250ms release/포획망 명중을 검증한다. Task 12는 같은 id를 재선언하지 않고 boss HUD와 이름 snapshot만 이 factory에 보강한다.

Run: `npm run test:unit -- tests/unit/ShelterSystem.test.ts tests/unit/EnemyAttackSystem.test.ts tests/unit/ProjectileSystem.test.ts && npm run test:e2e -- tests/e2e/combat.spec.ts`

Expected: release/collision/damage가 각각 정확히 한 번, 후추 HP 필드는 존재하지 않음.

- [ ] **Step 7: Task 9를 커밋한다.**

```bash
git add src/game/shelter src/game/combat src/game/enemies/EnemySystem.ts src/game/session src/game/events src/game/scenes/GameScene.ts src/game/debug tests
git commit -m "feat: add shelter and enemy attacks"
```

---

### Task 10: 간식 임계값·스킬 카드·완전 정지 모달

**Files:**
- Create: `src/game/progression/ProgressionTypes.ts`
- Create: `src/game/progression/ProgressionSystem.ts`
- Create: `src/game/progression/SkillCardPicker.ts`
- Create: `src/game/skills/SkillTypes.ts`
- Create: `src/game/ui/SkillSelectionModal.ts`
- Create: `src/game/ui/CountdownOverlay.ts`
- Create: `src/game/ui/UiTransitionClock.ts`
- Create: `src/game/lifecycle/WorldPauseController.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/session/RunSnapshot.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `tests/unit/fixtures.ts`
- Test: `tests/unit/ProgressionSystem.test.ts`
- Test: `tests/unit/SkillCardPicker.test.ts`
- Test: `tests/unit/WorldPauseController.test.ts`
- Test: `tests/unit/UiTransitionClock.test.ts`
- Test: `tests/e2e/skill-selection.spec.ts`

**Interfaces:**
- Consumes: 누적 snacks, thresholds, 현재 skill levels, seeded RNG, 카드 선택 id
- Produces: 서로 다른 카드 3장, 새 스킬 최소 1장, `skillSelection → countdown → playing`, 대기 임계값

```ts
// src/game/skills/SkillTypes.ts (Task 10에서 먼저 소유)
import type { SkillId, SkillLevel } from '../types/GameTypes';
export type SkillLevels = Readonly<Record<SkillId, SkillLevel>>;
export interface SkillCard {
  id: string;
  skillId: SkillId;
  nextLevel: Exclude<SkillLevel, 0>;
  kind: 'unlock' | 'upgrade';
  title: string;
}
```

```ts
// tests/unit/fixtures.ts에 Task 10에서 추가
// 파일 상단 imports에도 다음을 추가한다.
import { ProgressionSystem } from '../../src/game/progression/ProgressionSystem';
import type { SkillLevels } from '../../src/game/skills/SkillTypes';

export const skillLevels = (overrides: Partial<SkillLevels> = {}): SkillLevels => ({
  bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0, ...overrides,
});
export function pendingTwoSelections(): ProgressionSystem {
  const progression = new ProgressionSystem([8, 22, 40, 62, 88], 5000);
  progression.addSnacks(40);
  progression.takeNextRequest();
  progression.resolveSelection();
  progression.step(5000, { mode: 'playing', activeEnemies: 1 });
  progression.takeNextRequest();
  progression.resolveSelection();
  return progression;
}
```

- [ ] **Step 1: 임계값 초과 보존과 5초 지연 규칙을 실패 테스트로 작성한다.**

```ts
// tests/unit/ProgressionSystem.test.ts
import { ProgressionSystem } from '../../src/game/progression/ProgressionSystem';
import { pendingTwoSelections } from './fixtures';

it('여러 기준을 넘겨도 한 번에 하나만 열고 초과분을 보존한다', () => {
  const progression = new ProgressionSystem([8, 22, 40, 62, 88], 5000);
  progression.addSnacks(40);
  expect(progression.takeNextRequest()).toMatchObject({ threshold: 8 });
  progression.resolveSelection();
  progression.step(4999, { mode: 'playing', activeEnemies: 1 });
  expect(progression.takeNextRequest()).toBeUndefined();
  progression.step(1, { mode: 'playing', activeEnemies: 1 });
  expect(progression.takeNextRequest()).toMatchObject({ threshold: 22 });
  expect(progression.snapshot()).toMatchObject({ snacks: 40, pendingCount: 1 });
});

it('적 없는 웨이브 간 countdown은 전투 5초에 포함하지 않는다', () => {
  const progression = pendingTwoSelections();
  progression.step(5000, { mode: 'countdown', activeEnemies: 0 });
  expect(progression.canOpen()).toBe(false);
});
```

Run: `npm run test:unit -- tests/unit/ProgressionSystem.test.ts`

Expected: progression 모듈 부재로 실패.

- [ ] **Step 2: threshold cursor와 combat-only delay를 구현한다.**

```ts
// src/game/progression/ProgressionTypes.ts
import type { GameMode } from '../core/GameMode';

export interface ProgressionContext { readonly mode: GameMode; readonly activeEnemies: number; }
export interface SkillSelectionRequest { readonly threshold: number; readonly index: number; }
export interface ProgressionSnapshot {
  readonly snacks: number;
  readonly nextThreshold: number | null;
  readonly pendingCount: number;
  readonly selectionOpen: boolean;
  readonly combatDelayRemainingMs: number;
}
```

```ts
// src/game/progression/ProgressionSystem.ts
import { reachedDuration } from '../constants';
import type { ProgressionContext, ProgressionSnapshot, SkillSelectionRequest } from './ProgressionTypes';

export class ProgressionSystem {
  private snacks = 0;
  private thresholdCursor = 0;
  private combatSinceSelectionMs: number;
  private selectionOpen = false;

  constructor(
    private readonly thresholds: readonly number[],
    private readonly delayMs: number,
  ) {
    if (thresholds.length === 0 || thresholds.some((value, index) => value <= 0 || (index > 0 && value <= thresholds[index - 1]!))) {
      throw new RangeError('Skill thresholds must be positive and strictly ascending');
    }
    if (delayMs < 0) throw new RangeError('Skill delay must be non-negative');
    this.combatSinceSelectionMs = delayMs;
  }

  addSnacks(amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Snacks must be a non-negative integer');
    this.snacks += amount;
  }
  step(stepMs: number, context: ProgressionContext): void {
    if (context.mode === 'playing' && context.activeEnemies > 0) this.combatSinceSelectionMs += stepMs;
  }
  canOpen(): boolean {
    const threshold = this.thresholds.at(this.thresholdCursor);
    return !this.selectionOpen && threshold !== undefined && this.snacks >= threshold && reachedDuration(this.combatSinceSelectionMs, this.delayMs);
  }
  takeNextRequest(): SkillSelectionRequest | undefined {
    if (!this.canOpen()) return undefined;
    const threshold = this.thresholds.at(this.thresholdCursor)!;
    this.selectionOpen = true;
    return { threshold, index: this.thresholdCursor };
  }
  resolveSelection(): void {
    if (!this.selectionOpen) throw new Error('No skill selection is open');
    this.selectionOpen = false;
    this.thresholdCursor += 1;
    this.combatSinceSelectionMs = 0;
  }
  snapshot(): ProgressionSnapshot {
    const dueFromCursor = this.thresholds.slice(this.thresholdCursor).filter((value) => value <= this.snacks).length;
    return {
      snacks: this.snacks,
      nextThreshold: this.thresholds.at(this.thresholdCursor) ?? null,
      pendingCount: Math.max(0, dueFromCursor - Number(this.selectionOpen)),
      selectionOpen: this.selectionOpen,
      combatDelayRemainingMs: Math.max(0, this.delayMs - this.combatSinceSelectionMs),
    };
  }
}
```

첫 threshold는 run 시작부터 delay 충족 상태라 8 snacks 도달 즉시 열린다. 이후에만 5초 combat delay가 적용된다.

- [ ] **Step 3: 서로 다른 세 카드와 새 스킬 보장을 실패 테스트로 고정한다.**

```ts
// tests/unit/SkillCardPicker.test.ts
import { SeededRng } from '../../src/game/core/SeededRng';
import { pickSkillCards } from '../../src/game/progression/SkillCardPicker';
import { skillLevels } from './fixtures';

it('배우지 않은 스킬이 있으면 세 장 중 최소 하나를 해금 카드로 준다', () => {
  const cards = pickSkillCards(skillLevels({ bark: 1 }), new SeededRng(9));
  expect(cards).toHaveLength(3);
  expect(new Set(cards.map((card) => card.id)).size).toBe(3);
  expect(cards.some((card) => card.kind === 'unlock')).toBe(true);
});

it('최대 레벨 항목은 후보에서 제거하고 같은 seed는 같은 결과다', () => {
  const current = skillLevels({ bark: 3, scold: 3, aquaBeam: 1 });
  const a = pickSkillCards(current, new SeededRng(42));
  const b = pickSkillCards(current, new SeededRng(42));
  expect(a).toEqual(b);
  expect(a.every((card) => !['bark', 'scold'].includes(card.skillId))).toBe(true);
});
```

```ts
// src/game/progression/SkillCardPicker.ts
import type { RandomSource } from '../core/SeededRng';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import type { SkillCard, SkillLevels } from '../skills/SkillTypes';

const SKILL_IDS: readonly SkillId[] = ['bark', 'scold', 'aquaBeam', 'deokbaeHowl', 'safetyReport'];
const TITLES: Readonly<Record<SkillId, string>> = {
  bark: '짖기', scold: '호통치기', aquaBeam: '아쿠아빔',
  deokbaeHowl: '덕배 하울링', safetyReport: '안전신문고 신고하기',
};

function shuffle<T>(values: readonly T[], rng: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function cardFor(skillId: SkillId, level: SkillLevel): SkillCard | undefined {
  if (level === 3) return undefined;
  const nextLevel = (level + 1) as Exclude<SkillLevel, 0>;
  const kind = level === 0 ? 'unlock' : 'upgrade';
  return {
    id: `${skillId}:${nextLevel}`,
    skillId,
    nextLevel,
    kind,
    title: kind === 'unlock' ? `${TITLES[skillId]} 배우기` : `${TITLES[skillId]} Lv.${nextLevel}`,
  };
}

export function pickSkillCards(levels: SkillLevels, rng: RandomSource): readonly SkillCard[] {
  const candidates = SKILL_IDS.map((id) => cardFor(id, levels[id])).filter((card): card is SkillCard => card !== undefined);
  const unlocks = candidates.filter((card) => card.kind === 'unlock');
  const selected: SkillCard[] = [];
  if (unlocks.length > 0) selected.push(shuffle(unlocks, rng).at(0)!);
  const remaining = candidates.filter((card) => !selected.some((chosen) => chosen.id === card.id));
  selected.push(...shuffle(remaining, rng).slice(0, 3 - selected.length));
  return selected;
}
```

카드 id는 `${skillId}:${nextLevel}`로 고정한다. 후보가 3개 미만인 마지막 단계에서는 표시 가능한 카드 수만 반환한다. 정상 threshold 5회에서는 매 선택 결과를 적용하며 `pickSkillCards`를 다시 호출해 매번 3장이 나온다는 fixture test를 추가한다.

- [ ] **Step 4: Scene pause가 아닌 mode gate와 카드 modal을 구현한다.**

```ts
// tests/unit/WorldPauseController.test.ts
import { GameStateMachine } from '../../src/game/core/GameStateMachine';
import { WorldPauseController } from '../../src/game/lifecycle/WorldPauseController';

it('selection은 world runtime을 멈추고 countdown 종료만 다시 움직인다', () => {
  const calls: boolean[] = [];
  const controller = new WorldPauseController(new GameStateMachine('playing'), { setPaused: (value) => calls.push(value) });
  controller.openSkillSelection();
  controller.beginCountdown();
  expect(calls).toEqual([true]);
  controller.finishCountdown();
  expect(calls).toEqual([true, false]);
});

it('playing에서 countdown으로 바로 들어가도 world를 멈춘다', () => {
  const calls: boolean[] = [];
  const controller = new WorldPauseController(new GameStateMachine('playing'), { setPaused: (value) => calls.push(value) });
  controller.beginCountdown();
  expect(calls).toEqual([true]);
});
```

Run: `npm run test:unit -- tests/unit/WorldPauseController.test.ts`

Expected first run: `WorldPauseController`와 runtime port가 없어 실패.

```ts
// src/game/lifecycle/WorldPauseController.ts
import { GameStateMachine } from '../core/GameStateMachine';

export interface WorldRuntimePort { setPaused(paused: boolean): void; }
export class WorldPauseController {
  private paused = false;
  constructor(private readonly state: GameStateMachine, private readonly runtime: WorldRuntimePort) {}
  openSkillSelection(): void { this.state.transition('skillSelection'); this.setPaused(true); }
  beginCountdown(): void { this.state.transition('countdown'); this.setPaused(true); }
  finishCountdown(): void { this.state.transition('playing'); this.setPaused(false); }
  private setPaused(value: boolean): void {
    if (this.paused === value) return;
    this.paused = value;
    this.runtime.setPaused(value);
  }
}
```

`GameScene`의 runtime port는 worldAnimationMs와 projectile/effect age 갱신을 막고 Arcade world도 pause한다. PlayerView와 EnemyActor는 frozen snapshot frame을 그대로 다시 그리므로 Phaser wall time으로 frame이 바뀌지 않는다. DOM card와 CountdownOverlay는 이 port에 등록하지 않아 계속 동작한다.

```ts
// tests/unit/UiTransitionClock.test.ts
import { UiTransitionClock } from '../../src/game/ui/UiTransitionClock';

it('countdown만 진행하고 visibility pause에서는 남은 시간을 보존한다', () => {
  const clock = new UiTransitionClock(3000);
  clock.step(1000, 'countdown');
  clock.pause();
  clock.step(10_000, 'visibilityPause');
  expect(clock.remainingMs).toBe(2000);
  clock.resume();
expect(clock.step(2000, 'countdown')).toBe('completed');
});
```

```ts
// src/game/ui/UiTransitionClock.ts
import { subtractDuration } from '../constants';
import type { GameMode } from '../core/GameMode';

export class UiTransitionClock {
  private paused = false;
  constructor(public remainingMs: number) {
    if (remainingMs < 0) throw new RangeError('UI transition duration must be non-negative');
  }
  restart(durationMs: number): void {
    if (durationMs < 0) throw new RangeError('UI transition duration must be non-negative');
    this.remainingMs = durationMs;
    this.paused = false;
  }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  step(stepMs: number, mode: GameMode): 'running' | 'completed' {
    if (this.remainingMs === 0) return 'completed';
    if (this.paused || (mode !== 'countdown' && mode !== 'lost')) return 'running';
    this.remainingMs = subtractDuration(this.remainingMs, stepMs);
    return this.remainingMs === 0 ? 'completed' : 'running';
  }
}
```

`UiTransitionClock`은 countdown과 lost 실패 연출처럼 월드가 멈춘 동안 필요한 전환 시간만 소유한다. 실시간 GameScene과 manual TestBridge는 같은 fixed step마다 이 clock도 호출하되, clock이 paused이거나 mode가 `visibilityPause|skillSelection|won`이면 elapsed를 늘리지 않는다. Phaser wall timer를 직접 사용하지 않는다.

`SkillSelectionModal`은 Scene 위 dim layer, 제목 `간식으로 스킬 배우기`, 서로 다른 세 Phaser DOMElement `<button>` 카드와 44px 이상 pointer 영역을 만든다. 카드 선택은 한 번만 accept하고 즉시 skill level과 좌상단 HUD 모델을 갱신한 뒤 modal을 destroy한다. `CountdownOverlay`는 simulation time이 아니라 UI timer로 `3,2,1`을 표시하지만 WorldPauseController가 3초 동안 world step을 막는다. 새 스킬 cooldown은 countdown 종료 뒤 전체 쿨타임에서 충전을 시작하므로 HUD 진행률은 0%다.

웨이브 종료와 selection이 같은 스텝이면 selection을 먼저 표시한다. 선택 뒤 다음 wave가 대기 중이면 `다음 웨이브 3,2,1` overlay 하나만 사용하고 별도 resume countdown을 만들지 않는다.

- [ ] **Step 5: 브라우저에서 완전 정지·선택·재개를 검증한다.**

```ts
// tests/e2e/skill-selection.spec.ts
import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('간식 8에서 월드가 멈추고 카드 선택 뒤 3초 후 재개한다', async ({ page }) => {
  await openScenario(page, 'skill-selection');
  const frozen = await snapshot(page);
  expect(frozen.mode).toBe('skillSelection');
  expect(new Set(frozen.cards.map((card) => card.id)).size).toBe(3);
  expect(frozen.cards.at(0)).toMatchObject({ skillId: 'bark', nextLevel: 2 });
  await advance(page, 5000);
  expect((await snapshot(page)).enemies).toEqual(frozen.enemies);
  await page.getByRole('button', { name: frozen.cards.at(0)!.title }).click();
  expect((await snapshot(page)).mode).toBe('countdown');
  await advance(page, 2999);
  expect((await snapshot(page)).mode).toBe('countdown');
  await advance(page, 1);
  expect((await snapshot(page)).mode).toBe('playing');
  const hp = (await snapshot(page)).enemies.at(0)!.currentHp;
  await advance(page, 250);
  expect((await snapshot(page)).enemies.at(0)!.currentHp).toBe(hp - 13);
});
```

테스트 브리지에 `'skill-selection'`, cards, skill levels, cooldown progress를 추가한다. factory는 첫 카드를 `bark:2`로 고정하고 HP 1000인 유효 사거리 target 한 명을 둔다. 카드 선택·`SkillSystem.levelUp`·`BarkSystem.setLevel`·실제 자동 짖기까지는 production `GameSession.selectCard` 경로를 그대로 사용한다. manual clock에서는 CountdownOverlay도 bridge clock으로 진행해 wall clock sleep을 쓰지 않는다.

Run: `npm run test:unit -- tests/unit/ProgressionSystem.test.ts tests/unit/SkillCardPicker.test.ts tests/unit/WorldPauseController.test.ts tests/unit/UiTransitionClock.test.ts && npm run test:e2e -- tests/e2e/skill-selection.spec.ts`

Expected: 월드 상태 freeze, distinct cards, 3초 정확한 재개가 통과.

- [ ] **Step 6: Task 10을 커밋한다.**

```bash
git add src/game/progression src/game/skills/SkillTypes.ts src/game/ui/SkillSelectionModal.ts src/game/ui/CountdownOverlay.ts src/game/ui/UiTransitionClock.ts src/game/lifecycle/WorldPauseController.ts src/game/session src/game/scenes/GameScene.ts src/game/debug tests
git commit -m "feat: add snack skill selection"
```

---

### Task 11: 네 자동 스킬과 좌상단 소형 HUD

**Files:**
- Modify: `src/game/skills/SkillTypes.ts`
- Create: `src/game/skills/skillDefinitions.ts`
- Create: `src/game/skills/SkillSystem.ts`
- Create: `src/game/skills/SpatialBucketTargeting.ts`
- Create: `src/game/ui/HudSystem.ts`
- Create: `src/game/ui/TopHud.ts`
- Create: `src/game/ui/SkillHud.ts`
- Modify: `src/game/combat/TargetingSystem.ts`
- Modify: `src/game/enemies/EnemySystem.ts`
- Modify: `src/game/player/PlayerView.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `tests/unit/fixtures.ts`
- Test: `tests/unit/SkillSystem.test.ts`
- Test: `tests/unit/SpatialBucketTargeting.test.ts`
- Test: `tests/unit/SkillHudModel.test.ts`
- Modify: `tests/e2e/skill-selection.spec.ts`

**Interfaces:**
- Consumes: skill levels/cooldowns, player/enemy/path snapshots, fixed step
- Produces: scold cone+knockback, piercing beam, Deokbae AoE, safety damage+stun, 32×32 auto-cast slots

```ts
// tests/unit/fixtures.ts에 Task 11에서 추가
// 파일 상단 imports에도 다음을 추가한다.
import type { SkillId } from '../../src/game/types/GameTypes';
import { SkillSystem, type SkillContext } from '../../src/game/skills/SkillSystem';

export function learnedSkillSystem(id: Exclude<SkillId, 'bark'>): SkillSystem {
  const initial = skillLevels({ [id]: 1 } as Partial<SkillLevels>);
  return new SkillSystem(initial);
}
export const emptySkillContext = (): SkillContext => ({ player: { x: 270, y: 600 }, enemies: [] });
export const candidateAt = (x: number, y: number, etaMs: number, overrides: Partial<EnemySnapshot> = {}) =>
  enemy({ position: { x, y }, etaMs, ...overrides });
```

- [ ] **Step 1: 정확한 레벨 계산과 target 부재 ready 유지 테스트를 작성한다.**

```ts
// tests/unit/SkillSystem.test.ts
import {
  resolveBeamCommands, resolveHowlCommands, resolveSafetyCommand, resolveScoldCommands,
  resolveSkillStats,
} from '../../src/game/skills/SkillSystem';
import type { SkillId, SkillLevel } from '../../src/game/types/GameTypes';
import { candidateAt, emptySkillContext, learnedSkillSystem } from './fixtures';

it.each([
  ['scold', 2, { damage: 25, cooldownMs: 8000 }],
  ['aquaBeam', 2, { damage: 40, cooldownMs: 9000 }],
  ['deokbaeHowl', 2, { damage: 56, cooldownMs: 14000 }],
  ['safetyReport', 2, { damage: 113, cooldownMs: 20000 }],
  ['scold', 3, { damage: 25, cooldownMs: 6400, distance: 138, knockback: 34 }],
])('%s level %i 계산', (id, level, expected) => {
  expect(resolveSkillStats(id as Exclude<SkillId, 'bark'>, level as SkillLevel)).toMatchObject(expected);
});

it('대상이 없으면 ready 상태를 유지하고 cooldown을 소비하지 않는다', () => {
  const system = learnedSkillSystem('aquaBeam');
  system.step(9000, emptySkillContext());
  expect(system.snapshot('aquaBeam')).toMatchObject({ ready: true, cooldownRemainingMs: 0 });
});

it('쿨타임 감소 강화는 현재 충전 비율을 보존한다', () => {
  const system = learnedSkillSystem('scold');
  system.setCooldownProgressForTest('scold', 0.5);
  system.levelUp('scold');
  system.levelUp('scold');
  expect(system.snapshot('scold').cooldownRemainingMs).toBe(3200);
});

it('자동 방향은 스킬 사거리 안 위협만 고르고 동률이면 player 거리까지 공통 정렬한다', () => {
  const system = learnedSkillSystem('scold');
  const casts = system.step(8000, {
    player: { x: 0, y: 0 },
    enemies: [
      candidateAt(500, 0, 10, { id: 1, spawnSequence: 0 }),
      candidateAt(0, 100, 20, { id: 2, spawnSequence: 2 }),
      candidateAt(80, 0, 20, { id: 3, spawnSequence: 3 }),
    ],
  });
  expect(casts.at(0)?.targetIds).toEqual([3]);
  expect(system.snapshot('scold').ready).toBe(false);
});

it('player와 같은 좌표의 적도 zero-vector 예외 없이 직접 맞힌다', () => {
  const system = learnedSkillSystem('aquaBeam');
  expect(system.step(9000, { player: { x: 10, y: 10 }, enemies: [candidateAt(10, 10, 1, { id: 9 })] }).at(0)?.targetIds)
    .toContain(9);
});
```

Run: `npm run test:unit -- tests/unit/SkillSystem.test.ts`

Expected: skill 모듈 부재로 실패.

- [ ] **Step 2: single-source skill definitions와 cooldown state를 구현한다.**

```ts
// src/game/skills/skillDefinitions.ts
export const SKILL_DEFINITIONS = {
  scold: { cooldownMs: 8000, damage: 20, angleDeg: 70, distance: 115, knockback: 28 },
  aquaBeam: { cooldownMs: 9000, damage: 32, length: 250, width: 22 },
  deokbaeHowl: { cooldownMs: 14000, damage: 45, radius: 80, bucketSize: 80 },
  safetyReport: { cooldownMs: 20000, damage: 90, regularStunMs: 3000, bossStunMs: 1500 },
} as const;
```

```ts
// src/game/skills/SkillSystem.ts
import { reachedDuration, subtractDuration } from '../constants';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import { distance, type Point } from '../world/Geometry';
import type { SkillLevels } from './SkillTypes';
import { SKILL_DEFINITIONS } from './skillDefinitions';
import { chooseHowlCenter } from './SpatialBucketTargeting';
import { rankThreatTargets, selectThreatTarget } from '../combat/TargetingSystem';

type AutoSkillId = Exclude<SkillId, 'bark'>;
export interface SkillContext { readonly player: Point; readonly enemies: readonly EnemySnapshot[]; }
export interface SkillSnapshot { readonly level: SkillLevel; readonly cooldownRemainingMs: number; readonly ready: boolean; }
export interface SkillHit { readonly targetId: number; readonly damage: number; readonly nextPathProgress?: number; readonly stunMs?: number; }
export interface SkillCastCommand { readonly type: 'skillCast'; readonly skillId: AutoSkillId; readonly targetIds: readonly number[]; readonly hits: readonly SkillHit[]; readonly center?: Point; }

export function resolveSkillStats(id: AutoSkillId, level: SkillLevel): Record<string, number> {
  if (level < 1) throw new RangeError(`${id} is not learned`);
  const base = SKILL_DEFINITIONS[id];
  const damage = Math.round(base.damage * (level >= 2 ? 1.25 : 1));
  const cooldownMs = Math.round(base.cooldownMs * (level >= 3 ? 0.8 : 1));
  if (id === 'scold') return { damage, cooldownMs, angleDeg: 70, distance: level >= 3 ? 138 : 115, knockback: level >= 3 ? 34 : 28 };
  if (id === 'aquaBeam') return { damage, cooldownMs, length: level >= 3 ? 300 : 250, width: level >= 3 ? 26.4 : 22 };
  if (id === 'deokbaeHowl') return { damage, cooldownMs, radius: level >= 3 ? 96 : 80, bucketSize: 80 };
  return { damage, cooldownMs, regularStunMs: level >= 3 ? 3600 : 3000, bossStunMs: level >= 3 ? 1800 : 1500 };
}

const normalized = (vector: Point): Point => {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) throw new RangeError('Direction must be non-zero');
  return { x: vector.x / length, y: vector.y / length };
};
const alive = (enemies: readonly EnemySnapshot[]) => enemies.filter((enemy) => enemy.state !== 'dead');
const directionTo = (origin: Point, target: Point): Point => {
  const direction = { x: target.x - origin.x, y: target.y - origin.y };
  return direction.x === 0 && direction.y === 0 ? { x: 0, y: -1 } : direction;
};

export function resolveScoldCommands(origin: Point, direction: Point, enemies: readonly EnemySnapshot[], level: SkillLevel): readonly SkillHit[] {
  const stats = resolveSkillStats('scold', level); const unit = normalized(direction); const minDot = Math.cos(35 * Math.PI / 180);
  return alive(enemies).filter((enemy) => {
    const offset = { x: enemy.position.x - origin.x, y: enemy.position.y - origin.y };
    const length = Math.hypot(offset.x, offset.y);
    return length <= stats.distance! && (length === 0 || (offset.x * unit.x + offset.y * unit.y) / length >= minDot);
  }).sort((a, b) => a.spawnSequence - b.spawnSequence).map((enemy) => {
    const knockback = enemy.isBoss ? Math.round(stats.knockback! / 2) : stats.knockback!;
    return { targetId: enemy.id, damage: stats.damage!, nextPathProgress: Math.max(0, enemy.pathProgress - knockback) };
  });
}

export function resolveBeamCommands(origin: Point, direction: Point, enemies: readonly EnemySnapshot[], level: SkillLevel): readonly SkillHit[] {
  const stats = resolveSkillStats('aquaBeam', level); const unit = normalized(direction);
  return alive(enemies).filter((enemy) => {
    const dx = enemy.position.x - origin.x; const dy = enemy.position.y - origin.y;
    const along = dx * unit.x + dy * unit.y;
    const perpendicular = Math.abs(dx * unit.y - dy * unit.x);
    return along >= 0 && along <= stats.length! + 1e-9 && perpendicular <= stats.width! / 2 + 1e-9;
  }).sort((a, b) => a.spawnSequence - b.spawnSequence)
    .map((enemy) => ({ targetId: enemy.id, damage: stats.damage! }));
}

export function resolveHowlCommands(center: Point, enemies: readonly EnemySnapshot[], level: SkillLevel): readonly SkillHit[] {
  const stats = resolveSkillStats('deokbaeHowl', level);
  return alive(enemies).filter((enemy) => distance(center, enemy.position) <= stats.radius! + 1e-9)
    .sort((a, b) => a.spawnSequence - b.spawnSequence).map((enemy) => ({ targetId: enemy.id, damage: stats.damage! }));
}

export function resolveSafetyCommand(origin: Point, enemies: readonly EnemySnapshot[], level: SkillLevel): SkillHit | undefined {
  const target = rankThreatTargets(origin, enemies).at(0); if (target === undefined) return undefined;
  const stats = resolveSkillStats('safetyReport', level);
  return { targetId: target.id, damage: stats.damage!, stunMs: target.isBoss ? stats.bossStunMs! : stats.regularStunMs! };
}

export class SkillSystem {
  private readonly levels: Record<SkillId, SkillLevel>;
  private readonly remaining = new Map<AutoSkillId, number>();
  constructor(levels: SkillLevels) {
    this.levels = { ...levels };
    for (const id of ['scold', 'aquaBeam', 'deokbaeHowl', 'safetyReport'] as const) {
      if (levels[id] > 0) this.remaining.set(id, resolveSkillStats(id, levels[id]).cooldownMs!);
    }
  }
  step(stepMs: number, context: SkillContext): readonly SkillCastCommand[] {
    const commands: SkillCastCommand[] = [];
    for (const id of ['scold', 'aquaBeam', 'deokbaeHowl', 'safetyReport'] as const) {
      const level = this.levels[id]; if (level === 0) continue;
      const remaining = subtractDuration(this.remaining.get(id) ?? 0, stepMs); this.remaining.set(id, remaining);
      if (!reachedDuration(0, remaining)) continue;
      let center: Point | undefined; let hits: readonly SkillHit[];
      if (id === 'scold') {
        const threat = selectThreatTarget(context.player, context.enemies, resolveSkillStats(id, level).distance!);
        hits = threat === undefined ? [] : resolveScoldCommands(context.player, directionTo(context.player, threat.position), context.enemies, level);
      }
      else if (id === 'aquaBeam') {
        const threat = selectThreatTarget(context.player, context.enemies, resolveSkillStats(id, level).length!);
        hits = threat === undefined ? [] : resolveBeamCommands(context.player, directionTo(context.player, threat.position), context.enemies, level);
      }
      else if (id === 'deokbaeHowl') { center = chooseHowlCenter(context.enemies, 80, { width: 540, height: 960 }); hits = center === undefined ? [] : resolveHowlCommands(center, context.enemies, level); }
      else { const hit = resolveSafetyCommand(context.player, context.enemies, level); hits = hit === undefined ? [] : [hit]; }
      if (hits.length === 0) continue;
      this.remaining.set(id, resolveSkillStats(id, level).cooldownMs!);
      commands.push({ type: 'skillCast', skillId: id, targetIds: hits.map((hit) => hit.targetId), hits, ...(center === undefined ? {} : { center }) });
    }
    return commands;
  }
  levelUp(id: SkillId): void {
    const current = this.levels[id]; if (current >= 3) throw new RangeError(`${id} is already max level`);
    const next = (current + 1) as SkillLevel; this.levels[id] = next;
    if (id === 'bark') return;
    const oldFull = current === 0 ? 0 : resolveSkillStats(id, current).cooldownMs!;
    const ratioRemaining = oldFull === 0 ? 1 : (this.remaining.get(id) ?? 0) / oldFull;
    this.remaining.set(id, resolveSkillStats(id, next).cooldownMs! * ratioRemaining);
  }
  snapshot(id: SkillId): SkillSnapshot {
    const level = this.levels[id]; const cooldownRemainingMs = id === 'bark' ? 0 : this.remaining.get(id) ?? 0;
    return { level, cooldownRemainingMs, ready: level > 0 && reachedDuration(0, cooldownRemainingMs) };
  }
  setCooldownProgressForTest(id: AutoSkillId, chargedRatio: number): void {
    const level = this.levels[id]; if (level === 0) throw new Error(`${id} is not learned`);
    this.remaining.set(id, resolveSkillStats(id, level).cooldownMs! * (1 - Math.min(1, Math.max(0, chargedRatio))));
  }
}
```

새 해금은 `cooldownRemainingMs = fullCooldown`; countdown과 pause 중에는 `SkillSystem.step`을 호출하지 않는다. 한 cast의 target id 배열은 spawnSequence 순이며 GameSession이 hit command를 damage/knockback/stun에 적용한다.

- [ ] **Step 3: 공간 버킷 동률·중심·맵 clamp 테스트를 작성한다.**

```ts
// tests/unit/SpatialBucketTargeting.test.ts
import { chooseHowlCenter } from '../../src/game/skills/SpatialBucketTargeting';
import { candidateAt } from './fixtures';

it('80×80 최다 버킷을 고르고 동률이면 최소 ETA 적이 있는 버킷을 택한다', () => {
  const result = chooseHowlCenter([
    candidateAt(10, 10, 900), candidateAt(20, 20, 800),
    candidateAt(410, 810, 200), candidateAt(420, 820, 300),
  ], 80, { width: 540, height: 960 });
  expect(result).toEqual({ x: 415, y: 815 });
});
```

`chooseHowlCenter`는 살아 있는 적 중심을 `floor(x/80),floor(y/80)`로 group하고 count 내림차순, bucket 최소 ETA 오름차순, bucket y, x 순으로 안정 정렬한다. 선택 버킷 적들의 평균 위치를 내고 `[0,540]×[0,960]`으로 clamp한다.

```ts
// src/game/skills/SpatialBucketTargeting.ts
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import { clamp, type Point } from '../world/Geometry';

export function chooseHowlCenter(
  enemies: readonly EnemySnapshot[],
  bucketSize: number,
  bounds: { readonly width: number; readonly height: number },
): Point | undefined {
  const groups = new Map<string, { x: number; y: number; enemies: EnemySnapshot[] }>();
  for (const enemy of enemies) {
    if (enemy.state === 'dead') continue;
    const x = Math.floor(enemy.position.x / bucketSize); const y = Math.floor(enemy.position.y / bucketSize);
    const key = `${x}:${y}`; const group = groups.get(key) ?? { x, y, enemies: [] };
    group.enemies.push(enemy); groups.set(key, group);
  }
  const selected = [...groups.values()].sort((left, right) =>
    right.enemies.length - left.enemies.length ||
    Math.min(...left.enemies.map((enemy) => enemy.etaMs)) - Math.min(...right.enemies.map((enemy) => enemy.etaMs)) ||
    left.y - right.y || left.x - right.x,
  ).at(0);
  if (selected === undefined) return undefined;
  return {
    x: clamp(selected.enemies.reduce((sum, enemy) => sum + enemy.position.x, 0) / selected.enemies.length, 0, bounds.width),
    y: clamp(selected.enemies.reduce((sum, enemy) => sum + enemy.position.y, 0) / selected.enemies.length, 0, bounds.height),
  };
}
```

- [ ] **Step 4: 각 스킬의 순수 판정과 path-progress knockback을 구현한다.**

먼저 geometry/effect RED tests를 추가한다.

```ts
// tests/unit/SkillSystem.test.ts 추가
it('호통 level3은 70도·138 범위 안만 때리고 normal 34, boss 17 progress를 되돌린다', () => {
  const hits = resolveScoldCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, [
    candidateAt(100, 0, 100, { id: 1, pathProgress: 100 }),
    candidateAt(100, 20, 100, { id: 2, pathProgress: 100, isBoss: true }),
    candidateAt(0, 100, 100, { id: 3, pathProgress: 100 }),
  ], 3);
  expect(hits).toEqual([
    { targetId: 1, damage: 25, nextPathProgress: 66 },
    { targetId: 2, damage: 25, nextPathProgress: 83 },
  ]);
});

it('아쿠아빔은 level1 길이250·폭22, level3 폭26.4의 선분 안을 관통한다', () => {
  const enemies = [
    candidateAt(200, 0, 100, { id: 1 }), candidateAt(200, 11, 100, { id: 2 }),
    candidateAt(200, 11.1, 100, { id: 3 }), candidateAt(251, 0, 100, { id: 4 }),
    candidateAt(200, 13.2, 100, { id: 5 }),
  ];
  expect(resolveBeamCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, enemies, 1).map((hit) => hit.targetId)).toEqual([1, 2]);
  expect(resolveBeamCommands({ x: 0, y: 0 }, { x: 1, y: 0 }, enemies, 3).map((hit) => hit.targetId)).toEqual([1, 2, 3, 4, 5]);
});

it('하울링 반경은 level1 80, level3 96이고 경계는 포함한다', () => {
  const enemies = [candidateAt(180, 100, 100, { id: 1 }), candidateAt(196, 100, 100, { id: 2 }), candidateAt(196.1, 100, 100, { id: 3 })];
  expect(resolveHowlCommands({ x: 100, y: 100 }, enemies, 1).map((hit) => hit.targetId)).toEqual([1]);
  expect(resolveHowlCommands({ x: 100, y: 100 }, enemies, 3).map((hit) => hit.targetId)).toEqual([1, 2]);
});

it('안전신문고는 최소 ETA 하나에 damage와 일반·boss stun을 정확히 적용한다', () => {
  expect(resolveSafetyCommand({ x: 0, y: 0 }, [
    candidateAt(0, 0, 100, { id: 1 }), candidateAt(0, 0, 200, { id: 2, isBoss: true }),
  ], 1)).toEqual({ targetId: 1, damage: 90, stunMs: 3000 });
  expect(resolveSafetyCommand({ x: 0, y: 0 }, [candidateAt(0, 0, 100, { id: 2, isBoss: true })], 3))
    .toEqual({ targetId: 2, damage: 113, stunMs: 1800 });
});
```

Run: `npm run test:unit -- tests/unit/SkillSystem.test.ts`

Expected first run: 네 resolver가 없어 실패. 아래 판정을 구현한 뒤 통과시킨다.

- scold: 가장 위협적인 적 방향의 70도 cone 안, 거리 115/138의 모든 적에게 damage. `EnemySystem.knockBack(id, boss ? round(distance/2) : distance)`로 progress만 되돌리고 position을 재계산한다.
- aquaBeam: player에서 가장 위협적인 적 방향으로 length 250/300, half width 11/13.2 선분을 만들고 점-선분 거리가 폭 이하인 모든 적에게 관통 damage.
- deokbaeHowl: spatial bucket 중심 반경 80/96 안 모든 적에게 damage.
- safetyReport: 최소 ETA 적 하나에게 damage와 regular 3000/3600ms 또는 boss 1500/1800ms stun.

각 system은 cooldown ready일 때 유효 target이 있어야 `skillCast` event를 내고 그 시점부터 full cooldown으로 재설정한다. 한 cast의 target id 배열은 spawnSequence 순으로 고정한다.

- [ ] **Step 5: 소형 자동 스킬 HUD와 시각 효과를 구현한다.**

```ts
// src/game/ui/SkillHud.ts의 layout 계약
import type { SkillId, SkillLevel } from '../types/GameTypes';

export const SKILL_SLOT = { x: 12, y: 92, size: 32, iconMax: 28, gap: 4, fontPx: 9 } as const;
export const skillSlotY = (index: number) => SKILL_SLOT.y + index * (SKILL_SLOT.size + SKILL_SLOT.gap);
export interface SkillSlotModel { readonly id: SkillId; readonly level: SkillLevel; readonly x: 12; readonly y: number; readonly width: 32; readonly height: 32; }
export function buildSkillSlots(
  learnedOrder: readonly Exclude<SkillId, 'bark'>[],
  levels: Readonly<Record<SkillId, SkillLevel>>,
): readonly SkillSlotModel[] {
  const ids: SkillId[] = ['bark', ...learnedOrder.filter((id) => levels[id] > 0)];
  return ids.map((id, index) => ({ id, level: levels[id], x: 12, y: skillSlotY(index), width: 32, height: 32 }));
}
```

```ts
// tests/unit/SkillHudModel.test.ts
import { buildSkillSlots } from '../../src/game/ui/SkillHud';
import { skillLevels } from './fixtures';

it('bark를 첫 칸에 고정하고 배운 순서만 32px 슬롯으로 배치한다', () => {
  const slots = buildSkillSlots(['aquaBeam', 'scold', 'deokbaeHowl'], skillLevels({ aquaBeam: 1, scold: 2 }));
  expect(slots.map((slot) => slot.id)).toEqual(['bark', 'aquaBeam', 'scold']);
  expect(slots.map((slot) => [slot.x, slot.y, slot.width, slot.height])).toEqual([
    [12, 92, 32, 32], [12, 128, 32, 32], [12, 164, 32, 32],
  ]);
});
```

첫 슬롯은 bark 고정, 배운 스킬은 습득 순서대로 아래에 추가한다. 각 슬롯은 32×32, 내부 icon 최대 28×28, 원형 cooldown mask와 9px 남은 초만 표시하며 interactive로 만들지 않는다. 새 스킬은 0%로 시작한다. `TopHud`는 shelter HP, `WAVE n/5`, 누적 snack을 한 줄로 표시한다.

아이콘은 Boot에서 Phaser Graphics로 bark·speech cone·water beam·dog howl·report sheet를 각각 한 번만 `28×28` texture로 생성해 cache한다. 전투 중 Graphics texture를 새로 만들지 않는다.

시각 효과:

- scold: target 방향 부채꼴 outline/fade
- aquaBeam: 길이와 폭이 판정과 같은 청록 beam, 180ms
- howl: 덕배 표시 높이 64, frames 4~7 8fps one-shot, 선택 중심 ring
- safety: 신고서 아이콘 낙하와 일반/보스 stun stars

모든 effect는 120개 pool 안에서 재사용하고 Huchu 이동을 막지 않는다.

- [ ] **Step 6: 네 스킬 자동 시전과 HUD를 E2E로 검증한다.**

```ts
// tests/e2e/skill-selection.spec.ts 추가
// 기존 helpers import를 다음으로 교체한다.
import { advance, events, openScenario, snapshot } from './helpers';

test('배운 네 스킬이 대상이 생길 때 자동 시전되고 좌상단에 작게 표시된다', async ({ page }) => {
  await openScenario(page, 'all-skills');
  await advance(page, 20_000);
  const castTypes = (await events(page)).filter((event) => event.type === 'skillCast').map((event) => event.skillId);
  expect(new Set(castTypes)).toEqual(new Set(['scold', 'aquaBeam', 'deokbaeHowl', 'safetyReport']));
  const boxes = (await snapshot(page)).hud.skillSlots;
  expect(boxes).toHaveLength(5);
  expect(boxes.every((box) => box.width <= 32 && box.height <= 32)).toBe(true);
});
```

테스트 브리지에 `'all-skills'`, skill snapshots와 cast events를 추가하고 `GameDebugEvent` union에 `{type:'skillCast', skillId, targetIds}`를 추가한다. 이 scenario는 네 스킬을 level 1로 배운 상태, 후추 주변의 서로 다른 유효 방향·버킷에 HP 10,000인 일반 적 4명과 boss 1명을 배치한다. 적은 20초 동안 shelter attackProgress 앞에서 이동을 멈추지만 자동 스킬 피해는 정상 적용하므로 모든 cooldown과 targeting을 실제 코드로 거친다. 합산 피해보다 HP가 높아 safetyReport를 포함한 네 번째 스킬까지 target이 사라지지 않는다.

Run: `npm run test:unit -- tests/unit/SkillSystem.test.ts tests/unit/SpatialBucketTargeting.test.ts tests/unit/SkillHudModel.test.ts && npm run test:e2e -- tests/e2e/skill-selection.spec.ts`

Expected: 레벨·대상·cooldown·HUD 계약 통과.

- [ ] **Step 7: Task 11을 커밋한다.**

```bash
git add src/game/skills src/game/ui/HudSystem.ts src/game/ui/TopHud.ts src/game/ui/SkillHud.ts src/game/combat/TargetingSystem.ts src/game/enemies/EnemySystem.ts src/game/player/PlayerView.ts src/game/session src/game/scenes/GameScene.ts src/game/debug tests
git commit -m "feat: add automatic skills and hud"
```

---

### Task 12: 보스·5웨이브 완주·승패·재시작

**Files:**
- Create: `src/game/ui/BossHud.ts`
- Modify: `src/game/waves/WaveSystem.ts`
- Modify: `src/game/session/RunOutcomeResolver.ts`
- Modify: `src/game/session/RunSnapshot.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/events/GameEvents.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/scenes/ResultScene.ts`
- Modify: `src/game/ui/CountdownOverlay.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Modify: `src/game/debug/ScenarioSessionPort.ts`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `tests/unit/RunOutcomeResolver.test.ts`
- Test: `tests/unit/RunFactory.test.ts`
- Test: `tests/unit/SimulationResolution.test.ts`
- Test: `tests/e2e/full-run.spec.ts`

**Interfaces:**
- Consumes: wave pending/active counts, shelter HP, boss snapshot, restart command
- Produces: 3초 wave transition, boss top bar, won/lost 단 한 번, 1.2초 failed hold, 완전 초기화 run

- [ ] **Step 1: 웨이브 종료·동시 조건·재시작 초기화 실패 테스트를 작성한다.**

```ts
// tests/unit/RunOutcomeResolver.test.ts 추가
it('비최종 wave clear와 skill due가 겹치면 skill을 열고 단일 next-wave countdown을 예약한다', () => {
  expect(resolvePostStep({ shelterHp: 10, wave: 2, active: 0, pending: 0, skillDue: true }))
    .toEqual({ mode: 'skillSelection', nextWave: 3, countdownKind: 'nextWave' });
});

// tests/unit/RunFactory.test.ts
import { GameSession } from '../../src/game/session/GameSession';

it('reset은 모든 run state와 풀 active count를 초기화한다', () => {
  const run = GameSession.create({ seed: 7 });
  for (let step = 0; step < 180; step += 1) run.step(1000 / 60, { x: 0, y: 960 });
  expect(run.snapshot().activeEnemyCount).toBeGreaterThan(0);
  run.reset(424242);
  expect(run.snapshot()).toMatchObject({
    mode: 'playing', wave: 1, shelterHp: 100, snacks: 0,
    skills: { bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0 },
    activeEnemyCount: 0, activeProjectileCount: 0,
  });
});

it('세 번 reset해도 같은 projectile pool의 80개 capacity를 재사용한다', () => {
  const run = GameSession.create({ seed: 1 });
  const initial = run.projectilePoolTelemetry();
  for (let reset = 0; reset < 3; reset += 1) run.reset(reset + 2);
  expect(run.projectilePoolTelemetry()).toEqual(initial);
  expect(initial).toMatchObject({ created: 80, active: 0, available: 80 });
});
```

Run: `npm run test:unit -- tests/unit/RunOutcomeResolver.test.ts tests/unit/RunFactory.test.ts`

Expected: full-run post-step/reset 계약이 없어 실패.

- [ ] **Step 2: 정확한 후처리 순서와 웨이브 전환을 GameSession에 구현한다.**

```ts
// src/game/waves/WaveSystem.ts에 Task 12에서 추가
private pendingNextWave: number | null = null;

setPendingNext(waveNumber: number): void {
  if (waveNumber !== this.current + 1 || waveNumber > this.definitions.length) {
    throw new RangeError(`Invalid next wave ${waveNumber} after ${this.current}`);
  }
  if (this.pendingNextWave !== null && this.pendingNextWave !== waveNumber) {
    throw new Error(`Wave ${this.pendingNextWave} is already pending`);
  }
  this.pendingNextWave = waveNumber;
}
get pendingNext(): number | null { return this.pendingNextWave; }
startPendingNext(): number {
  if (this.pendingNextWave === null) throw new Error('No next wave is pending');
  const waveNumber = this.pendingNextWave;
  this.pendingNextWave = null;
  this.start(waveNumber);
  return waveNumber;
}
```

Task 6의 임시 `RunSnapshot`과 `GameSession`을 아래 최종 형태로 교체한다. 결정성 비교용 snapshot은 count만 보지 않고 적·투사체·쿨타임의 내부 규칙 상태까지 포함한다.

```ts
// src/game/session/RunSnapshot.ts (최종)
import type { GameMode } from '../core/GameMode';
import type { BarkSystem } from '../combat/BarkSystem';
import type { ProjectileSnapshot } from '../combat/ProjectileSystem';
import type { EnemySnapshot } from '../enemies/EnemyTypes';
import type { SkillSnapshot } from '../skills/SkillSystem';
import type { SkillId, SkillLevel } from '../types/GameTypes';

export interface RunSnapshot {
  readonly mode: GameMode;
  readonly simulationMs: number;
  readonly wave: number;
  readonly pendingSpawns: number;
  readonly activeEnemyCount: number;
  readonly activeProjectileCount: number;
  readonly shelterHp: number;
  readonly snacks: number;
  readonly skills: Readonly<Record<SkillId, SkillLevel>>;
  readonly skillStates: Readonly<Record<SkillId, SkillSnapshot>>;
  readonly barkState: ReturnType<BarkSystem['snapshot']>;
  readonly enemies: readonly EnemySnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
}
```

subsystem event를 별도 untyped bus로 복사하지 않고 final `GameEvent` union으로 합성한다.

```ts
// src/game/events/GameEvents.ts (최종 union)
import type { BarkEvent } from '../combat/BarkSystem';
import type { EnemyAttackEvent } from '../combat/EnemyAttackSystem';
import type { ProjectileEvent } from '../combat/ProjectileSystem';
import type { GameMode } from '../core/GameMode';
import type { EnemyLifecycleEvent } from '../enemies/EnemySystem';
import type { SkillSelectionRequest } from '../progression/ProgressionTypes';
import type { ShelterDamageEvent } from '../shelter/ShelterSystem';
import type { SkillCastCommand } from '../skills/SkillSystem';
import type { SkillCard } from '../skills/SkillTypes';
import type { SkillId, SkillLevel } from '../types/GameTypes';
import type { EnemySpawnRequest } from '../waves/WaveTypes';

export type GameEvent =
  | BarkEvent | EnemyAttackEvent | ProjectileEvent | EnemyLifecycleEvent | ShelterDamageEvent | SkillCastCommand
  | { readonly type: 'modeChanged'; readonly mode: GameMode }
  | { readonly type: 'runEnded' | 'resultReady'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'enemySpawnRequested'; readonly request: EnemySpawnRequest }
  | { readonly type: 'enemySpawned'; readonly enemyId: number; readonly request: EnemySpawnRequest }
  | { readonly type: 'waveStarted'; readonly wave: number }
  | { readonly type: 'waveTransition'; readonly fromWave: number; readonly toWave: number; readonly countdownMs: 3000 }
  | { readonly type: 'skillLearned'; readonly skillId: SkillId; readonly level: SkillLevel }
  | { readonly type: 'skillSelectionOpened'; readonly request: SkillSelectionRequest; readonly cards: readonly SkillCard[] };
```

Task 12 시점에 `GameSession`이 import하는 scenario port도 먼저 완성한다. Task 5의 `ScenarioEnemySeed` 골격을 다음 계약으로 교체하고, Task 14에서는 pool telemetry 한 항목만 확장한다.

```ts
// src/game/debug/ScenarioSessionPort.ts (Task 12 상태)
import type { ProjectileSpawn } from '../combat/ProjectileSystem';
import type { GameMode } from '../core/GameMode';
import type { GameEvent } from '../events/GameEvents';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { SkillCard, SkillLevels } from '../skills/SkillTypes';
import type { EnemyKind, EnemyState, EnemyVariant, PathId } from '../types/GameTypes';

export interface ScenarioEnemySeed {
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
  readonly pathId: PathId;
  readonly placement: { readonly kind: 'attackBoundary' } | { readonly kind: 'worldPoint'; readonly x: number; readonly y: number };
  readonly currentHp?: number;
  readonly maxHp?: number;
  readonly state?: EnemyState;
  readonly stunnedMs?: number;
}

export interface ScenarioSessionPort {
  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[];
  snapshot(): RunSnapshot;
  selectCard(cardId: string): readonly GameEvent[];
  drainEvents(): readonly GameEvent[];
  reset(seed: number): void;
  useWaveSchedule(wave: number, schedule: 'real' | 'held' | 'exhausted'): void;
  replaceShelter(currentHp: number, maxHp?: number): void;
  damageShelter(damage: number): void;
  replaceSkills(levels: SkillLevels, learnedOrder: readonly Exclude<keyof SkillLevels, 'bark'>[]): void;
  setSnacks(snacks: number): void;
  replaceCards(cards: readonly SkillCard[]): void;
  spawnEnemy(seed: ScenarioEnemySeed): number;
  spawnProjectile(seed: ProjectileSpawn): void;
  removeEnemyWithoutReward(enemyId: number): void;
  enterMode(mode: GameMode, uiRemainingMs?: number): void;
  projectilePoolTelemetry?(): PoolSnapshot;
}
```

```ts
// src/game/session/GameSession.ts (Task 12 조립; Task 14에서 telemetry port만 확장)
import { BarkSystem } from '../combat/BarkSystem';
import { CombatSystem, type DamageCommand } from '../combat/CombatSystem';
import { EnemyAttackSystem } from '../combat/EnemyAttackSystem';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { selectThreatTarget } from '../combat/TargetingSystem';
import { FIXED_STEP_MS, TIME_EPSILON_MS, simulationMsFromTicks } from '../constants';
import { GameStateMachine } from '../core/GameStateMachine';
import { SeededRng } from '../core/SeededRng';
import { BALANCE } from '../data/balance';
import { WAVE_DEFINITIONS } from '../data/waveDefinitions';
import { EnemySystem } from '../enemies/EnemySystem';
import type { GameEvent } from '../events/GameEvents';
import type { ScenarioSessionPort } from '../debug/ScenarioSessionPort';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import { ProgressionSystem } from '../progression/ProgressionSystem';
import { pickSkillCards } from '../progression/SkillCardPicker';
import type { SkillSelectionRequest } from '../progression/ProgressionTypes';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import { ShelterSystem, shelterVisualState } from '../shelter/ShelterSystem';
import { SkillSystem, type SkillHit } from '../skills/SkillSystem';
import type { SkillCard, SkillLevels } from '../skills/SkillTypes';
import type { EnemyKind, SkillId } from '../types/GameTypes';
import { UiTransitionClock } from '../ui/UiTransitionClock';
import { WaveSystem } from '../waves/WaveSystem';
import { RunOutcomeResolver } from './RunOutcomeResolver';
import type { RunSnapshot } from './RunSnapshot';

type UiTransitionKind = 'resumeCombat' | 'nextWave' | 'lostResult' | null;
const INITIAL_SKILLS: SkillLevels = {
  bark: 1, scold: 0, aquaBeam: 0, deokbaeHowl: 0, safetyReport: 0,
};

export class GameSession {
  private readonly stateMachine = new GameStateMachine('playing');
  private rng!: SeededRng;
  private waves!: WaveSystem;
  private enemies!: EnemySystem;
  private attacks!: Record<EnemyKind, EnemyAttackSystem>;
  private readonly projectiles = new ProjectileSystem(BALANCE.caps.projectiles);
  private shelter!: ShelterSystem;
  private combat!: CombatSystem;
  private bark!: BarkSystem;
  private skills!: SkillSystem;
  private progression!: ProgressionSystem;
  private outcomes!: RunOutcomeResolver;
  private readonly uiClock = new UiTransitionClock(0);
  private uiTransition: UiTransitionKind = null;
  private cards: readonly SkillCard[] = [];
  private scenarioSelectionRequest: SkillSelectionRequest | null = null;
  private learnedOrder: Exclude<SkillId, 'bark'>[] = [];
  private simulationTicks = 0;
  private nextProjectileId = 0;
  private nextAttackId = 0;
  private readonly eventBuffer: GameEvent[] = [];

  private constructor(seed: number) { this.rebuild(seed); }
  static create(input: { readonly seed: number }): GameSession { return new GameSession(input.seed); }

  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[] {
    if (Math.abs(stepMs - FIXED_STEP_MS) > TIME_EPSILON_MS) throw new RangeError('GameSession requires one fixed step');
    const entryMode = this.stateMachine.current();
    if (entryMode === 'countdown' || entryMode === 'lost') {
      this.stepUiTransition(stepMs, entryMode);
      return this.flushEvents();
    }
    if (entryMode !== 'playing') return this.flushEvents();
    this.stepPlayingWorld(stepMs, player);
    return this.flushEvents();
  }

  private stepPlayingWorld(stepMs: number, player: PlayerSnapshot): void {
    this.simulationTicks += 1;
    for (const request of this.waves.step(stepMs, this.enemies.activeCount)) {
      const enemyId = this.enemies.spawn(request);
      this.eventBuffer.push({ type: 'enemySpawnRequested', request }, { type: 'enemySpawned', enemyId, request });
    }

    this.enemies.step(stepMs);
    const movedEnemies = this.enemies.snapshots();
    const shelterDamage: number[] = [];
    for (const enemy of movedEnemies) {
      for (const event of this.attacks[enemy.kind].step(stepMs, enemy)) {
        this.eventBuffer.push(event);
        if (event.type === 'attackStarted') this.enemies.setState(event.enemyId, 'windup', stepMs);
        else if (event.type === 'attackHolding') this.enemies.setState(event.enemyId, 'holding');
        else if (event.type === 'attackCancelled') this.enemies.setState(event.enemyId, 'moving');
        else if (event.type === 'shelterDamageRequested') shelterDamage.push(event.damage);
        else if (event.type === 'projectileRequested') {
          this.eventBuffer.push(...this.projectiles.spawn({
            id: this.nextProjectileId++, kind: event.projectileKind, from: event.from, to: event.to,
            speed: event.speed, damage: event.damage, lifeMs: event.lifeMs,
          }));
        }
      }
    }

    for (const event of this.projectiles.step(stepMs)) {
      this.eventBuffer.push(event);
      if (event.type === 'shelterDamageRequested') shelterDamage.push(event.damage);
    }

    const damageCommands: DamageCommand[] = [];
    const pendingStatus: SkillHit[] = [];
    const barkTarget = selectThreatTarget(player, this.enemies.snapshots(), 150);
    for (const event of this.bark.step(stepMs, barkTarget, (enemyId) => this.enemies.has(enemyId))) {
      this.eventBuffer.push(event);
      if (event.type === 'damageRequested') {
        damageCommands.push({ attackId: `bark:${this.nextAttackId++}`, targetId: event.targetId, amount: event.amount });
      }
    }

    for (const cast of this.skills.step(stepMs, { player, enemies: this.enemies.snapshots() })) {
      this.eventBuffer.push(cast);
      const attackId = `skill:${cast.skillId}:${this.nextAttackId++}`;
      for (const hit of cast.hits) {
        damageCommands.push({ attackId, targetId: hit.targetId, amount: hit.damage });
        pendingStatus.push(hit);
      }
    }

    for (const amount of shelterDamage) this.eventBuffer.push(...this.shelter.damage(amount));
    const lifecycle = this.combat.applyDamage(damageCommands);
    const beforeStatus = new Map(movedEnemies.map((enemy) => [enemy.id, enemy] as const));
    for (const hit of pendingStatus) {
      if (!this.enemies.has(hit.targetId)) continue;
      const before = beforeStatus.get(hit.targetId);
      if (before === undefined) continue;
      if (hit.nextPathProgress !== undefined) {
        this.enemies.knockBack(hit.targetId, Math.max(0, before.pathProgress - hit.nextPathProgress));
        this.attacks[before.kind].interrupt(hit.targetId);
      }
      if (hit.stunMs !== undefined) {
        this.enemies.stun(hit.targetId, hit.stunMs);
        this.attacks[before.kind].stun(hit.targetId, hit.stunMs, before.pathProgress);
      }
    }

    for (const event of lifecycle) {
      if (event.type === 'enemyDied') {
        for (const attack of Object.values(this.attacks)) attack.remove(event.enemyId);
      } else this.progression.addSnacks(event.amount);
      this.eventBuffer.push(event);
    }

    this.progression.step(stepMs, { mode: 'playing', activeEnemies: movedEnemies.length });
    this.resolvePostStepOutcome();
  }

  selectCard(cardId: string): readonly GameEvent[] {
    if (this.stateMachine.current() !== 'skillSelection') throw new Error('Skill card can only be selected during skillSelection');
    const card = this.cards.find((candidate) => candidate.id === cardId);
    if (card === undefined) throw new RangeError(`Unknown skill card ${cardId}`);
    const previousLevel = this.skills.snapshot(card.skillId).level;
    this.skills.levelUp(card.skillId);
    if (card.skillId === 'bark') this.bark.setLevel(card.nextLevel);
    else if (previousLevel === 0) this.learnedOrder.push(card.skillId);
    this.progression.resolveSelection();
    this.cards = [];
    this.scenarioSelectionRequest = null;
    this.eventBuffer.push({ type: 'skillLearned', skillId: card.skillId, level: card.nextLevel });
    this.beginCountdown(this.waves.pendingNext === null ? 'resumeCombat' : 'nextWave');
    return this.flushEvents();
  }

  snapshot(): RunSnapshot {
    return {
      mode: this.stateMachine.current(), simulationMs: simulationMsFromTicks(this.simulationTicks),
      wave: this.waves.current, pendingSpawns: this.waves.pendingCount,
      activeEnemyCount: this.enemies.activeCount, activeProjectileCount: this.projectiles.activeCount,
      shelterHp: this.shelter.currentHp, snacks: this.progression.snapshot().snacks,
      skills: this.currentSkillLevels(),
      skillStates: this.currentSkillStates(),
      barkState: this.bark.snapshot(),
      enemies: this.enemies.snapshots(), projectiles: this.projectiles.snapshots(),
    };
  }
  currentCards(): readonly SkillCard[] { return this.cards; }
  currentLearnedOrder(): readonly Exclude<SkillId, 'bark'>[] { return this.learnedOrder; }
  currentMode(): ReturnType<GameStateMachine['current']> { return this.stateMachine.current(); }
  projectilePoolTelemetry(): PoolSnapshot { return this.projectiles.poolSnapshot(); }
  modeStateForControllers(): GameStateMachine { return this.stateMachine; }
  forceModeForTest(mode: ReturnType<GameStateMachine['current']>): void { this.stateMachine.transition(mode); }
  scenarioPortForE2e(): ScenarioSessionPort {
    if (import.meta.env.MODE !== 'e2e') throw new Error('Scenario port is available only in e2e mode');
    return {
      step: (stepMs, player) => this.step(stepMs, player),
      snapshot: () => this.snapshot(),
      selectCard: (cardId) => this.selectCard(cardId),
      drainEvents: () => this.flushEvents(),
      reset: (seed) => this.reset(seed),
      useWaveSchedule: (wave, schedule) => {
        const definitions = schedule === 'real' ? WAVE_DEFINITIONS : WAVE_DEFINITIONS.map((definition) => ({
          ...definition,
          spawns: schedule === 'held' ? [{
            atMs: 86_400_000, pathId: 'P6' as const, kind: 'poopGuardian' as const, variant: 'male' as const,
          }] : [],
        }));
        this.waves = new WaveSystem(definitions, this.rng);
        this.waves.start(wave);
      },
      replaceShelter: (currentHp, maxHp = BALANCE.shelter.maxHp) => {
        this.shelter = new ShelterSystem(maxHp, currentHp);
        this.eventBuffer.push({ type: 'shelterDamaged', hp: currentHp, visual: shelterVisualState(currentHp, maxHp) });
      },
      damageShelter: (damage) => {
        this.eventBuffer.push(...this.shelter.damage(damage));
        this.resolvePostStepOutcome();
      },
      replaceSkills: (levels, learnedOrder) => {
        if (levels.bark < 1) throw new RangeError('Scenario bark level must be at least 1');
        this.skills = new SkillSystem(levels);
        this.bark = new BarkSystem(levels.bark);
        this.learnedOrder = [...learnedOrder];
      },
      setSnacks: (snacks) => {
        this.progression = new ProgressionSystem(BALANCE.snackThresholds, BALANCE.pendingSkillCombatDelayMs);
        this.progression.addSnacks(snacks);
      },
      replaceCards: (cards) => {
        const request = this.progression.snapshot().selectionOpen ? this.scenarioSelectionRequest : this.progression.takeNextRequest();
        if (request === undefined || request === null) throw new Error('Scenario cards require a due progression request');
        this.scenarioSelectionRequest = request;
        this.cards = [...cards];
      },
      spawnEnemy: (seed) => {
        const spawned = this.enemies.spawnForScenario(seed);
        if (seed.stunnedMs !== undefined && seed.stunnedMs > 0) {
          const snapshot = this.enemies.snapshots().find((enemy) => enemy.id === spawned.enemyId)!;
          this.attacks[seed.kind].stun(spawned.enemyId, seed.stunnedMs, snapshot.pathProgress);
        }
        this.eventBuffer.push({ type: 'enemySpawned', enemyId: spawned.enemyId, request: spawned.request });
        return spawned.enemyId;
      },
      spawnProjectile: (seed) => { this.eventBuffer.push(...this.projectiles.spawn(seed)); },
      removeEnemyWithoutReward: (enemyId) => {
        this.enemies.removeWithoutReward(enemyId);
        for (const attack of Object.values(this.attacks)) attack.remove(enemyId);
      },
      enterMode: (mode, uiRemainingMs = 0) => {
        this.stateMachine.reset(mode);
        this.uiTransition = mode === 'lost' ? 'lostResult' : null;
        this.uiClock.restart(uiRemainingMs);
        this.eventBuffer.push({ type: 'modeChanged', mode });
        if (mode === 'skillSelection') {
          if (this.scenarioSelectionRequest === null) throw new Error('Scenario skillSelection has no request');
          this.eventBuffer.push({ type: 'skillSelectionOpened', request: this.scenarioSelectionRequest, cards: this.cards });
        } else if (mode === 'lost') this.eventBuffer.push({ type: 'runEnded', outcome: 'lost' });
      },
      projectilePoolTelemetry: () => this.projectilePoolTelemetry(),
    };
  }
  requestVisibilityPause(): void {
    const mode = this.stateMachine.current();
    if (mode === 'visibilityPause' || mode === 'won' || mode === 'lost') return;
    this.stateMachine.hide(); this.uiClock.pause();
    this.eventBuffer.push({ type: 'modeChanged', mode: 'visibilityPause' });
  }
  requestVisibilityResume(): void {
    if (this.stateMachine.current() !== 'visibilityPause') return;
    const mode = this.stateMachine.resume(); this.uiClock.resume();
    this.eventBuffer.push({ type: 'modeChanged', mode });
  }

  reset(seed: number): void {
    this.projectiles.clear(); this.enemies.clear();
    for (const attack of Object.values(this.attacks)) attack.clear();
    this.rebuild(seed);
  }

  private rebuild(seed: number): void {
    this.eventBuffer.length = 0;
    this.stateMachine.reset('playing');
    this.rng = new SeededRng(seed);
    this.waves = new WaveSystem(WAVE_DEFINITIONS, this.rng);
    this.enemies = EnemySystem.createDefault();
    this.attacks = this.createAttackSystems();
    this.projectiles.clear();
    this.shelter = new ShelterSystem(BALANCE.shelter.maxHp);
    this.combat = new CombatSystem(this.enemies);
    this.bark = new BarkSystem(1);
    this.skills = new SkillSystem(INITIAL_SKILLS);
    this.progression = new ProgressionSystem(BALANCE.snackThresholds, BALANCE.pendingSkillCombatDelayMs);
    this.outcomes = new RunOutcomeResolver();
    this.cards = []; this.scenarioSelectionRequest = null; this.learnedOrder = []; this.uiTransition = null; this.uiClock.restart(0);
    this.simulationTicks = 0; this.nextProjectileId = 0; this.nextAttackId = 0;
    this.waves.start(1);
    this.eventBuffer.push({ type: 'waveStarted', wave: 1 });
  }

  private createAttackSystems(): Record<EnemyKind, EnemyAttackSystem> {
    const shelter = { center: { x: BALANCE.shelter.x, y: BALANCE.shelter.y }, radius: BALANCE.shelter.hitRadius };
    return Object.fromEntries((Object.keys(BALANCE.enemies) as EnemyKind[]).map((kind) => [
      kind, new EnemyAttackSystem({ kind, balance: BALANCE.enemies[kind], shelter }),
    ])) as Record<EnemyKind, EnemyAttackSystem>;
  }
  private currentSkillLevels(): SkillLevels {
    return {
      bark: this.skills.snapshot('bark').level, scold: this.skills.snapshot('scold').level,
      aquaBeam: this.skills.snapshot('aquaBeam').level, deokbaeHowl: this.skills.snapshot('deokbaeHowl').level,
      safetyReport: this.skills.snapshot('safetyReport').level,
    };
  }
  private currentSkillStates(): RunSnapshot['skillStates'] {
    return {
      bark: this.skills.snapshot('bark'), scold: this.skills.snapshot('scold'),
      aquaBeam: this.skills.snapshot('aquaBeam'), deokbaeHowl: this.skills.snapshot('deokbaeHowl'),
      safetyReport: this.skills.snapshot('safetyReport'),
    };
  }
  private openSkillSelection(): void {
    const request = this.progression.takeNextRequest();
    if (request === undefined) throw new Error('Progression request disappeared');
    this.cards = pickSkillCards(this.currentSkillLevels(), this.rng);
    this.stateMachine.transition('skillSelection');
    this.eventBuffer.push(
      { type: 'modeChanged', mode: 'skillSelection' },
      { type: 'skillSelectionOpened', request, cards: this.cards },
    );
  }
  private beginCountdown(kind: Exclude<UiTransitionKind, 'lostResult' | null>): void {
    this.uiTransition = kind; this.uiClock.restart(BALANCE.waveCountdownMs);
    this.stateMachine.transition('countdown');
    this.eventBuffer.push({ type: 'modeChanged', mode: 'countdown' });
    if (kind === 'nextWave') {
      if (this.waves.pendingNext === null) throw new Error('Next-wave countdown has no pending wave');
      this.eventBuffer.push({
        type: 'waveTransition', fromWave: this.waves.current,
        toWave: this.waves.pendingNext, countdownMs: 3000,
      });
    }
  }
  private stepUiTransition(stepMs: number, entryMode: 'countdown' | 'lost'): void {
    if (this.uiTransition === null || this.uiClock.step(stepMs, entryMode) !== 'completed') return;
    const completed = this.uiTransition; this.uiTransition = null;
    if (completed === 'lostResult') { this.eventBuffer.push({ type: 'resultReady', outcome: 'lost' }); return; }
    if (completed === 'nextWave') this.eventBuffer.push({ type: 'waveStarted', wave: this.waves.startPendingNext() });
    this.stateMachine.transition('playing');
    this.eventBuffer.push({ type: 'modeChanged', mode: 'playing' });
  }
  private resolvePostStepOutcome(): void {
    const resolution = this.outcomes.resolve({
      shelterHp: this.shelter.currentHp, wave: this.waves.current,
      active: this.enemies.activeCount, pending: this.waves.pendingCount,
      skillDue: this.progression.canOpen(),
    });
    if (resolution.mode === 'lost' || resolution.mode === 'won') { this.finish(resolution.mode); return; }
    if (resolution.nextWave !== undefined) this.waves.setPendingNext(resolution.nextWave);
    if (resolution.mode === 'skillSelection') this.openSkillSelection();
    else if (resolution.countdownKind === 'nextWave') this.beginCountdown('nextWave');
  }
  private finish(outcome: 'won' | 'lost'): void {
    this.stateMachine.transition(outcome);
    this.eventBuffer.push({ type: 'modeChanged', mode: outcome }, { type: 'runEnded', outcome });
    if (outcome === 'lost') { this.uiTransition = 'lostResult'; this.uiClock.restart(1200); }
    else this.eventBuffer.push({ type: 'resultReady', outcome: 'won' });
  }
  private flushEvents(): readonly GameEvent[] { return this.eventBuffer.splice(0); }
}
```

`step()`은 tick 진입 mode를 먼저 캡처한다. 진입 mode가 `playing`이면 월드만, `countdown|lost`면 기존 UI transition만 한 번 진행하고 같은 tick 안에서 다른 branch로 넘어가지 않는다. 따라서 월드 step에서 새 countdown/lost를 만든 tick은 새 timer를 차감하지 않고, countdown 완료 tick도 다음 wave의 첫 world step을 실행하지 않는다. `GameScene`은 `modeChanged('skillSelection'|'countdown'|'lost')`에서 idempotent runtime pause를 적용하고 `modeChanged('playing')`에서만 푼다. Scene의 enemy/projectile/effect actor pool은 restart 전에 각각 `releaseAll(reset)`한 뒤 `session.reset(seed)`를 호출한다.

`resolvePostStep`과 `RunOutcomeResolver.resolve`의 canonical 구현은 Task 2의 같은 파일 하나다. `finish`는 첫 호출만 `runEnded`를 발행하고 이후 event를 무시한다. `setPendingNext`는 wave 번호만 저장하고 countdown을 시작하지 않는다. 카드 선택이 끝났을 때 `waves.pendingNext !== null`이면 그때 `nextWave` countdown 하나를 시작한다. `UiTransitionClock`이 완료되면 `waves.startPendingNext()`를 딱 한 번 호출하고 `waveStarted`를 발행한 뒤 mode를 `playing`으로 바꾼다. skill due가 없는 비최종 clear만 즉시 3000ms countdown을 시작한다. 적 없는 countdown은 pending selection의 5초 combat delay를 늘리지 않는다.

- [ ] **Step 3: 렌더 delta가 달라도 같은 결과인지 검증하고 고정 스텝 adapter를 완성한다.**

```ts
// tests/unit/SimulationResolution.test.ts
import { FixedStepClock } from '../../src/game/core/FixedStepClock';
import { GameSession } from '../../src/game/session/GameSession';
import type { RunSnapshot } from '../../src/game/session/RunSnapshot';

function normalizeSnapshot(snapshot: RunSnapshot): unknown {
  return JSON.parse(JSON.stringify(snapshot, (_key, value: unknown) =>
    typeof value === 'number' ? Math.round(value * 1_000_000) / 1_000_000 : value,
  ));
}

function simulateWithRenderDeltas(deltas: readonly number[], seed: number): unknown {
  const run = GameSession.create({ seed });
  const clock = new FixedStepClock(1000 / 60, 5);
  for (const delta of deltas) {
    for (const stepMs of clock.consume(delta)) run.step(stepMs, { x: 270, y: 650 });
  }
  return normalizeSnapshot(run.snapshot());
}

it('60fps와 30fps 렌더 delta가 같은 10초 결과를 만든다', () => {
  const at60 = simulateWithRenderDeltas(Array(600).fill(1000 / 60), 7);
  const at30 = simulateWithRenderDeltas(Array(300).fill(1000 / 30), 7);
  expect(at30).toEqual(at60);
});
```

비교 snapshot은 simulationMs, wave, enemy ids/pathProgress/HP, shelterHp, snacks, skills, cooldowns, projectiles를 포함하고 부동소수 위치는 1e-6으로 round한다.

- [ ] **Step 4: boss actor·상단 bar·고유 이름을 구현한다.**

`BossHud`는 화면 상단 중앙에 이름과 `280×12` bar를 둔다. boss도 머리 위 30×4 bar를 유지한다. W3 trader 이름은 `개장수`, W5 breeder 이름은 `불법번식업자`다. boss spawn 때 중앙 문구를 900ms 표시한다. male/female breeder는 동일 수치와 공격을 사용한다.

```ts
export const BOSS_HUD = { x: 130, y: 58, width: 280, height: 12 } as const;
```

- [ ] **Step 5: lost hold·ResultScene·restart를 구현한다.**

lost 확정 즉시 simulation을 멈추고 shelter failed frame 3과 shake를 정확히 1200ms UI time으로 표시한 뒤 ResultScene으로 이동한다. won은 마지막 death effect flush 뒤 즉시 결과로 이동한다. ResultScene은 Phaser DOMElement로 `보호소를 지켰어요!` 또는 `다시 지켜볼까요?` 문구와 실제 `<button>`인 `다시 시작`을 표시한다. GameScene과 기존 `GameSession` 및 세 actor pool은 ResultScene 아래에서 보존한다. 재시작은 모든 actor/projectile/effect를 `releaseAll(reset)`하고 event listener를 중복 없이 다시 연결한 뒤 기존 `session.reset(seed)`를 호출해 wave 1을 즉시 시작한다. 새 `GameSession`이나 pool을 만들지 않는다.

Task 12에서 restart acceptance가 사용하는 최소 pool telemetry를 먼저 확정한다. `ObjectPool.snapshot()`은 Task 7 구현을 그대로 재사용하고 TestBridge가 세 pool을 아래 shape으로 투영한다. Task 14는 이 계약을 새로 만들지 않고 cap 초과와 반복 안정성만 확장 검증한다.

```ts
// src/game/debug/TestContract.ts에 Task 12에서 추가
export interface PoolCount { readonly instanceId: number; readonly created: number; readonly active: number; readonly available: number; }
// GameDebugSnapshot에 추가:
// readonly pools: { readonly enemies: PoolCount; readonly projectiles: PoolCount; readonly effects: PoolCount };
```

- [ ] **Step 6: 보스·승리·패배·재시작 E2E를 작성하고 통과시킨다.**

```ts
// tests/e2e/full-run.spec.ts
import { expect, test } from '@playwright/test';
import { advance, events, openScenario, snapshot } from './helpers';

test('개장수 보스와 상단 HP 바가 함께 표시된다', async ({ page }) => {
  await openScenario(page, 'boss');
  expect((await snapshot(page)).hud.bossBar).toEqual({ name: '개장수', width: 280, height: 12 });
});

test('보호소 0은 failed frame 1.2초 뒤 패배하고 재시작은 초기화한다', async ({ page }) => {
  await openScenario(page, 'shelter-defeat');
  const beforeRestart = (await snapshot(page)).pools;
  expect((await snapshot(page)).mode).toBe('lost');
  await advance(page, 1199);
  await expect(page.getByText('다시 지켜볼까요?')).not.toBeVisible();
  await advance(page, 1);
  await page.getByRole('button', { name: '다시 시작' }).click();
  await page.waitForFunction(() => {
    const state = window.__HUCHU_TEST__?.snapshot();
    return state?.mode === 'playing' && state.wave === 1 && state.shelterHp === 100;
  });
  const restarted = await snapshot(page);
  expect(restarted).toMatchObject({
    mode: 'playing', wave: 1, shelterHp: 100, snacks: 0,
    skills: {
      bark: { level: 1, cooldownRemainingMs: 0 },
      scold: { level: 0, cooldownRemainingMs: 0 },
      aquaBeam: { level: 0, cooldownRemainingMs: 0 },
      deokbaeHowl: { level: 0, cooldownRemainingMs: 0 },
      safetyReport: { level: 0, cooldownRemainingMs: 0 },
    },
    pools: { enemies: { active: 0 }, projectiles: { active: 0 }, effects: { active: 0 } },
  });
  expect({
    enemies: restarted.pools.enemies.instanceId,
    projectiles: restarted.pools.projectiles.instanceId,
    effects: restarted.pools.effects.instanceId,
  }).toEqual({
    enemies: beforeRestart.enemies.instanceId,
    projectiles: beforeRestart.projectiles.instanceId,
    effects: beforeRestart.effects.instanceId,
  });

  const lastSequence = (await events(page)).at(-1)?.sequence ?? 0;
  await advance(page, 1000 / 60);
  const afterFirstWaveTick = await snapshot(page);
  expect(afterFirstWaveTick.enemies).toHaveLength(1);
  expect(afterFirstWaveTick.pools.enemies.active).toBe(1);
  expect((await events(page, lastSequence)).filter((event) => event.type === 'enemySpawned')).toHaveLength(1);
});

test('wave 5의 마지막 적 제거 뒤 승리한다', async ({ page }) => {
  await openScenario(page, 'final-enemy');
  await advance(page, 300);
  await expect(page.getByText('보호소를 지켰어요!')).toBeVisible();
});

test('actual WaveSystem이 W1부터 W5까지 clear와 3초 전환을 거쳐 완주한다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  await advance(page, 120_000);
  const runEvents = await events(page);
  expect(runEvents.filter((event) => event.type === 'waveStarted').map((event) => event.wave)).toEqual([1, 2, 3, 4, 5]);
  const transitions = runEvents.filter((event) => event.type === 'waveTransition');
  expect(transitions).toHaveLength(4);
  expect(transitions.every((event) => event.countdownMs === 3000)).toBe(true);
  expect((await snapshot(page)).mode).toBe('won');
});

test('wave clear를 만든 tick은 새 3초 countdown을 차감하지 않고 다음 180 tick만 사용한다', async ({ page }) => {
  await openScenario(page, 'wave-schedule');
  let transitionSeen = false;
  for (let tick = 0; tick < 900 && !transitionSeen; tick += 1) {
    await advance(page, 1000 / 60);
    transitionSeen = (await events(page)).some((event) => event.type === 'waveTransition');
  }
  expect(transitionSeen).toBe(true);
  expect((await snapshot(page)).wave).toBe(1);
  await advance(page, 2999);
  expect((await snapshot(page)).wave).toBe(1);
  await advance(page, 1);
  expect((await snapshot(page)).wave).toBe(2);
});
```

테스트 계약에 `'final-enemy'`, `'shelter-defeat'`를 추가하고 Task 9에서 만든 `'boss'` factory에는 boss HUD/name 상태만 보강한다. `final-enemy`는 HP 10인 마지막 W5 적 한 명을 후추 짖기 사거리 안에 배치해 정상 전투 경로로 승리를 만든다. `GameDebugEvent` union에는 `waveStarted`와 `{fromWave,toWave,countdownMs:3000}`인 `waveTransition`을 추가한다.

`shelter-defeat` factory는 ready를 resolve하기 전에 shelter damage와 같은 `RunOutcomeResolver.resolve` 경로를 한 번 실행해 mode `lost`, failed frame, `UiTransitionClock(1200)` 상태로 만든다. 따라서 1ms처럼 fixed step보다 작은 호출에 전환을 기대하지 않는다. `wave-schedule`은 실제 `WAVE_DEFINITIONS`, `WaveSystem.step`, `RunOutcomeResolver`, `UiTransitionClock`을 그대로 사용하되 이 테스트가 검증하지 않는 전투·성장만 명시적으로 대체한다. spawn 요청은 같은 fixed step 끝에 snack 보상 없이 즉시 제거하고, shelter는 무적이며 `ProgressionSystem.addSnacks`를 호출하지 않는다. 따라서 skill selection이 열리지 않는다. 각 wave의 마지막 예약 spawn이 제거되면 실제 clear 판정과 정확히 3000ms countdown을 거쳐 `startPendingNext()`를 호출한다. 이 override는 `import.meta.env.MODE==='e2e'`인 scenario factory 내부에만 있고 일반 `GameSession`에는 분기나 flag를 추가하지 않는다. `advance(120_000)` 한 번으로 다섯 실제 스케줄과 네 전환을 충분히 통과한다.

Run: `npm run test:unit -- tests/unit/RunOutcomeResolver.test.ts tests/unit/RunFactory.test.ts tests/unit/SimulationResolution.test.ts && npm run test:e2e -- tests/e2e/full-run.spec.ts`

Expected: boss, priority, failed hold, win/loss/restart 통과.

- [ ] **Step 7: Task 12를 커밋한다.**

```bash
git add src/game/ui/BossHud.ts src/game/ui/CountdownOverlay.ts src/game/waves/WaveSystem.ts src/game/session src/game/events/GameEvents.ts src/game/scenes src/game/debug tests
git commit -m "feat: complete waves and run results"
```

---

### Task 13: 로딩·탭 숨김·WebGL 복원·반응형 오류 처리

**Files:**
- Create: `src/game/ui/RuntimeErrorOverlay.ts`
- Create: `src/game/lifecycle/VisibilityController.ts`
- Create: `src/game/lifecycle/WebGlRecoveryController.ts`
- Create: `src/game/debug/E2eBootOverrides.ts`
- Modify: `src/game/ui/UiTransitionClock.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `src/game/createGame.ts`
- Modify: `src/game/scenes/BootScene.ts`
- Modify: `src/game/scenes/PreloadScene.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `src/game/player/VirtualJoystick.ts`
- Modify: `src/game/debug/TestBridge.ts`
- Test: `tests/unit/VisibilityController.test.ts`
- Test: `tests/unit/WebGlRecoveryController.test.ts`
- Test: `tests/e2e/lifecycle.spec.ts`
- Test: `tests/e2e/error-recovery.spec.ts`

**Interfaces:**
- Consumes: `visibilitychange`, WebGL context lost/restored, loader error, data validation error, resize
- Produces: 안전한 simulation pause, 명시적 재개, retry UI, 논리 좌표 유지, unsupported 안내

- [ ] **Step 1: 숨김 전 상태 보존과 skill modal 복귀 테스트를 작성한다.**

```ts
// tests/unit/VisibilityController.test.ts
import { VisibilityController } from '../../src/game/lifecycle/VisibilityController';
import { GameSession } from '../../src/game/session/GameSession';

it('playing에서 숨기면 사용자 재개 전까지 멈춘다', () => {
  const session = GameSession.create({ seed: 1 });
  const controller = new VisibilityController(session);
  controller.hidden();
  controller.visible();
  expect(session.currentMode()).toBe('visibilityPause');
  controller.confirmResume();
  expect(session.currentMode()).toBe('playing');
});

it('skill selection 중 복귀하면 같은 modal에서 즉시 계속한다', () => {
  const session = GameSession.create({ seed: 1 });
  session.forceModeForTest('skillSelection');
  const controller = new VisibilityController(session);
  controller.hidden();
  controller.visible();
  expect(session.currentMode()).toBe('skillSelection');
});
```

Run: `npm run test:unit -- tests/unit/VisibilityController.test.ts`

Expected: lifecycle controller 부재로 실패.

- [ ] **Step 2: visibility pause와 명시적 resume overlay를 구현한다.**

```ts
// src/game/lifecycle/VisibilityController.ts
import type { GameMode } from '../core/GameMode';

export interface VisibilitySessionPort {
  currentMode(): GameMode;
  requestVisibilityPause(): void;
  requestVisibilityResume(): void;
}

export interface VisibilityRuntimePort {
  setWorldPaused(paused: boolean): void;
  setResumePromptVisible(visible: boolean): void;
}
const noopRuntime: VisibilityRuntimePort = {
  setWorldPaused: () => {}, setResumePromptVisible: () => {},
};

export class VisibilityController {
  private returnMode: GameMode | null = null;
  private awaitingConfirmation = false;
  constructor(private readonly session: VisibilitySessionPort, private readonly runtime: VisibilityRuntimePort = noopRuntime) {}

  hidden(): void {
    const current = this.session.currentMode();
    if (current === 'visibilityPause' || current === 'won' || current === 'lost') return;
    this.returnMode = current;
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
    this.runtime.setWorldPaused(true);
    this.session.requestVisibilityPause();
  }
  visible(): void {
    if (this.session.currentMode() !== 'visibilityPause' || this.returnMode === null) return;
    if (this.returnMode === 'skillSelection') {
      this.session.requestVisibilityResume();
      this.returnMode = null;
      return;
    }
    this.awaitingConfirmation = true;
    this.runtime.setResumePromptVisible(true);
  }
  confirmResume(): void {
    if (!this.awaitingConfirmation || this.returnMode === null) return;
    const target = this.returnMode;
    this.returnMode = null;
    this.awaitingConfirmation = false;
    this.runtime.setResumePromptVisible(false);
    this.session.requestVisibilityResume();
    const resumed = this.session.currentMode();
    if (resumed !== target) throw new Error(`Expected to resume ${target}, got ${resumed}`);
    this.runtime.setWorldPaused(target !== 'playing');
  }
  get needsConfirmation(): boolean { return this.awaitingConfirmation; }
}
```

`GameScene` port는 실제 Phaser DOMElement `<button>`인 `계속하기`를 44px 이상으로 띄운다. countdown elapsed와 skill cooldown은 숨긴 시간만큼 늘어나지 않는다. `TestBridge.simulateVisibility`는 실제 controller method를 호출한다.

- [ ] **Step 3: WebGL 초기화 실패·context 복구 테스트를 작성한다.**

```ts
// tests/unit/WebGlRecoveryController.test.ts
import { WebGlRecoveryController } from '../../src/game/lifecycle/WebGlRecoveryController';
import { GameSession } from '../../src/game/session/GameSession';

it('context lost를 preventDefault하고 복구 뒤 사용자 확인을 요구한다', () => {
  const target = new EventTarget();
  const session = GameSession.create({ seed: 1 });
  const prompts: boolean[] = [];
  const controller = new WebGlRecoveryController(target, session, {
    setWorldPaused: () => undefined, setRestorePromptVisible: (visible) => prompts.push(visible),
  });
  controller.attach();
  const lost = new Event('webglcontextlost', { cancelable: true });
  target.dispatchEvent(lost);
  expect(lost.defaultPrevented).toBe(true);
  expect(session.currentMode()).toBe('visibilityPause');
  target.dispatchEvent(new Event('webglcontextrestored'));
  expect(controller.needsConfirmation).toBe(true);
  expect(prompts.at(-1)).toBe(true);
  controller.confirmRestore();
  expect(prompts.at(-1)).toBe(false);
});
```

`main.ts`는 Phaser 생성 전에 임시 canvas에서 `webgl2 || webgl`을 확인한다. 실패 시 canvas 대신 `이 브라우저에서는 WebGL을 사용할 수 없어요`와 지원 브라우저 안내를 렌더한다. 실행 중 canvas `webglcontextlost`는 `preventDefault`, world pause와 overlay를 수행하고 `webglcontextrestored` 뒤 `다시 그리기` 확인을 받아 Scene view를 snapshot에서 재동기화한다.

```ts
// src/game/lifecycle/WebGlRecoveryController.ts
import type { GameMode } from '../core/GameMode';
import type { VisibilitySessionPort } from './VisibilityController';

export interface WebGlRuntimePort {
  setWorldPaused(paused: boolean): void;
  setRestorePromptVisible(visible: boolean): void;
  resyncView?(): void;
}
export class WebGlRecoveryController {
  private returnMode: GameMode | null = null;
  needsConfirmation = false;
  constructor(
    private readonly target: EventTarget,
    private readonly session: VisibilitySessionPort,
    private readonly runtime: WebGlRuntimePort,
  ) {}
  attach(): void {
    this.target.addEventListener('webglcontextlost', this.onLost);
    this.target.addEventListener('webglcontextrestored', this.onRestored);
  }
  detach(): void {
    this.target.removeEventListener('webglcontextlost', this.onLost);
    this.target.removeEventListener('webglcontextrestored', this.onRestored);
  }
  confirmRestore(): void {
    if (!this.needsConfirmation || this.returnMode === null) return;
    const mode = this.returnMode;
    this.returnMode = null;
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.resyncView?.();
    this.session.requestVisibilityResume();
    const resumed = this.session.currentMode();
    if (resumed !== mode) throw new Error(`Expected to restore ${mode}, got ${resumed}`);
    this.runtime.setWorldPaused(mode !== 'playing');
  }
  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    if (this.session.currentMode() === 'visibilityPause' || this.session.currentMode() === 'won' || this.session.currentMode() === 'lost') return;
    this.returnMode = this.session.currentMode();
    this.needsConfirmation = false;
    this.runtime.setRestorePromptVisible(false);
    this.runtime.setWorldPaused(true);
    this.session.requestVisibilityPause();
  };
  private readonly onRestored = (): void => {
    if (this.returnMode !== null) {
      this.needsConfirmation = true;
      this.runtime.setRestorePromptVisible(true);
    }
  };
}
```

복구 확인 뒤 `playing`은 world/UI clock을 모두 재개하고, `countdown`은 world를 멈춘 채 UI clock만 재개하며, `skillSelection`은 modal과 입력 상태를 유지한 채 world만 멈춘다. 따라서 context loss 전 mode를 단일 pause boolean으로 압축하지 않는다.
`GameScene`의 `setRestorePromptVisible(true)`는 실제 Phaser DOMElement `<button>` `다시 그리기`를 만들고 click을 `confirmRestore()`에 한 번 연결한다. false에서는 listener와 element를 함께 제거한다.

`E2eBootOverrides.ts`는 `forceWebglUnsupported=1`일 때 WebGL probe를 false로, `invalidPath=P1`일 때 복사한 P1 첫 x만 -1로 바꾸는 두 함수만 export한다. `main.ts`와 BootScene은 `import.meta.env.MODE==='e2e'` 분기 안에서만 이 파일을 dynamic import한다. production에는 이 query 문자열과 override chunk가 포함되지 않는다.

- [ ] **Step 4: loader/data 오류 retry와 resize를 구현한다.**

`PreloadScene`은 필수 에셋 실패 파일 수를 `필수 그림 N개를 불러오지 못했어요`로 표시하고 Phaser DOMElement `<button>`인 `다시 시도`가 Scene을 restart한다. `BootScene`은 `validateGameData` 오류의 첫 path/wave id를 표시하고 retry 전에는 GameScene을 시작하지 않는다. `RuntimeErrorOverlay`의 버튼은 모두 최소 44×44다.

resize는 Phaser Scale Manager만 갱신하고 logical `540×960`, player/enemy/path/shelter 좌표를 바꾸지 않는다. `Phaser.Input.Pointer.x/y`는 Input Manager가 이미 logical screen 좌표로 변환한 값이므로 `VirtualJoystick`은 그대로 사용한다. native DOM event의 raw `pageX/pageY`를 직접 받는 별도 경로를 만들 때만 `scale.transformX/Y`를 한 번 적용한다.

- [ ] **Step 5: lifecycle과 오류 복구 E2E를 통과시킨다.**

```ts
// tests/e2e/lifecycle.spec.ts
import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('탭 숨김 시간에는 적·cooldown·countdown이 진행되지 않는다', async ({ page }) => {
  await openScenario(page, 'all-skills');
  const before = await snapshot(page);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 10_000);
  expect(await snapshot(page)).toMatchObject({ enemies: before.enemies, skills: before.skills });
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});

test('390×844 resize 뒤 논리 좌표가 유지되고 joystick drag가 한 번만 변환된다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const before = (await snapshot(page)).player;
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await snapshot(page)).player).toEqual(before);

  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('Canvas is not visible');
  const start = { x: box.x + box.width * 78 / 540, y: box.y + box.height * 862 / 960 };
  const end = { x: start.x + box.width * 50 / 540, y: start.y };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await advance(page, 1000);
  await page.mouse.up();
  expect((await snapshot(page)).player.x).toBeGreaterThan(before.x + 40);
});

test('countdown 중 숨김 시간은 3초 전환 clock에 포함되지 않는다', async ({ page }) => {
  await openScenario(page, 'skill-selection');
  const cardTitle = (await snapshot(page)).cards.at(0)!.title;
  await page.getByRole('button', { name: cardTitle }).click();
  await advance(page, 1000);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(true));
  await advance(page, 10_000);
  await page.evaluate(() => window.__HUCHU_TEST__!.simulateVisibility(false));
  await page.getByRole('button', { name: '계속하기' }).click();
  await advance(page, 1999);
  expect((await snapshot(page)).mode).toBe('countdown');
  await advance(page, 1);
  expect((await snapshot(page)).mode).toBe('playing');
});
```

```ts
// tests/e2e/error-recovery.spec.ts
import { expect, test } from '@playwright/test';
import { advance, openScenario, snapshot } from './helpers';

test('필수 에셋 실패는 파일 수와 retry를 표시한다', async ({ page }) => {
  await page.route('**/map-background.webp', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('필수 그림 1개를 불러오지 못했어요')).toBeVisible();
  await page.unroute('**/map-background.webp');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('button', { name: '보호소 지키기' })).toBeVisible();
});

test('WebGL 미지원이면 canvas 없이 지원 안내를 표시한다', async ({ page }) => {
  await page.goto('/?e2e=1&forceWebglUnsupported=1');
  await expect(page.getByText('이 브라우저에서는 WebGL을 사용할 수 없어요')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('잘못된 P1 데이터는 전투를 막고 경로 id와 retry를 표시한다', async ({ page }) => {
  await page.goto('/?e2e=1&invalidPath=P1');
  await expect(page.getByText(/P1/)).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.locator('#game-root')).not.toHaveAttribute('data-scene', 'Game');
});

test('실제 WebGL context lost/restored 뒤 확인 전에는 world가 멈춘다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl!.getExtension('WEBGL_lose_context')!;
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context }).__loseContextExtension = extension;
    extension.loseContext();
  });
  await expect(page.getByText('화면을 다시 준비하고 있어요')).toBeVisible();
  const frozen = await snapshot(page);
  await advance(page, 1000);
  expect((await snapshot(page)).simulationMs).toBe(frozen.simulationMs);
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    (canvas as HTMLCanvasElement & { __loseContextExtension?: WEBGL_lose_context })
      .__loseContextExtension!.restoreContext();
  });
  await page.getByRole('button', { name: '다시 그리기' }).click();
  expect((await snapshot(page)).mode).toBe('playing');
});
```

Run: `npm run test:unit -- tests/unit/VisibilityController.test.ts tests/unit/WebGlRecoveryController.test.ts && npm run test:e2e -- tests/e2e/lifecycle.spec.ts tests/e2e/error-recovery.spec.ts`

Expected: visibility, resize, retry, 복원 케이스 통과.

- [ ] **Step 6: Task 13을 커밋한다.**

```bash
git add src/main.ts src/styles.css src/game/createGame.ts src/game/lifecycle src/game/ui/RuntimeErrorOverlay.ts src/game/ui/UiTransitionClock.ts src/game/player/VirtualJoystick.ts src/game/scenes src/game/debug tests
git commit -m "feat: add lifecycle and WebGL recovery"
```

---

### Task 14: 통합 테스트 계약·시각 회귀·성능 게이트

**Files:**
- Modify: `tests/e2e/helpers.ts`
- Create: `tests/e2e/test-bridge.spec.ts`
- Create: `tests/e2e/gameplay-visuals.spec.ts`
- Create: `tests/visual/asset-review.spec.ts`
- Create: `tests/performance/performance.spec.ts`
- Create: `tests/unit/PoolCaps.test.ts`
- Create: `tests/visual/__snapshots__/*.png`
- Modify: `src/game/debug/TestContract.ts`
- Modify: `src/game/debug/TestBridge.ts`
- Modify: `src/game/debug/ScenarioFactory.ts`
- Modify: `src/game/debug/ScenarioSessionPort.ts`
- Modify: `src/game/session/GameSession.ts`
- Modify: `src/game/enemies/EnemySystem.ts`
- Modify: `src/game/shelter/ShelterSystem.ts`
- Modify: `src/game/skills/SkillSystem.ts`
- Modify: `src/game/session/RunSnapshot.ts`
- Modify: `src/game/scenes/GameScene.ts`
- Modify: `playwright.config.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 완성된 GameSession, 모든 runtime view/pool, 수동 시계, desktop/mobile viewport
- Produces: 11개 결정적 scenario, 캔버스 스냅샷, pool telemetry, 30초 FPS 통계, production bridge 부재 증거

- [ ] **Step 1: 모든 scenario load/reset 계약을 먼저 실패시킨 뒤 최종 TestBridge와 helper를 완성한다.**

```ts
// tests/e2e/test-bridge.spec.ts
import { expect, test } from '@playwright/test';
import { loadScenario, openScenario, snapshot } from './helpers';

const scenarios = [
  'empty-run', 'wave-schedule', 'bark-targeting', 'poop-attack', 'health-bar-colors',
  'skill-selection', 'all-skills', 'boss', 'final-enemy', 'shelter-defeat', 'stress',
] as const;

for (const scenario of scenarios) {
  test(`${scenario}를 독립적으로 load한다`, async ({ page }) => {
    await openScenario(page, scenario);
    const loaded = await snapshot(page);
    expect(loaded.simulationMs).toBe(0);
    expect(loaded.pools.enemies.active).toBeLessThanOrEqual(60);
    await loadScenario(page, 'empty-run');
    expect((await snapshot(page)).pools).toMatchObject({
      enemies: { active: 0 }, projectiles: { active: 0 }, effects: { active: 0 },
    });
  });
}
```

Run: `npm run test:e2e -- tests/e2e/test-bridge.spec.ts`

Expected first run: 최종 scenario union과 pool telemetry가 없어 실패. 아래 계약과 factory reset을 구현한 뒤 통과시킨다.

```ts
// src/game/debug/TestContract.ts
import type { GameMode } from '../core/GameMode';
import type { EnemyKind, EnemyState, SkillId, SkillLevel } from '../types/GameTypes';

export type TestScenarioId =
  | 'empty-run' | 'wave-schedule' | 'bark-targeting' | 'poop-attack'
  | 'health-bar-colors' | 'skill-selection' | 'all-skills' | 'boss'
  | 'final-enemy' | 'shelter-defeat' | 'stress';

export interface GameDebugSnapshot {
  mode: GameMode;
  simulationMs: number;
  wave: number;
  player: { x: number; y: number };
  shelterHp: number;
  snacks: number;
  enemies: readonly DebugEnemy[];
  projectiles: readonly DebugProjectile[];
  skills: Readonly<Record<SkillId, DebugSkill>>;
  cards: readonly DebugCard[];
  pools: { enemies: PoolCount; projectiles: PoolCount; effects: PoolCount };
  hud: { skillSlots: readonly { id: SkillId; x: number; y: number; width: 32; height: 32 }[]; bossBar?: { name: string; width: 280; height: 12 } };
}

export interface DebugEnemy {
  id: number;
  kind: EnemyKind;
  currentHp: number;
  maxHp: number;
  pathProgress: number;
  state: EnemyState;
  hpBar: { visible: boolean; width: 30; height: 4; color: number };
}
export interface DebugProjectile { id: number; kind: 'poop' | 'net' | 'electric'; x: number; y: number; speed: number; damage: number; lifeMs: number; }
export interface DebugSkill { level: SkillLevel; cooldownRemainingMs: number; ready: boolean; }
export interface DebugCard { id: string; title: string; skillId: SkillId; nextLevel: SkillLevel; }
export interface PoolCount { instanceId: number; created: number; active: number; available: number; }
interface DebugEventBase { sequence: number; atMs: number; }
export type GameDebugEvent =
  | (DebugEventBase & { type: 'modeChanged'; mode: GameMode })
  | (DebugEventBase & { type: 'playerMoved'; x: number; y: number })
  | (DebugEventBase & { type: 'skillCast'; skillId: Exclude<SkillId, 'bark'>; targetIds: readonly number[] })
  | (DebugEventBase & { type: 'waveStarted'; wave: number })
  | (DebugEventBase & { type: 'waveTransition'; fromWave: number; toWave: number; countdownMs: 3000 })
  | (DebugEventBase & { type: 'barkStarted' | 'barkReleased' | 'enemySpawned' | 'enemyDied' | 'projectileSpawned' | 'projectileHit' | 'shelterDamaged' | 'runEnded' });

export interface HuchuTestBridge {
  readonly ready: Promise<void>;
  loadScenario(id: TestScenarioId): Promise<void>;
  advance(ms: number): Promise<void>;
  advanceWithoutFlush(ms: number): void;
  snapshot(): GameDebugSnapshot;
  eventsSince(sequence: number): readonly GameDebugEvent[];
  simulateVisibility(hidden: boolean): Promise<void>;
}
declare global { interface Window { __HUCHU_TEST__?: HuchuTestBridge; } }
```

scenario 상태 주입은 임의 private 접근이 아니라 e2e build에서만 열리는 명시적 port 하나가 소유한다.

```ts
// src/game/debug/ScenarioSessionPort.ts (Task 14 최종 상태)
import type { GameEvent } from '../events/GameEvents';
import type { GameMode } from '../core/GameMode';
import type { ProjectileSpawn } from '../combat/ProjectileSystem';
import type { PlayerSnapshot } from '../player/PlayerTypes';
import type { PoolSnapshot } from '../pooling/ObjectPool';
import type { RunSnapshot } from '../session/RunSnapshot';
import type { SkillCard } from '../skills/SkillTypes';
import type { SkillLevels } from '../skills/SkillTypes';
import type { EnemyKind, EnemyState, EnemyVariant, PathId } from '../types/GameTypes';

export interface ScenarioEnemySeed {
  readonly kind: EnemyKind;
  readonly variant: EnemyVariant;
  readonly pathId: PathId;
  readonly placement: { readonly kind: 'attackBoundary' } | { readonly kind: 'worldPoint'; readonly x: number; readonly y: number };
  readonly currentHp?: number;
  readonly maxHp?: number;
  readonly state?: EnemyState;
  readonly stunnedMs?: number;
}
export interface ScenarioSessionPort {
  step(stepMs: number, player: PlayerSnapshot): readonly GameEvent[];
  snapshot(): RunSnapshot;
  selectCard(cardId: string): readonly GameEvent[];
  drainEvents(): readonly GameEvent[];
  reset(seed: number): void;
  useWaveSchedule(wave: number, schedule: 'real' | 'held' | 'exhausted'): void;
  replaceShelter(currentHp: number, maxHp?: number): void;
  damageShelter(damage: number): void;
  replaceSkills(levels: SkillLevels, learnedOrder: readonly Exclude<keyof SkillLevels, 'bark'>[]): void;
  setSnacks(snacks: number): void;
  replaceCards(cards: readonly SkillCard[]): void;
  spawnEnemy(seed: ScenarioEnemySeed): number;
  spawnProjectile(seed: ProjectileSpawn): void;
  removeEnemyWithoutReward(enemyId: number): void;
  enterMode(mode: GameMode, uiRemainingMs?: number): void;
  projectilePoolTelemetry(): PoolSnapshot;
}
```

`GameSession.scenarioPortForE2e()`는 `import.meta.env.MODE !== 'e2e'`이면 즉시 throw하고 위 closure만 반환한다. Task 14에서 closure에 `projectilePoolTelemetry: () => this.projectilePoolTelemetry()`를 추가하고 TestBridge의 pool snapshot도 이 port를 통해 읽는다. `EnemySystem.spawnForScenario()`는 `worldPoint`를 선택 path의 선분에 투영해 가장 가까운 progress를 결정하고, `attackBoundary`는 기존 `firstProgressWithinCircle` 값을 사용한다. `removeEnemyWithoutReward()`는 lifecycle/snack event 없이 enemy와 attack track만 반환한다. `held` schedule은 각 wave에 24시간 뒤 inert spawn 하나를 두어 테스트 horizon 동안 `pendingCount>0`, `exhausted`는 빈 schedule로 `pendingCount=0`, `real`은 실제 definition을 사용한다. 일반 `GameSession.step`에는 scenario 분기나 flag를 넣지 않는다. shelter/skill/progression 교체도 새 subsystem instance를 주입한 뒤 관련 counter만 reset한다.

```ts
// src/game/debug/ScenarioFactory.ts
import type { TestScenarioId } from './TestContract';
import type { ScenarioSessionPort } from './ScenarioSessionPort';
import type { PathId } from '../types/GameTypes';
import type { GameEvent } from '../events/GameEvents';

export interface ScenarioRuntimePort {
  readonly session: ScenarioSessionPort;
  stopScenarioMaintainers(): void;
  resetEventLog(): void;
  resetManualScheduler(): void;
  releaseAllViews(): void;
  releaseEnemyView(enemyId: number): void;
  setPlayer(x: number, y: number): void;
  applyEvents(events: readonly GameEvent[]): void;
  seedEffectPool(active: number): void;
  maintainStressPools(): void;
}

export function loadScenario(id: TestScenarioId, runtime: ScenarioRuntimePort): void {
  runtime.stopScenarioMaintainers();
  runtime.releaseAllViews();
  runtime.resetEventLog();
  runtime.resetManualScheduler();
  const port = runtime.session;
  port.reset(424242);
  runtime.setPlayer(270, 540);
  const finishLoad = () => runtime.applyEvents(port.drainEvents());

  if (id === 'wave-schedule') { port.useWaveSchedule(1, 'real'); finishLoad(); return; }
  port.useWaveSchedule(
    id === 'final-enemy' ? 5 : id === 'boss' ? 3 : 1,
    id === 'final-enemy' || id === 'shelter-defeat' ? 'exhausted' : 'held',
  );
  if (id === 'empty-run') { finishLoad(); return; }
  if (id === 'bark-targeting') {
    port.spawnEnemy({ kind: 'poopGuardian', variant: 'male', pathId: 'P1', placement: { kind: 'worldPoint', x: 270, y: 560 }, currentHp: 35 });
  } else if (id === 'poop-attack') {
    port.spawnEnemy({ kind: 'poopGuardian', variant: 'female', pathId: 'P1', placement: { kind: 'attackBoundary' }, currentHp: 1000, maxHp: 1000 });
  } else if (id === 'health-bar-colors') {
    const placements = [
      { pathId: 'P4' as const, x: 170, y: 445 },
      { pathId: 'P5' as const, x: 370, y: 445 },
      { pathId: 'P6' as const, x: 270, y: 625 },
    ];
    for (const [index, hp] of [35, 17, 6].entries()) {
      const placement = placements[index]!;
      port.spawnEnemy({ kind: 'poopGuardian', variant: index % 2 ? 'female' : 'male', pathId: placement.pathId, placement: { kind: 'worldPoint', x: placement.x, y: placement.y }, currentHp: hp, maxHp: 35, state: 'stunned', stunnedMs: 60_000 });
    }
  } else if (id === 'skill-selection') {
    port.setSnacks(8);
    port.spawnEnemy({ kind: 'poopGuardian', variant: 'male', pathId: 'P1', placement: { kind: 'worldPoint', x: 270, y: 560 }, currentHp: 1000, maxHp: 1000 });
    port.replaceCards([
      { id: 'bark:2', skillId: 'bark', nextLevel: 2, kind: 'upgrade', title: '짖기 Lv.2' },
      { id: 'scold:1', skillId: 'scold', nextLevel: 1, kind: 'unlock', title: '호통치기 배우기' },
      { id: 'aquaBeam:1', skillId: 'aquaBeam', nextLevel: 1, kind: 'unlock', title: '아쿠아빔 배우기' },
    ]);
    port.enterMode('skillSelection');
  } else if (id === 'all-skills') {
    port.replaceShelter(1_000_000, 1_000_000);
    port.replaceSkills({ bark: 1, scold: 1, aquaBeam: 1, deokbaeHowl: 1, safetyReport: 1 }, ['scold', 'aquaBeam', 'deokbaeHowl', 'safetyReport']);
    const placements = [
      { pathId: 'P6' as const, x: 270, y: 530 }, { pathId: 'P4' as const, x: 220, y: 480 },
      { pathId: 'P5' as const, x: 320, y: 480 }, { pathId: 'P1' as const, x: 270, y: 430 },
      { pathId: 'P3' as const, x: 270, y: 340 },
    ];
    for (const [index, kind] of (['poopGuardian', 'offLeashGuardian', 'poopGuardian', 'dogTrader', 'illegalBreeder'] as const).entries()) {
      const placement = placements[index]!;
      port.spawnEnemy({ kind, variant: kind === 'illegalBreeder' && index % 2 ? 'female' : 'male', pathId: placement.pathId, placement: { kind: 'worldPoint', x: placement.x, y: placement.y }, currentHp: 10_000, maxHp: 10_000, state: 'stunned', stunnedMs: 20_000 });
    }
  } else if (id === 'boss') {
    port.spawnEnemy({ kind: 'dogTrader', variant: 'male', pathId: 'P3', placement: { kind: 'attackBoundary' }, currentHp: 600, maxHp: 600 });
  } else if (id === 'final-enemy') {
    runtime.setPlayer(270, 480);
    port.spawnEnemy({ kind: 'illegalBreeder', variant: 'female', pathId: 'P3', placement: { kind: 'attackBoundary' }, currentHp: 10, maxHp: 1000 });
  } else if (id === 'shelter-defeat') {
    port.replaceShelter(1);
    port.damageShelter(1);
  } else if (id === 'stress') {
    port.replaceShelter(1_000_000, 1_000_000);
    for (let index = 0; index < 60; index += 1) port.spawnEnemy({ kind: index % 2 ? 'offLeashGuardian' : 'poopGuardian', variant: index % 2 ? 'female' : 'male', pathId: (`P${index % 6 + 1}` as PathId), placement: { kind: 'worldPoint', x: 40 + index % 10 * 50, y: 120 + Math.floor(index / 10) * 90 }, currentHp: 1_000_000, maxHp: 1_000_000 });
    for (let index = 0; index < 80; index += 1) port.spawnProjectile({ id: index, kind: 'poop', from: { x: index % 20 * 27, y: 40 + Math.floor(index / 20) * 80 }, to: { x: 270, y: 480 }, speed: 40, damage: 0, lifeMs: 60_000 });
    runtime.seedEffectPool(120);
    runtime.maintainStressPools();
  }
  finishLoad();
}
```

`'wave-schedule'` driver만 매 `GameSession.step` 반환 직후 `enemySpawned` id를 `removeEnemyWithoutReward`로 제거하고 같은 id를 `releaseEnemyView`로 반환해 actor/HP bar가 누적되지 않게 한다. shelter/skills/effects는 건드리지 않는다. `'stress'` maintainer는 step 뒤 반환된 projectile/effect slot만 같은 pool에서 보충하며 cleanup handle은 runtime이 보관해 다음 load의 `stopScenarioMaintainers()`에서 먼저 해제한다. `TestBridge.loadScenario`는 factory가 initial event를 적용하기 직전에 event sequence를 0으로 재설정한다. `finishLoad()`가 initial event를 Scene에 동기 적용하면서 sequence는 1부터 부여되고, factory 완료 뒤 scheduler requested/emitted tick과 `simulationMs`는 0인 상태로 `ready` render flush를 resolve한다. 따라서 첫 advance 전에도 actor, projectile, modal, failed shelter view와 pool telemetry가 준비된다. production은 `TestBridge`와 `ScenarioFactory`를 dynamic import하지 않는다.

```ts
// tests/e2e/helpers.ts
import type { Page } from '@playwright/test';
import type { GameDebugSnapshot, TestScenarioId } from '../../src/game/debug/TestContract';

export async function openScenario(page: Page, scenario: TestScenarioId): Promise<void> {
  await page.goto('/?e2e=1&seed=424242&clock=manual');
  await page.getByRole('button', { name: '보호소 지키기' }).click();
  await page.waitForFunction(() => window.__HUCHU_TEST__ !== undefined);
  await page.evaluate(() => window.__HUCHU_TEST__!.ready);
  await loadScenario(page, scenario);
}
export const loadScenario = (page: Page, scenario: TestScenarioId) =>
  page.evaluate((id) => window.__HUCHU_TEST__!.loadScenario(id), scenario);
export const advance = (page: Page, ms: number) => page.evaluate((value) => window.__HUCHU_TEST__!.advance(value), ms);
export const snapshot = (page: Page) => page.evaluate(() => window.__HUCHU_TEST__!.snapshot()) as Promise<GameDebugSnapshot>;
export const events = (page: Page, sequence = 0) => page.evaluate((value) => window.__HUCHU_TEST__!.eventsSince(value), sequence);
```

각 scenario factory는 seed와 명시적 객체 목록만으로 state를 만들고 이전 scenario actor/listener를 전부 release한 뒤 로드한다. `'stress'`는 enemy 60, projectile 80, effect 120을 정확히 활성화하며 cap을 초과 요청해도 created count가 늘지 않아야 한다. stress 전용 maintainer는 정상 lifetime·명중으로 반환된 projectile/effect를 같은 풀에서 즉시 다시 acquire해 30초 sample 내내 active count `60/80/120`을 유지한다. 적은 damage를 받지 않지만 이동·공격 상태 갱신은 계속하며, maintainer는 `import.meta.env.MODE==='e2e'`일 때만 존재한다.

- [ ] **Step 2: pool cap 단위 회귀와 같은 런타임의 세 번 반복 안정성을 검증한다.**

```ts
// tests/unit/PoolCaps.test.ts
import { ObjectPool } from '../../src/game/pooling/ObjectPool';

it('cap을 넘는 acquire를 거부하고 release한 객체를 재사용한다', () => {
  const pools = {
    enemies: new ObjectPool(60, () => ({ kind: 'enemy' })),
    projectiles: new ObjectPool(80, () => ({ kind: 'projectile' })),
    effects: new ObjectPool(120, () => ({ kind: 'effect' })),
  };
  const cycle = <T>(pool: ObjectPool<T>, cap: number) => {
    const acquired = Array.from({ length: cap }, () => pool.acquire()!);
    expect(pool.acquire()).toBeUndefined();
    for (const item of acquired) pool.release(item);
  };
  cycle(pools.enemies, 60);
  cycle(pools.projectiles, 80);
  cycle(pools.effects, 120);
  const initial = {
    enemies: pools.enemies.snapshot(), projectiles: pools.projectiles.snapshot(), effects: pools.effects.snapshot(),
  };
  for (let iteration = 0; iteration < 3; iteration += 1) {
    for (const [pool, cap] of [[pools.enemies, 60], [pools.projectiles, 80], [pools.effects, 120]] as const) {
      const acquired = Array.from({ length: cap }, () => pool.acquire()!);
      for (const item of acquired) pool.release(item);
    }
  }
  expect({ enemies: pools.enemies.snapshot(), projectiles: pools.projectiles.snapshot(), effects: pools.effects.snapshot() }).toEqual(initial);
  expect(initial).toMatchObject({
    enemies: { created: 60 }, projectiles: { created: 80 }, effects: { created: 120 },
  });
});
```

```ts
// tests/e2e/test-bridge.spec.ts에 추가
test('같은 page에서 stress를 세 번 다시 로드해도 pool instance와 created count가 유지된다', async ({ page }) => {
  await openScenario(page, 'empty-run');
  const identity = (pools: Awaited<ReturnType<typeof snapshot>>['pools']) => ({
    enemies: { instanceId: pools.enemies.instanceId, created: pools.enemies.created },
    projectiles: { instanceId: pools.projectiles.instanceId, created: pools.projectiles.created },
    effects: { instanceId: pools.effects.instanceId, created: pools.effects.created },
  });
  const initialIdentity = identity((await snapshot(page)).pools);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    await loadScenario(page, 'stress');
    const stressed = await snapshot(page);
    expect(identity(stressed.pools)).toEqual(initialIdentity);
    expect(stressed.pools).toMatchObject({
      enemies: { created: 60, active: 60 },
      projectiles: { created: 80, active: 80 },
      effects: { created: 120, active: 120 },
    });

    await loadScenario(page, 'empty-run');
    const cleared = await snapshot(page);
    expect(identity(cleared.pools)).toEqual(initialIdentity);
    expect(cleared.pools).toMatchObject({
      enemies: { active: 0 }, projectiles: { active: 0 }, effects: { active: 0 },
    });
  }
});
```

Run: `npm run test:unit -- tests/unit/PoolCaps.test.ts && npm run test:e2e -- tests/e2e/test-bridge.spec.ts`

Expected first run: Task 7의 독립 pool 단위 회귀는 통과하지만, 같은 page의 scenario reset이 actor/pool을 재생성하거나 완전히 release하지 않으면 E2E가 실패한다. Task 12의 `instanceId`, `created`, `active`, `available` telemetry를 그대로 노출하고 Task 14 reset wiring을 수정해 통과시킨다.

- [ ] **Step 3: 핵심 화면 시각 회귀와 에셋 리뷰 페이지를 작성한다.**

```ts
// tests/e2e/gameplay-visuals.spec.ts
import { expect, test } from '@playwright/test';
import { advance, openScenario } from './helpers';

for (const scenario of ['health-bar-colors', 'all-skills', 'boss', 'shelter-defeat'] as const) {
  test(`${scenario} 캔버스 시각 회귀`, async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 960 });
    await openScenario(page, scenario);
    await advance(page, 0);
    const before = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
    await expect(page.locator('canvas')).toHaveScreenshot(`${scenario}.png`, {
      animations: 'disabled', maxDiffPixelRatio: 0.015,
    });
  });
}
```

manual mode에서는 Phaser AnimationState/tween을 캐릭터·전투 effect에 사용하지 않고 snapshot age에서 frame/alpha를 직접 계산한다. `openScenario` 직후 `advance(0)`으로 render flush를 요청하고 `requestAnimationFrame` 두 번을 기다린 뒤 screenshot을 찍는다. 그 사이 snapshot과 canvas hash가 동일하다는 assertion을 `gameplay-visuals.spec.ts`에 추가한다.

```ts
// tests/visual/asset-review.spec.ts
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('asset review 문서에 모든 캐릭터와 보호소 overlay가 있다', async ({ page }) => {
  await page.setContent(await readFile('.cache/asset-review/sprite-animation-review.html', 'utf8'));
  await page.getByRole('button', { name: '프레임 정지' }).click();
  await expect(page.locator('[data-sheet]')).toHaveCount(9);
  await expect(page.locator('[data-animation="walk"]')).toHaveCount(9);
  await expect(page.locator('[data-animation="attack"]')).toHaveCount(9);
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every((canvas) => canvas.dataset.ready === 'true'));
  await expect(page).toHaveScreenshot('asset-review.png', { fullPage: true, maxDiffPixelRatio: 0.01 });
});
```

처음 한 번 `npm run assets:review && npx playwright test tests/e2e/gameplay-visuals.spec.ts tests/visual/asset-review.spec.ts --update-snapshots`를 실행한다. 생성된 baseline을 `view_image`로 확인해 다음을 수동 승인한 뒤 커밋한다.

- 후추·덕배 걷기/공격 프레임에 잘림·다른 캐릭터 혼입 없음
- 일반 적 변형 4종(pooper 남녀, off-leash 남녀)과 boss 변형 3종(trader, breeder 남녀)의 머리·발·소품이 셀 안에 있음
- poop 남녀 하단이 집기→조준→투척→복귀이며 휘파람 파동이 없음
- poop 남녀는 딴청을 피우는 40대, off-leash 남녀는 느슨한 목줄을 든 60대로 읽힘
- trader는 모자를 쓴 60대 남성, breeder 남녀는 가상 전기 장치를 든 50대로 읽힘
- 일반 적 HP bar가 full HP에서도 머리 위에 보임
- 작은 보호소와 6개 경로가 겹치지 않고 배경에 중복 보호소가 없음
- Huchu 표시 높이 72, Deokbae 64, shelter 77
- skill icon이 32×32를 넘지 않음

- [ ] **Step 4: 30초 desktop/mobile FPS test를 작성한다.**

```ts
// tests/performance/performance.spec.ts
import { expect, test } from '@playwright/test';
import { openScenario, snapshot } from '../e2e/helpers';

test.setTimeout(60_000);

test('@perf stress 장면은 평균 55fps와 저하 지속 기준을 지킨다', async ({ page }, testInfo) => {
  await openScenario(page, 'stress');
  const expectedActive = {
    enemies: { active: 60 }, projectiles: { active: 80 }, effects: { active: 120 },
  };
  expect((await snapshot(page)).pools).toMatchObject(expectedActive);
  const stats = await page.evaluate(async () => {
    const frameTimes: number[] = [];
    const started = performance.now();
    let previous = started;
    while (performance.now() - started < 30_000) {
      await new Promise<void>((resolve) => requestAnimationFrame((now) => {
        frameTimes.push(now - previous);
        window.__HUCHU_TEST__!.advanceWithoutFlush(now - previous);
        previous = now;
        resolve();
      }));
    }
    const elapsed = performance.now() - started;
    const averageFps = frameTimes.length * 1000 / elapsed;
    const oneSecondBuckets = Array.from({ length: Math.floor(elapsed / 1000) }, () => 0);
    let accumulated = 0;
    for (const frame of frameTimes) {
      accumulated += frame;
      const index = Math.floor(accumulated / 1000);
      if (index < oneSecondBuckets.length) oneSecondBuckets[index] = (oneSecondBuckets[index] ?? 0) + 1;
    }
    let lowStreak = 0;
    let maxLowStreak = 0;
    for (const fps of oneSecondBuckets) { lowStreak = fps < 50 ? lowStreak + 1 : 0; maxLowStreak = Math.max(maxLowStreak, lowStreak); }
    return { averageFps, maxLowStreakSeconds: maxLowStreak, frameCount: frameTimes.length };
  });
  await testInfo.attach('fps.json', { body: JSON.stringify(stats, null, 2), contentType: 'application/json' });
  expect((await snapshot(page)).pools).toMatchObject(expectedActive);
  expect(stats.averageFps).toBeGreaterThanOrEqual(55);
  expect(stats.maxLowStreakSeconds).toBeLessThanOrEqual(3);
});
```

이 test는 browser의 한 `requestAnimationFrame`마다 simulation을 동기 advance하고 다음 프레임을 바로 기다린다. 일반 `advance()`의 render-flush Promise를 rAF callback 안에서 기다리지 않으므로 측정 자체가 2프레임 cadence를 만들지 않는다. 시작 전 bridge가 `stress` scenario인지 확인하고, 종료 뒤 한 번의 rAF를 기다린 후 pool snapshot을 읽는다.

Task 1에서 만든 `playwright.config.ts`의 projects가 아래 값과 동일한지 고정한다. `test:perf`는 두 프로젝트를 worker 1로 순차 실행한다. 실제 모바일 Safari 측정은 기기명과 결과만 별도 기록하며 MVP 차단 조건에는 넣지 않는다.

```ts
projects: [
  {
    name: 'desktop-chromium',
    use: { browserName: 'chromium', viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 },
  },
  {
    name: 'mobile-chromium',
    use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  },
],
```

성능 test가 실패하면 다음 순서로만 조정하고 매 단계에서 재실행한다.

1. effect pool의 active particle lifetime과 alpha overdraw를 25% 줄인다.
2. 화면 밖 effect의 `visible=false` culling을 추가한다.
3. 장식 layer를 정적 RenderTexture 한 장으로 bake한다.

적 수, projectile 규칙, damage, path, skill 판정은 성능 조정으로 바꾸지 않는다.

- [ ] **Step 5: production bundle에 test bridge가 없는지 검증한다.**

Run: `npm run build`

Run: `rg "__HUCHU_TEST__|bark-targeting|shelter-defeat|forceWebglUnsupported|invalidPath" dist`

Expected: 출력 없음, exit code 1. 출력이 있으면 Task 5의 e2e-only dynamic import 계약이 깨진 것이므로 Task 14를 완료 처리하지 않는다.

- [ ] **Step 6: 모든 통합·시각·성능 test를 실행한다.**

Run: `npm run assets:verify && npm run assets:review && npm run test:unit && npm run build && npm run test:e2e && npm run test:perf`

Expected:

- unit/assets/e2e 실패 0
- desktop/mobile 30초 각각 average fps ≥55
- 50fps 미만 1초 bucket 연속 ≤3
- pool created count `60/80/120`, 3회 cycle 뒤 증가 0
- Playwright screenshot diff 기준 이내

- [ ] **Step 7: Task 14를 커밋한다.**

```bash
git add .gitignore playwright.config.ts src/game/debug src/game/session/GameSession.ts src/game/session/RunSnapshot.ts src/game/enemies/EnemySystem.ts src/game/shelter/ShelterSystem.ts src/game/skills/SkillSystem.ts src/game/scenes/GameScene.ts tests
git commit -m "test: add game acceptance and performance gates"
```

---

### Task 15: MVP 완료 검증과 사용자 플레이 승인

**Files:**
- Verify only: 전체 저장소
- Generated, do not commit: `.cache/`, `test-results/`, `playwright-report/`, `dist/`

**Interfaces:**
- Consumes: clean checkout, Node `>=22.12.0`, Chromium
- Produces: 재현 가능한 clean build, 자동 검증 증거, 사용자의 첫 판 플레이 승인

- [ ] **Step 1: clean install부터 전체 자동 검증을 실행한다.**

Run: `npm ci`

Run: `npx playwright install chromium`

Linux CI처럼 Chromium 시스템 의존성도 없는 clean runner라면 위 명령 대신 `npx playwright install --with-deps chromium`을 실행한다.

Run: `npm run assets:build && npm run assets:verify && npm run assets:review`

Run: `npm run test:unit && npm run build && npm run test:e2e && npm run test:perf`

Expected: 모든 명령 exit 0. 실패가 있으면 해당 기능 Task로 돌아가 실패 테스트를 유지한 채 최소 수정 후 Task 15를 처음부터 재실행한다.

- [ ] **Step 2: 구현 누락과 규칙 계층 비결정성을 정적 검사한다.**

Run: `rg -n "T[O]DO|T[B]D|FIX[M]E|place[h]older|임시" src tests scripts assets/source/provenance.json`

Expected: 출력 없음.

Run: `rg "Math\.random|Date\.now|performance\.now" src/game/core src/game/data src/game/session src/game/waves src/game/enemies src/game/combat src/game/progression src/game/skills`

Expected: 출력 없음.

Run: `rg "\.superpowers" src public scripts tests package.json`

Expected: 출력 없음. `assets/source/provenance.json`만 원본 provenance 문자열을 가질 수 있다.

- [ ] **Step 3: 실제 브라우저에서 한 판의 수동 acceptance를 수행한다.**

Run: `npm run dev`

사용자가 다음 순서로 직접 확인한다.

1. 세로 화면에서 `보호소 지키기`로 시작
2. 키보드 또는 터치로 후추 이동, 이동 중 자동 짖기
3. 일반 적 위 작은 HP bar 항상 표시
4. 똥 보호자의 단거리 똥 투척이 보호소에만 명중
5. snack 8 이후 전투 완전 정지, 카드 3장 중 선택, 3-2-1 재개
6. 좌상단 작은 자동 skill 슬롯과 네 skill 자동 시전
7. W3 개장수 boss, W5 불법번식업자 boss와 상단 HP bar
8. 보호소 4단계 외형, 승리 또는 패배, 재시작 초기화
9. 탭 전환 뒤 계속하기, resize 뒤 좌표 보존

- [ ] **Step 4: 최종 repository 상태와 변경 범위를 확인한다.**

Run: `git status --short && git log --oneline --decorate -15`

Expected: 의도하지 않은 파일과 generated report가 staged되지 않고, Task 1~14 commit이 논리적 순서로 존재한다. `.superpowers/`는 기존 untracked 상태를 보존하고 커밋하지 않는다.

- [ ] **Step 5: 완료 보고에는 검증 수치와 남은 비차단 항목만 적는다.**

보고 내용은 unit/e2e test 수, desktop/mobile average fps와 최대 low-fps streak, asset report failure 0, 사용자 플레이 승인 여부를 포함한다. 실제 모바일 Safari 측정을 하지 않았다면 `비차단 후속 검증`으로 명시하고 완료를 과장하지 않는다.

## Plan Self-Review Checklist

- [x] 설계의 18개 절과 완료 기준 10개가 Task 1~15에 각각 연결되어 있다.
- [x] Task 1~14에 exact Files, Consumes, Produces, 실패 테스트, 최소 구현, 검증 명령, commit이 있고 Task 15는 검증 전용이다.
- [x] 모든 test helper와 shared type 이름이 한 가지 casing을 사용한다.
- [x] 미완성 표식과 구현을 다른 Task에 떠넘기는 문구가 계획 본문에 없다.
- [x] ImageGen 비결정 단계와 Sharp 결정 단계가 분리되고 수동 승인 gate가 있다.
- [x] production runtime과 CI가 `.superpowers`를 직접 읽지 않는다.
- [x] 최종 결과 우선순위와 pause semantics가 모든 관련 Task에서 동일하다.
- [x] 성능 실패 대응이 게임 규칙을 바꾸지 않는다.
