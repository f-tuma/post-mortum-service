import {enqueueCaseWrite} from './case-write-queue.mjs';
import {introductionComplete} from './hub-ballot.mjs';
import {escape as esc} from './view-utils.mjs';

const flag=(doc,key)=>doc?.getFlag?.('pms',key)??doc?.flags?.pms?.[key];
const collection=(world,type)=>world[{Actor:'actors',Scene:'scenes',Item:'items',JournalEntry:'journal',Folder:'folders'}[type]];
const contents=value=>value?.contents??[...(value??[])];
export function caseRemoved(caseId,world=globalThis.game){
 return Boolean(caseId&&world?.journal?.some(d=>['caseVault','caseOffer'].includes(flag(d,'kind'))&&flag(d,'caseId')===caseId&&flag(d,'caseLifecycle')));
}
export function assertCaseAvailable(caseId,world=globalThis.game){if(caseRemoved(caseId,world))throw new Error('Případ je v koši. Nejdřív jej obnov.');}
export function caseDocuments(caseId,world=globalThis.game,visitIds=[]){
 const owns=d=>flag(d,'caseBundle')===caseId&&!flag(d,'hubVista');
 return {
  Scene:contents(world.scenes).filter(owns),
  Actor:contents(world.actors).filter(d=>owns(d)||d.type==='avatar'&&d.system?.caseId===caseId),
  Item:contents(world.items).filter(d=>owns(d)||d.type==='clue'&&d.system?.caseId===caseId),
  JournalEntry:contents(world.journal).filter(d=>['caseVault','caseOffer','board'].includes(flag(d,'kind'))&&flag(d,'caseId')===caseId||flag(d,'kind')==='evidence'&&flag(d,'evidence')?.sourceCase===caseId||flag(d,'kind')==='visitProjection'&&flag(d,'visit')?.caseId===caseId||flag(d,'kind')==='visitVault'&&visitIds.includes(flag(d,'visitId'))),
  Folder:contents(world.folders).filter(owns)
 };
}
export function deletionBlockers(caseId,documents,world=globalThis.game){
 const actors=new Set(documents.Actor.map(d=>d.id)),journals=new Set(documents.JournalEntry.map(d=>d.id)),scenes=new Set(documents.Scene.map(d=>d.id)),blockers=[];
 for(const scene of contents(world.scenes))if(!scenes.has(scene.id)){
  if(contents(scene.tokens).some(t=>actors.has(t.actorId)))blockers.push(`Scéna „${scene.name}“ používá token postavy tohoto případu.`);
  if(contents(scene.notes).some(n=>journals.has(n.entryId)))blockers.push(`Scéna „${scene.name}“ odkazuje na deník tohoto případu.`);
 }
 for(const list of Object.values(documents))for(const doc of list){const bundle=flag(doc,'caseBundle');if(bundle&&bundle!==caseId)blockers.push(`Dokument „${doc.name}“ patří jinému případu.`);}
 return blockers;
}
/** Remove local case play data, retaining accounting and the unlocked campaign introduction. */
export function forgetCase(campaign,memory,caseId,visitIds=[]){
 const next=structuredClone(campaign),privateMemory=memory&&structuredClone(memory);
 if(next){next.introductionCompleted=introductionComplete(next);next.savedAvatars=Object.fromEntries(Object.entries(next.savedAvatars??{}).filter(([,a])=>a.caseId!==caseId));
  next.deletedVisitIds=[...new Set([...(next.deletedVisitIds??[]),...visitIds,...(next.caseVisits??[]).filter(v=>v.caseId===caseId).map(v=>v.visitId),...Object.entries(privateMemory?.returns??{}).filter(([,v])=>v.caseId===caseId).map(([id])=>id),privateMemory?.realResults?.[caseId]?.visit?.id].filter(Boolean))];
  next.caseVisits=(next.caseVisits??[]).filter(v=>v.caseId!==caseId);if(next.caseLabels)delete next.caseLabels[caseId];
  if(next.preparation?.caseId===caseId)next.preparation=null;
  if(next.hubBallot?.caseIds?.includes(caseId)||next.hubBallot?.selectedCaseId===caseId)next.hubBallot={...next.hubBallot,status:'canceled',votes:{},selectedCaseId:null};next.revision=(next.revision??0)+1;
 }
 if(privateMemory){delete privateMemory.templates[caseId];delete privateMemory.realResults[caseId];for(const key of ['returns','resets'])for(const [id,value]of Object.entries(privateMemory[key]??{}))if(value.caseId===caseId)delete privateMemory[key][id];}
 return {campaign:next,memory:privateMemory};
}
export class CaseLifecycleService {
 constructor(cases){this.cases=cases;}
 async write(run){await this.cases.visits.queue;return enqueueCaseWrite(this.cases,run);}
 vault(id){return game.journal.find(d=>flag(d,'kind')==='caseVault'&&flag(d,'caseId')===id);}
 async owns(doc,type,caseId){if(type==='JournalEntry'&&flag(doc,'kind')==='visitVault')return (await this.cases.visits.unseal(flag(doc,'sealed'))).caseId===caseId;return caseDocuments(caseId,game)[type]?.includes(doc);}
 guard(caseId){this.cases.gm();if(!game.user.isGM)throw new Error('Koš spravuje vypravěč.');if(!this.vault(caseId))throw new Error('Případ už není ve světě.');
  const visit=this.cases.visits.state,privateVisit=this.cases.visits.privateState,preparation=game.pms?.avatars.state?.preparation;
  if(visit?.status==='active'||privateVisit?.status==='active'||preparation?.status==='preparing'||preparation?.materializing&&preparation.status!=='launched'||this.cases.launching)throw new Error('Správu případů dokonči mezi výpravami a mimo tvorbu Avatarů.');
  const editor=game.pms?.caseEditor;if(editor?.draft?.caseId===caseId&&editor.dirty)throw new Error('Nejdřív ulož nebo zavři rozepsaný návrh tohoto případu.');
 }
 get entries(){if(!game.user.isGM)return [];return game.journal.filter(d=>flag(d,'kind')==='caseVault').map(v=>{const data=this.cases.definitions.get(flag(v,'caseId'));return {caseId:flag(v,'caseId'),title:data?.title??v.name.replace(/ · příprava vypravěče$/,''),version:data?.contentVersion??null,draftOnly:data?.draftOnly??false,status:flag(v,'caseLifecycle')??'available',trashedAt:flag(v,'caseTrashedAt'),cover:flag(v,'caseId')==='tetove'?'systems/pms/assets/hub/tetove-cover-v1.png':'systems/pms/assets/hub/sector-exterior-v2.png'};});}
 async inspect(caseId){this.guard(caseId);const campaign=game.pms.avatars.state,memory=campaign?.initialized?await this.cases.memory.read():null,visitIds=new Set((campaign?.caseVisits??[]).filter(v=>v.caseId===caseId).map(v=>v.visitId));
  for(const doc of game.journal.filter(d=>flag(d,'kind')==='visitVault')){const visit=await this.cases.visits.unseal(flag(doc,'sealed'));if(visit.caseId===caseId){if(visit.status==='active')throw new Error('Nejdřív uzavři uloženou aktivní výpravu tohoto případu.');visitIds.add(flag(doc,'visitId'));}}
  const visit=this.cases.visits.state;if(visit?.caseId===caseId&&campaign?.initialized&&flag(this.vault(caseId),'caseLifecycle')!=='deleting'&&!memory?.returns?.[visit.id])throw new Error('Nejdřív dokonči uložení návratu MHD.');
  const documents=caseDocuments(caseId,game,[...visitIds]);for(const list of Object.values(documents))for(const doc of list)if(flag(doc,'caseBundle')&&flag(doc,'caseBundle')!==caseId)throw new Error(`Dokument „${doc.name}“ patří jinému případu.`);
  return {documents,campaign,memory,blockers:deletionBlockers(caseId,documents),stamp:JSON.stringify(Object.entries(documents).map(([type,list])=>[type,list.map(d=>[d.id,d._stats?.modifiedTime??null]).sort()]))};
 }
 async closeWindows(caseId){
  const editor=game.pms.caseEditor;if(editor?.draft?.caseId===caseId){await editor.close();editor.draft=null;editor.savedDraft=null;}
  if(this.cases.selectedId===caseId)this.cases.selectedId=null;for(const key of ['guideApplication','preparationApplication','resultApplication']){const app=this.cases[key];if(app&&(app.caseId===caseId||app.options?.caseData?.id===caseId||app.caseData?.id===caseId||this.cases.guideCaseId===caseId&&key==='guideApplication')){await app.close();this.cases[key]=undefined;}}
  if(game.pms.service?.caseId===caseId){await game.pms.board?.close();game.pms.service.selectedCaseId=null;}
 }
 async park(documents){if(documents.Scene.some(s=>s.active||globalThis.canvas?.scene?.id===s.id))await game.pms.hub.enter();}
 async trash(caseId){return this.write(async()=>{
  this.guard(caseId);const vault=this.vault(caseId);if(flag(vault,'caseLifecycle'))throw new Error('Případ už je v koši.');const {documents,campaign}=await this.inspect(caseId);
  const visibility=[];for(const [type,list]of Object.entries(documents))if(type!=='Folder')for(const doc of list)if(doc!==vault)visibility.push({type,id:doc.id,ownership:structuredClone(doc.ownership??{default:0}),...(type==='Scene'?{navigation:doc.navigation}: {})});
  const saved={version:1,visibility};await this.park(documents);this.guard(caseId);
  await game.pms?.starterCase?.dismiss(caseId);
  await vault.update({'flags.pms.caseTrash':await this.cases.visits.seal(saved),'flags.pms.caseLifecycle':'trashed','flags.pms.caseTrashedAt':Date.now(),'flags.pms.editorRevision':(flag(vault,'editorRevision')??0)+1});
  if(campaign?.hubBallot?.caseIds?.includes(caseId)||campaign?.hubBallot?.selectedCaseId===caseId){const next=structuredClone(campaign);next.hubBallot={...next.hubBallot,status:'canceled',votes:{},selectedCaseId:null};next.revision++;await game.pms.avatars.persist(next);game.pms.avatars.notify();}
  for(const entry of visibility){this.guard(caseId);const doc=collection(game,entry.type).get(entry.id);if(doc)await doc.update({ownership:new foundry.data.operators.ForcedReplacement({default:0}),...(entry.type==='Scene'?{navigation:false}:{}),...(flag(doc,'kind')==='caseOffer'?{'flags.pms.caseLifecycle':'trashed'}:{})});}
  await this.closeWindows(caseId);this.notify();
 });}
 async restore(caseId){return this.write(async()=>{
  this.guard(caseId);const vault=this.vault(caseId);if(flag(vault,'caseLifecycle')!=='trashed')throw new Error('Obnovit lze pouze případ v koši. Rozpracované trvalé mazání dokonči.');
  const saved=await this.cases.visits.unseal(flag(vault,'caseTrash'));if(saved?.version!==1)throw new Error('Záznam koše není podporovaný.');
  for(const entry of saved.visibility){this.guard(caseId);const doc=collection(game,entry.type).get(entry.id);if(!doc)continue;
   if(!await this.owns(doc,entry.type,caseId))throw new Error('Dokument mezitím opustil tento případ. Obnovení nepřepíše jiný obsah.');
   const bundle=flag(doc,'caseBundle');if(bundle&&bundle!==caseId)throw new Error('Dokument mezitím převzal jiný případ.');
   await doc.update({ownership:new foundry.data.operators.ForcedReplacement(entry.ownership),...(entry.type==='Scene'?{navigation:entry.navigation}:{}),...(flag(doc,'kind')==='caseOffer'?{'flags.pms.caseLifecycle':new foundry.data.operators.ForcedDeletion()}: {})});
  }
  this.guard(caseId);const revision=(flag(vault,'editorRevision')??0)+1,draft=flag(vault,'editorDraft')?await this.cases.visits.unseal(flag(vault,'editorDraft')):null;if(draft)draft.revision=revision;await vault.update({...(draft?{'flags.pms.editorDraft':await this.cases.visits.seal(draft)}:{}),'flags.pms.caseLifecycle':new foundry.data.operators.ForcedDeletion(),'flags.pms.caseTrash':new foundry.data.operators.ForcedDeletion(),'flags.pms.caseTrashedAt':new foundry.data.operators.ForcedDeletion(),'flags.pms.editorRevision':revision});
  await this.cases.reloadDefinition(caseId);this.notify();
 });}
 async remove(caseId,expectedStamp){return this.write(async()=>{
  this.guard(caseId);const vault=this.vault(caseId);if(!['trashed','deleting'].includes(flag(vault,'caseLifecycle')))throw new Error('Nejdřív přesuň případ do koše.');
  const inspected=await this.inspect(caseId);if(expectedStamp!==inspected.stamp)throw new Error('Obsah případu se změnil. Znovu otevři potvrzení smazání.');if(inspected.blockers.length)throw new Error(inspected.blockers.join(' '));
  const saved=await this.cases.visits.unseal(flag(vault,'caseTrash'));
  // Durable deletion intent survives failures and GM reconnects. The vault is removed last.
  saved.deletion=Object.fromEntries(Object.entries(inspected.documents).map(([type,list])=>[type,[...new Set([...(saved.deletion?.[type]??[]),...list.map(d=>d.id)])]]));
  await vault.update({'flags.pms.caseLifecycle':'deleting','flags.pms.caseTrash':await this.cases.visits.seal(saved)});
  await this.park(inspected.documents);await this.closeWindows(caseId);
  const cleaned=forgetCase(inspected.campaign,inspected.memory,caseId,inspected.documents.JournalEntry.filter(d=>flag(d,'kind')==='visitVault').map(d=>flag(d,'visitId')));
  if(cleaned.campaign){this.guard(caseId);await game.pms.avatars.persist(cleaned.campaign,cleaned.memory?{caseMemory:await this.cases.visits.seal(cleaned.memory)}:{});game.pms.avatars.notify();}
  for(const user of game.users??[])if(saved.deletion.Actor.includes(user.character?.id??user.character)){this.guard(caseId);await user.update({character:null});}
  for(const type of ['Scene','Actor','Item','JournalEntry'])for(const id of saved.deletion[type]){if(id===vault.id)continue;this.guard(caseId);const doc=collection(game,type).get(id);if(doc){if(!await this.owns(doc,type,caseId))throw new Error('Dokument mezitím převzal jiný případ. Smazání bylo zastaveno.');this.guard(caseId);await doc.delete();}}
  // Native folder deletion must never cascade into somebody else's contents or subfolders.
  for(const id of saved.deletion.Folder){this.guard(caseId);const folder=game.folders.get(id);if(!folder)continue;
   const occupied=[...contents(game.actors),...contents(game.scenes),...contents(game.items),...contents(game.journal),...contents(game.folders)].some(d=>(d.folder?.id??d.folder)===id);
   if(occupied)await folder.update({'flags.pms.caseBundle':new foundry.data.operators.ForcedDeletion()});else await folder.delete({deleteContents:false,deleteSubfolders:false});
  }
  this.guard(caseId);await vault.delete();this.cases.definitions.delete(caseId);this.cases.runtimeDefinitions.delete(caseId);
  if(this.cases.visits.state?.caseId===caseId||this.cases.visits.canonical?.caseId===caseId){this.cases.visits.privateDocument=null;this.cases.visits.canonical=null;}
  this.notify();
 });}
 notify(){game.pms.catalog?.notify();game.pms.service?.notify();ui.controls?.render({force:true});}
 async dialog(command,caseId){this.guard(caseId);const entry=this.entries.find(e=>e.caseId===caseId);if(!entry)throw new Error('Případ chybí.');let detail,stamp;
  if(command==='remove'){const inspected=await this.inspect(caseId);stamp=inspected.stamp;if(inspected.blockers.length)throw new Error(inspected.blockers.join(' '));detail=`<p>Trvale smazat <strong>${esc(entry.title)}</strong>?</p><ul>${Object.entries(inspected.documents).filter(([,list])=>list.length).map(([type,list])=>`<li>${{Scene:'Scény',Actor:'Postavy a Avataři',Item:'Předměty a vodítka',JournalEntry:'Deníky a tabule',Folder:'Složky'}[type]}: ${list.length}</li>`).join('')}</ul><p>Smaže se i výchozí svět, výsledek a uložené sestavy tohoto případu. Získaná energie, odměnová historie a odemčený postup služby zůstanou.</p><p>Obrázky a zvuky zůstanou na disku: mohou je používat jiné dokumenty. Pokud chceš zálohu, nejdřív obnov případ a exportuj jeho ZIP.</p><label>Pro potvrzení napiš identifikátor <strong>${esc(caseId)}</strong><input name="confirmId" autocomplete="off" required></label>`;}
  else detail=command==='trash'?`<p>Přesunout <strong>${esc(entry.title)}</strong> do koše?</p><p>Případ zmizí z pověření a archivu. Mapy, postavy, vodítka i tabule zůstanou uložené a půjde je obnovit. Případné hlasování o tomto případu se zruší.</p>`:`<p>Obnovit <strong>${esc(entry.title)}</strong> včetně přístupů k mapám a archivu?</p>`;
  const result=await this.cases.controls.promptForm(command==='remove'?'Trvalé smazání případu':command==='trash'?'Přesunout do koše':'Obnovit případ',detail,{label:command==='remove'?'Smazat natrvalo':command==='trash'?'Přesunout do koše':'Obnovit',position:{width:700},submit:async f=>{if(command==='remove'&&f.get('confirmId')!==caseId)throw new Error('Identifikátor případu nesouhlasí.');await this[command](caseId,stamp);}});
  return Boolean(result);
 }
}
