#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
function dep(n){try{return require(n)}catch{return require(require.resolve(n,{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}))}}
const {createCanvas,loadImage,GlobalFonts}=dep('@napi-rs/canvas'),root=path.resolve(__dirname,'..');
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sharedAssets=require('./shared-assets.cjs');
const normalizeText=require('./normalize-text.cjs'),assertFontCoverage=require('./font-coverage.cjs');
async function main(){
 if(process.argv.includes('--help')){console.log('node render-poster.cjs config.json output-directory; variant must be darkroom or mint. See references/unified.md');return}
 if(process.argv.length!==4)throw Error('Supply config.json and output-directory');
 const file=path.resolve(process.argv[2]),base=path.dirname(file),cfg=normalizeText(JSON.parse(fs.readFileSync(file))),out=path.resolve(process.argv[3]);
 if(!['darkroom','mint'].includes(cfg.variant))throw Error('Choose variant first: darkroom (红黑底绿字) or mint (浅绿底红字). No default.');
 if(cfg.layout==='legacy'){
  if(cfg.variant!=='darkroom')throw Error('legacy is only for existing darkroom/monologue layouts');
  const r=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'render-legacy.cjs'),file,out],{stdio:'inherit'});if(r.status!==0)throw Error('Legacy rendering failed');return;
 }
 if(typeof cfg.text!=='string'||!cfg.text.trim())throw Error('text is required');
 const data=sharedAssets(out);
 const mint=cfg.variant==='mint',W=1200,H=1600,spacing=-45,color=mint?'#b54434':'#b4ddbe';
 const canvas=createCanvas(W,H),c=canvas.getContext('2d'),bg=createCanvas(W,H),b=bg.getContext('2d');
 const fontName=cfg.font?path.resolve(base,cfg.font):path.join(root,'assets/fonts/YouyouYisong.ttf.gz');
 const readFont=p=>p.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(p)):fs.readFileSync(p);
 const fontBytes=readFont(fontName);if(!GlobalFonts.register(fontBytes,'Body'))throw Error('Cannot load body font');
 assertFontCoverage(fontBytes,[cfg.text,cfg.author,cfg.workTitle,cfg.sourceTitle,cfg.sourceMedium,cfg.sourcePrefix,...Object.values(cfg.credits??{}),cfg.credits?'作词：作曲：':'',cfg.workTitle||cfg.sourceTitle?'《》':''].filter(v=>typeof v==='string').join(''),'正文字体');
 let backBytes;
 const layerHTML=[];
 if(mint){
  const bytes=fs.readFileSync(path.join(root,'assets/mint-texture.png'));b.drawImage(await loadImage(bytes),0,0,W,H);layerHTML.push(`<img class="layer" alt="浅绿织纹" src="${data(bytes)}">`);
  backBytes=readFont(path.join(root,'assets/fonts/KingHwaOldSong-v3.ttf.gz'));if(!GlobalFonts.register(backBytes,'Back'))throw Error('Cannot load background font');assertFontCoverage(backBytes,(cfg.backgroundText??[]).join(''),'背景字体');
 }else{
  if(typeof cfg.photo!=='string')throw Error('darkroom requires an original photo');
  const im=await loadImage(path.resolve(base,cfg.photo)),scale=Math.max(W/im.width,H/im.height),sw=W/scale,sh=H/scale;
  const fx=cfg.focusX??.5,fy=cfg.focusY??.5;if(fx<0||fx>1||fy<0||fy>1)throw Error('focus must be 0..1');
  b.drawImage(im,(im.width-sw)*fx,(im.height-sh)*fy,sw,sh,0,0,W,H);
  const pixels=b.getImageData(0,0,W,H),d=pixels.data;
  for(let i=0;i<d.length;i+=4){const gray=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;for(let k=0;k<3;k++)d[i+k]=((gray*(cfg.brightness??1.05)/255-.5)*(cfg.contrast??1.2)+.5)*255;}b.putImageData(pixels,0,0);
  layerHTML.push(`<img class="layer" alt="照片" src="${data(bg.toBuffer('image/png'))}">`);
  const opacity=cfg.opacity??.85;if(opacity<0||opacity>1)throw Error('opacity must be 0..1');
  b.globalAlpha=opacity;b.globalCompositeOperation='multiply';b.fillStyle='#c90b13';b.fillRect(0,0,W,H);
  layerHTML.push(`<div class="layer" style="background:#c90b13;opacity:${opacity};mix-blend-mode:multiply"></div>`);
  const grain=createCanvas(W,H),g=grain.getContext('2d'),noise=g.createImageData(W,H);let seed=71925;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){seed=(Math.imul(seed,1664525)+1013904223)|0;const v=128+((seed>>>0)/4294967296-.5)*170+(x%3===0?28:-8)+(y%4===0?18:-6),i=(y*W+x)*4;noise.data[i]=noise.data[i+1]=noise.data[i+2]=v;noise.data[i+3]=255;}g.putImageData(noise,0,0);
  const go=cfg.grainOpacity??.23;if(go<0||go>1)throw Error('grainOpacity must be 0..1');b.globalAlpha=go;b.globalCompositeOperation='soft-light';b.drawImage(grain,0,0);
  layerHTML.push(`<img class="layer" alt="颗粒" style="opacity:${go};mix-blend-mode:soft-light" src="${data(grain.toBuffer('image/png'))}">`);
 }
 c.drawImage(bg,0,0);const backSVG=[],frontSVG=[];
 function glyphs(text,font,size,tracking){c.font=`${size}px ${font}`;let x=0,left=Infinity,right=-Infinity,ascent=0,descent=0;const chars=[];for(const ch of Array.from(text)){const m=c.measureText(ch);chars.push({ch,x});left=Math.min(left,x-m.actualBoundingBoxLeft);right=Math.max(right,x+m.actualBoundingBoxRight);ascent=Math.max(ascent,m.actualBoundingBoxAscent);descent=Math.max(descent,m.actualBoundingBoxDescent);x+=m.width+tracking;}return {chars,left,right,ascent,descent};}
 function draw(text,font,size,tracking,x,y,fill,blend,list){c.font=`${size}px ${font}`;c.globalCompositeOperation=blend;c.fillStyle=fill;c.strokeStyle=fill;c.lineWidth=size*.009;for(const it of glyphs(text,font,size,tracking).chars){c.fillText(it.ch,x+it.x,y);c.strokeText(it.ch,x+it.x,y);list.push(`<text x="${x+it.x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" stroke="${fill}" stroke-width="${size*.009}" paint-order="stroke fill">${esc(it.ch)}</text>`);}}
 if(mint){const texts=cfg.backgroundText??[];if(!Array.isArray(texts)||texts.length>2||texts.some(t=>typeof t!=='string'||!t.trim()))throw Error('backgroundText must contain up to two non-empty lines');texts.forEach((text,i)=>{const sz=600,stroke=sz*.0045,m=glyphs(text,'Back',sz,-sz*.1),left=m.left-stroke,top=-m.ascent-stroke,width=m.right-m.left+stroke*2,height=m.ascent+m.descent+stroke*2,slot=1200/texts.length,sx=1200/width,sy=slot/height,tx=-left*sx,ty=i*slot-top*sy,parts=[];c.save();c.setTransform(sx,0,0,sy,tx,ty);draw(text,'Back',sz,-sz*.1,0,0,'#ffffff','soft-light',parts);c.restore();backSVG.push(`<g transform="matrix(${sx} 0 0 ${sy} ${tx} ${ty})">${parts.join('')}</g>`);});}

 const lines=cfg.lines??cfg.text.split('\n');if(!Array.isArray(lines)||!lines.length||lines.some(s=>typeof s!=='string'||!s.trim()))throw Error('lines must contain non-empty strings, no blank lines');
 if(lines.join('')!==cfg.text.replace(/\n/g,''))throw Error('lines must preserve original text exactly');
 if(cfg.originalText){const original=Array.from(cfg.normalizedOriginalText.replace(/\s/g,'')),edited=Array.from(cfg.text.replace(/\s/g,''));let j=0;for(const ch of edited){if(ch===original[j])j++;else if(!'，。'.includes(ch))throw Error('Only commas and periods may be added to originalText');}if(j!==original.length)throw Error('Original words and punctuation must be preserved');}

 const emphasis=cfg.emphasis??[];if(!Array.isArray(emphasis))throw Error('emphasis must be a list of exact phrases');
 const all=Array.from(lines.join('')),factors=all.map(()=>1);for(const word of emphasis){const needle=Array.from(word);if(!needle.length||!all.join('').includes(word))throw Error('Invalid emphasis phrase');for(let i=0;i<=all.length-needle.length;i++)if(needle.every((v,j)=>all[i+j]===v))needle.forEach((_,j)=>factors[i+j]=1.55);}
 const gap=14,pad=8,bodyLimit=cfg.layout==='long'?((cfg.credits||cfg.sourceType==='quote')?1360:1430):1200;
 function measure(size){
  let offset=0,regularAscent=0,regularDescent=0;
  const rows=lines.map(line=>{
   let pen=0,left=Infinity,right=-Infinity,a=0,d=0;
   const chars=Array.from(line).map(ch=>{
    c.font=`${size}px Body`;const small=c.measureText(ch),regularStroke=size*.0045;
    regularAscent=Math.max(regularAscent,small.actualBoundingBoxAscent+regularStroke);
    regularDescent=Math.max(regularDescent,small.actualBoundingBoxDescent+regularStroke);
    const factor=factors[offset++],glyphSize=size*factor;c.font=`${glyphSize}px Body`;
    const m=c.measureText(ch),stroke=glyphSize*.0045,x=pen;
    const box={left:x-m.actualBoundingBoxLeft-stroke,right:x+m.actualBoundingBoxRight+stroke,a:m.actualBoundingBoxAscent+stroke,d:m.actualBoundingBoxDescent+stroke};
    left=Math.min(left,box.left);right=Math.max(right,box.right);a=Math.max(a,box.a);d=Math.max(d,box.d);pen+=m.width+spacing;
    return {ch,size:glyphSize,factor,x,box};
   });
   // Mixed lines follow their small words. A wholly emphasized line has no
   // small-word anchor, so place its actual letterforms locally between neighbors.
   const smallWords=chars.filter(ch=>ch.factor===1&&!/[\p{P}\p{S}\s]/u.test(ch.ch));
   const anchorA=smallWords.length?Math.max(...smallWords.map(ch=>ch.box.a)):a;
   const anchorD=smallWords.length?Math.max(...smallWords.map(ch=>ch.box.d)):d;
   return {chars,left,right,a,d,anchorA,anchorD,anchorMode:smallWords.length?'small-words':'whole-line'};
  });
  const regularBaselineStep=regularAscent+regularDescent+gap;
  rows.forEach((r,i)=>{r.baseline=i?rows[i-1].baseline+rows[i-1].anchorD+gap+r.anchorA:r.anchorA;});
  // Keep small-word row anchors stable; coordinate only a colliding emphasis run.
  // This is a glyph offset, not extra space inserted before the whole row.
  rows.forEach((row,i)=>{
   for(let start=0;start<row.chars.length;start++){
    if(row.chars[start].factor===1)continue;
    let end=start+1;while(end<row.chars.length&&row.chars[end].factor>1)end++;
    const run=row.chars.slice(start,end);let shift=0;
    if(row.anchorMode==='small-words'){
     for(let j=0;j<i;j++)for(const upper of rows[j].chars)for(const ch of run){
      const ul=pad-rows[j].left+upper.box.left,ur=pad-rows[j].left+upper.box.right;
      const cl=pad-row.left+ch.box.left,cr=pad-row.left+ch.box.right;
      if(ul<cr&&cl<ur)shift=Math.max(shift,rows[j].baseline+upper.box.d+(upper.yOffset??0)+gap-(row.baseline-ch.box.a));
     }
    }
    run.forEach(ch=>{ch.yOffset=shift;});start=end-1;
   }
   row.a=Math.max(...row.chars.map(ch=>ch.box.a-(ch.yOffset??0)));
   row.d=Math.max(...row.chars.map(ch=>ch.box.d+(ch.yOffset??0)));
  });
  let hasCollision=false;
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   const upper=rows[i],lower=rows[j];
   for(const u of upper.chars)for(const v of lower.chars){
    const ul=pad-upper.left+u.box.left,ur=pad-upper.left+u.box.right;
    const vl=pad-lower.left+v.box.left,vr=pad-lower.left+v.box.right;
    if(ul<vr&&vl<ur&&upper.baseline+u.box.d+(u.yOffset??0)+2>lower.baseline-v.box.a+(v.yOffset??0))hasCollision=true;
   }
  }
  const blockTop=Math.min(...rows.map(r=>r.baseline-r.a));
  const blockBottom=Math.max(...rows.map(r=>r.baseline+r.d));
  const baselineSteps=rows.slice(1).map((r,i)=>r.baseline-rows[i].baseline);
  return {rows,regularBaselineStep,baselineSteps,hasCollision,blockTop,bodyHeight:blockBottom-blockTop};
 }
 let size=600,layout;
 for(;size>=24;size--){layout=measure(size);if(layout.rows.every(r=>r.right-r.left<=W-pad*2)&&layout.bodyHeight<=bodyLimit-pad*2&&!layout.hasCollision)break;}
 if(size<24)throw Error('Cannot fit without collision: adjust word placement or semantic line breaks before confirming text; do not widen global line spacing');
 const {rows,bodyHeight,baselineSteps,regularBaselineStep,blockTop}=layout;
 const topPadding=(bodyLimit-bodyHeight)/2,baselineOrigin=topPadding-blockTop,rendered=[];
 rows.forEach((r,i)=>{
  const x=pad-r.left,y=baselineOrigin+r.baseline;
  r.chars.forEach(ch=>draw(ch.ch,'Body',ch.size,spacing,x+ch.x,y+(ch.yOffset??0),color,'source-over',frontSVG));
  rendered.push({text:lines[i],baseline:y,left:pad,right:pad+r.right-r.left,top:y-r.a,bottom:y+r.d,anchorTop:y-r.anchorA,anchorBottom:y+r.anchorD,anchorMode:r.anchorMode,emphasisOffsets:r.chars.filter(ch=>ch.yOffset).map(ch=>({text:ch.ch,offsetY:ch.yOffset}))});
 });
 const outputName=cfg.outputName??'poster';
 if(typeof outputName!=='string'||!outputName.trim()||outputName==='.'||outputName==='..'||/[\\/\x00-\x1f]/u.test(outputName))throw Error('outputName must be a filename stem without path separators');
 const recipeName=cfg.outputName?`${outputName}_排版参数.json`:'recipe.json';
 const sourceType=cfg.sourceType;
 if(sourceType!==undefined&&!['lyrics','quote'].includes(sourceType))throw Error('sourceType must be lyrics or quote');
 const author=String(cfg.author??''),sourceTop=bodyLimit,sourceRows=[];
 if(cfg.workTitle!==undefined&&(typeof cfg.workTitle!=='string'||!cfg.workTitle.trim()))throw Error('workTitle must be a non-empty string');
 const sourceAuthor=sourceType==='lyrics'&&cfg.workTitle?`${author}《${cfg.workTitle}》`:author;
 if(sourceType==='quote'){
  if(!author.trim())throw Error('quote requires a verified author');
  if(typeof cfg.sourceTitle!=='string'||!cfg.sourceTitle.trim())throw Error('quote requires a verified article, video or other source title');
  if(cfg.sourceMedium!==undefined&&(typeof cfg.sourceMedium!=='string'||!cfg.sourceMedium.trim()))throw Error('sourceMedium must be a non-empty string');
  if(cfg.credits!==undefined)throw Error('quote must use sourceTitle, not lyric credits');
 }

 const credits=cfg.credits;
 if(credits!==undefined&&(credits===null||typeof credits!=='object'||Array.isArray(credits)))throw Error('credits must be an object with lyricist and/or composer');
 for(const key of ['lyricist','composer'])if(credits?.[key]!==undefined&&(typeof credits[key]!=='string'||!credits[key].trim()))throw Error(`credits.${key} must be a non-empty string`);
 if(credits&&!author.trim())throw Error('credits requires author containing singer and song title');
 function sourceLine(text,preferredSize,top,role){
  let fontSize=preferredSize,m;
  for(;fontSize>=20;fontSize--){m=glyphs(text,'Body',fontSize,-4.666667);if(m.right-m.left+fontSize*.009<=1182)break;}
  if(fontSize<20)throw Error('Source line too long; shorten verified formatting or split the poster');
  const stroke=fontSize*.0045,x=1190-m.right-stroke,baseline=top+m.ascent+stroke;
  draw(text,'Body',fontSize,-4.666667,x,baseline,color,'source-over',frontSVG);
  const row={role,text,fontSize,left:x+m.left-stroke,right:1190,top,bottom:baseline+m.descent+stroke,baseline};sourceRows.push(row);return row;
 }
 if(author){
  const title=sourceLine(String(cfg.sourcePrefix??'')+sourceAuthor,77.77778,sourceTop,'title');
  if(credits){
   const parts=[];
   if(credits.lyricist)parts.push(`作词：${credits.lyricist}`);
   if(credits.composer)parts.push(`作曲：${credits.composer}`);
   if(!parts.length)throw Error('credits requires lyricist and/or composer');
   const detail=sourceLine(parts.join('　'),55.55556,title.bottom+14,'credits');
   if(detail.bottom>1505)throw Error('Credits exceed source area above Logo');
  }else if(sourceType==='quote'){
   const detail=sourceLine(`${cfg.sourceMedium??''}《${cfg.sourceTitle}》`,55.55556,title.bottom+14,'source');
   if(detail.bottom>1505)throw Error('Source title exceeds source area above Logo');
  }
 }
 if(cfg.brand!==false){const bytes=fs.readFileSync(path.join(root,'assets',mint?'logo-red.png':'watermark-exact.png'));c.globalCompositeOperation='source-over';c.drawImage(await loadImage(bytes),2,1513,278,57);frontSVG.push(`<image x="2" y="1513" width="278" height="57" href="${data(bytes)}"/>`);}
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(author||cfg.text)}</title><style>@font-face{font-family:Body;src:url(${data(fontBytes,'font/ttf')})}${backBytes?`@font-face{font-family:Back;src:url(${data(backBytes,'font/ttf')})}`:''}body{margin:0;background:#333;display:grid;place-items:center}.poster{position:relative;width:min(100vw,75vh);aspect-ratio:3/4;isolation:isolate}.layer{position:absolute;inset:0;width:100%;height:100%}</style><article class="poster">${layerHTML.join('')}<svg class="layer" viewBox="0 0 1200 1600" style="mix-blend-mode:soft-light">${backSVG.join('')}</svg><svg class="layer" viewBox="0 0 1200 1600">${frontSVG.join('')}</svg></article></html>`;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,`${outputName}.png`),canvas.toBuffer('image/png'));fs.writeFileSync(path.join(out,`${outputName}.html`),html);fs.writeFileSync(path.join(out,recipeName),JSON.stringify({...cfg,width:W,height:H,fontSize:size,letterSpacing:spacing,bodyBox:{x:0,y:0,width:W,height:bodyLimit},sourceTop,sourceRows,backgroundFit:"stretch-square",verticalAlign:"middle",bodyHeight,topPadding,lineSpacingMode:"optical-small-word-anchors",regularBaselineStep,baselineSteps,collisionChecked:true,rendered},null,2));console.log(JSON.stringify({variant:cfg.variant,fontSize:size,rows:rendered,output:out}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
