import {CASE_ASSET_TYPES,assetExtension,assertAssetSource} from './case-package-assets.mjs';
import {CASE_ASSET_MAX_BYTES} from './case-package-zip.mjs';
import {definitionId} from './case-definition.mjs';
export async function readFoundryAsset(source){
 assertAssetSource(source);const remote=/^https?:\/\//i.test(source),url=remote?source:foundry.utils.getRoute(source.replace(/^\//,''));
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
 try{
  const response=await fetch(url,{credentials:remote?'omit':'same-origin',signal:controller.signal});
  if(!response.ok||!response.body)throw new Error('Nedostupný soubor.');
  if(Number(response.headers.get('content-length'))>CASE_ASSET_MAX_BYTES)throw new Error('Soubor překračuje 128 MiB.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>CASE_ASSET_MAX_BYTES)throw new Error('Soubor překračuje 128 MiB.');chunks.push(value);}}
  catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return {bytes,type:response.headers.get('content-type')?.split(';')[0]};
 }catch(error){throw new Error(`Nelze přibalit „${source}“. Ověř cestu; externí soubor musí povolovat stažení v prohlížeči. ${error.name==='AbortError'?'Vypršel čas pro stažení.':error.message}`);}
 finally{clearTimeout(timeout);}
}
/** Content-addressed world storage never writes into system/module/source-world folders. */
export function nativeCaseAssetStorage(guard){
 const picker=foundry.applications.apps.FilePicker.implementation,created=new Set();
 const ensure=async path=>{
  if(created.has(path))return;guard();
  const parent=await picker.browse('data',path.slice(0,path.lastIndexOf('/')));
  if(!parent.dirs.includes(path)){guard();try{await picker.createDirectory('data',path);}catch(error){const refreshed=await picker.browse('data',path.slice(0,path.lastIndexOf('/')));if(!refreshed.dirs.includes(path))throw error;}}
  created.add(path);
 };
 return async(asset,caseId)=>{
  definitionId(caseId);const world=`worlds/${game.world.id}`,directory=`${world}/pms-cases/${caseId}/assets`;
  for(const path of [`${world}/pms-cases`,`${world}/pms-cases/${caseId}`,directory])await ensure(path);
  const name=asset.path.split('/').at(-1);guard();
  const result=await picker.upload('data',directory,new File([asset.bytes],name,{type:CASE_ASSET_TYPES[assetExtension(name)]}),{},{notify:false});
  if(!result?.path)throw new Error('Soubor případu se nepodařilo uložit. Zkontroluj oprávnění a velikost uploadu.');
  return result.path;
 };
}
export function packageProgress(message){
 const notification=ui.notifications.info(message,{progress:true});
 return {update(state){const pct=state.pct??(state.total?state.done/state.total:0),labels={assets:'Načítám soubory',zip:'Sestavuji ZIP',verify:'Ověřuji balíček',upload:'Nahrávám soubory'};notification?.update?.({pct,message:`${labels[state.phase]??message}${state.total?` · ${state.done}/${state.total}`:''}`});},close(){notification?.remove?.();}};
}
