'use strict';
let converter;
module.exports=function normalizeText(input){
 const mode=input.scriptMode??'simplified';
 if(!['simplified','preserve'].includes(mode))throw Error('scriptMode must be simplified or preserve');
 if(mode==='simplified'&&!converter)converter=require('opencc-js').Converter({from:'t',to:'cn'});
 const convert=s=>typeof s==='string'&&mode==='simplified'?converter(s):s;
 const cfg={...input,scriptMode:mode};
 for(const key of ['text','author','workTitle','sourceMedium','sourceTitle','sourcePrefix','brand'])cfg[key]=convert(input[key]);
 for(const key of ['lines','emphasis','backgroundText'])if(Array.isArray(input[key]))cfg[key]=input[key].map(convert);
 if(input.credits&&typeof input.credits==='object'&&!Array.isArray(input.credits))cfg.credits=Object.fromEntries(Object.entries(input.credits).map(([k,v])=>[k,convert(v)]));
 if(input.originalText!==undefined){
  if(typeof input.originalText!=='string')throw Error('originalText must be a string');
  cfg.normalizedOriginalText=convert(input.originalText);
 }
 return cfg;
};
