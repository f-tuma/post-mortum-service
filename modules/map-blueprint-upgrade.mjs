import {CASE_MAPS,planWalls,planStairs,planFloorSurfaces} from './map-plans.mjs';
import {TETOVE_MAP_V4} from './tetove-map-v4.mjs';
import {sceneLevelData,floorTileData} from './scene-art.mjs';
import {enqueueCaseWrite} from './case-write-queue.mjs';
const clone=v=>structuredClone(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const differences=(a,b,path='')=>same(a,b)?[]:a&&b&&typeof a==='object'&&typeof b==='object'?
 [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],path?`${path}.${k}`:k)):[{path,before:a,after:b}];
const flag=(d,k)=>d?.getFlag?.('pms',k)??d?.flags?.pms?.[k];
const coordKey=w=>`${flag(w,'levelKey')}:${JSON.stringify(Array.from(w.c))}`;
const list=c=>c.contents??[...c];
const generated=src=>!src||src.startsWith('systems/pms/assets/plans/');
const systemAsset=src=>generated(src?.includes('/')?src:`systems/pms/assets/plans/${src??''}`);
const setFlags=(doc,data)=>{doc.flags??={};doc.flags.pms={...doc.flags.pms,...data};};

/** Upgrade only the authored map geometry and art. Native IDs and every story field survive. */
export function patchBlueprintScene(source,plan,{makeId=()=>foundry.utils.randomID(),relocateTrapped=false}={}){
 const before=clone(source);
 if(flag(before,'caseBundle')!=='tetove'||flag(before,'caseScene')!==plan.id||before.levels?.some(l=>!generated(l.background?.src))||(before.tiles??[]).some(t=>flag(t,'scenePlan')===plan.id&&flag(t,'caseFloor')&&!generated(t.texture?.src)))return before;
 if(plan.version!==5)throw new Error('Chybí ověřená revize půdorysu.');
 const next=clone(before),previous=TETOVE_MAP_V4.find(p=>p.id===plan.id);
 const levelIds=Object.fromEntries((next.levels??[]).map((l,i)=>[flag(l,'levelKey')??plan.levels[i]?.key,l._id]));
 for(const data of sceneLevelData(plan,levelIds)){
  const level=next.levels.find(l=>l._id===levelIds[data.flags.pms.levelKey]);
  if(!level)throw new Error('Půdorysu chybí nativní podlaží.');
  level.background={...level.background,src:data.background.src||null};level.textures={...level.textures,...data.textures};
  if(data.visibility)level.visibility={...level.visibility,...data.visibility};
 }
 const floorKeys=new Set(floorTileData(plan,levelIds).map(t=>t.flags.pms.caseFloor));
 next.tiles=(next.tiles??[]).filter(t=>flag(t,'scenePlan')!==plan.id||!previous?.levels.some(l=>l.key===flag(t,'caseFloor'))||floorKeys.has(flag(t,'caseFloor')));
 for(const data of floorTileData(plan,levelIds)){
  let tile=(next.tiles??[]).find(t=>flag(t,'scenePlan')===plan.id&&flag(t,'caseFloor')===data.flags.pms.caseFloor);
  if(!tile){next.tiles??=[];tile={...data,_id:makeId()};next.tiles.push(tile);}
  else{Object.assign(tile,{x:data.x,y:data.y,width:data.width,height:data.height,levels:data.levels,elevation:data.elevation,sort:data.sort});tile.texture={...tile.texture,...data.texture};setFlags(tile,{planVersion:5,...(plan.artVersion?{artVersion:plan.artVersion}:{})});}
 }
 const oldWalls=previous?planWalls(previous,levelIds):[],oldByCoord=new Map(oldWalls.map(w=>[coordKey(w),w]));
 const owned=(next.walls??[]).filter(w=>flag(w,'scenePlan')===plan.id),byKey=new Map();
 for(const wall of owned){const old=oldByCoord.get(coordKey(wall)),key=flag(wall,'caseWall')??flag(old,'caseWall');if(key)byKey.set(key,wall);}
 const keep=new Set(),newWalls=[];
 for(const data of planWalls(plan,levelIds)){
  const existing=byKey.get(data.flags.pms.caseWall)??(data.flags.pms.caseDoor&&owned.find(w=>flag(w,'caseDoor')===data.flags.pms.caseDoor));
  if(existing){keep.add(existing._id);existing.c=clone(data.c);existing.levels=clone(data.levels);setFlags(existing,data.flags.pms);}
  else newWalls.push({...data,_id:makeId()});
 }
 const replaced=new Set([...byKey.values()].filter(w=>!keep.has(w._id)).map(w=>w._id));
 next.walls=(next.walls??[]).filter(w=>!replaced.has(w._id)).concat(newWalls);
 next.regions??=[];
 for(const data of [...planStairs(plan,levelIds),...planFloorSurfaces(plan,levelIds)]){
  const existing=next.regions.find(r=>data.flags.pms.caseStairs?flag(r,'caseStairs')===data.flags.pms.caseStairs:flag(r,'caseSurface')===data.flags.pms.caseSurface);
  if(existing){Object.assign(existing,{shapes:clone(data.shapes),levels:clone(data.levels),elevation:clone(data.elevation)});setFlags(existing,data.flags.pms);}
  else next.regions.push({...data,_id:makeId(),behaviors:data.behaviors.map(b=>({...b,_id:makeId()}))});
 }
 if(relocateTrapped&&(flag(before,'scenePlanVersion')??0)<5)for(const token of next.tokens??[]){
  const wells=(plan.stairs??[]).map(s=>s.flights?.[0]?.start[1]===s.flights?.[0]?.end[1]?{x:s.x+100,y:s.y+100,w:s.w-100,h:100}:{x:s.x+100,y:s.y+100,w:100,h:s.h-100});
  const w=(token.width??1)*plan.grid,h=(token.height??1)*plan.grid;
  const overlaps=(x,y,r)=>x<r.x+r.w&&x+w>r.x&&y<r.y+r.h&&y+h>r.y;
  const trap=wells.find(r=>overlaps(token.x,token.y,r));if(!trap)continue;
  const levelKey=Object.keys(levelIds).find(key=>levelIds[key]===token.level);
  const candidates=[[trap.x+trap.w,token.y],[trap.x-w,token.y],[token.x,trap.y-h],[token.x,trap.y+trap.h]]
   .filter(([x,y])=>!wells.some(r=>overlaps(x,y,r))&&(plan.rooms??[]).some(r=>r.level===levelKey&&x>=r.x&&y>=r.y&&x+w<=r.x+r.w&&y+h<=r.y+r.h))
   .sort((a,b)=>Math.hypot(a[0]-token.x,a[1]-token.y)-Math.hypot(b[0]-token.x,b[1]-token.y));
  if(!candidates.length)throw new Error(`Token ${token.name??token._id} nemá bezpečné místo vedle nové šachty.`);
  setFlags(token,{blueprintPositionBefore5:{x:token.x,y:token.y,level:token.level,elevation:token.elevation}});
  [token.x,token.y]=candidates[0];
 }
 next.width=plan.width;next.height=plan.height;next.grid={...next.grid,size:plan.grid};setFlags(next,{scenePlanVersion:5});
 return next;
}

