import {enqueueCaseWrite} from './case-write-queue.mjs';

export const TETOVE_NPC_PORTRAITS=Object.freeze(Object.fromEntries(
  ['oto','adela','armand','korda','bela','havel','ida','tereza','darek']
    .map(id=>[id,`systems/pms/assets/npcs/${id}-v1.png`])
));
const clone=value=>structuredClone(value);
const flag=(document,key)=>document.getFlag?.('pms',key)??document.flags?.pms?.[key];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const contents=collection=>collection.contents??[...collection];
export function isPlaceholderNpcArt(src){
  return src===undefined||src===null||src===''||src==='systems/pms/assets/avatar.svg'||src==='icons/svg/mystery-man.svg';
}

/** Fill only empty/generic artwork. A manually chosen portrait or token remains authoritative. */
export function npcPortraitUpdate(actor,portrait){
  const update={},img=isPlaceholderNpcArt(actor.img)?portrait:actor.img;
  if(isPlaceholderNpcArt(actor.img))update.img=img;
  if(isPlaceholderNpcArt(actor.prototypeToken?.texture?.src))update['prototypeToken.texture.src']=img;
  return update;
}
function portraitChoices(definition,portraits){
  return Object.fromEntries((definition.npcs??[]).filter(n=>Object.hasOwn(portraits,n.id))
    .map(n=>[n.id,isPlaceholderNpcArt(n.img)?portraits[n.id]:n.img]));
}
function fillActor(actor,portrait){
  const update=npcPortraitUpdate(actor,portrait);
  if(update.img)actor.img=update.img;
  if(update['prototypeToken.texture.src']){
    actor.prototypeToken??={};actor.prototypeToken.texture??={};
    actor.prototypeToken.texture.src=update['prototypeToken.texture.src'];
  }
}
/** No capture or scene replacement: IDs, levels, walls, movement and every non-art field survive. */
export function patchNpcPortraitSnapshot(snapshot,portraits){
  if(!snapshot)return snapshot;
  const next=clone(snapshot),actors=new Map();
  for(const actor of next.actors??[]){
    const id=flag(actor,'caseNpc');
    if(actor.type!=='npc'||flag(actor,'caseBundle')!==next.caseId||!Object.hasOwn(portraits,id))continue;
    fillActor(actor,portraits[id]);actors.set(actor._id,actor);
  }
  for(const scene of next.scenes??[]){
    if(flag(scene,'caseBundle')!==next.caseId)continue;
    for(const token of scene.tokens??[]){
      const actor=actors.get(token.actorId);
      if(!actor||!isPlaceholderNpcArt(token.texture?.src))continue;
      token.texture??={};token.texture.src=actor.prototypeToken.texture.src;
    }
  }
  return next;
}
export function patchNpcPortraitDefinition(definition,portraits){
  const next=clone(definition);
  for(const npc of next.npcs??[])if(Object.hasOwn(portraits,npc.id)&&isPlaceholderNpcArt(npc.img))npc.img=portraits[npc.id];
  if(next.initialSnapshot)next.initialSnapshot=patchNpcPortraitSnapshot(next.initialSnapshot,portraitChoices(next,portraits));
  return next;
}
export function patchNpcPortraitMemory(memory,caseId,portraits){
  const next=clone(memory),template=next.templates?.[caseId];
  if(template){
    if(template.definition)template.definition=patchNpcPortraitDefinition(template.definition,portraits);
    template.snapshot=patchNpcPortraitSnapshot(template.snapshot,template.definition?portraitChoices(template.definition,portraits):portraits);
  }
  const result=next.realResults?.[caseId];
  if(result?.snapshot)result.snapshot=patchNpcPortraitSnapshot(result.snapshot,portraits);
  return next;
}

