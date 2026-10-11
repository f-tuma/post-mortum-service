import JSZip from './vendor/jszip.mjs';
import {CASE_JSON_MAX_BYTES} from './case-transfer.mjs';
export const CASE_PACKAGE_MAX_BYTES=512*1024*1024;
export const CASE_ASSET_MAX_BYTES=128*1024*1024;
export const CASE_PACKAGE_MAX_FILES=502;
export const CASE_PACKAGE_MANIFEST_MAX_BYTES=1024*1024;
export const packageEntryPath=path=>path==='case.json'||path==='package.json'||/^assets\/[a-f\d]{64}\.[a-z\d]{2,5}$/.test(path);
const invalid=()=>new Error('ZIP případu je poškozený nebo má nepodporovanou strukturu.');
export function assertPackageSize(bytes){if(!Number.isSafeInteger(bytes)||bytes<22||bytes>CASE_PACKAGE_MAX_BYTES)throw new Error('Balíček případu musí být ZIP do 512 MiB.');return bytes;}
/** Inspect declared sizes BEFORE decompression; reject aliases, traversal and ZIP64. */
export function inspectCaseZip(bytes){
 assertPackageSize(bytes.byteLength);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),names=new Map();let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw invalid();
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
 if(count<2||count>CASE_PACKAGE_MAX_FILES||view.getUint16(end+8,true)!==count||offset+size!==end)throw invalid();
 let at=offset,total=0;const spans=[];
 for(let i=0;i<count;i++){
  if(at+46>end||view.getUint32(at,true)!==0x02014b50)throw invalid();
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),compressed=view.getUint32(at+20,true),expanded=view.getUint32(at+24,true),nameLength=view.getUint16(at+28,true),extraLength=view.getUint16(at+30,true),commentLength=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
  const next=at+46+nameLength+extraLength+commentLength;
  if(next>end||flags&1||![0,8].includes(method)||view.getUint16(at+34,true)||((view.getUint32(at+38,true)>>>16)&0xf000)===0xa000)throw invalid();
  const path=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+nameLength));
  if(!packageEntryPath(path)||names.has(path))throw invalid();
  const cap=path==='case.json'?CASE_JSON_MAX_BYTES:path==='package.json'?CASE_PACKAGE_MANIFEST_MAX_BYTES:CASE_ASSET_MAX_BYTES;
  total+=expanded;if(expanded<1||expanded>cap||total>CASE_PACKAGE_MAX_BYTES)throw new Error('Rozbalený případ překračuje limit velikosti souborů.');
  if(local+30>offset||view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method)throw invalid();
  const localName=view.getUint16(local+26,true),start=local+30+localName+view.getUint16(local+28,true);
  if(start+compressed>offset||new TextDecoder().decode(bytes.subarray(local+30,local+30+localName))!==path)throw invalid();
  if(method===0&&compressed!==expanded)throw invalid();
  spans.push([local,start+compressed]);names.set(path,{expanded,compressed});at=next;
 }
 spans.sort((a,b)=>a[0]-b[0]);if(spans.some((span,i)=>i&&span[0]<spans[i-1][1])||at!==end||!names.has('case.json')||!names.has('package.json'))throw invalid();
 return names;
}
export async function writeCaseZip(files,onProgress=()=>{}){
 const zip=new JSZip();for(const [name,bytes]of files)zip.file(name,bytes,{createFolders:false,compression:name.endsWith('.json')?'DEFLATE':'STORE'});
 const result=await zip.generateAsync({type:'uint8array',compressionOptions:{level:6}},meta=>onProgress(meta.percent/100));assertPackageSize(result.byteLength);return result;
}
export async function readCaseZip(bytes){
 const entries=inspectCaseZip(bytes),zip=await JSZip.loadAsync(bytes,{createFolders:false});
 if(Object.keys(zip.files).length!==entries.size)throw invalid();
 return {entries,async read(path){
  const file=zip.file(path),entry=entries.get(path);if(!file||!entry||file.unsafeOriginalName&&file.unsafeOriginalName!==path)throw invalid();
  // A bounded stream also protects against deliberately false central-directory sizes.
  const chunks=[];let length=0;
  await new Promise((resolve,reject)=>{const stream=file.internalStream('uint8array');stream.on('data',chunk=>{length+=chunk.length;if(length>entry.expanded){stream.pause();reject(invalid());}else chunks.push(chunk);}).on('error',reject).on('end',resolve).resume();});
  if(length!==entry.expanded)throw invalid();const result=new Uint8Array(length);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;
 }};
}
