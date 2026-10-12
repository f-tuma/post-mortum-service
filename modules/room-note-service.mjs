import {roomNoteSources,roomGuideTarget,planRooms} from './room-note-data.mjs';
import {buildCaseGuide} from './case-guide.mjs';
import {validateCase} from './case-state.mjs';
import {caseRemoved,assertCaseAvailable} from './case-lifecycle.mjs';
const flag=(doc,key)=>doc?.getFlag?.('pms',key)??doc?.flags?.pms?.[key];
const contents=collection=>collection?.contents??[...(collection??[])];
/** Supply new room handouts only when the installed stock location chapters are untouched. */
export function withBundledRoomNotes(data,bundled){
 if(data.id!=='tetove'||data.roomNotes!==undefined)return data;
 const normalize=html=>html.replace(/\s(?:href="#"|role="button"|tabindex="0")/g,'');
 const old=buildCaseGuide(data),stock=buildCaseGuide(bundled),keys=['location-manor','location-bend','location-guild'];
 if(!keys.every(key=>{const a=old.find(p=>flag(p,'guideKey')===key),b=stock.find(p=>flag(p,'guideKey')===key);return a&&b&&normalize(a.text.content)===normalize(b.text.content);}))return data;
 const notes=bundled.roomNotes.filter(n=>{const plan=data.scenePlans.find(p=>p.id===n.sceneId);return plan&&planRooms(plan).some(r=>r.id===n.roomId);});
 return {...data,roomNotes:structuredClone(notes)};
}
export class RoomNoteService{
 constructor(cases,{fetch=globalThis.fetch.bind(globalThis)}={}){this.cases=cases;this.fetch=fetch;this.queue=Promise.resolve();this.bundled=null;}
 get isAuthority(){return game.user.isGM&&this.cases.visits.isAuthority&&!game.pmsAuthority?.failed;}
 async definition(data){
  if(!game.user.isGM||game.pmsAuthority?.failed||data.id!=='tetove'||data.roomNotes!==undefined)return data;
  this.bundled??=this.fetch('systems/pms/cases/tetove.json',{credentials:'same-origin'}).then(async response=>{if(!response.ok)throw new Error('Nelze načíst popisy místností úvodního případu.');const bundle=validateCase(await response.json());if(bundle.id!=='tetove'||!Array.isArray(bundle.roomNotes))throw new Error('Vestavěná příprava nemá popisy místností Tétů.');return bundle;}).catch(error=>{this.bundled=null;throw error;});
  return withBundledRoomNotes(data,await this.bundled);
 }
 ensureForCase(caseId){
  if(!this.isAuthority||caseRemoved(caseId))return Promise.resolve();
  const job=this.queue.then(()=>this.ensureQueued(caseId));this.queue=job.catch(()=>{});return job;
 }
 async ensureQueued(caseId){
  if(!this.isAuthority||caseRemoved(caseId))return;
  const authored=this.cases.forCase(caseId);if(!authored)return;
  const data=await this.definition(authored);if(!this.isAuthority||caseRemoved(caseId)||this.cases.forCase(caseId)!==authored)return;
  this.cases.definitions.set(caseId,data);
  const current=()=>this.isAuthority&&!caseRemoved(caseId)&&this.cases.forCase(caseId)===data;
  const vault=game.journal.find(d=>flag(d,'kind')==='caseVault'&&flag(d,'caseId')===caseId);if(!vault)return;
  const pages=buildCaseGuide(data);
  for(const scene of contents(game.scenes).filter(s=>flag(s,'caseBundle')===caseId&&!flag(s,'hubVista'))){
   if(!current())return;
   const plan=data.scenePlans.find(p=>p.id===flag(scene,'caseScene'));if(!plan)continue;
   if(!pages.some(p=>flag(p,'roomSceneId')===plan.id))continue;
   const sources=roomNoteSources(data,plan,scene,vault.id,game.user.id),creates=[],updates=[];
   for(const source of sources){
    const existing=contents(scene.notes).find(n=>flag(n,'caseBundle')===caseId&&flag(n,'caseRoomNote')===source.flags.pms.caseRoomNote);
    if(!existing){if(contents(scene.notes).some(n=>n.id===source._id))source._id=foundry.utils.randomID();creates.push(source);}
    // Repair portable references only. Manual position, text, icon and floor edits survive.
    else if(!game.journal.some(d=>d.id===existing.entryId&&flag(d,'kind')!=='caseVault')){
     const update={_id:existing.id};
     if(existing.entryId!==vault.id){update.entryId=vault.id;update.pageId=null;}
     if(flag(existing,'roomVaultId')!==vault.id)update['flags.pms.roomVaultId']=vault.id;
     if(Object.keys(update).length>1)updates.push(update);
    }
   }
   if(creates.length){if(!current())return;await scene.createEmbeddedDocuments('Note',creates,{keepId:true});}
   if(updates.length){if(!current())return;await scene.updateEmbeddedDocuments('Note',updates);}
  }
 }
 async ensureAll(){if(!this.isAuthority)return;for(const {id} of this.cases.definitions.values())await this.ensureForCase(id);}
 async open(note){
  if(!game.user.isGM||game.pmsAuthority?.failed)throw new Error('Popis místnosti patří připojenému vypravěči.');
  const caseId=flag(note,'caseBundle'),planId=flag(note,'scenePlan');assertCaseAvailable(caseId);
  if(flag(note.parent,'caseBundle')!==caseId||flag(note.parent,'caseScene')!==planId)throw new Error('Připínáček nepatří k této scéně případu.');
  const authored=await this.cases.reloadDefinition(caseId);if(!authored)throw new Error('Příprava tohoto případu chybí.');
  const data=await this.definition(authored);this.cases.definitions.set(caseId,data);
  return this.cases.showGuide(roomGuideTarget(data,planId,flag(note,'roomId')));
 }
}
/** Retain the native note layer, elevation filtering and double-click workflow. */
export function createRoomNoteClass(NativeNote){
 return class PMSRoomNote extends NativeNote{
  get isVisible(){if(flag(this.document,'caseRoomNote')&&!game.user.isGM)return false;return super.isVisible;}
  _canView(user){if(flag(this.document,'caseRoomNote')&&!user.isGM)return false;return super._canView(user);}
 };
}
export function registerRoomNoteHooks(){
 Hooks.on('activateNote',note=>{
  if(!flag(note.document,'caseRoomNote'))return;
  if(!game.user.isGM)return false;
  if(note.entry&&flag(note.entry,'kind')!=='caseVault')return;
  game.pms?.roomNotes?.open(note.document).catch(error=>ui.notifications.warn(error.message));return false;
 });
 for(const hook of ['canvasReady','pmsAuthorityChanged'])Hooks.on(hook,()=>{game.pms?.roomNotes?.ensureAll().catch(error=>ui.notifications.warn(error.message));});
}
