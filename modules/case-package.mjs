import {caseJSONExport,assertCaseTransferSize} from './case-transfer.mjs';
import {collectCaseAssets,remapCaseAssets,assetExtension,assertAssetSource,CASE_ASSET_TYPES} from './case-package-assets.mjs';
import {writeCaseZip,readCaseZip,assertPackageSize,CASE_PACKAGE_MAX_BYTES,CASE_ASSET_MAX_BYTES,CASE_PACKAGE_MAX_FILES} from './case-package-zip.mjs';
export const packageHash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const encode=text=>new TextEncoder().encode(text);
const decodeJSON=bytes=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('Balíček obsahuje neplatný JSON.');}};
const hashPattern=/^[a-f\d]{64}$/;
export async function buildCasePackage(data,{readAsset,onProgress=()=>{}}){
 const caseBytes=encode(caseJSONExport(data).json),sources=collectCaseAssets(data),assets=new Map();let total=caseBytes.length;
 if(sources.length>CASE_PACKAGE_MAX_FILES-2)throw new Error('Případ používá příliš mnoho souborů (maximum 500).');
 for(const [i,source]of sources.entries()){
  onProgress({phase:'assets',done:i,total:sources.length,source});const loaded=await readAsset(source),bytes=loaded.bytes??loaded;
  const ext=assetExtension(source)||Object.entries(CASE_ASSET_TYPES).find(([,mime])=>mime===loaded.type)?.[0];
  if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>CASE_ASSET_MAX_BYTES)throw new Error(`Soubor nelze přibalit (limit 128 MiB): ${source}`);
  if(!CASE_ASSET_TYPES[ext])throw new Error(`Nepodporovaný typ souboru: ${source}`);
  const hash=await packageHash(bytes),path=`assets/${hash}.${ext}`;
  if(!assets.has(path)){total+=bytes.length;if(total>CASE_PACKAGE_MAX_BYTES-1024*1024)throw new Error('Případ překračuje 512 MiB.');assets.set(path,{path,sha256:hash,size:bytes.length,sources:[],bytes});}
  assets.get(path).sources.push(source);
 }
 const manifest={format:'pms-case-package',version:1,caseId:data.id,contentVersion:data.contentVersion,caseSha256:await packageHash(caseBytes),assets:[...assets.values()].map(({bytes,...asset})=>asset)};
 const manifestBytes=encode(JSON.stringify(manifest,null,2));if(manifestBytes.length>1024*1024)throw new Error('Seznam souborů případu je příliš velký.');
 const files=new Map([['case.json',caseBytes],['package.json',manifestBytes],...[...assets.values()].map(a=>[a.path,a.bytes])]);
 const bytes=await writeCaseZip(files,pct=>onProgress({phase:'zip',pct}));return {bytes,manifest,fileCount:assets.size};
}
/** All bytes, references and hashes pass preflight before any FilePicker upload. */
export async function openCasePackage(bytes,{validate,onProgress=()=>{}}={}){
 const zip=await readCaseZip(bytes),manifest=decodeJSON(await zip.read('package.json')),caseBytes=await zip.read('case.json');
 if(manifest?.format!=='pms-case-package'||manifest.version!==1||!hashPattern.test(manifest.caseSha256)||!Array.isArray(manifest.assets)||manifest.assets.length>CASE_PACKAGE_MAX_FILES-2)throw new Error('Neznámý formát balíčku případu.');
 if(await packageHash(caseBytes)!==manifest.caseSha256)throw new Error('Příprava v balíčku má poškozený kontrolní součet.');
 const raw=decodeJSON(caseBytes),data=validate?validate(raw):raw;
 if(data.id!==manifest.caseId||data.contentVersion!==manifest.contentVersion)throw new Error('Balíček a příprava patří jinému případu nebo verzi.');
 const wanted=new Set(collectCaseAssets(data)),seenSources=new Set(),seenPaths=new Set(['case.json','package.json']),assets=[];
 for(const [i,asset]of manifest.assets.entries()){
  if(!hashPattern.test(asset?.sha256)||asset.path!==`assets/${asset.sha256}.${assetExtension(asset.path)}`||!CASE_ASSET_TYPES[assetExtension(asset.path)]||seenPaths.has(asset.path)||!Number.isSafeInteger(asset.size)||!Array.isArray(asset.sources)||!asset.sources.length||asset.sources.length>500)throw new Error('Neplatný seznam souborů balíčku.');
  for(const source of asset.sources){assertAssetSource(source);if(seenSources.has(source)||!wanted.has(source))throw new Error('Balíček obsahuje nesouvisející nebo duplicitní soubory.');seenSources.add(source);}
  const content=await zip.read(asset.path);if(content.length!==asset.size||await packageHash(content)!==asset.sha256)throw new Error(`Poškozený soubor balíčku: ${asset.path}`);
  seenPaths.add(asset.path);assets.push({...asset,bytes:content});onProgress({phase:'verify',done:i+1,total:manifest.assets.length});
 }
 if(seenSources.size!==wanted.size||seenPaths.size!==zip.entries.size)throw new Error('V balíčku chybí použitý soubor nebo obsahuje soubory navíc.');
 return {data,manifest,assets};
}
export async function readCaseFile(file,{validate,onProgress}={}){
 if(!file)throw new Error('Vyber soubor případu.');
 if(/\.zip$/i.test(file.name)){assertPackageSize(file.size);return openCasePackage(new Uint8Array(await file.arrayBuffer()),{validate,onProgress});}
 assertCaseTransferSize(file.size);const raw=decodeJSON(new Uint8Array(await file.arrayBuffer()));return {data:validate?validate(raw):raw,assets:[]};
}
export async function restorePackageAssets(bundle,data,{store,guard=()=>{},onProgress=()=>{}}){
 const wanted=new Set(collectCaseAssets(data)),mapping=new Map(),selected=bundle.assets.filter(a=>a.sources.some(s=>wanted.has(s)));
 for(const [i,asset]of selected.entries()){
  guard();const path=await store(asset,data.id);guard();
  if(typeof path!=='string'||!path)throw new Error('Foundry neuložilo soubor případu.');
  for(const source of asset.sources)if(wanted.has(source))mapping.set(source,path);
  onProgress({phase:'upload',done:i+1,total:selected.length});
 }
 return remapCaseAssets(data,mapping);
}
