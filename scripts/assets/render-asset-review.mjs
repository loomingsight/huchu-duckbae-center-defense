import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { alphaBounds, measureOutlineAt390 } from './verify-assets.mjs';
import { animationManifest, sourceAnimationEntries } from './manifest.mjs';

const outputDir = '.cache/asset-review';
const VIEWPORT_FIT = 390 / 540;
export const reviewSections = Object.freeze([
  'actors-at-390px',
  'walk-and-attack-frames',
  'tail-swipe-event-frame',
  'trader-directions-and-mirrors',
  'trader-event-sockets',
  'labels-hp-and-damage-numbers',
]);
function displayMetrics(entry) {
  if (entry.action === 'tailOverlay') {
    const cssSize = 256 * (72 / 204) * 2 * VIEWPORT_FIT;
    return { cssWidth: cssSize, cssHeight: cssSize, logicalHeight: 72 };
  }
  if (entry.key.startsWith('dog-trader-truck-roll-')) {
    return { cssWidth: 142 * VIEWPORT_FIT, cssHeight: 86 * VIEWPORT_FIT, logicalHeight: 86 };
  }
  let logicalHeight = 84;
  if (entry.key.startsWith('huchu-') || entry.key.startsWith('deokbae-')) logicalHeight = 72;
  if (entry.key.startsWith('breeder-') || entry.key.startsWith('dog-trader-human-')) logicalHeight = 100;
  const cssSize = 256 * (logicalHeight / entry.opaqueHeightPx) * VIEWPORT_FIT;
  return { cssWidth: cssSize, cssHeight: cssSize, logicalHeight };
}

function resolveReviewSource(entry) {
  let source = entry;
  let flipX = false;
  const visited = new Set();
  while (source.mirrorOf !== undefined) {
    if (visited.has(source.key)) throw new Error(`Animation mirror cycle at ${source.key}`);
    visited.add(source.key);
    const next = animationManifest.find(({ key }) => key === source.mirrorOf);
    if (next === undefined) throw new Error(`Unknown mirror source: ${source.mirrorOf}`);
    source = next;
    flipX = !flipX;
  }
  return { source, flipX };
}

