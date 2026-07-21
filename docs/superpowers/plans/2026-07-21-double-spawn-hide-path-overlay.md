# Double Spawn Cadence And Hide Path Overlay Implementation Plan

> **For agentic workers:** Execute inline in the existing `codex/huchu-defense-mvp` worktree. Do not dispatch subagents and do not commit or push.

**Goal:** Make every wave spawn event occur twice as frequently without changing enemy counts, and remove the blue development path lines from normal local play.

**Architecture:** Keep the existing grouped wave model and halve only each group's seconds offset. Remove the normal-development construction of `DebugPathOverlay`; gameplay `PATH_DEFINITIONS` and the tan map asset remain unchanged.

**Tech Stack:** TypeScript 7, Phaser 4, Vitest, Playwright

## Global Constraints

- Total enemies and group composition remain unchanged.
- Every group time, including boss groups, is exactly half its previous value.
- No approved asset, approval ledger, or visual baseline is changed.
- No commit or push.

---

### Task 1: Double wave spawn cadence

**Files:**
- Modify: `tests/unit/GameDataValidation.test.ts`
- Modify: `tests/e2e/wave-schedule.spec.ts`
- Modify: `src/game/data/waveDefinitions.ts`

**Interfaces:**
- Consumes: existing `WaveDefinition.groups` tuples in seconds
- Produces: unchanged group counts with seconds `[0,5,10,15,20]` for wave 1 and the same 0.5 multiplier for waves 2-5

- [ ] Change the exact unit and E2E expectations first. Wave 1 request timestamps become `0,0,5000,5000,10000,10000,15000,15000,20000,20000`.
- [ ] Run `npm run test:unit -- tests/unit/GameDataValidation.test.ts` and confirm the schedule expectation fails against the old values.
- [ ] Halve every non-zero group seconds value in `WAVE_DEFINITIONS` while preserving counts and boss kinds.
- [ ] Re-run the focused unit test and confirm it passes.
- [ ] Run `npx playwright test tests/e2e/wave-schedule.spec.ts --project=mobile-chromium --workers=1` and confirm the 20-second schedule passes.

### Task 2: Remove local path debug lines

**Files:**
- Modify: `tests/unit/PresentationRules.test.ts`
- Modify: `src/game/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `GameScene.ts` source contract
- Produces: normal local play with no `DebugPathOverlay` import or construction

- [ ] Add a source contract assertion that `GameScene.ts` does not contain `DebugPathOverlay`.
- [ ] Run `npm run test:unit -- tests/unit/PresentationRules.test.ts` and confirm it fails because the overlay is still constructed.
- [ ] Remove the import and development-only `new DebugPathOverlay(this)` call from `GameScene.ts`.
- [ ] Re-run the focused unit test and confirm it passes.
- [ ] Run the full unit suite, build, and a real local mobile smoke capture to verify the blue lines are absent.
