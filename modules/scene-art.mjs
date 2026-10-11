import {planWalls,planStairs,planFloorSurfaces} from './map-plans.mjs';
const flag=(d,key)=>d.getFlag?.('pms',key)??d.flags?.pms?.[key];
const art=asset=>!asset?'':asset.includes('/')?asset:`systems/pms/assets/plans/${asset}`;
const key=c=>JSON.stringify(c);

/** Coordinates of the old generated walls, so migration leaves additional hand-drawn walls intact. */
/** Scene update data is explicit: square grid is measured in metres and not painted into the art. */
export function sceneArtSettings(plan){return {width:plan.width,height:plan.height,padding:0,grid:{type:1,size:plan.grid,distance:1,units:'m',color:'#344454',alpha:0.12},
 tokenVision:true,'fog.mode':1,'environment.darknessLevel':0,'environment.globalLight.enabled':true,'environment.globalLight.bright':true,'environment.globalLight.darkness':{min:0,max:1},
 'flags.pms.scenePlanVersion':(plan.version??1)};}
/** Native fill transforms around the scene centre, not around the image's top-left corner. */
export function levelTextureRegistration(plan,level){
 const r=level.registration;
 if(!r)return {anchorX:0.5,anchorY:0.5,fit:'fill',scaleX:1,scaleY:1,offsetX:0,offsetY:0,rotation:0};
 const target=r.target??plan.registrationTarget??{left:0,top:0,right:plan.width,bottom:plan.height};
 for(const [name,rect] of [['source',r],['target',target]]){
  if(!['left','top','right','bottom'].every(k=>Number.isFinite(rect[k]))||rect.right<=rect.left||rect.bottom<=rect.top)throw new Error(`Invalid ${name} artwork registration rectangle.`);
 }
 if(!(r.sourceWidth>0&&r.sourceHeight>0))throw new Error('Artwork registration requires its positive source dimensions.');
 const x=(target.right-target.left)/(r.right-r.left),y=(target.bottom-target.top)/(r.bottom-r.top);
 return {anchorX:0.5,anchorY:0.5,fit:'fill',scaleX:x*r.sourceWidth/plan.width,scaleY:y*r.sourceHeight/plan.height,
  offsetX:Math.round(target.left-plan.width/2-(r.left-r.sourceWidth/2)*x),offsetY:Math.round(target.top-plan.height/2-(r.top-r.sourceHeight/2)*y),rotation:0};
}
export function sceneLevelData(plan,levelIds=Object.fromEntries(plan.levels.map(l=>[l.key,l.id]))){return plan.levels.map((l,i)=>({_id:levelIds[l.key],name:l.name,sort:i*1000,elevation:{bottom:l.bottom,top:l.top},background:{src:art(l.asset)||null},textures:levelTextureRegistration(plan,l),...(l.visibleLevels?{visibility:{levels:l.visibleLevels.map(key=>levelIds[key])}}:{}),flags:{pms:{levelKey:l.key,scenePlan:plan.id}}}));}

const tileRect=(plan,rect)=>{
 const r=rect??{x:0,y:0,w:plan.width,h:plan.height};
 if(!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>plan.width||r.y+r.h>plan.height)throw new Error('Invalid map Tile rectangle.');
 return {x:r.x,y:r.y,width:r.w,height:r.h};
};
const mapTile=(plan,key,name,asset,rect,levels,elevation,sort=-1000)=>({name,...tileRect(plan,rect),levels,elevation,sort,rotation:0,alpha:1,hidden:false,locked:true,
 texture:{src:art(asset),fit:'fill',scaleX:1,scaleY:1,anchorX:0,anchorY:0},restrictions:{light:false,weather:false},occlusion:{modes:[],alpha:1},
 flags:{pms:{caseFloor:key,scenePlan:plan.id,planVersion:plan.version??1,...(plan.artVersion?{artVersion:plan.artVersion}:{})}}});

