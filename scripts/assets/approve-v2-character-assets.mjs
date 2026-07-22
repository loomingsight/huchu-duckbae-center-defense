import { pathToFileURL } from 'node:url';
import { parseApprovalCliArgs, updateApprovalLedgers } from './approval-ledger.mjs';
import { sourceAnimationEntries } from './manifest.mjs';

const referenceByStem = {
  huchu: 'assets/source/characters/huchu.png',
  deokbae: 'assets/source/characters/deokbae.png',
  'poop-male': 'assets/source/characters/enemy-poop-male-base.png',
  'poop-female': 'assets/source/characters/enemy-poop-female-base.png',
  'offleash-male': 'assets/source/characters/enemy-offleash-male.png',
  'offleash-female': 'assets/source/characters/enemy-offleash-female.png',
  'breeder-male': 'assets/source/characters/enemy-breeder-male.png',
  'breeder-female': 'assets/source/characters/enemy-breeder-female.png',
};

const V2_CHARACTER_KEYS = [
  'huchu-walk',
  'huchu-attack',
  'huchu-tail-swipe',
  'huchu-tail-overlay',
  'deokbae-walk',
  'deokbae-attack',
  'poop-male-walk',
  'poop-male-attack',
  'poop-female-walk',
  'poop-female-attack',
  'offleash-male-walk',
  'offleash-male-attack',
  'offleash-female-walk',
  'offleash-female-attack',
  'breeder-male-walk',
  'breeder-male-attack',
  'breeder-female-walk',
  'breeder-female-attack',
];

function referenceForKey(key) {
  const stem = Object.keys(referenceByStem).find((candidate) => key.startsWith(`${candidate}-`));
  if (stem === undefined) throw new Error(`No reference source configured for ${key}`);
  return referenceByStem[stem];
}

export function v2CharacterApprovalSources(entries = sourceAnimationEntries) {
  const owned = entries.filter(({ key }) => !key.startsWith('dog-trader-'));
  const expected = V2_CHARACTER_KEYS.map((key) => ({
    key,
    source: `assets/source/generated/v2/${key}.png`,
  }));
  const actualIdentities = owned
    .map(({ key, source }) => `${key}|${source}`)
    .sort();
  const expectedIdentities = expected
    .map(({ key, source }) => `${key}|${source}`)
    .sort();
  if (
    actualIdentities.length !== expectedIdentities.length ||
    actualIdentities.some((identity, index) => identity !== expectedIdentities[index])
  ) {
    throw new Error('Expected exact 18-source V2 approval set');
  }
  const byKey = new Map(owned.map((entry) => [entry.key, entry]));
  return V2_CHARACTER_KEYS.map((key) => ({
    source: byKey.get(key).source,
    references: [referenceForKey(key)],
  }));
}

export async function approveV2CharacterAssets({ root = '.', generatedAt, approvalEvidence } = {}) {
  const sources = v2CharacterApprovalSources();
  await updateApprovalLedgers({
    root,
    sources,
    provider: 'imagegen',
    generatedAt,
    approvalEvidence,
  });
  console.log(`Approved ${sources.length} V2 generated assets`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await approveV2CharacterAssets(parseApprovalCliArgs(process.argv.slice(2)));
}
