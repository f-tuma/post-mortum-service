import {createAvatarCampaign,applyAvatarCommand,availablePreparationRoster} from './avatar-state.mjs';
import {avatarCatalog} from './avatar-catalog.mjs';
import {clientCanWrite,electedPMSAuthority} from './gm-authority.mjs';
const NS='pms',KIND='avatarCampaign';
const requestLimit=12000;
export function decodeAvatarRequest(stored) {
  if(typeof stored!=='string'||stored.length>requestLimit)return null;
  try {const value=JSON.parse(stored);return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
}
export function electedAvatarAuthority(users) {return users.filter(u=>u.active&&u.isGM).sort((a,b)=>a.id.localeCompare(b.id))[0]??null;}

/** Player-owned User flags are requests; only the elected GM writes campaign accounting. */
export class AvatarService {
  constructor(visits=null) {this.visits=visits;this.listeners=new Set();this.pending=new Map();this.queue=Promise.resolve();this.localQueue=Promise.resolve();this.booted=false;}
  get authority(){return electedPMSAuthority(game.users.contents??[...game.users],game.journal);}
  get isAuthority(){return this.authority?.id===game.user.id&&clientCanWrite();}
  get document(){return game.journal.find(d=>!d.pack&&d.getFlag(NS,'kind')===KIND)??null;}
  get state(){return this.document?.getFlag(NS,'campaign')??null;}
  get eligibleOwnerIds(){return game.users.filter(u=>!u.isGM&&u.role>=CONST.USER_ROLES.PLAYER&&!u.isBanned).map(u=>u.id);}
  persist(state,privateFlags={}){return this.document.update({flags:{...this.document.flags,[NS]:{...this.document.flags[NS],...privateFlags,campaign:state}}},{recursive:false});}
  onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  notify(){
    for(const [requestId,p]of this.pending){const receipt=this.state?.receipts.find(r=>r.key===`${game.user.id}:${requestId}`);if(!receipt)continue;
      clearTimeout(p.timer);this.pending.delete(requestId);receipt.ok?p.resolve(receipt):p.reject(new Error(receipt.message));}
    for(const fn of this.listeners)fn();
  }
  async initialize(){
    if(this.booted)return;this.booted=true;
    for(const hook of ['createJournalEntry','updateJournalEntry','deleteJournalEntry'])Hooks.on(hook,doc=>{if([KIND,'authorityProof'].includes(doc.getFlag(NS,'kind')))this.notify();if(doc.getFlag(NS,'kind')==='authorityProof'&&this.isAuthority)for(const user of game.users)this.enqueue(user);});
    Hooks.on('updateUser',user=>{if(this.isAuthority)this.enqueue(user);});
    Hooks.on('userConnected',()=>{if(this.isAuthority)for(const u of game.users)this.enqueue(u);this.notify();});
    if(this.isAuthority)for(const u of game.users)this.enqueue(u);
    Hooks.on('pmsAuthorityChanged',()=>{this.notify();if(this.isAuthority)for(const u of game.users)this.enqueue(u);});
  }
  enqueue(user){const c=decodeAvatarRequest(user.getFlag(NS,'avatarRequest'));if(!c?.requestId||!this.state||c.campaignId!==this.state.id)return;
    this.queue=this.queue.then(()=>this.process(c,user)).catch(e=>console.error('PMS avatar',e));}
  async process(command,user){
    if(!this.isAuthority||!this.document||command.campaignId!==this.state.id)throw new Error('Příprava čeká na připojeného vypravěče.');
    if(user.role<CONST.USER_ROLES.PLAYER||user.isBanned)throw new Error('Tento uživatel nemůže připravovat Avatara.');
    // Assigning User.character during departure fires updateUser again with the
    // last acknowledged request. Replaying it must return its durable receipt
    // before the launch guard, without another purchase or a spurious error.
    const acknowledged=this.state.receipts.find(r=>r.key===`${user.id}:${command.requestId}`);
    if(acknowledged){this.notify();return acknowledged;}
    if(game.pms?.cases.launching&&['draft','confirm','unconfirm','openPreparation','cancelPreparation'].includes(command.type))throw new Error('Odjezd už začal. Sestavy se právě obnovují do výchozího světa.');
    const {campaignId,...input}=command;
    const definition=command.type==='openPreparation'?await game.pms?.cases.preparationDefinition(command.caseId):null;
    const offeredCaseIds=game.pms?.catalog?.newOffers.map(o=>o.caseId)??[];
    const result=applyAvatarCommand(this.state,input,{id:user.id,isGM:user.isGM},{eligibleOwnerIds:this.eligibleOwnerIds,catalog:definition?.avatarCatalog,offeredCaseIds});
    if(!result.duplicate)await this.persist(result.state);
    this.notify();return result.receipt;
  }
  submit(command){
    const requestId=command.requestId??foundry.utils.randomID();
    const encoded=JSON.stringify({...command,requestId,campaignId:this.state?.id});
    if(encoded.length>requestLimit)return Promise.reject(new Error('Požadavek je příliš dlouhý.'));
    const c=decodeAvatarRequest(encoded);
    const run=async()=>{
      if(!this.authority||!this.state)throw new Error('Příprava čeká na připojeného vypravěče.');
      if(game.user.isGM&&!this.isAuthority)throw new Error(game.pmsAuthority?.message??'Přípravu řídí hlavní okno vypravěče.');
      if(this.isAuthority){const job=this.queue.then(()=>this.process(c,game.user));this.queue=job.catch(()=>{});const receipt=await job;if(!receipt.ok)throw new Error(receipt.message);return receipt;}
      const confirmation=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error('Potvrzení ještě nedorazilo. Po obnovení spojení zkontrolujte uloženou sestavu.'));},20000);this.pending.set(requestId,{resolve,reject,timer});});
      confirmation.catch(()=>{});
      try {await game.user.setFlag(NS,'avatarRequest',encoded);this.notify();return await confirmation;}
      catch(error){const pending=this.pending.get(requestId);if(pending){clearTimeout(pending.timer);this.pending.delete(requestId);pending.reject(error);}throw error;}
    };
    const job=this.localQueue.then(run);this.localQueue=job.catch(()=>{});return job;
  }
  initializePool(ownerIds){
    const run=async()=>{
      if(!this.isAuthority)throw new Error('Zásobu zakládá připojený vypravěč.');
      // The existence and initial contribution are committed together. Reconnects never create a second grant.
      if(this.state?.initialized)throw new Error('Počáteční energie už byla připsaná.');
      const current=this.state??createAvatarCampaign({id:foundry.utils.randomID()});
      const result=applyAvatarCommand(current,{type:'initializePool',ownerIds,requestId:foundry.utils.randomID()},{id:game.user.id,isGM:true},{eligibleOwnerIds:this.eligibleOwnerIds});
      if(!result.receipt.ok)throw new Error(result.receipt.message);
      if(this.document)await this.persist(result.state);
      else await JournalEntry.create({name:'PMS — společná energie a příprava Avatarů',ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER},flags:{[NS]:{kind:KIND,campaign:result.state}}});
      this.notify();return result.receipt;
    };
    const job=this.queue.then(run);this.queue=job.catch(()=>{});return job;
  }
  async openPreparation({caseId=game.pms?.cases.data?.id,mode='real',ownerIds}){
    if(!this.isAuthority)throw new Error('Přípravu otevírá připojený vypravěč.');
    if(this.visits?.state?.status==='active'||game.pms?.visits?.state?.status==='active')throw new Error('Nejdřív dokončete aktuální návštěvu.');
    return this.submit({type:'openPreparation',preparationId:foundry.utils.randomID(),caseId,mode,ownerIds,
      avatarIds:Object.fromEntries(ownerIds.map(id=>[id,foundry.utils.randomID()]))});
  }
  async markLaunched(visitId){return this.submit({type:'markLaunched',preparationId:this.state?.preparation?.id,visitId});}
  async cancelPreparation(){return this.submit({type:'cancelPreparation',preparationId:this.state?.preparation?.id});}
  readyAvatars(){
    const run=async()=>{
      if(!this.isAuthority)throw new Error('Avatary připravuje připojený vypravěč.');
      if(this.visits?.state?.status==='active'||game.pms?.visits?.state?.status==='active')throw new Error('Nejdřív dokončete právě probíhající výpravu.');
      const p=this.state?.preparation;availablePreparationRoster(this.state);
      // Older preparations may predate catalog checks. Reject an invalid kit
      // before the durable departure latch prevents edits and refunds.
      avatarCatalog(p.catalog,p.caseId);
      if(!p.materializing){const begun=await this.process({type:'beginMaterialization',campaignId:this.state.id,requestId:foundry.utils.randomID(),preparationId:p.id},game.user);if(!begun.ok)throw new Error(begun.message);}
      for(const ownerId of p.ownerIds){
        const d=this.state.preparation.drafts[ownerId],key=`${this.state.id}:${d.avatarId}`;
        let actor=game.actors.get(d.actorId)??game.actors.find(a=>a.type==='avatar'&&a.getFlag(NS,'campaignAvatar')===key);
        const saved=this.state.savedAvatars[`${p.caseId}:${ownerId}`];
        if(saved.materializedPreparationId===p.id&&actor)continue;
        const contact=p.catalog.contacts.find(c=>c.id===d.contactId),relation=contact?.relationships.find(r=>r.id===d.relationshipId);
        const data={name:d.name,img:d.portrait,ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,[ownerId]:CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER},
          system:{caseId:p.caseId,role:d.role,origin:d.origin,motivation:d.motivation,biography:d.biography,contact:contact?`${contact.name} · ${relation?.label??relation?.name??''}`:'',
            vitals:d.vitals,skills:d.skills,alive:true,food:p.catalog.kits.find(k=>k.id===d.kitId).items.filter(i=>i.food).reduce((n,i)=>n+i.quantity,0),paidValueH:d.paidValueH},prototypeToken:{name:d.name,texture:{src:d.portrait},actorLink:true,disposition:1,alpha:1,hidden:false,sight:{enabled:true,range:0,angle:360,visionMode:'basic'}},
          flags:{[NS]:{campaignAvatar:key,initialKit:d.kitId,contactId:d.contactId,relationshipId:d.relationshipId}}};
        if(!actor)actor=await Actor.create({...data,type:'avatar',...(d.actorId?{_id:d.actorId}:{})},{keepId:true});
        else await actor.update(data);
        if(!d.actorId){const result=await this.process({type:'attachActor',campaignId:this.state.id,requestId:foundry.utils.randomID(),preparationId:p.id,ownerId,avatarId:d.avatarId,actorId:actor.id},game.user);if(!result.ok)throw new Error(result.message);}
        // Replay is a fresh starting inventory, not carried-over loot. Archive Items are separate world documents.
        const remove=actor.items.filter(i=>['supply','injury','clue'].includes(i.type)||i.getFlag(NS,'initialKit')).map(i=>i.id);
        if(remove.length)await actor.deleteEmbeddedDocuments('Item',remove);
        if(actor.effects?.size)await actor.deleteEmbeddedDocuments('ActiveEffect',actor.effects.map(e=>e.id));
        const kit=p.catalog.kits.find(k=>k.id===d.kitId);
        await actor.createEmbeddedDocuments('Item',kit.items.map(item=>({name:item.name,type:'supply',img:'icons/svg/item-bag.svg',system:{quantity:item.quantity??1,description:item.description??''},flags:{[NS]:{initialKit:d.kitId,kitItem:item.id,food:Boolean(item.food)}}})));
        const result=await this.process({type:'materialized',campaignId:this.state.id,requestId:foundry.utils.randomID(),preparationId:p.id,ownerId},game.user);if(!result.ok)throw new Error(result.message);
      }
      return availablePreparationRoster(this.state);
    };
    const job=this.queue.then(run);this.queue=job.catch(()=>{});return job;
  }
}