export function patchBlueprintSnapshot(snapshot,plans=CASE_MAPS,options={}){
 if(!snapshot||snapshot.caseId!=='tetove')return clone(snapshot);
 const next=clone(snapshot);
 next.scenes=next.scenes.map(scene=>{const plan=plans.find(p=>p.id===flag(scene,'caseScene')&&p.rooms.length);return plan?patchBlueprintScene(scene,plan,options):scene;});
 return next;
}
export function patchBlueprintDefinition(definition,options={}){
 const next=clone(definition);if(next.id!=='tetove')return next;
 next.scenePlans=next.scenePlans.map(p=>{
  const current=CASE_MAPS.find(v=>v.id===p.id&&v.rooms.length);
  if(!current||!systemAsset(p.garden)||p.levels?.some(l=>!systemAsset(l.asset)||!systemAsset(l.overlay))||p.supplementalTiles?.some(t=>!systemAsset(t.asset)))return p;
  const out={...p,version:5,artVersion:current.artVersion,asset:current.asset,garden:current.garden,supplementalTiles:clone(current.supplementalTiles??[]),width:current.width,height:current.height,grid:current.grid,rooms:clone(current.rooms),edges:clone(current.edges),stairs:clone(current.stairs),levels:p.levels.map(l=>{
   const authored=current.levels.find(v=>v.key===l.key);if(!authored)return l;
   const out={...l,asset:authored.asset,overlay:authored.overlay,overlayRect:clone(authored.overlayRect),visibleLevels:authored.visibleLevels};delete out.registration;delete out.overlayRegistration;return out;
  })};
  delete out.registrationTarget;
  if(previousParty(p.party,p.id))out.party=clone(current.party);
  return out;
 });
 if(next.entry?.sceneId==='manor'&&next.entry.x===1200&&next.entry.y===1100)next.entry.x=1400;
 if(next.initialSnapshot)next.initialSnapshot=patchBlueprintSnapshot(next.initialSnapshot,CASE_MAPS,options);
 return next;
}
const previousParty=(party,id)=>same(party,TETOVE_MAP_V4.find(p=>p.id===id)?.party);

