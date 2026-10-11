/** The same traversal discovers assets and rewrites them, including GM journal markup. */
export const CASE_ASSET_TYPES=Object.freeze({
 apng:'image/apng',avif:'image/avif',bmp:'image/bmp',gif:'image/gif',jpeg:'image/jpeg',jpg:'image/jpeg',png:'image/png',svg:'image/svg+xml',tiff:'image/tiff',webp:'image/webp',
 m4v:'video/mp4',mp4:'video/mp4',ogv:'video/ogg',webm:'video/webm',basis:'application/octet-stream',ktx2:'image/ktx2',
 aac:'audio/aac',flac:'audio/flac',m4a:'audio/mp4',mid:'audio/midi',mp3:'audio/mpeg',ogg:'audio/ogg',opus:'audio/opus',wav:'audio/wav',
 pdf:'application/pdf',otf:'font/otf',ttf:'font/ttf',woff:'font/woff',woff2:'font/woff2'
});
const fileKeys=new Set(['img','src','path','icon','asset','overlay','garden','poster','portrait']);
const decodeHTML=value=>value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,entity=>{
 const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
 if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
 const hex=/^&#x/i.test(entity),number=parseInt(entity.slice(hex?3:2,-1),hex?16:10);
 return number>0&&number<=0x10ffff?String.fromCodePoint(number):entity;
});
export function assetExtension(source){return String(source).split(/[?#]/)[0].match(/\.([a-z\d]+)$/i)?.[1]?.toLowerCase()??'';}
export function assertAssetSource(source){
 if(typeof source!=='string'||!source||source.length>4000||/[\x00-\x1f\\]/.test(source))throw new Error('Neplatná cesta souboru případu.');
 let path;try{path=decodeURIComponent(source.split(/[?#]/)[0]);}catch{throw new Error('Neplatné kódování cesty souboru.');}
 if(path.split('/').some(p=>p==='..')||/[\x00-\x1f\\]/.test(path))throw new Error('Soubor případu odkazuje mimo povolenou cestu.');
 if(/^[a-z][\w+.-]*:/i.test(source)&&!/^https?:\/\//i.test(source)||source.startsWith('//'))throw new Error('Soubor případu musí být uložený ve Foundry nebo na HTTP(S) adrese.');
 if(source.includes('*'))throw new Error('Náhodný obrázek tokenu nelze přibalit. Vyber pro výchozí token konkrétní obrázek.');
 return source;
}
function looksLikeAsset(value,key='',explicit=false){
 if(!value||/^(?:data:|#|@UUID\[)/i.test(value))return false;
 const ext=assetExtension(value);
 if(CASE_ASSET_TYPES[ext]&&(explicit||fileKeys.has(key)||value.includes('/')&&!/\s/.test(value)||/^(?:\/?(?:worlds|systems|modules|icons|assets)\/|https?:\/\/)/i.test(value)))return true;
 return (explicit||fileKeys.has(key))&&/^(?:https?:\/\/|blob:)/i.test(value);
}
function inlineAssets(text,replace){
 // Quoted/unquoted native journal media, linked PDFs and CSS backgrounds.
 text=text.replace(/(\b(?:src|href|poster|data-src)\s*=\s*)(?:(["'])(.*?)\2|([^\s>]+))/gi,(all,prefix,quote,quoted,bare)=>{
  const source=decodeHTML(quoted??bare);if(/^href/i.test(prefix)&&!CASE_ASSET_TYPES[assetExtension(source)]||!looksLikeAsset(source,'',true))return all;
  const target=replace(source);return `${prefix}${quote??''}${target}${quote??''}`;
 });
 text=text.replace(/(\bsrcset\s*=\s*)(["'])(.*?)\2/gi,(all,prefix,quote,set)=>`${prefix}${quote}${set.replace(/(^|,\s*)(\S+)(\s+[\d.]+[wx])?/g,(part,start,src,size='')=>looksLikeAsset(decodeHTML(src),'',true)?`${start}${replace(decodeHTML(src))}${size}`:part)}${quote}`);
 text=text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,(all,quote,source)=>looksLikeAsset(source.trim(),'',true)?`url(${quote}${replace(source.trim())}${quote})`:all);
 return text.replace(/(!?\[[^\]\n]*\]\(\s*)(<[^>\n]+>|[^\s)]+)([^)\n]*\))/g,(all,prefix,raw,suffix)=>{
  const angle=raw.startsWith('<'),source=angle?raw.slice(1,-1):raw;
  return (prefix.startsWith('!')||CASE_ASSET_TYPES[assetExtension(source)])&&looksLikeAsset(source,'',true)?`${prefix}${angle?'<':''}${replace(source)}${angle?'>':''}${suffix}`:all;
 });
}
export function transformCaseAssets(data,replace){
 const walk=(value,key='',parents=[])=>{
  if(Array.isArray(value))return value.map(v=>walk(v,key,parents));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,k,[...parents,key])]));
  if(typeof value!=='string')return value;
  if(looksLikeAsset(value,key)){
   // Historical map plans allow just a basename, resolved by scene-art.mjs.
   const shorthand=parents.includes('scenePlans')&&['asset','overlay','garden'].includes(key)&&!value.includes('/');
   const source=shorthand?`systems/pms/assets/plans/${value}`:value;
   return replace(assertAssetSource(source));
  }
  return inlineAssets(value,source=>replace(assertAssetSource(source)));
 };
 return walk(data);
}
export function collectCaseAssets(data){const sources=new Set();transformCaseAssets(data,source=>{sources.add(source);return source;});return [...sources].sort();}
export function remapCaseAssets(data,mapping){return transformCaseAssets(data,source=>mapping.has(source)?mapping.get(source)+(source.includes('#')?source.slice(source.indexOf('#')):''):source);}
