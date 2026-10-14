#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{createHash}=require('node:crypto');
const normalize=require('./normalize-text.cjs'),coverage=require('./font-coverage.cjs');
const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex');
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<0.02;
const decode=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
function main(){
 const args=process.argv.slice(2),reviewed=args.includes('--visual-reviewed');
 if(args.includes('--help')){console.log('node scripts/verify-poster.cjs config.json output-directory [--visual-reviewed]');return;}
 if(args.length!==(reviewed?3:2)||reviewed&&args[2]!=='--visual-reviewed')throw Error('Supply config.json output-directory, optionally --visual-reviewed after inspecting PNG.');
 const file=path.resolve(args[0]),out=path.resolve(args[1]),input=fs.readFileSync(file),cfg=normalize(JSON.parse(input));
 const name=cfg.outputName??'poster';if(typeof name!=='string'||!name.trim()||/[\\/\x00-\x1f]/u.test(name)||['.','..'].includes(name))throw Error('Invalid outputName');
 const reportPath=path.join(out,cfg.outputName?`${name}_验收.json`:'verification.json');
 const checks=[],warnings=[];
 const check=(name,ok,detail)=>checks.push({name,passed:!!ok,detail});
 if(cfg.layout==='legacy')throw Error('此验收器只验证统一版布局，旧版不能冒充新版验收通过。');
 const recipe=JSON.parse(fs.readFileSync(path.join(out,cfg.outputName?`${name}_排版参数.json`:'recipe.json')));
 const html=fs.readFileSync(path.join(out,`${name}.html`),'utf8'),png=fs.readFileSync(path.join(out,`${name}.png`));
 const texts=[...html.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map(m=>{
  const a=Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]]));
  return {char:decode(m[2]),family:a['font-family'],fontSize:Number(a['font-size']),x:Number(a.x),y:Number(a.y)};
 });
 const body=recipe.bodyGlyphs??[],source=recipe.sourceGlyphs??[],all=[...body,...source],actual=texts.filter(t=>t.family==='Body');
 check('正式入口和配置',recipe.rendererInfo?.sha256===sha(fs.readFileSync(path.join(__dirname,'render-poster.cjs')))&&recipe.rendererInfo?.inputSha256===sha(input),'比对实际入口及本次配置指纹，拒绝临时脚本或过期成品');
 check('成品配对',recipe.outputInfo?.pngSha256===sha(png)&&recipe.outputInfo?.htmlSha256===sha(Buffer.from(html)),'PNG、HTML 与本次参数记录相匹配');
 check('画布',png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&png.readUInt32BE(16)===1200&&png.readUInt32BE(20)===1600,'PNG 1200×1600');
 check('文字与简繁',recipe.text===cfg.text&&recipe.originalText===cfg.originalText&&recipe.scriptMode===cfg.scriptMode&&JSON.stringify(recipe.lines??cfg.text.split('\n'))===JSON.stringify(cfg.lines??cfg.text.split('\n'))&&body.map(g=>g.char).join('')===cfg.text.replace(/\n/g,''),'与按当前默认规则转换的配置逐字核对；保留原文');
 check('强调词',JSON.stringify(recipe.emphasis??[])===JSON.stringify(cfg.emphasis??[]));
 check('实际 HTML 字形',all.length>0&&actual.length===all.length&&all.every((g,i)=>g.char===actual[i].char&&near(g.x,actual[i].x)&&near(g.y,actual[i].y)&&near(g.fontSize,actual[i].fontSize)),'逐字核对 HTML 字号、坐标和字体家族');
 const fontPath=cfg.font?path.resolve(path.dirname(file),cfg.font):path.join(root,'assets/fonts/YouyouYisong.ttf.gz');
 const readFont=p=>p.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(p)):fs.readFileSync(p);
 const bytes=readFont(fontPath),fontHash=sha(bytes),bodyAsset=html.match(/font-family:Body;src:url\(([^)]+)\)/)?.[1];
 check('字体与字体授权变更',(!cfg.font||cfg.fontChangeConfirmed===true)&&recipe.fontInfo?.body?.sha256===fontHash&&bodyAsset&&!bodyAsset.startsWith('data:')&&sha(fs.readFileSync(path.resolve(out,bodyAsset)))===fontHash,'默认又又意宋；显式换字体必须有用户确认；核对 HTML 实际引用字体');
 coverage(bytes,actual.map(g=>g.char).join(''),'正文字体');
 if(cfg.variant==='mint'){
  const expected=readFont(path.join(root,'assets/fonts/KingHwaOldSong-v3.ttf.gz')),asset=html.match(/font-family:Back;src:url\(([^)]+)\)/)?.[1];
  check('背景字体',asset&&!asset.startsWith('data:')&&recipe.fontInfo?.background?.sha256===sha(expected)&&sha(fs.readFileSync(path.resolve(out,asset)))===sha(expected),'京華老宋体');
  coverage(expected,texts.filter(g=>g.family==='Back').map(g=>g.char).join(''),'背景字体');
 }
 check('字形覆盖',true,'所用字体均包含实际显示字符，不依赖系统回退');
 if(!GlobalFonts.register(bytes,'VerifyBody'))throw Error('Cannot register verification font');
 const c=createCanvas(1,1).getContext('2d');
 function bounds(g){c.font=`${g.fontSize}px VerifyBody`;const m=c.measureText(g.char),stroke=g.fontSize*.0045;return {left:g.x-m.actualBoundingBoxLeft-stroke,right:g.x+m.actualBoundingBoxRight+stroke,top:g.y-m.actualBoundingBoxAscent-stroke,bottom:g.y+m.actualBoundingBoxDescent+stroke};}
 const measured=body.map(g=>({...g,...bounds(g)}));
 check('实际字形边界',body.length>0&&body.every((g,i)=>['left','right','top','bottom'].every(k=>near(g[k],measured[i][k]))),'由实际字体重新测量，不只相信 collisionChecked 标记');
 const plain=Array.from(cfg.text.replace(/\n/g,'')),factors=plain.map(()=>1);
 for(const word of cfg.emphasis??[]){const n=Array.from(word);for(let i=0;i<=plain.length-n.length;i++)if(n.every((v,j)=>plain[i+j]===v))n.forEach((_,j)=>factors[i+j]=1.55);}
 check('强调比例',recipe.emphasisRatio===1.55&&body.every((g,i)=>near(g.fontSize,recipe.fontSize*factors[i])),'逐字核对普通字号与 1.55 倍强调');
 function tracking(glyphs,gap){return glyphs.every((g,i)=>{const next=glyphs[i+1];if(!next||next.row!==g.row)return true;c.font=`${g.fontSize}px VerifyBody`;return near(next.x-g.x,c.measureText(g.char).width+gap);});}
 check('固定字距',recipe.letterSpacing===-45&&tracking(body,-45)&&tracking(source,-4.666667),'正文与强调 −45 px，署名独立字距');
 const limit=cfg.layout==='long'?((cfg.credits||cfg.sourceType==='quote')?1360:1430):1200;
 check('正文越界',measured.length>0&&measured.every(g=>g.left>=7.98&&g.right<=1192.02&&g.top>=7.98&&g.bottom<=limit-7.98));
 let collision=false;for(let i=0;i<measured.length;i++)for(let j=i+1;j<measured.length;j++){const a=measured[i],b=measured[j];if(a.row!==b.row&&a.left<b.right&&b.left<a.right&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+0.02)collision=true;}
 check('跨行碰撞',!collision,'实际字形外框独立检测；同排固定负字距不作为跨行碰撞');
 const top=Math.min(...measured.map(g=>g.top)),bottom=Math.max(...measured.map(g=>g.bottom));
 check('整体居中与留白',near(top,limit-bottom),'含强调字的实际总边界上下留白相等');
 const rows=recipe.rendered??[];
 check('小字行距',recipe.lineSpacingMode==='optical-small-word-anchors'&&rows.slice(1).every((r,i)=>near(r.anchorTop-rows[i].anchorBottom,14)),'相邻小字锚点可见空隙 14 px，不放大全局行距');
 const expected=[];if(cfg.author){expected.push((cfg.sourcePrefix??'')+(cfg.sourceType==='lyrics'&&cfg.workTitle?`${cfg.author}《${cfg.workTitle}》`:cfg.author));if(cfg.credits){const p=[];if(cfg.credits.lyricist)p.push(`作词：${cfg.credits.lyricist}`);if(cfg.credits.composer)p.push(`作曲：${cfg.credits.composer}`);expected.push(p.join('　'));}else if(cfg.sourceType==='quote')expected.push(`${cfg.sourceMedium??''}《${cfg.sourceTitle}》`);}
 check('署名内容',expected.length>0&&JSON.stringify((recipe.sourceRows??[]).map(r=>r.text))===JSON.stringify(expected)&&expected.every((t,i)=>source.filter(g=>g.row===i).map(g=>g.char).join('')===t),'与确认配置核对，出处真实性仍须人工查证');
 const sourceRows=recipe.sourceRows??[],sourceMeasured=source.map(g=>({...g,...bounds(g)}));
 check('署名位置',sourceRows.length>0&&sourceRows.every((r,i)=>{const gs=sourceMeasured.filter(g=>g.row===i);return gs.length>0&&near(Math.max(...gs.map(g=>g.right)),1190)&&near(Math.min(...gs.map(g=>g.top)),i?sourceRows[i-1].bottom+14:limit)&&Math.max(...gs.map(g=>g.bottom))<=1505.02;}));
 const logo=html.match(/<image\b([^>]*)\/>/);
 if(cfg.brand!==false){
  const a=Object.fromEntries([...(logo?.[1]??'').matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]])),expectedLogo=fs.readFileSync(path.join(root,'assets',cfg.variant==='mint'?'logo-red.png':'watermark-exact.png'));
  check('Logo',a.href&&a.x==='2'&&a.y==='1513'&&a.width==='278'&&a.height==='57'&&fs.existsSync(path.resolve(out,a.href))&&sha(fs.readFileSync(path.resolve(out,a.href)))===sha(expectedLogo),'原始Logo素材、位置和尺寸');
 }else check('Logo',!logo,'配置明确隐藏Logo');
 const refs=[...new Set(html.match(/_assets\/[a-f0-9]+\.(?:png|ttf|otf)/g)??[])];
 check('共享素材',refs.length>0&&!html.includes('data:font/')&&refs.every(r=>fs.existsSync(path.join(out,r))),'引用完整，字体不重复内嵌');
 const width=Math.max(...measured.map(g=>g.right))-Math.min(...measured.map(g=>g.left));
 if(width<1200*.6||bottom-top<limit*.45)warnings.push('正文占用面积偏小：需检查是否因碰撞缩字、断行失衡；不自动改字距或撑大行距。');
 const passed=checks.every(c=>c.passed),report={version:'1.5',automaticStatus:passed?'passed':'failed',deliveryStatus:passed&&reviewed?'reviewed':passed?'needs-visual-review':'blocked',checks,warnings,fontInfo:recipe.fontInfo,fillMetrics:{widthFraction:width/1200,heightFraction:(bottom-top)/limit,topSpace:top,bottomSpace:limit-bottom},visualReview:{status:reviewed?'marked-reviewed':'pending',items:['字体风格是否保持','行距、断行与整体疏密是否自然','背景主体是否位于顶部1:1框且不妨碍文字','孤字、标点、署名与Logo是否清晰完整','查证来源与用户确认稿是否一致'],note:'程序无法确认视觉判断正确，也不能证明用户授权；只有实际查看PNG后才可标记。'}};
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
 console.log(JSON.stringify({report:reportPath,automaticStatus:report.automaticStatus,deliveryStatus:report.deliveryStatus,warnings}));
 if(!passed){console.error('验收失败：'+checks.filter(c=>!c.passed).map(c=>c.name).join('、'));process.exitCode=1;}
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