/** Bounded paintings use native Tiles at surveyed rectangles; the garden is shared between floors. */
export function floorTileData(plan,levelIds=Object.fromEntries(plan.levels.map(l=>[l.key,l.id]))){
 // Native Tile level membership is independent of Level background visibility.
 const visibleIds=keys=>plan.levels.filter(l=>keys.includes(l.key)||l.visibleLevels?.some(k=>keys.includes(k))).map(l=>levelIds[l.key]);
 const tiles=plan.levels.filter(l=>l.overlay).map(l=>{
  let {x,y,width,height}=tileRect(plan,l.overlayRect);
  if(!l.overlayRect&&l.overlayRegistration){const r=l.overlayRegistration;levelTextureRegistration(plan,{registration:r});
   const target=r.target??plan.registrationTarget??{left:0,top:0,right:plan.width,bottom:plan.height};
   const sx=(target.right-target.left)/(r.right-r.left),sy=(target.bottom-target.top)/(r.bottom-r.top);
   x=Math.round(target.left-r.left*sx);y=Math.round(target.top-r.top*sy);width=Math.round(r.sourceWidth*sx);height=Math.round(r.sourceHeight*sy);
  }
  const data=mapTile(plan,l.key,`${l.name} · podlaha`,l.overlay,l.overlayRect,visibleIds([l.key]),l.bottom);
  return {...data,x,y,width,height};
 });
 for(const t of plan.supplementalTiles??[]){
  if(!t.key||!t.asset||!Array.isArray(t.levels)||!t.levels.length||t.levels.some(k=>!levelIds[k])||!Number.isFinite(t.elevation)||(t.sort!==undefined&&!Number.isInteger(t.sort)))throw new Error('Invalid map Tile layer.');
  tiles.push(mapTile(plan,t.key,t.name,t.asset,t.rect,visibleIds(t.levels),t.elevation,t.sort));
 }
 if(plan.garden)tiles.push(mapTile(plan,'garden','Společná zahrada',plan.garden,undefined,Object.values(levelIds),plan.levels[0].bottom-1));
 if(new Set(tiles.map(t=>t.flags.pms.caseFloor)).size!==tiles.length)throw new Error('Duplicate map Tile layer.');
 return tiles;
}

