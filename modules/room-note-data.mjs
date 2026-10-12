import {escape as esc} from './view-utils.mjs';
const flag=(doc,key)=>doc?.getFlag?.('pms',key)??doc?.flags?.pms?.[key];
export function roomDocumentId(key){
 const hash=seed=>{for(const c of key)seed=Math.imul(seed^c.codePointAt(0),0x01000193)>>>0;return seed.toString(16).padStart(8,'0');};
 return hash(0x811c9dc5)+hash(0x9e3779b9);
}
export const roomPageId=(caseId,sceneId)=>roomDocumentId(`room-guide:${caseId}:${sceneId}`);
export const roomAnchor=roomId=>`room-${roomId}`;
export function planRooms(plan){
 return plan.rooms?.length?plan.rooms:[{id:'scene',label:plan.name,level:plan.levels[0].key,x:0,y:0,w:plan.width,h:plan.height}];
}
export function validateRoomNotes(data){
 if(data.roomNotes===undefined)return;
 if(!Array.isArray(data.roomNotes)||data.roomNotes.length>500)throw new Error('Neplatný rozsah popisů místností.');
 const ids=new Set();
 for(const note of data.roomNotes){
  const plan=data.scenePlans?.find(p=>p.id===note?.sceneId),key=`${note?.sceneId}:${note?.roomId}`;
  if(!plan||!planRooms(plan).some(r=>r.id===note.roomId)||ids.has(key))throw new Error('Neplatné přiřazení popisu místnosti.');
  ids.add(key);
  for(const [field,max] of [['description',2000],['notes',3000],['guideKey',180],['anchor',128]])if(note[field]!==undefined&&(typeof note[field]!=='string'||note[field].length>max))throw new Error('Neplatný text popisu místnosti.');
 }
}
const paragraphs=text=>String(text??'').split(/\n+/).filter(s=>s.trim()).map(s=>`<p>${esc(s)}</p>`).join('');
/** Derived local GM pages. Existing authored room pages take precedence. */
export function addRoomGuidePages(data,pages){
 const next=[...pages],group=pages.find(p=>p.flags?.pms?.guideGroup==='locations')?.flags.pms??pages[0]?.flags.pms;
 const category={guideCategoryId:group?.guideCategoryId??'pmsGuideGroup001',guideGroupName:group?.guideGroupName??'Lokace',guideGroupOrder:group?.guideGroupOrder??0};
 for(const plan of data.scenePlans??[]){
  if(next.some(p=>p.flags?.pms?.roomSceneId===plan.id))continue;
  const records=(data.roomNotes??[]).filter(n=>n.sceneId===plan.id);
  if(!plan.rooms?.length&&!records.length)continue;
  const content=planRooms(plan).map(room=>{
   const record=records.find(n=>n.roomId===room.id),related=record?.guideKey?pages.find(p=>p.flags?.pms?.guideKey===record.guideKey):pages.find(p=>p.flags?.pms?.locationIds?.includes(room.id));
   return `<section class="pms-room-brief"><h2 id="${esc(roomAnchor(room.id))}">${esc(room.label)}</h2><h3 id="${esc(roomAnchor(room.id))}-description">Na první pohled</h3>${record?.description?`<blockquote class="pms-guide-player-text">${paragraphs(record.description)}</blockquote>`:'<p>Popis této místnosti zatím není doplněný.</p>'}<h3 id="${esc(roomAnchor(room.id))}-gm">Pro vypravěče</h3>${paragraphs(record?.notes)||'<p>Další informace doplň v přípravě případu.</p>'}${related?`<p><a class="pms-guide-link" role="button" tabindex="0" data-action="goToHeading" data-page-id="${esc(related._id)}"${record?.anchor?` data-anchor="${esc(record.anchor)}"`:''}>Podrobná příprava lokace</a></p>`:''}</section>`;
  }).join('\n');
  next.push({_id:roomPageId(data.id,plan.id),name:`${plan.name} · místnosti`,type:'text',sort:((category.guideGroupOrder??0)+1)*100000+99000,category:category.guideCategoryId,ownership:{default:0},title:{show:true,level:1},text:{format:1,content:`<div class="pms-case-guide-content">${content}</div>`},flags:{pms:{...category,guideKey:`room-guide-${plan.id}`,guideGroup:'locations',roomSceneId:plan.id,roomIds:planRooms(plan).map(r=>r.id)}}});
 }
 return next;
}
/** Native Note sources contain only references and room labels, never private prose. */
export function roomNoteSources(data,plan,scene,vaultId,author){
 const sources=[];
 for(const room of planRooms(plan)){
  const key=room.level??plan.levels[0].key,level=scene.levels.find(l=>flag(l,'levelKey')===key)??scene.levels.get?.(plan.levels.find(l=>l.key===key)?.id);
  if(!level)throw new Error(`Podlaží „${key}“ chybí pro připínáček místnosti „${room.label}“.`);
  const overview=room.id==='scene'&&!plan.rooms?.length;
  sources.push({_id:roomDocumentId(`room-note:${data.id}:${plan.id}:${room.id}`),entryId:vaultId,pageId:null,author,
   x:Math.round(room.x+(overview?room.w/2:Math.min(plan.grid*.6,room.w/2))),y:Math.round(room.y+(overview?room.h/2:Math.min(plan.grid*.6,room.h/2))),
   elevation:level.elevation?.bottom??plan.levels.find(l=>l.key===key).bottom,levels:[level.id],global:true,locked:false,iconSize:40,
   texture:{src:'icons/svg/book.svg',tint:'#d8be87'},text:room.label,fontSize:24,textColor:'#eee5d2',textAnchor:1,
   flags:{pms:{caseBundle:data.id,caseRoomNote:`${plan.id}:${room.id}`,roomId:room.id,scenePlan:plan.id,levelKey:key,roomVaultId:vaultId}}});
 }
 return sources;
}
export function roomGuideTarget(data,sceneId,roomId){
 const plan=data.scenePlans?.find(p=>p.id===sceneId);if(!plan||!planRooms(plan).some(r=>r.id===roomId))throw new Error('Místnost už není součástí přípravy tohoto případu.');
 const page=(data.guidePages??[]).find(p=>p.flags?.pms?.roomSceneId===sceneId);
 return {caseId:data.id,pageId:page?._id??roomPageId(data.id,sceneId),anchor:roomAnchor(roomId)};
}
