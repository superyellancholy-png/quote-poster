#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
function dependency(name){try{return require(name);}catch{return require(require.resolve(name,{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));}}
const {createCanvas,loadImage,GlobalFonts}=dependency('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
const sharedAssets=require('./shared-assets.cjs');
const checkPunctuation=require('./check-punctuation.cjs');
const normalizeText=require('./normalize-text.cjs'),assertFontCoverage=require('./font-coverage.cjs');
const help='Usage: node render-poster.cjs config.json output-directory\nCreates poster.png, poster.html and recipe.json. See references/parameters.md.';
if(process.argv.includes('--help')){console.log(help);process.exit(0);}
function num(v,def,min,max,key){v=v??def;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${key} must be ${min}..${max}`);return v;}
function hex(v,def){v=v??def;if(!/^#[0-9a-f]{6}$/i.test(v))throw Error('Colors must use #RRGGBB');return v;}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function local(p,base){return path.resolve(base,p);}
async function main(){
 if(process.argv.length!==4)throw Error(help);
 const configPath=path.resolve(process.argv[2]),base=path.dirname(configPath),raw=normalizeText(JSON.parse(fs.readFileSync(configPath,'utf8'))),out=path.resolve(process.argv[3]);
 const data=sharedAssets(out);
 if(typeof raw.photo!=='string'||!raw.photo)throw Error('photo is required; supply an original local photograph.');
 if(typeof raw.text!=='string'||!raw.text.trim())throw Error('text is required.');
 checkPunctuation(raw);
 const preset=raw.preset??'darkroom';if(!['darkroom','monologue'].includes(preset))throw Error('preset must be darkroom or monologue');
 const W=1200,H=1600;
 const BODY_SPACING=-45;
 const fontPath=raw.font?local(raw.font,base):path.join(root,'assets/fonts/YouyouYisong.ttf.gz');
 if(!/\.(ttf|otf)(\.gz)?$/i.test(fontPath))throw Error('Use a TTF or OTF font. Convert WOFF/WOFF2 before rendering.');
 const fontBytes=fontPath.endsWith('.gz')?require('node:zlib').gunzipSync(fs.readFileSync(fontPath)):fs.readFileSync(fontPath);
 if(!GlobalFonts.register(fontBytes,'PosterFont'))throw Error('Font could not be loaded.');
 assertFontCoverage(fontBytes,[raw.text,raw.author,typeof raw.brand==='string'?raw.brand:''].filter(Boolean).join(''),'正文字体');
 const cfg={...raw,preset,photo:local(raw.photo,base),font:fontPath,
  tint:hex(raw.tint,'#c90b13'),textColor:hex(raw.textColor,'#b4ddbe'),
  brightness:num(raw.brightness,1.05,.1,2.5,'brightness'),contrast:num(raw.contrast,1.2,.1,3,'contrast'),
  saturation:num(raw.saturation,0,0,1,'saturation'),opacity:num(raw.opacity,.85,0,1,'opacity'),
  grainOpacity:num(raw.grainOpacity,.23,0,1,'grainOpacity'),grainSize:num(raw.grainSize,2,1,8,'grainSize'),
  fontSize:num(raw.fontSize,preset==='monologue'?127:203,30,300,'fontSize'),lineHeight:num(raw.lineHeight,1.28,1,2,'lineHeight'),
  focusX:num(raw.focusX,.5,0,1,'focusX'),focusY:num(raw.focusY,.5,0,1,'focusY'),
  texture:raw.texture??'fabric',blend:raw.blend??'multiply',author:String(raw.author??''),brand:String(raw.brand??'@二流观众'),
  emphasis:raw.emphasis??-1,signaturePosition:raw.signaturePosition??(preset==='monologue'?'top-right':'bottom-left'),
  layers:{photo:true,tint:true,grain:true,text:true,...raw.layers}};
 if(!['fabric','noise'].includes(cfg.texture))throw Error('texture must be fabric or noise');
 if(!['multiply','normal'].includes(cfg.blend))throw Error('blend must be multiply or normal');
 if(!['top-right','bottom-left'].includes(cfg.signaturePosition))throw Error('Invalid signaturePosition');
 const lines=cfg.text.split('\n');if(!Number.isInteger(cfg.emphasis)||cfg.emphasis< -1||cfg.emphasis>=lines.length)throw Error('emphasis is a zero-based line index, or -1');
 const photo=createCanvas(W,H),p=photo.getContext('2d'),image=await loadImage(cfg.photo);
 let sx=0,sy=0,sw=image.width,sh=image.height;
 if(raw.crop){if(!Array.isArray(raw.crop)||raw.crop.length!==4)throw Error('crop requires [x,y,width,height] in normalized coordinates');const [x,y,w,h]=raw.crop.map((v,i)=>num(v,0,0,1,'crop'));if(w<=0||h<=0||x+w>1.00001||y+h>1.00001)throw Error('crop outside image');sx=x*sw;sy=y*sh;sw*=w;sh*=h;}
 const factor=Math.max(W/sw,H/sh),cw=W/factor,ch=H/factor;
 p.fillStyle='#090706';p.fillRect(0,0,W,H);p.drawImage(image,sx+(sw-cw)*cfg.focusX,sy+(sh-ch)*cfg.focusY,cw,ch,0,0,W,H);
 const pixels=p.getImageData(0,0,W,H);for(let i=0;i<pixels.data.length;i+=4){const d=pixels.data;const gray=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;for(let k=0;k<3;k++){let v=gray+(d[i+k]-gray)*cfg.saturation;d[i+k]=((v*cfg.brightness/255-.5)*cfg.contrast+.5)*255;}}p.putImageData(pixels,0,0);
 const grain=createCanvas(W,H),g=grain.getContext('2d'),tiny=createCanvas(Math.ceil(W/cfg.grainSize),Math.ceil(H/cfg.grainSize)),t=tiny.getContext('2d'),noise=t.createImageData(tiny.width,tiny.height);let seed=71925;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
 for(let y=0;y<tiny.height;y++)for(let x=0;x<tiny.width;x++){const i=(y*tiny.width+x)*4;let v=128+(random()-.5)*170;if(cfg.texture==='fabric')v+=(x%3===0?28:-8)+(y%4===0?18:-6);noise.data[i]=noise.data[i+1]=noise.data[i+2]=v;noise.data[i+3]=255;}t.putImageData(noise,0,0);g.imageSmoothingEnabled=false;g.drawImage(tiny,0,0,W,H);
 const final=createCanvas(W,H),c=final.getContext('2d');c.fillStyle='#090706';c.fillRect(0,0,W,H);
 if(cfg.layers.photo)c.drawImage(photo,0,0);
 if(cfg.layers.tint){c.globalAlpha=cfg.opacity;c.globalCompositeOperation=cfg.blend==='normal'?'source-over':'multiply';c.fillStyle=cfg.tint;c.fillRect(0,0,W,H);}
 if(cfg.layers.grain){c.globalAlpha=cfg.grainOpacity;c.globalCompositeOperation='soft-light';c.drawImage(grain,0,0);}
 c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle=cfg.textColor;c.textBaseline='alphabetic';
 const useLogo=cfg.brand==='@二流观众' && raw.brandMode!=='text';
 const brandText=useLogo?'':cfg.brand;
 let body;
 if(raw.textLayout){
 cfg.letterSpacing=BODY_SPACING;
 cfg.textLayout=raw.textLayout.map(row=>({...row,letterSpacing:BODY_SPACING}));
 const rows=cfg.textLayout;
 if(!Array.isArray(rows)||!rows.length)throw Error('textLayout must contain rows');
 if(rows.flatMap(r=>r.runs.map(s=>s.text)).join('')!==cfg.text.replace(/\n/g,''))throw Error('textLayout must preserve the exact text and order');
 const specs=[];
 for(const row of rows){
  const x=num(row.x,8,-100,1100,'row.x'),y=num(row.baseline,300,0,1500,'row.baseline'),spacing=BODY_SPACING;
  const chars=row.runs.flatMap(run=>Array.from(run.text).map(text=>({text,size:num(run.fontSize,cfg.fontSize,30,600,'run.fontSize')})));
  let width=0; for(const ch of chars){c.font=`${ch.size}px PosterFont`;width+=c.measureText(ch.text).width;}width+=Math.max(0,chars.length-1)*spacing;
  const gaps=Math.max(0,chars.length-1)*spacing;
  const fit=Math.min(1,(W-x-20-gaps)/Math.max(1,width-gaps));let pen=x;
  for(const ch of chars){const size=ch.size*fit;c.font=`${size}px PosterFont`;specs.push({text:ch.text,size,x:pen,y});pen+=c.measureText(ch.text).width+spacing;}
 }
 if(brandText)specs.push({text:brandText,size:68,x:0,y:1566});
 if(cfg.author)specs.push({text:cfg.author,size:58,x:20,y:1450});
 body=specs.map(s=>{if(cfg.layers.text){c.font=`${s.size}px PosterFont`;c.fillText(s.text,s.x,s.y);}return `<text x="${s.x}" y="${s.y}" font-size="${s.size}">${escape(s.text)}</text>`;}).join('\n');
 }else if(preset==='monologue'){
 const font=s=>`${s}px PosterFont`;const specs=lines.map((line,i)=>{let size=cfg.fontSize*(i===cfg.emphasis?1.85:1);c.font=font(size);const available=cfg.signaturePosition==='top-right'&&i<2?1080:1152;size*=Math.min(1,available/Math.max(1,c.measureText(line).width));return{text:line,size};});
 const maxHeight=preset==='monologue'?1310:1060,total=specs.reduce((sum,s)=>sum+s.size*cfg.lineHeight,0),fit=Math.min(1,maxHeight/total);let y=55;
 for(const s of specs){s.size*=fit;c.font=font(s.size);const m=c.measureText(s.text||'国'),a=m.fontBoundingBoxAscent??s.size*.88,d=m.fontBoundingBoxDescent??s.size*.12;s.x=24;s.y=y+(s.size*cfg.lineHeight-a-d)/2+a;y+=s.size*cfg.lineHeight;}
 function addText(text,size,x,y,max,align='left'){c.font=font(size);size*=Math.min(1,max/Math.max(1,c.measureText(text).width));c.font=font(size);const width=c.measureText(text).width;specs.push({text,size,x:align==='right'?x-width:x,y});}
 addText(cfg.author,58,1176,preset==='monologue'?1540:1300,1120,'right');
 if(cfg.signaturePosition==='top-right'){
  const chars=Array.from(brandText);const step=Math.min(44,280/Math.max(1,chars.length));chars.forEach((ch,i)=>addText(ch,step,1176-step,85+i*step,step));
 }else addText(brandText,48,24,1550,1120);
 body=specs.map(s=>{if(cfg.layers.text){c.font=font(s.size);c.fillText(s.text,s.x,s.y);}return `<text x="${s.x}" y="${s.y}" font-size="${s.size}">${escape(s.text)}</text>`;}).join('\n');
 }else{
 const font=s=>`${s}px PosterFont`;
 const exact=preset==='darkroom';
 cfg.letterSpacing=BODY_SPACING;
 cfg.bodyX=num(raw.bodyX,exact?-12:24,-100,200,'bodyX');
 cfg.firstBaseline=num(raw.firstBaseline,exact?243:190,0,600,'firstBaseline');
 cfg.baselineStep=num(raw.baselineStep,exact?222:cfg.fontSize*cfg.lineHeight,30,500,'baselineStep');
 cfg.authorSize=num(raw.authorSize,exact?75:58,20,150,'authorSize');
 cfg.authorBaseline=num(raw.authorBaseline,exact?1264:1540,0,1600,'authorBaseline');
 cfg.authorRight=num(raw.authorRight,exact?0:24,0,300,'authorRight');
 cfg.brandSize=num(raw.brandSize,exact?68:48,20,120,'brandSize');
 cfg.brandX=num(raw.brandX,exact?-7:24,-100,300,'brandX');
 cfg.brandBaseline=num(raw.brandBaseline,exact?1566:1550,0,1600,'brandBaseline');
 cfg.authorRule=raw.authorRule??exact;
 const specs=[];
 function addSpaced(text,size,x,baseline,spacing=0){c.font=font(size);for(const ch of Array.from(text)){specs.push({text:ch,size,x,y:baseline});x+=c.measureText(ch).width+spacing;}return x;}
 function textWidth(text,size,spacing=0){c.font=font(size);return Array.from(text).reduce((n,ch)=>n+c.measureText(ch).width,0)+Math.max(0,Array.from(text).length-1)*spacing;}
 let baseline=cfg.firstBaseline;
 for(let i=0;i<lines.length;i++){
  let size=cfg.fontSize*(i===cfg.emphasis?1.85:1),spacing=cfg.letterSpacing;
  c.font=font(size);const chars=Array.from(lines[i]),last=chars.at(-1)||' ';const width=textWidth(lines[i],size,spacing)-c.measureText(last).width+c.measureText(last).actualBoundingBoxRight;const available=W-cfg.bodyX-24;
  if(width>available){const gaps=Math.max(0,chars.length-1)*spacing;const fit=(available-gaps)/Math.max(1,width-gaps);size*=fit;}
  addSpaced(lines[i],size,cfg.bodyX,baseline,spacing);
  baseline+=cfg.baselineStep+(i===cfg.emphasis?size-cfg.fontSize:0);
 }
 const authorSpacing=-1,authorWidth=textWidth(cfg.author,cfg.authorSize,authorSpacing),authorX=W-cfg.authorRight-authorWidth;
 addSpaced(cfg.author,cfg.authorSize,authorX,cfg.authorBaseline,authorSpacing);
 if(cfg.signaturePosition==='top-right'){
  const chars=Array.from(brandText),step=Math.min(44,280/Math.max(1,chars.length));chars.forEach((ch,i)=>addSpaced(ch,step,1176-step,85+i*step));
 }else addSpaced(brandText,cfg.brandSize,cfg.brandX,cfg.brandBaseline,-10);
 body=specs.map(s=>{if(cfg.layers.text){c.font=font(s.size);c.fillText(s.text,s.x,s.y);}return `<text x="${s.x}" y="${s.y}" font-size="${s.size}">${escape(s.text)}</text>`;}).join('\n');
 if(cfg.authorRule&&cfg.author){const x1=authorX-148,ruleY=cfg.authorBaseline-27;if(cfg.layers.text){c.fillRect(x1,ruleY,68,4);c.fillRect(x1+76,ruleY,68,4);}body+=`<rect x="${x1}" y="${ruleY}" width="68" height="4"/><rect x="${x1+76}" y="${ruleY}" width="68" height="4"/>`;}
 }
 if(useLogo){const logoBytes=fs.readFileSync(path.join(root,'assets/watermark-exact.png')),logo=await loadImage(logoBytes);const x=1,y=1513;if(cfg.layers.text)c.drawImage(logo,x,y,278,57);body+=`<image x="${x}" y="${y}" width="278" height="57" href="${data(logoBytes)}"/>`;}
 const photoData=data(photo.toBuffer('image/png')),grainData=data(grain.toBuffer('image/png')),fontData=data(fontBytes,fontPath.endsWith('.otf')?'font/otf':'font/ttf');
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>暗房海报</title><style>@font-face{font-family:PosterFont;src:url(${fontData})}*{box-sizing:border-box}body{margin:0;background:#171717;display:grid;min-height:100vh;place-items:center}.poster{position:relative;width:min(100vw,75vh);aspect-ratio:3/4;isolation:isolate;background:#090706}.layer{position:absolute;inset:0;width:100%;height:100%}svg{font-family:PosterFont;fill:${cfg.textColor}}</style><article class="poster" aria-label="暗房风格海报"><img class="layer" id="photo" alt="照片底层" style="display:${cfg.layers.photo?'block':'none'}" src="${photoData}"><div class="layer" id="tint" style="display:${cfg.layers.tint?'block':'none'};background:${cfg.tint};opacity:${cfg.opacity};mix-blend-mode:${cfg.blend}"></div><img class="layer" id="grain" alt="" src="${grainData}" style="display:${cfg.layers.grain?'block':'none'};opacity:${cfg.grainOpacity};mix-blend-mode:soft-light"><svg class="layer" id="text" viewBox="0 0 1200 1600" xmlns="http://www.w3.org/2000/svg" style="display:${cfg.layers.text?'block':'none'}">${body}</svg></article></html>`;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'poster.png'),final.toBuffer('image/png'));fs.writeFileSync(path.join(out,'poster.html'),html);fs.writeFileSync(path.join(out,'recipe.json'),JSON.stringify({...cfg,renderedFont:raw.font?'user-supplied':'又又意宋',width:W,height:H},null,2));
 console.log(JSON.stringify({png:path.join(out,'poster.png'),html:path.join(out,'poster.html'),recipe:path.join(out,'recipe.json'),width:W,height:H,font:raw.font?'user-supplied':'又又意宋'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
