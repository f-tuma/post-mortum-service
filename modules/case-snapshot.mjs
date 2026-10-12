import {planWalls} from './map-plans.mjs';
const flag=(d,key)=>d.getFlag?.('pms',key)??d.flags?.pms?.[key];
const clone=value=>structuredClone(value);
export const SCENE_COLLECTIONS={Level:'levels',Wall:'walls',Tile:'tiles',Drawing:'drawings',Note:'notes',AmbientLight:'lights',AmbientSound:'sounds',Region:'regions',Token:'tokens'};
function source(doc){const clean=value=>{if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='_stats').map(([key,v])=>[key,clean(v)]));return value;};return clean(doc.toObject());}
export function captureCaseSnapshot({caseId,actors,scenes,items=[],avatarActorIds=[],includeAvatars=false}) {
  const npcActors=actors.filter(a=>(a.type==='npc'&&flag(a,'caseBundle')===caseId)||(includeAvatars&&avatarActorIds.includes(a.id)));
  const party=new Set(avatarActorIds);
  return {caseId,actors:npcActors.map(source),items:items.filter(i=>flag(i,'caseBundle')===caseId&&flag(i,'caseTemplateItem')&&!flag(i,'sourceVisit')&&!i.system?.published).map(source),scenes:scenes.filter(s=>flag(s,'caseBundle')===caseId).map(scene=>{
    const data=source(scene);delete data.active;delete data.folder;delete data.sort;
    // Local GM handouts are resolved by case/room identity after import or reset.
    // Their world Journal IDs must not point back to the source World.
    for(const note of data.notes??[])if(flag(note,'caseRoomNote')&&note.entryId===flag(note,'roomVaultId')){note.entryId=null;note.pageId=null;}
    // Avatar tokens are visit projections, not inhabitants of the starting reality.
    if(!includeAvatars)data.tokens=data.tokens.filter(t=>!party.has(t.actorId)&&actors.find(a=>a.id===t.actorId)?.type!=='avatar'&&!flag(t,'visitParty'));
    return data;
  })};
}
/** Old worlds have no pristine snapshot. Reconstruct authored actors, doors and token starts;
 * retain their existing artwork and manually drawn geometry instead of guessing it away. */
