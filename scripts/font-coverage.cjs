'use strict';
// Read the font's own Unicode cmap; prevent silent system-font fallback.
module.exports=function assertFontCoverage(bytes,text,label){
 let cmap;
 for(let i=0;i<bytes.readUInt16BE(4);i++){const pos=12+i*16;if(bytes.toString('ascii',pos,pos+4)==='cmap')cmap=bytes.readUInt32BE(pos+8);}
 if(cmap===undefined)throw Error('Font has no cmap: '+label);
 const maps=[];
 for(let i=0;i<bytes.readUInt16BE(cmap+2);i++){
  const pos=cmap+4+i*8,platform=bytes.readUInt16BE(pos),encoding=bytes.readUInt16BE(pos+2);
  if(platform!==0&&!(platform===3&&[1,10].includes(encoding)))continue;
  const offset=cmap+bytes.readUInt32BE(pos+4),format=bytes.readUInt16BE(offset);
  if([4,12].includes(format))maps.push({offset,format});
 }
 if(!maps.length)throw Error('No supported Unicode cmap: '+label);
 function has(code,{offset:o,format}){
  if(format===12){for(let i=0;i<bytes.readUInt32BE(o+12);i++){const p=o+16+i*12,start=bytes.readUInt32BE(p),end=bytes.readUInt32BE(p+4);if(code>=start&&code<=end)return bytes.readUInt32BE(p+8)+code-start!==0;}return false;}
  if(code>65535)return false;
  const n=bytes.readUInt16BE(o+6)/2,ends=o+14,starts=ends+n*2+2,deltas=starts+n*2,ranges=deltas+n*2;
  for(let i=0;i<n;i++){
   const start=bytes.readUInt16BE(starts+i*2),end=bytes.readUInt16BE(ends+i*2);if(code<start||code>end)continue;
   const delta=bytes.readInt16BE(deltas+i*2),range=bytes.readUInt16BE(ranges+i*2);
   if(!range)return ((code+delta)&65535)!==0;
   const glyph=bytes.readUInt16BE(ranges+i*2+range+(code-start)*2);return glyph!==0&&((glyph+delta)&65535)!==0;
  }
  return false;
 }
 const missing=[...new Set(Array.from(text).filter(ch=>!/[\s\p{Cf}]/u.test(ch)&&!maps.some(map=>has(ch.codePointAt(0),map))))];
 if(missing.length)throw Error(`${label}缺字：${missing.join(' ')}。不自动替换字体；请调整文字或明确指定可用字体。`);
};
