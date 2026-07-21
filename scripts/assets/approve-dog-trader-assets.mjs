import { pathToFileURL } from 'node:url';
import { parseApprovalCliArgs, updateApprovalLedgers } from './approval-ledger.mjs';
import { sourceAnimationEntries } from './manifest.mjs';

const REFERENCE = 'assets/source/characters/enemy-trader.png';
const DOG_TRADER_STEMS = [
  'human-walk-north',
  'human-walk-north-west',
  'human-walk-west',
  'human-walk-south-west',
  'human-walk-south',
  'human-attack-north',
  'human-attack-north-west',
  'human-attack-west',
  'human-attack-south-west',
  'human-attack-south',
  'truck-roll-north',
  'truck-roll-north-west',
  'truck-roll-west',
  'truck-roll-south-west',
  'truck-roll-south',
];

export function dogTraderApprovalSources(entries = sourceAnimationEntries) {
  const owned = entries.filter(({ key }) => key.startsWith('dog-trader-'));
  const expectedIdentities = DOG_TRADER_STEMS
    .map((stem) => `dog-trader-${stem}|assets/source/generated/dog-trader/${stem}.png`)
    .sort();
  const actualIdentities = owned
    .map(({ key, source }) => `${key}|${source}`)
    .sort();
  if (
    actualIdentities.length !== expectedIdentities.length ||
    actualIdentities.some((identity, index) => identity !== expectedIdentities[index])
  ) {
    throw new Error('Expected exact 15-source dog trader approval set');
  }
  const byKey = new Map(owned.map((entry) => [entry.key, entry]));
  return DOG_TRADER_STEMS.map((stem) => ({
    source: byKey.get(`dog-trader-${stem}`).source,
    references: [REFERENCE],
  }));
}

export async function approveDogTraderAssets({ root = '.', generatedAt, approvalEvidence } = {}) {
  const sources = dogTraderApprovalSources();
  await updateApprovalLedgers({
    root,
    sources,
    provider: 'imagegen',
    generatedAt,
    approvalEvidence,
  });
  console.log(`Approved ${sources.length} dog trader generated assets`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await approveDogTraderAssets(parseApprovalCliArgs(process.argv.slice(2)));
}
