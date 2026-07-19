export const characterSheets = [
  { key: 'huchu', source: 'assets/source/characters/huchu.png' },
  { key: 'deokbae', source: 'assets/source/characters/deokbae.png' },
  {
    key: 'enemy-poop-male',
    source: 'assets/source/characters/enemy-poop-male-base.png',
    attackEdit: 'assets/source/generated/enemy-poop-male-throw-edit.png',
  },
  {
    key: 'enemy-poop-female',
    source: 'assets/source/characters/enemy-poop-female-base.png',
    attackEdit: 'assets/source/generated/enemy-poop-female-throw-edit.png',
  },
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
  width: 941,
  height: 1672,
  centerX: 470.5,
  centerY: 806,
  radiusX: 120,
  radiusY: 155,
  feather: 12,
};

export const shelterAsset = {
  source: 'assets/source/generated/shelter-states-edit.png',
  output: 'public/assets/shelter/shelter-states.png',
  cellWidth: 256,
  cellHeight: 256,
  anchorX: 128,
  anchorY: 224,
};
