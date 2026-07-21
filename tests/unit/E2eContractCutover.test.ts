import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const E2E_DIR = join(process.cwd(), 'tests/e2e');
const BANNED = [
  'skillSelection',
  'SkillCard',
  'selectCard',
  'deokbaeHowl',
  'scold',
  'stunned',
  'stunnedMs',
] as const;

it('모든 E2E consumer가 V2 bridge로 완전히 cutover된다', () => {
  const legacyHits = readdirSync(E2E_DIR)
    .filter((name) => name.endsWith('.ts'))
    .flatMap((name) => {
      const source = readFileSync(join(E2E_DIR, name), 'utf8');
      return BANNED
        .filter((identifier) => source.includes(identifier))
        .map((identifier) => `${name}:${identifier}`);
    });

  expect(legacyHits).toEqual([]);
  expect(existsSync(join(E2E_DIR, 'skill-selection.spec.ts'))).toBe(false);
  expect(existsSync(join(E2E_DIR, 'skill-dock.spec.ts'))).toBe(true);
  expect(existsSync(join(E2E_DIR, 'boss-rig.spec.ts'))).toBe(true);
  expect(existsSync(join(E2E_DIR, 'audio.spec.ts'))).toBe(true);
});
