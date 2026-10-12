import {createCaseMemory,validateCaseMemory,rememberRealResult,discardReflection,recordRealReport} from './case-memory.mjs';
import {captureCaseSnapshot,seedLegacyTemplate,restoreCaseSnapshot,assertNativeCaseSnapshot} from './case-snapshot.mjs';
import {caseRemoved} from './case-lifecycle.mjs';
export class CaseMemoryService {
  constructor(avatars,visits,cases){this.avatars=avatars;this.visits=visits;this.cases=cases;}
  gm(){if(!game.user.isGM||!this.avatars.isAuthority)throw new Error('Paměť případu spravuje hlavní připojený vypravěč.');}
  serial(run){const job=this.avatars.queue.then(()=>{this.gm();return run();});this.avatars.queue=job.catch(()=>{});return job;}
  async read(){
    if(!game.user.isGM)throw new Error('Skutečný výsledek a výchozí svět patří vypravěči.');
    const campaign=this.avatars.state;if(!campaign?.initialized)throw new Error('Nejdřív založ společnou zásobu v MHD.');
    const sealed=this.avatars.document.getFlag('pms','caseMemory');
    return validateCaseMemory(sealed?await this.visits.unseal(sealed):createCaseMemory(campaign.id),campaign.id);
  }
  async persist(memory,campaign=this.avatars.state){await this.avatars.persist(campaign,{caseMemory:await this.visits.seal(memory)});this.avatars.notify();}
  capture(caseId,includeAvatars=false){return captureCaseSnapshot({caseId,actors:game.actors.contents,scenes:game.scenes.contents,items:game.items.contents,
    avatarActorIds:includeAvatars?(this.visits.privateState?.avatars??[]).map(a=>a.actorId):Object.values(this.avatars.state.savedAvatars).map(a=>a.actorId),includeAvatars});}
  async restore(snapshot){
    assertNativeCaseSnapshot(snapshot);
    await game.pms?.hub?.parkForReset(snapshot.caseId);
    const result=await restoreCaseSnapshot(snapshot,{actors:game.actors,scenes:game.scenes,items:game.items,folders:game.folders,createItem:(...args)=>Item.create(...args),deleteItems:ids=>Item.deleteDocuments(ids),createActor:(...args)=>Actor.create(...args),createScene:(...args)=>Scene.create(...args),deleteActors:ids=>Actor.deleteDocuments(ids),deleteScenes:ids=>Scene.deleteDocuments(ids),resetFog:id=>this.resetFog(id)});
    await game.pms?.npcTokens?.syncAll(snapshot.caseId);
    await game.pms?.roomNotes?.ensureForCase(snapshot.caseId);
    return result;
  }
  resetFog(sceneId){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);game.socket.off('resetFog',confirmed);error?reject(error):resolve();};
      const confirmed=event=>{if(event?.sceneId===sceneId)finish();};
      const timer=setTimeout(()=>finish(new Error('Server nepotvrdil obnovu mlhy scény. Zopakuj odjezd po obnovení spojení.')),12000);
      // The native v14 resetFog event is GM-authorized by Foundry and broadcasts only after deletion.
      try{game.socket.on('resetFog',confirmed);game.socket.emit('resetFog',sceneId);}catch(error){finish(error);}
    });
  }
  async ensureTemplate(memory,data){
    if(data.initialSnapshot&&(!memory.templates[data.id]||memory.templates[data.id].definition.contentVersion<data.contentVersion)){
      memory.templates[data.id]={source:'editor',snapshot:structuredClone(data.initialSnapshot),definition:structuredClone(data)};await this.persist(memory);return memory;
    }
    if(memory.templates[data.id])return memory;
    const previous=(this.avatars.state.caseVisits??[]).some(v=>v.caseId===data.id)||this.visits.privateState?.caseId===data.id;
    const snapshot=this.capture(data.id);if(!snapshot.scenes.length||!data.npcs.every(n=>snapshot.actors.some(a=>a.flags?.pms?.caseNpc===n.id)))throw new Error('Nejdřív doplň scény a všechna NPC případu.');
    memory.templates[data.id]={source:previous?'legacy-authored':'captured',snapshot:previous?seedLegacyTemplate(snapshot,data):snapshot,
      definition:structuredClone(data)};
    await this.persist(memory);return memory;
  }
  finishReturn(visit){
    if(!visit?.caseId||visit.status!=='returned')return Promise.resolve(visit);
    return this.serial(async()=>{
      if(caseRemoved(visit.caseId)||this.avatars.state?.deletedVisitIds?.includes(visit.id))return visit;
      let memory=await this.read();
      if(visit.mode==='real'){
        if(!memory.returns[visit.id]){
          memory=rememberRealResult(memory,visit,this.capture(visit.caseId,true));
          const campaign=structuredClone(this.avatars.state),entry=campaign.caseVisits?.find(v=>v.visitId===visit.id);
          if(entry)Object.assign(entry,{status:'returned',clock:visit.clock,returnReason:visit.returnReason});
          else {campaign.caseVisits??=[];campaign.caseVisits.push({caseId:visit.caseId,mode:'real',visitId:visit.id,status:'returned',clock:visit.clock,returnReason:visit.returnReason,ownerIds:visit.avatars.map(a=>a.ownerId)});}
          await this.persist(memory,campaign);
        }
        else if(!(this.avatars.state.caseVisits??[]).some(v=>v.visitId===visit.id)){
          // Older campaigns already froze the real result before public visit history existed.
          const campaign=structuredClone(this.avatars.state);campaign.caseVisits??=[];
          campaign.caseVisits.push({caseId:visit.caseId,mode:'real',visitId:visit.id,status:'returned',clock:visit.clock,returnReason:visit.returnReason,ownerIds:visit.avatars.map(a=>a.ownerId)});
          await this.persist(memory,campaign);
        }
        return visit;
      }
      if(!memory.returns[visit.id]){
        if(!memory.templates[visit.caseId]){
          const data=this.cases.definitionFor?.(visit.caseId)??this.cases.data;if(data?.id!==visit.caseId)throw new Error('Chybí výchozí příprava tohoto odrazu.');
          memory=await this.ensureTemplate(memory,data);
        }
        // Restore first, mark last. An interrupted return retries the same idempotent restoration.
        await this.restore(memory.templates[visit.caseId].snapshot);
        memory.returns[visit.id]={caseId:visit.caseId,mode:'reflection',clock:visit.clock,reason:visit.returnReason};
        const campaign=structuredClone(this.avatars.state),entry=campaign.caseVisits?.find(v=>v.visitId===visit.id);
        if(entry)Object.assign(entry,{status:'returned',clock:visit.clock,returnReason:visit.returnReason});
        await this.persist(memory,campaign);
      }
      return discardReflection(visit);
    });
  }
  prepare(preparation,data){
    return this.serial(async()=>{
      if(this.visits.privateState?.status==='active')throw new Error('Nejdřív dokonči aktuální návštěvu.');
      let memory=await this.read();
      const returned=this.visits.privateState;
      if(returned?.caseId&&returned.mode==='real'&&!memory.realResults[returned.caseId])throw new Error('Nejdřív dokonči uložení skutečného návratu.');
      if(preparation.mode==='reflection'&&!memory.realResults[data.id])throw new Error('Odraz čeká na uložený výsledek skutečného průchodu.');
      memory=await this.ensureTemplate(memory,data);
      if(memory.resets[preparation.id]?.status==='restored')return structuredClone(memory.templates[data.id].definition);
      memory.resets[preparation.id]={caseId:data.id,status:'restoring'};await this.persist(memory);
      await this.restore(memory.templates[data.id].snapshot);
      memory.resets[preparation.id].status='restored';await this.persist(memory);
      return structuredClone(memory.templates[data.id].definition);
    });
  }
  updateReport(caseId,report){return this.serial(async()=>{const memory=recordRealReport(await this.read(),caseId,report);await this.persist(memory);});}
}