/** Read-only native preflight; use a GM Script Macro rather than browser application-state access. */
export function reviewTetoveBlueprints(){
 const result=[];
 for(const scene of list(game.scenes)){
  const plan=CASE_MAPS.find(p=>p.id===flag(scene,'caseScene')&&p.rooms.length);
  if(!plan||flag(scene,'caseBundle')!=='tetove')continue;
  const before=scene.toObject(),next=patchBlueprintScene(before,plan,{relocateTrapped:true});
  new Scene(clone(next),{strict:true}).validate({strict:true,dropInvalidEmbedded:false,fallback:false});
  result.push({scene:scene.name,changed:!same(before,next),differences:differences(before,next).slice(0,15),version:plan.version,doors:next.walls.filter(w=>w.door).length,levels:next.levels.map(l=>({id:l._id,key:flag(l,'levelKey')})),
   tokens:next.tokens.map(t=>({id:t._id,name:t.name,x:t.x,y:t.y,level:t.level,...(flag(t,'blueprintPositionBefore5')?{positionBefore:flag(t,'blueprintPositionBefore5')}:{})})),regions:next.regions.map(r=>({id:r._id,name:r.name,type:r.behaviors?.[0]?.type})),darkness:next.environment.darknessLevel});
 }
 return result;
}

async function applyNative(scene,next){
 for(const [type,key]of [['Level','levels'],['Tile','tiles'],['Wall','walls'],['Region','regions']]){
  const current=list(scene[key]),ids=new Set(next[key].map(d=>d._id));
  const updates=next[key].filter(d=>current.some(c=>c.id===d._id&&!same(c.toObject(),d)));
  const creates=next[key].filter(d=>!current.some(c=>c.id===d._id)),removes=current.filter(d=>!ids.has(d.id)).map(d=>d.id);
  if(updates.length)await scene.updateEmbeddedDocuments(type,updates,{diff:true});
  if(creates.length)await scene.createEmbeddedDocuments(type,creates,{keepId:true});
  if(removes.length)await scene.deleteEmbeddedDocuments(type,removes);
 }
 const movements={},tokenUpdates=[];
 for(const token of next.tokens??[]){const current=scene.tokens.get(token._id);if(!current||current.x===token.x&&current.y===token.y)continue;
  movements[token._id]={waypoints:[{x:token.x,y:token.y,level:token.level,elevation:token.elevation,action:'displace'}],showRuler:false,constrainOptions:{ignoreWalls:true,ignoreCost:true}};
  tokenUpdates.push({_id:token._id,'flags.pms.blueprintPositionBefore5':flag(token,'blueprintPositionBefore5')});
 }
 if(tokenUpdates.length)await scene.updateEmbeddedDocuments('Token',tokenUpdates,{movement:movements,animate:false});
 await scene.update({width:next.width,height:next.height,'grid.size':next.grid.size,'flags.pms.scenePlanVersion':5});
}