/** Idempotent upgrade of system-owned maps; player visit, door states and custom geometry survive. */
export async function applySceneArt(scene,plan){
 const currentSource=scene.firstLevel?.background?.src??'';
 if(currentSource&&currentSource!==art(plan.levels[0]?.asset)&&!currentSource.startsWith('systems/pms/assets/plans/'))return {changed:false,custom:true};
 const previousVersion=flag(scene,'scenePlanVersion')??0;
 const legacy=plan.legacyTokenLayout;const legacyTokens=legacy&&(flag(scene,'tokenLayoutVersion')??0)<3&&scene.tokens.some(t=>flag(t,'caseNpc')===legacy.npcId&&t.x<legacy.npcMaxX&&t.y<legacy.npcMaxY)&&scene.tokens.some(t=>t.actor?.type==='avatar'&&t.x<legacy.avatarMaxX);
 const migrate=previousVersion!==(plan.version??1)||Boolean(legacyTokens);
 const levelIds={};const updates=[],creates=[];
 for(const [i,l] of plan.levels.entries()){
  const existing=scene.levels.find(v=>flag(v,'levelKey')===l.key)??(i===0?scene.firstLevel:scene.levels.get(l.id));
  levelIds[l.key]=existing?.id??l.id;
  const data=sceneLevelData(plan,levelIds)[i];if(existing){updates.push({...data,_id:existing.id});}else creates.push(data);
 }
 if(creates.length)await scene.createEmbeddedDocuments('Level',creates,{keepId:true});
 if(updates.length)await scene.updateEmbeddedDocuments('Level',updates);
 const tiles=[],tileUpdates=[];
 for(const tile of floorTileData(plan,levelIds)){const existing=scene.tiles.find(t=>flag(t,'scenePlan')===plan.id&&flag(t,'caseFloor')===tile.flags.pms.caseFloor);if(existing)tileUpdates.push({...tile,_id:existing.id});else tiles.push(tile);}
 if(tiles.length)await scene.createEmbeddedDocuments('Tile',tiles);
 if(tileUpdates.length)await scene.updateEmbeddedDocuments('Tile',tileUpdates);
 if(plan.garden){const keep=new Set(floorTileData(plan,levelIds).map(t=>t.flags.pms.caseFloor));
  const old=scene.tiles.filter(t=>flag(t,'scenePlan')===plan.id&&plan.levels.some(l=>l.key===flag(t,'caseFloor'))&&!keep.has(flag(t,'caseFloor'))&&t.texture.src.startsWith('systems/pms/assets/plans/')).map(t=>t.id);
  if(old.length)await scene.deleteEmbeddedDocuments('Tile',old);
 }
 if(migrate){
  const doorStates=new Map(scene.walls.filter(w=>flag(w,'caseDoor')).map(w=>[flag(w,'caseDoor'),w.ds]));
  const oldKeys=new Set((plan.legacyWalls??[]).map(key));
  const remove=scene.walls.filter(w=>flag(w,'scenePlan')===plan.id||oldKeys.has(key(Array.from(w.c)))).map(w=>w.id);
  if(remove.length)await scene.deleteEmbeddedDocuments('Wall',remove);
  const walls=planWalls(plan,levelIds).map(w=>({...w,...(doorStates.has(w.flags.pms.caseDoor)?{ds:doorStates.get(w.flags.pms.caseDoor)}:{})}));
  if(walls.length)await scene.createEmbeddedDocuments('Wall',walls);
  if(previousVersion<2||legacyTokens){const movements=[];let partyIndex=0;
   for(const t of scene.tokens){const npc=plan.tokens.find(([id])=>id===flag(t,'caseNpc'));if(npc){const [,x,y,,level='ground']=npc;movements.push({_id:t.id,x,y,level:levelIds[level],elevation:plan.levels.find(l=>l.key===level)?.bottom??0});}else if(plan.party&&t.actor?.type==='avatar'){movements.push({_id:t.id,x:plan.party[0]+partyIndex++*plan.grid,y:plan.party[1],level:levelIds.ground,elevation:0});}}
   if(movements.length){
    const movement=Object.fromEntries(movements.map(({_id,...position})=>[_id,{waypoints:[{...position,action:'displace'}],showRuler:false,constrainOptions:{ignoreWalls:true,ignoreCost:true}}]));
    await scene.updateEmbeddedDocuments('Token',movements.map(({_id})=>({_id})),{movement,animate:false});
   }
  }
 }
 const stairs=[...planStairs(plan,levelIds),...planFloorSurfaces(plan,levelIds)],newStairs=[],changedStairs=[];
 for(const s of stairs){const existing=scene.regions.find(r=>s.flags.pms.caseStairs?flag(r,'caseStairs')===s.flags.pms.caseStairs:flag(r,'caseSurface')===s.flags.pms.caseSurface);
  if(!existing)newStairs.push(s);
  else if(flag(existing,'planVersion')!==(plan.version??1))changedStairs.push({_id:existing.id,shapes:s.shapes,levels:s.levels,elevation:s.elevation,'flags.pms.planVersion':(plan.version??1)});
 }
 if(newStairs.length)await scene.createEmbeddedDocuments('Region',newStairs);
 if(changedStairs.length)await scene.updateEmbeddedDocuments('Region',changedStairs);
 const visionUpdates=scene.tokens.filter(t=>t.actor?.type==='avatar'&&!t.sight?.enabled).map(t=>({_id:t.id,'sight.enabled':true}));
 if(visionUpdates.length)await scene.updateEmbeddedDocuments('Token',visionUpdates);
 await scene.update({...sceneArtSettings(plan),'flags.pms.tokenLayoutVersion':3});
 return {changed:migrate,levelIds,levels:plan.levels.length};
}