async function frameBounds(file, frameCount) {
  return Promise.all(
    Array.from({ length: frameCount }, async (_, index) => {
      const { data } = await sharp(file)
        .extract({ left: index * 256, top: 0, width: 256, height: 256 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return alphaBounds(data, 256, 256);
    }),
  );
}

export async function reviewRow(entry) {
  const { source, flipX } = resolveReviewSource(entry);
  const file = `public${source.url}`;
  const metrics = displayMetrics(entry);
  const outlineAt390 = entry.action === 'tailOverlay'
    ? null
    : await measureOutlineAt390(file, {
      frameCount: entry.frameCount,
      logicalOpaqueHeight: metrics.logicalHeight,
      sourceOpaqueHeight: entry.opaqueHeightPx,
    });
  const bounds = await frameBounds(file, entry.frameCount);
  return {
    ...entry,
    dataUrl: `data:image/png;base64,${(await readFile(file)).toString('base64')}`,
    bounds: flipX
      ? bounds.map((value) => value === undefined ? value : { ...value, x: 256 - value.x - value.width })
      : bounds,
    cssWidth: metrics.cssWidth,
    cssHeight: metrics.cssHeight,
    flipX,
    outlineAt390,
  };
}

export async function renderAnimationHtml() {
  const animations = await Promise.all(animationManifest.map(reviewRow));
  const encodedAnimations = JSON.stringify(animations).replaceAll('<', '\\u003c');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>후추덕배 디펜스 V2 에셋 후보 검토판</title>
  <style>
  *{box-sizing:border-box}html,body{width:390px;max-width:390px;margin:0;overflow-x:hidden}body{font:12px system-ui,sans-serif;background:#334155;color:white}header{position:sticky;top:0;z-index:3;width:390px;padding:10px 12px;background:#1e293b;border-bottom:1px solid #64748b;font-size:11px;line-height:1.35}main{width:390px;padding:8px;display:grid;gap:10px}section{padding:8px;background:#1e293b;border:1px solid #475569;border-radius:10px}section>h1{margin:0 0 3px;font-size:14px}section>.section-note{margin:0 0 8px;color:#cbd5e1;font-size:10px;line-height:1.35}article{margin-top:8px;padding:7px;background:#0f172a;border-radius:8px;overflow:hidden}article>h2{margin:0 0 5px;font-size:11px;overflow-wrap:anywhere}.stage{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:5px;background:repeating-conic-gradient(#e2e8f0 0 25%,#94a3b8 0 50%) 50%/16px 16px}.frame-card{min-width:0;padding:3px;background:rgba(15,23,42,.88);border-radius:5px}.frame-visual{position:relative;margin:0 auto}.frame-visual canvas{display:block;width:100%;height:100%}.frame-meta{margin-top:3px;color:#e2e8f0;font:8px/1.25 ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}.sheet-meta{margin-top:4px;color:#cbd5e1;font-size:9px}.semantic-stage{display:flex;flex-wrap:wrap;align-items:end;gap:7px;padding:7px;background:#f1eadb;border-radius:7px}.semantic-stage .frame-card{width:108px;color:#1f2937;background:#fffaf0}.semantic-stage .frame-meta{color:#334155}.socket-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-top:5px}.socket-chip{padding:4px;border:1px solid #eab308;border-radius:5px;color:#fef08a;font-size:9px}.label-demo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px;background:#e7efd8;border-radius:7px}.enemy-tag{display:grid;justify-items:center;gap:2px}.hp-demo{width:94px;height:6px;padding:1px;background:#30271f;border-radius:3px}.hp-demo>i{display:block;height:4px;border-radius:2px}.enemy-label{padding:2px 5px;border-radius:4px;color:white;background:rgba(47,37,31,.86);font-size:10px;font-weight:800;text-shadow:-1px 0 #30271f,0 1px #30271f,1px 0 #30271f,0 -1px #30271f}.damage-demo{display:flex;justify-content:space-around;align-items:end;min-height:52px;margin-top:8px;padding:8px;background:#3f4d35;border-radius:7px}.damage-demo span{font-weight:900;text-shadow:0 1px 2px #30271f}.legend{color:#fde68a}
  </style></head><body>
  <header><strong>390px CSS viewport · 후보 전용</strong><br><span class="legend">빨강=foot anchor 254 · 민트=alpha bounds · 노랑=event socket</span><br>사람이 승인하기 전 snapshot/ledger를 변경하지 않음</header>
  <main id="root">
    <section data-review-section="actors-at-390px"><h1>실제 표시 크기 배우</h1><p class="section-note">대표 실루엣을 390px FIT 크기로 함께 비교</p><div class="semantic-stage" data-section-body></div></section>
    <section data-review-section="walk-and-attack-frames"><h1>걷기·공격 프레임</h1><p class="section-note">일반 배우 16개 sheet의 primary frames</p><div data-section-body></div></section>
    <section data-review-section="tail-swipe-event-frame"><h1>후추 꼬리치기 판정 프레임</h1><p class="section-note">몸 6 frames + 꼬리 4 frames · 꼬리 frame 3에서 360도 판정</p><div data-section-body></div></section>
    <section data-review-section="trader-directions-and-mirrors"><h1>개장수 방향·mirror</h1><p class="section-note">사람 걷기와 트럭의 8방향 구도, source/mirror 대응</p><div data-section-body></div></section>
    <section data-review-section="trader-event-sockets"><h1>개장수 공격 socket</h1><p class="section-note">8방향 eventFrame 5 손 위치와 mirror 변환</p><div data-section-body></div></section>
    <section data-review-section="labels-hp-and-damage-numbers"><h1>이름표·HP·피해 숫자</h1><p class="section-note">390px 한글 가독성, 세 HP 색과 세 타격 강도</p><div data-section-body></div></section>
  </main>
  <script>const animations=${encodedAnimations};
  const bodyFor=id=>document.querySelector('[data-review-section="'+id+'"] [data-section-body]');
  function boundsText(bounds){return bounds?bounds.x+','+bounds.y+','+bounds.width+','+bounds.height:'empty'}
  function footText(bounds){return bounds?String(bounds.y+bounds.height):'none'}
  function appendFrames(row,stage,options={}){const primary=options.primary!==false;const indices=options.indices??Array.from({length:row.frameCount},(_,index)=>index);const image=new Image();const views=[];for(const index of indices){const bounds=row.bounds[index];const cssWidth=row.cssWidth;const cssHeight=row.cssHeight;const card=document.createElement('div');card.className='frame-card';if(primary){card.dataset.primaryReviewFrame='true';card.dataset.primaryAnimationFrame=String(index)}else card.dataset.semanticPreview='true';card.dataset.manifestKey=row.key;card.dataset.frameIndex=String(index);card.dataset.footAnchor=footText(bounds);card.dataset.alphaBounds=boundsText(bounds);card.dataset.cssSize=cssWidth.toFixed(2)+'x'+cssHeight.toFixed(2);if(index===row.eventFrame)card.dataset.eventFrame=String(index);const visual=document.createElement('div');visual.className='frame-visual';visual.style.width=cssWidth+'px';visual.style.height=cssHeight+'px';const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.dataset.frameIndex=String(index);visual.append(canvas);const meta=document.createElement('div');meta.className='frame-meta';meta.dataset.frameMeta='true';meta.textContent=card.dataset.manifestKey+' #'+index+' · foot '+card.dataset.footAnchor+' · α '+card.dataset.alphaBounds+' · CSS '+card.dataset.cssSize+'px';card.append(visual,meta);stage.append(card);views.push({canvas,index})}image.onload=()=>{for(const {canvas,index} of views){const context=canvas.getContext('2d');context.clearRect(0,0,256,256);if(row.flipX){context.save();context.translate(256,0);context.scale(-1,1)}context.drawImage(image,index*256,0,256,256,0,0,256,256);if(row.flipX)context.restore();context.strokeStyle='#ef4444';context.lineWidth=2;context.beginPath();context.moveTo(0,254);context.lineTo(256,254);context.stroke();const bounds=row.bounds[index];if(bounds){context.strokeStyle='#2dd4bf';context.strokeRect(bounds.x,bounds.y,bounds.width,bounds.height)}if(index===row.eventFrame&&row.eventSocket){context.strokeStyle='#facc15';context.lineWidth=4;context.beginPath();context.arc(row.eventSocket.x,row.eventSocket.y,8,0,Math.PI*2);context.stroke()}if(row.action==='tailSwipe'&&index===row.eventFrame){context.strokeStyle='#fb7185';context.lineWidth=5;context.beginPath();context.arc(128,180,64,0,Math.PI*2);context.stroke()}canvas.dataset.ready='true'}};image.src=row.dataUrl}
  function appendSheet(row,sectionId){const article=document.createElement('article');article.dataset.sheet=row.key;article.dataset.kind='animation';article.dataset.action=row.action;article.dataset.frameCount=String(row.frameCount);article.dataset.assetGroup=row.key.startsWith('dog-trader-')?'dog-trader':'generic';article.dataset.virtualMirror=String(row.mirrorOf!==undefined);if(row.direction)article.dataset.direction=row.direction;if(row.eventSocket)article.dataset.eventSocket=row.eventSocket.x+','+row.eventSocket.y;const title=document.createElement('h2');title.textContent=row.key;const stage=document.createElement('div');stage.className='stage';appendFrames(row,stage);const meta=document.createElement('div');meta.className='sheet-meta';const outline=row.outlineAt390===null?'n/a':row.outlineAt390.toFixed(2)+'px';meta.textContent=row.frameCount+'f @ '+row.fps+'fps · '+(row.direction?'direction '+row.direction+' · ':'')+(row.mirrorOf?'mirrorOf '+row.mirrorOf+' · ':'source · ')+'outline '+outline;article.append(title,stage,meta);bodyFor(sectionId).append(article)}
  const representatives=['huchu-walk','deokbae-walk','poop-male-walk','poop-female-walk','offleash-male-walk','offleash-female-walk','dog-trader-human-walk-south','breeder-male-walk','breeder-female-walk','dog-trader-truck-roll-south'];for(const key of representatives){const row=animations.find(candidate=>candidate.key===key);appendFrames(row,bodyFor('actors-at-390px'),{primary:false,indices:[0]})}
  for(const row of animations){let sectionId;if(row.action==='tailSwipe'||row.action==='tailOverlay')sectionId='tail-swipe-event-frame';else if(row.key.startsWith('dog-trader-')&&row.action==='attack')sectionId='trader-event-sockets';else if(row.key.startsWith('dog-trader-'))sectionId='trader-directions-and-mirrors';else sectionId='walk-and-attack-frames';appendSheet(row,sectionId)}
  {const socketSummary=document.createElement('div');socketSummary.className='socket-summary';for(const row of animations.filter(row=>row.key.startsWith('dog-trader-human-attack-'))){const chip=document.createElement('div');chip.className='socket-chip';chip.textContent=row.direction+' · ('+row.eventSocket.x+','+row.eventSocket.y+') · '+(row.mirrorOf?'mirror '+row.mirrorOf:'source');socketSummary.append(chip)}bodyFor('trader-event-sockets').prepend(socketSummary)}
  {const labels=['똥 방치 보호자','오프리시 보호자','개장수','불법번식업자'];const demo=document.createElement('div');demo.className='label-demo';for(const [index,label] of labels.entries()){const tag=document.createElement('div');tag.className='enemy-tag';const hp=document.createElement('div');hp.className='hp-demo';const fill=document.createElement('i');fill.style.width=(index===0?100:index===1?50:20)+'%';fill.style.background=index===0?'#67b85b':index===1?'#f2b84b':'#e65b4f';hp.append(fill);const name=document.createElement('div');name.className='enemy-label';name.dataset.enemyLabel=label;name.textContent=label;tag.append(hp,name);demo.append(tag)}const colors=[['healthy','#67b85b'],['warning','#f2b84b'],['critical','#e65b4f']];for(const [name,color] of colors){const hp=document.createElement('div');hp.className='hp-demo';hp.dataset.hpColor=name;const fill=document.createElement('i');fill.style.width='72%';fill.style.background=color;hp.append(fill);demo.append(hp)}const damage=document.createElement('div');damage.className='damage-demo';for(const [strength,size,color,value] of [['light',13,'#fff1cf','-11'],['medium',17,'#f59e42','-14'],['heavy',24,'#fde047','-90']]){const number=document.createElement('span');number.dataset.damageStrength=strength;number.style.fontSize=size+'px';number.style.color=color;number.textContent=value;damage.append(number)}bodyFor('labels-hp-and-damage-numbers').append(demo,damage)}
  <\/script></body></html>`;
  await writeFile(`${outputDir}/sprite-animation-review.html`, html);
}

export async function main() {
  const missingCandidates = sourceAnimationEntries
    .map(({ source }) => source)
    .filter((file) => !existsSync(file));
  if (missingCandidates.length > 0) {
    throw new Error(`V2 candidates missing (${missingCandidates.length}): run assets:prepare:v2 after image generation`);
  }
  const missingRuntime = sourceAnimationEntries
    .map(({ url }) => `public${url}`)
    .filter((file) => !existsSync(file));
  if (missingRuntime.length > 0) {
    throw new Error(`V2 runtime assets missing (${missingRuntime.length}): run npm run assets:build`);
  }
  await mkdir(outputDir, { recursive: true });
  await renderAnimationHtml();
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
