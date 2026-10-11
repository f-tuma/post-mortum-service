import {avatarCatalog} from './avatar-catalog.mjs';
import {levelTextureRegistration,floorTileData} from './scene-art.mjs';
export const definitionId=value=>{if(typeof value!=='string'||!/^[\w-]{1,64}$/.test(value)||(value==='prototype'||Object.hasOwn(Object.prototype,value)))throw new Error('Neplatný identifikátor případu.');return value;};
const bounded=(n,min,max)=>{if(!Number.isFinite(n)||n<min||n>max)throw new Error('Neplatná geometrie případu.');return n;};
const text=(v,max=160)=>{if(typeof v!=='string'||v.length>max)throw new Error('Neplatný text definice.');};
const list=(v,max,min=0)=>{if(!Array.isArray(v)||v.length<min||v.length>max)throw new Error('Neplatný rozsah definice.');};
const unique=values=>{if(new Set(values).size!==values.length)throw new Error('Duplicitní identifikátor definice.');};
export function validateLoopDefinition(data){
 definitionId(data.id);if(!Number.isSafeInteger(data.contentVersion)||data.contentVersion<1)throw new Error('Chybí verze obsahu případu.');
 list(data.scenePlans,30,1);unique(data.scenePlans.map(p=>definitionId(p.id)));
 const npcIds=new Set(data.npcs.map(n=>n.id));
 for(const plan of data.scenePlans){
  text(plan.name);bounded(plan.width,100,30000);bounded(plan.height,100,30000);bounded(plan.grid,50,1000);
  if(!Number.isInteger(plan.version??1)||(plan.version??1)<1)throw new Error('Neplatná verze mapy.');
  list(plan.levels,20,1);unique(plan.levels.map(l=>definitionId(l.key)));unique(plan.levels.map(l=>l.id));
  const levels=new Set(plan.levels.map(l=>l.key));
  for(const level of plan.levels){if(!/^[a-zA-Z0-9]{16}$/.test(level.id))throw new Error('Neplatná identita podlaží.');text(level.name);bounded(level.bottom,-10000,10000);if(level.top!==null)bounded(level.top,level.bottom+0.01,10000);
   for(const asset of [level.asset,level.overlay].filter(Boolean))mapAsset(asset);
   levelTextureRegistration(plan,level);if(level.overlayRegistration)levelTextureRegistration(plan,{registration:level.overlayRegistration});
  }
  list(plan.supplementalTiles??[],100);for(const layer of plan.supplementalTiles??[]){definitionId(layer.key);text(layer.name);list(layer.levels,20,1);unique(layer.levels);}
  for(const asset of [plan.garden,...(plan.supplementalTiles??[]).map(t=>t.asset)].filter(Boolean))mapAsset(asset);
  floorTileData(plan);
  list(plan.edges??[],3000);for(const edge of plan.edges??[]){if(!levels.has(edge.level)||!Array.isArray(edge.c)||edge.c.length!==4)throw new Error('Neplatná stěna.');edge.c.forEach((n,i)=>bounded(n,0,i%2?plan.height:plan.width));if(edge.door&&edge.c[0]!==edge.c[2]&&edge.c[1]!==edge.c[3])throw new Error('Půdorysná stěna musí mít přímou osu.');if(edge.door){definitionId(edge.door.key);bounded(edge.door.width,1,3000);bounded(edge.door.state,0,2);if(!Number.isInteger(edge.door.state))throw new Error('Neplatný stav dveří.');const vertical=edge.c[0]===edge.c[2],ends=vertical?[edge.c[1],edge.c[3]]:[edge.c[0],edge.c[2]];bounded(edge.door.at-edge.door.width/2,Math.min(...ends),Math.max(...ends));bounded(edge.door.at+edge.door.width/2,Math.min(...ends),Math.max(...ends));}}
  list(plan.tokens??[],100);unique((plan.tokens??[]).map(t=>t[0]));for(const [id,x,y,hidden,level='ground'] of plan.tokens??[]){if(!npcIds.has(id)||!levels.has(level)||typeof hidden!=='boolean')throw new Error('Neplatné umístění NPC.');bounded(x,0,plan.width-plan.grid);bounded(y,0,plan.height-plan.grid);}
  list(plan.stairs??[],100);for(const s of plan.stairs??[]){definitionId(s.key);text(s.name);bounded(s.x,0,plan.width);bounded(s.y,0,plan.height);bounded(s.w,1,plan.width-s.x);bounded(s.h,1,plan.height-s.y);}
 }
 avatarCatalog(data.avatarCatalog,data.id);caseEntry(data);
 text(data.briefing?.name);text(data.briefing?.source??'',300);
 const fields=new Set(data.worldFields.map(f=>f.key));list(data.stateGroups??[],30);const grouped=[];
 for(const group of data.stateGroups??[]){text(group.title);list(group.keys,100);for(const key of group.keys){if(!fields.has(key))throw new Error('Neznámá skupina stavu.');grouped.push(key);}}unique(grouped);
 list(data.resultFields??[],100);for(const key of data.resultFields??[])if(!fields.has(key))throw new Error('Neznámý údaj výsledku.');
 return data;
}
const mapAsset=asset=>{text(asset,2000);if(asset.includes('..')||asset.includes('\\')||(/^[a-z]+:/i.test(asset)&&!/^https?:\/\//i.test(asset)))throw new Error('Neplatná cesta mapového podkladu.');};
export function caseEntry(data,count=1){
 const entry=data.entry,plan=data.scenePlans?.find(p=>p.id===entry?.sceneId),level=plan?.levels.find(l=>l.key===entry.levelKey);
 if(!plan||!level)throw new Error('Chybí výchozí scéna nebo podlaží případu.');
 const spacing=entry.spacing??plan.grid;bounded(spacing,0,plan.width);bounded(entry.x,0,plan.width-plan.grid);bounded(entry.y,0,plan.height-plan.grid);bounded(entry.x+Math.max(0,count-1)*spacing,0,plan.width-plan.grid);
 return {plan,level,x:entry.x,y:entry.y,spacing};
}
