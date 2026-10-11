import {TETOVE_PREPARATION} from './tetove-preparation.mjs';

export const PREPARATION_LIMITS = Object.freeze({summary:2000,truth:3000,situations:5000});
export const PREPARATION_PAGES = Object.freeze({overview:'pmsGmPrepStart01',maps:'pmsGmPrepMaps001',reading:'pmsGmPrepRead001',category:'pmsGmPrepGroup01'});
const NS='pms',SETTING='gmPreparationProgress';
const groupDescriptions={
 start:['Pochopit záhadu','Kdo za neštěstími stojí, proč jedná a co je ještě možné zachránit.'],
 npcs:['Projít cíle a znalosti NPC','Co každé NPC chce, co skutečně ví a kdy změní své jednání.'],
 locations:['Přečíst místa a přístupy','Kudy se dá vstoupit, co lze najít a které překážky jsou skutečné.'],
 events:['Projít děj a jeho odbočky','Které události nastanou samy a co je změní po zásahu hráčů.'],
 clues:['Propojit důkazy a falešné stopy','Co jednotlivé nálezy dokazují, co nedokazují a kudy vedou dál.'],
 resolutions:['Připravit rozluštění a konce','Jak posoudit vysvětlení hráčů, odměny a skutečné následky.'],
 rules:['Ověřit vedení herní smyčky','Čas akcí, cestování, smrt Avatarů, návrat a odrazy.']
};
export function validatePreparation(notes){
 if(notes===undefined)return;
 if(!notes||typeof notes!=='object'||Array.isArray(notes)||Object.keys(notes).some(k=>!Object.hasOwn(PREPARATION_LIMITS,k)))throw new Error('Neplatný přehled přípravy vypravěče.');
 for(const [key,max]of Object.entries(PREPARATION_LIMITS))if(notes[key]!==undefined&&(typeof notes[key]!=='string'||notes[key].length>max))throw new Error('Neplatný text přehledu přípravy vypravěče.');
}
export function preparationNotes(data){
 const notes=data.preparation??(data.id==='tetove'?TETOVE_PREPARATION:{});
 return {summary:notes.summary??data.intro??'',truth:notes.truth??'',situations:notes.situations??''};
}
const list=collection=>collection?.contents??(Array.isArray(collection)?collection:[]);
const flag=(document,key)=>document.getFlag?.(NS,key)??document.flags?.pms?.[key];
function nativeScene(data,plan,scenes){return list(scenes).find(s=>flag(s,'caseBundle')===data.id&&flag(s,'caseScene')===plan.id);}
async function fingerprint(value){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
/** Derived from the case's own guide categories and floors, including custom authored cases. */
export async function buildPreparationPlan(data,pages,scenes=[]){
 const groups=new Map();
 for(const page of pages){const f=page.flags.pms;let g=groups.get(page.category);if(!g){g={id:page.category,key:f.guideGroup,name:f.guideGroupName,order:f.guideGroupOrder,pages:[]};groups.set(g.id,g);}g.pages.push(page);}
 const reading=[...groups.values()].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'cs'));
 const notes=preparationNotes(data);
 const tasks=await Promise.all(reading.map(async(g,index)=>{
  const [label,why]=Object.hasOwn(groupDescriptions,g.key)?groupDescriptions[g.key]:[`Pročíst: ${g.name}`,'Projít podklady k této části případu.'];
  g.anchor=`prep-reading-${index}`;
  return {id:`reading:${g.id}`,label,why,pageId:PREPARATION_PAGES.reading,anchor:g.anchor,
   fingerprint:await fingerprint({pages:g.pages.map(p=>[p._id,p.name,p.text.content]).sort((a,b)=>a[0].localeCompare(b[0])),...(index===0?{notes}:{} )})};
 }));
 const maps=[];
 for(const plan of data.scenePlans??[]){
  const scene=nativeScene(data,plan,scenes);
  for(const level of plan.levels??[]){
   const id=`map:${plan.id}:${level.key}`,nativeLevel=list(scene?.levels).find(l=>flag(l,'levelKey')===level.key);
   maps.push({id,planId:plan.id,levelKey:level.key,name:plan.name,levelName:level.name,available:Boolean(scene&&nativeLevel),thumbnail:scene?.thumbnail??scene?.thumb??'',anchor:`prep-map-${maps.length}`});
   tasks.push({id,label:`Prohlédnout: ${plan.name} · ${level.name}`,why:'Projít dveře, přístupy a přechody mezi podlažími.',pageId:PREPARATION_PAGES.maps,anchor:maps.at(-1).anchor,
    fingerprint:await fingerprint({plan,baseline:data.initialSnapshot?.scenes?.find(s=>flag(s,'caseScene')===plan.id)??null,levelKey:level.key})});
  }
 }
 return {caseId:data.id,notes,reading,maps,tasks};
}
function assertGM(user){if(!user?.isGM)throw new Error('Příprava patří vypravěči.');}
function progressKey({worldId,userId,caseId}){return JSON.stringify([worldId,userId,caseId]);}
export function preparationProgress({settings,user,worldId,caseId,plan}){
 assertGM(user);
 const stored=settings.get(NS,SETTING)?.[progressKey({worldId,userId:user.id,caseId})]??{};
 return new Set(plan.tasks.filter(t=>stored[t.id]===t.fingerprint).map(t=>t.id));
}
let writes=Promise.resolve();
/** Client scope: only completion fingerprints, never story prose or shared document writes. */
export function setPreparationTask({settings,user,worldId,caseId,plan,taskId,completed,guard=()=>assertGM(user)}){
 const task=plan.tasks.find(t=>t.id===taskId);
 if(!task)return Promise.reject(new Error('Neznámý krok přípravy.'));
 const write=writes.catch(()=>{}).then(async()=>{
  assertGM(user);guard();
  const state=structuredClone(settings.get(NS,SETTING)??{}),key=progressKey({worldId,userId:user.id,caseId});
  const entry=Object.fromEntries(plan.tasks.filter(t=>state[key]?.[t.id]===t.fingerprint).map(t=>[t.id,t.fingerprint]));
  if(completed)entry[task.id]=task.fingerprint;else delete entry[task.id];
  state[key]=entry;await settings.set(NS,SETTING,state);
  return preparationProgress({settings,user,worldId,caseId,plan});
 });
 writes=write;return write;
}
/** Local native canvas view. Never activates the scene, starts a visit, or moves tokens. */
export async function viewPreparationMap(data,planId,levelKey,{user,scenes,canvas}){
 assertGM(user);
 const plan=data.scenePlans?.find(p=>p.id===planId),level=plan?.levels.find(l=>l.key===levelKey);
 if(!level)throw new Error('Neznámá mapa nebo podlaží tohoto případu.');
 const scene=nativeScene(data,plan,scenes),nativeLevel=list(scene?.levels).find(l=>flag(l,'levelKey')===level.key);
 if(!scene||!nativeLevel)throw new Error('Mapa nebo podlaží ještě není ve světě. Nejdřív importuj celý případ.');
 if(canvas?.loading)throw new Error('Počkej na dokončení načítání scény.');
 const result=await scene.view({level:nativeLevel.id});
 if(result!==scene)throw new Error('Scénu se nepodařilo otevřít. Zkus to po dokončení načítání.');
 return scene;
}
export function preparationActor(data,npcId,{user,actors}){
 assertGM(user);
 if(!data.npcs.some(n=>n.id===npcId))throw new Error('Neznámé NPC tohoto případu.');
 const actor=list(actors).find(a=>a.type==='npc'&&flag(a,'caseBundle')===data.id&&flag(a,'caseNpc')===npcId);
 if(!actor)throw new Error('NPC ještě není ve světě. Nejdřív importuj celý případ.');
 return actor;
}