export function seedLegacyTemplate(snapshot,data) {
  const initial=clone(snapshot);
  for(const actor of initial.actors){const npc=data.npcs.find(n=>n.id===flag(actor,'caseNpc'));if(!npc)continue;
    actor.system={schemaVersion:1,caseId:data.id,role:npc.role,biography:npc.biography,origin:'',motivation:'',contact:'',alive:true,food:0,paidValueH:0,
      vitals:{vitality:0,agility:0,intelligence:0},skills:{movement:0,stealth:0,perception:0,analysis:0,negotiation:0,knowledge:0,craft:0,combat:0}};
    actor.items=[];actor.effects=[];
  }
  for(const scene of initial.scenes){const plan=data.scenePlans?.find(p=>p.id===flag(scene,'caseScene'));if(!plan)continue;
    const levelIds=Object.fromEntries(scene.levels.map((l,i)=>[flag(l,'levelKey')??(i===0?'ground':l._id),l._id]));
    const defaults=new Map(planWalls(plan,levelIds).filter(w=>flag(w,'caseDoor')).map(w=>[flag(w,'caseDoor'),w.ds]));
    for(const wall of scene.walls)if(defaults.has(flag(wall,'caseDoor')))wall.ds=defaults.get(flag(wall,'caseDoor'));
    for(const token of scene.tokens){const npc=(plan.tokens??[]).find(([id])=>id===flag(token,'caseNpc'));if(!npc)continue;
      const [,x,y,hidden,level='ground']=npc;Object.assign(token,{x,y,hidden,level:levelIds[level],elevation:plan.levels.find(l=>l.key===level)?.bottom??0});
      delete token.delta;
    }
  }
  return initial;
}
/** Native embedded-document APIs keep IDs and links stable, including deleted doors/NPCs. */
async function restoreCollection(document,type,key,desired,{movement=false}={}) {
  const current=document[key].contents??[...document[key]],ids=new Set(desired.map(d=>d._id));
  const retyped=current.filter(d=>{const target=desired.find(v=>v._id===d.id);return target?.type&&target.type!==d.type;}).map(d=>d.id);
  if(retyped.length)await document.deleteEmbeddedDocuments(type,retyped);
  const remove=current.filter(d=>!ids.has(d.id)).map(d=>d.id);
  const exists=new Set(current.filter(d=>!retyped.includes(d.id)).map(d=>d.id)),create=desired.filter(d=>!exists.has(d._id));
  if(create.length)await document.createEmbeddedDocuments(type,clone(create),{keepId:true});
  // A Scene must always have at least one Level, including when its original one was removed.
  if(remove.length)await document.deleteEmbeddedDocuments(type,remove);
  const updates=desired.filter(d=>exists.has(d._id)).map(clone);
  if(!updates.length)return;
  const options={recursive:false,diff:false};
  if(type==='Region')for(const d of updates)delete d.behaviors;
  if(movement){
    options.movement=Object.fromEntries(updates.map(d=>[d._id,{waypoints:[{x:d.x,y:d.y,level:d.level,elevation:d.elevation,action:'displace'}],showRuler:false,constrainOptions:{ignoreWalls:true,ignoreCost:true}}]));
    options.animate=false;
    for(const d of updates){delete d.x;delete d.y;delete d.level;delete d.elevation;}
  }
  await document.updateEmbeddedDocuments(type,updates,options);
  if(type==='Region')for(const data of desired)await restoreCollection(document[key].get(data._id),'RegionBehavior','behaviors',data.behaviors??[]);
}
export function assertSnapshotIdentities(snapshot,{actors,scenes,items}) {
  if(!snapshot?.caseId)throw new Error('Výchozí svět chybí.');
  // Check every identity before any deletion. An imported template cannot replace another case.
  for(const data of snapshot.actors){const current=actors.get(data._id);if(current&&(current.type!=='npc'||flag(current,'caseBundle')!==snapshot.caseId))throw new Error('Výchozí NPC má konfliktní identitu.');}
  for(const data of snapshot.scenes){const current=scenes.get(data._id);if(current&&flag(current,'caseBundle')!==snapshot.caseId)throw new Error('Výchozí scéna má konfliktní identitu.');}
  if(items)for(const data of snapshot.items??[]){const current=items.get(data._id);if(current&&(flag(current,'caseBundle')!==snapshot.caseId||!flag(current,'caseTemplateItem')||flag(current,'sourceVisit')||current.system?.published))throw new Error('Výchozí předmět má konfliktní identitu.');}
}
/** Validate every native source locally before a bad import can replace or delete reality. */
export function assertNativeCaseSnapshot(snapshot,constructors={Actor:globalThis.Actor,Scene:globalThis.Scene,Item:globalThis.Item}) {
  for(const [type,key] of [['Actor','actors'],['Scene','scenes'],['Item','items']])for(const data of snapshot[key]??[]){
    const Document=constructors[type];if(typeof Document!=='function')throw new Error(`Chybí nativní validace ${type}.`);
    new Document(clone(data),{strict:true}).validate({strict:true,dropInvalidEmbedded:false,fallback:false});
  }
}
export function localSnapshotFolder(data,type,caseId,folders){
  const belongs=folder=>{const visited=new Set();while(folder&&!visited.has(folder.id)){visited.add(folder.id);const bundle=flag(folder,'caseBundle');if(bundle)return bundle===caseId;folder=typeof folder.folder==='string'?folders.get(folder.folder):folder.folder;}return false;};
  const source=folders.get(data.folder);if(source?.type===type&&belongs(source))return source.id;
  return (folders.contents??[...folders]).find(folder=>folder.type===type&&flag(folder,'caseBundle')===caseId)?.id??null;
}
export async function restoreCaseSnapshot(snapshot,{actors,scenes,items,folders,createItem,deleteItems,createActor,createScene,deleteActors,deleteScenes,resetFog,nativeConstructors}) {
  assertSnapshotIdentities(snapshot,{actors,scenes,items});
  assertNativeCaseSnapshot(snapshot,nativeConstructors);
  // Folder IDs belong to the destination World, unlike the stable loop Actor IDs.
  if(folders){snapshot=clone(snapshot);for(const data of snapshot.actors)data.folder=localSnapshotFolder(data,'Actor',snapshot.caseId,folders);for(const data of snapshot.items??[])data.folder=localSnapshotFolder(data,'Item',snapshot.caseId,folders);}
  const actorIds=new Set(snapshot.actors.map(a=>a._id)),sceneIds=new Set(snapshot.scenes.map(s=>s._id));
  const extraActors=(actors.contents??[...actors]).filter(a=>a.type==='npc'&&flag(a,'caseBundle')===snapshot.caseId&&!actorIds.has(a.id)).map(a=>a.id);
  const extraScenes=(scenes.contents??[...scenes]).filter(s=>flag(s,'caseBundle')===snapshot.caseId&&!sceneIds.has(s.id)).map(s=>s.id);
  if(extraActors.length)await deleteActors(extraActors);if(extraScenes.length)await deleteScenes(extraScenes);
  if(items&&snapshot.items){const ids=new Set(snapshot.items.map(i=>i._id));const extra=(items.contents??[...items]).filter(i=>flag(i,'caseBundle')===snapshot.caseId&&flag(i,'caseTemplateItem')&&!flag(i,'sourceVisit')&&!i.system?.published&&!ids.has(i.id)).map(i=>i.id);if(extra.length)await deleteItems(extra);
    for(const data of snapshot.items){const item=items.get(data._id);if(!item)await createItem(clone(data),{keepId:true});else {if(flag(item,'caseBundle')!==snapshot.caseId||!flag(item,'caseTemplateItem')||flag(item,'sourceVisit')||item.system?.published)throw new Error('Výchozí předmět má konfliktní identitu.');await item.update(clone(data),{recursive:false,diff:false});}}
  }
  for(const data of snapshot.actors){let actor=actors.get(data._id);
    if(!actor){await createActor(clone(data),{keepId:true});continue;}
    if(actor.type!=='npc'||flag(actor,'caseBundle')!==snapshot.caseId)throw new Error('Výchozí NPC má konfliktní identitu.');
    const {items=[],effects=[],_id,...update}=clone(data);
    await actor.update(update,{recursive:false,diff:false});
    await restoreCollection(actor,'Item','items',items);await restoreCollection(actor,'ActiveEffect','effects',effects);
  }
  for(const data of snapshot.scenes){let scene=scenes.get(data._id);
    if(!scene){await createScene(clone(data),{keepId:true});if(resetFog)await resetFog(data._id);continue;}
    if(flag(scene,'caseBundle')!==snapshot.caseId)throw new Error('Výchozí scéna má konfliktní identitu.');
    const update=clone(data);delete update._id;
    for(const key of Object.values(SCENE_COLLECTIONS))delete update[key];
    await restoreCollection(scene,'Level','levels',data.levels??[]);
    await scene.update(update,{recursive:false,diff:false});
    for(const [type,key] of Object.entries(SCENE_COLLECTIONS))if(type!=='Level')await restoreCollection(scene,type,key,data[key]??[],{movement:type==='Token'});
    if(resetFog)await resetFog(scene.id);
  }
}
