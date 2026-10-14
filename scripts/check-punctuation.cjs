'use strict';
const marks='，。！？；：、…—,.!?;:「」『』“”‘’（）()【】';
module.exports=function checkPunctuation(cfg){
 const mode=cfg.punctuationPolicy??'semantic';
 if(!['semantic','none','verbatim'].includes(mode))throw Error('punctuationPolicy must be semantic, none or verbatim');
 if(typeof cfg.text!=='string')throw Error('text is required');
 if(mode!=='semantic'&&cfg.punctuationExceptionConfirmed!==true)throw Error('标点例外须由用户明确要求，并记录 punctuationExceptionConfirmed: true；不能自行推断。');
 if(mode==='semantic'&&!/[，。！？；：、…,.!?;:]/u.test(cfg.text))throw Error('默认正文应有符合句意的标点。请先展示带必要标点的文字确认稿，不按视觉行尾补标点。');
 if(mode==='none'&&Array.from(cfg.text).some(c=>marks.includes(c)))throw Error('已确认无标点模式，但正文仍含标点。');
 if(mode==='verbatim'&&(cfg.scriptMode!=='preserve'||typeof cfg.originalText!=='string'||cfg.text.replace(/\n/g,'')!==cfg.originalText.replace(/\n/g,'')))throw Error('原文逐字保留需 scriptMode: preserve，正文除视觉换行外须与 originalText 一致。');
 const original=cfg.normalizedOriginalText??cfg.originalText;
 return {mode,originalForComparison:mode==='none'&&typeof original==='string'?Array.from(original).filter(c=>!marks.includes(c)).join(''):original};
};