/** Explicit GM migration for the review world; never reset a running reality to install its art. */
export function installTetoveBlueprints(cases){
 cases.gm();if(!game.user.isGM)throw new Error('Půdorysy spravuje vypravěč.');
 return enqueueCaseWrite(cases,async()=>{
  const vault=game.journal.find(d=>flag(d,'kind')==='caseVault'&&flag(d,'caseId')==='tetove');if(!vault)throw new Error('Chybí příprava Tétů.');
  const artBackup=`paintedArtBefore${Math.max(...CASE_MAPS.map(p=>p.artVersion??0))}`;
  const original=await cases.visits.unseal(flag(vault,'sealed')),definition=patchBlueprintDefinition(original);
  const sealedDraft=flag(vault,'editorDraft'),draft=sealedDraft?await cases.visits.unseal(sealedDraft):null;
  const nextDraft=draft?{...clone(draft),definition:patchBlueprintDefinition(draft.definition),snapshot:patchBlueprintSnapshot(draft.snapshot)}:null;
  const memory=game.pms.avatars.state.initialized?await cases.memory.read():null,nextMemory=clone(memory);
  if(nextMemory){const template=nextMemory.templates?.tetove;if(template){if(template.definition)template.definition=patchBlueprintDefinition(template.definition);template.snapshot=patchBlueprintSnapshot(template.snapshot);}
   const result=nextMemory.realResults?.tetove;if(result?.snapshot)result.snapshot=patchBlueprintSnapshot(result.snapshot);}
  const scenes=[];
  for(const scene of list(game.scenes)){const plan=CASE_MAPS.find(p=>p.id===flag(scene,'caseScene')&&p.rooms.length);if(!plan)continue;
   const before=scene.toObject(),next=patchBlueprintScene(before,plan,{relocateTrapped:true});if(!same(before,next))scenes.push({scene,before,next});}
  // Validate complete native documents before the first persisted write.
  for(const {next}of scenes)new Scene(clone(next),{strict:true}).validate({strict:true,dropInvalidEmbedded:false,fallback:false});
  const vaultChanged=!same(original,definition)||Boolean(draft&&!same(draft,nextDraft));
  if(vaultChanged){const revision=(flag(vault,'editorRevision')??0)+1,delta={'flags.pms.sealed':await cases.visits.seal(definition),'flags.pms.editorRevision':revision};
   if(!flag(vault,artBackup))delta[`flags.pms.${artBackup}`]={sealed:flag(vault,'sealed'),editorDraft:sealedDraft??null,editorRevision:flag(vault,'editorRevision')??0,memory:memory?await cases.visits.seal({template:memory.templates?.tetove??null,result:memory.realResults?.tetove??null}):null};
   if(nextDraft){nextDraft.revision=revision;delta['flags.pms.editorDraft']=await cases.visits.seal(nextDraft);}await vault.update(delta);}
  if(memory&&!same(memory,nextMemory))await cases.memory.persist(nextMemory);
  cases.definitions.set('tetove',definition);if(cases.runtimeDefinitions.has('tetove'))cases.runtimeDefinitions.set('tetove',patchBlueprintDefinition(cases.runtimeDefinitions.get('tetove')));
  for(const {scene,before,next}of scenes){
   if(next.walls.some(w=>flag(w,'caseStairGuard'))&&!flag(scene,'stairGuardsBefore1'))await scene.update({'flags.pms.stairGuardsBefore1':before.walls});
   if(!flag(scene,artBackup))await scene.update({[`flags.pms.${artBackup}`]:{levels:before.levels,tiles:before.tiles}});
   if(!flag(scene,'blueprintBefore5'))await scene.update({'flags.pms.blueprintBefore5':{width:before.width,height:before.height,grid:before.grid,levels:before.levels,tiles:before.tiles,walls:before.walls,regions:before.regions,tokens:before.tokens,planVersion:flag(before,'scenePlanVersion')}});
   await applyNative(scene,next);
  }
  return {scenes:scenes.length,vaultChanged,memoryChanged:Boolean(memory&&!same(memory,nextMemory))};
 });
}