/** Explicit GM maintenance, also callable from a native Macro without reloading an existing client. */
export function installCaseNpcPortraits(cases,caseId='tetove'){
  cases.gm();if(!game.user.isGM)throw new Error('Portréty případu spravuje vypravěč.');
  if(caseId!=='tetove')throw new Error('Tento případ nemá připravenou sadu portrétů.');
  return enqueueCaseWrite(cases,async()=>{
    const vault=game.journal.find(d=>flag(d,'kind')==='caseVault'&&flag(d,'caseId')===caseId);
    if(!vault)throw new Error('Nejdřív importuj přípravu případu.');
    const original=await cases.visits.unseal(flag(vault,'sealed'));
    const portraits=portraitChoices(original,TETOVE_NPC_PORTRAITS),definition=patchNpcPortraitDefinition(original,portraits);
    const sealedDraft=flag(vault,'editorDraft'),draft=sealedDraft?await cases.visits.unseal(sealedDraft):null;
    let nextDraft=null;
    if(draft){nextDraft=clone(draft);nextDraft.definition=patchNpcPortraitDefinition(draft.definition,portraits);
      nextDraft.snapshot=patchNpcPortraitSnapshot(draft.snapshot,portraitChoices(nextDraft.definition,portraits));}
    const memory=game.pms?.avatars.state?.initialized?await cases.memory.read():null;
    const nextMemory=memory?patchNpcPortraitMemory(memory,caseId,portraits):null;
    const actorUpdates=[],tokenUpdates=[];
    for(const actor of contents(game.actors)){
      const id=flag(actor,'caseNpc');
      if(actor.type!=='npc'||flag(actor,'caseBundle')!==caseId||!Object.hasOwn(portraits,id))continue;
      const update=npcPortraitUpdate(actor,portraits[id]);
      if(Object.keys(update).length)actorUpdates.push([actor,update]);
    }
    const actors=new Map(contents(game.actors).filter(a=>a.type==='npc'&&flag(a,'caseBundle')===caseId&&Object.hasOwn(portraits,flag(a,'caseNpc'))).map(a=>[a.id,a]));
    for(const scene of contents(game.scenes)){
      if(flag(scene,'caseBundle')!==caseId)continue;
      const updates=[];
      for(const token of contents(scene.tokens)){
        const actor=actors.get(token.actorId);
        if(!actor||!isPlaceholderNpcArt(token.texture?.src))continue;
        const update=npcPortraitUpdate(actor,portraits[flag(actor,'caseNpc')]);
        updates.push({_id:token.id,'texture.src':update['prototypeToken.texture.src']??actor.prototypeToken.texture.src});
      }
      if(updates.length)tokenUpdates.push([scene,updates]);
    }
    // Prepare all private copies before the first write. Retrying an interrupted art patch is safe.
    const vaultChanged=!same(original,definition)||(draft&&!same(draft,nextDraft));
    if(vaultChanged){
      const revision=(flag(vault,'editorRevision')??0)+1;
      const update={'flags.pms.sealed':await cases.visits.seal(definition),'flags.pms.editorRevision':revision};
      if(nextDraft){nextDraft.revision=revision;update['flags.pms.editorDraft']=await cases.visits.seal(nextDraft);}
      await vault.update(update);
    }
    const memoryChanged=Boolean(memory&&!same(memory,nextMemory));
    if(memoryChanged)await cases.memory.persist(nextMemory);
    cases.definitions.set(caseId,definition);
    if(cases.runtimeDefinitions.has(caseId))cases.runtimeDefinitions.set(caseId,patchNpcPortraitDefinition(cases.runtimeDefinitions.get(caseId),portraits));
    for(const [actor,update]of actorUpdates)await actor.update(update);
    for(const [scene,updates]of tokenUpdates)await scene.updateEmbeddedDocuments('Token',updates);
    return {actors:actorUpdates.length,tokens:tokenUpdates.reduce((total,[,updates])=>total+updates.length,0),vaultChanged:Boolean(vaultChanged),memoryChanged};
  });
}
