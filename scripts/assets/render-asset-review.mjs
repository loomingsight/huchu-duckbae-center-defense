import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { characterOutput, characterSheets, mapAsset, shelterAsset } from './manifest.mjs';

const outputDir = '.cache/asset-review';
await mkdir(outputDir, { recursive: true });

const checkerboard = (width, height) =>
  Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse">
    <rect width="32" height="32" fill="#f1f5f9"/><path d="M0 0h16v16H0zM16 16h16v16H16z" fill="#cbd5e1"/>
  </pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>
</svg>`);

async function renderContactSheet() {
  const width = 768;
  const height = 512 * characterSheets.length;
  const composites = await Promise.all(
    characterSheets.map(async (entry, index) => ({
      input: await readFile(characterOutput(entry.key)),
      left: 0,
      top: index * 512,
    })),
  );
  await sharp(checkerboard(width, height))
    .composite(composites)
    .png()
    .toFile(`${outputDir}/sprite-contact-sheet.png`);
}

async function renderAnimationHtml() {
  const sheets = await Promise.all(
    characterSheets.map(async (entry) => ({
      key: entry.key,
      url: `data:image/png;base64,${(await readFile(characterOutput(entry.key))).toString('base64')}`,
    })),
  );
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
  const shelter = await sharp(shelterAsset.output)
    .extract({ left: 0, top: 0, width: 256, height: 256 })
    .resize({ height: 96, fit: 'contain' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const scale = shelter.info.height / 256;
  await sharp(background)
    .composite([
      {
        input: shelter.data,
        left: 270 - Math.round(shelter.info.width / 2),
        top: 480 - Math.round(shelterAsset.anchorY * scale),
      },
    ])
    .png()
    .toFile(`${outputDir}/map-shelter-overlay.png`);
}

async function renderMapHeatmap() {
  const [source, output] = await Promise.all([
    sharp(mapAsset.source).removeAlpha().raw().toBuffer(),
    sharp(mapAsset.output).removeAlpha().raw().toBuffer(),
  ]);
  const heat = Buffer.alloc(source.length);
  for (let offset = 0; offset < source.length; offset += 3) {
    const difference =
      Math.min(
        255,
        Math.max(
          Math.abs(source[offset] - output[offset]),
          Math.abs(source[offset + 1] - output[offset + 1]),
          Math.abs(source[offset + 2] - output[offset + 2]),
        ) * 8,
      );
    heat[offset] = difference;
    heat[offset + 1] = 0;
    heat[offset + 2] = 255 - difference;
  }
  await sharp(heat, { raw: { width: mapAsset.width, height: mapAsset.height, channels: 3 } })
    .png()
    .toFile(`${outputDir}/map-diff-heatmap.png`);
}

await Promise.all([
  renderContactSheet(),
  renderAnimationHtml(),
  renderMapOverlay(),
  renderMapHeatmap(),
]);
