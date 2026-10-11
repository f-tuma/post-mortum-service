import {introductionComplete} from './hub-ballot.mjs';
import {sectorGuideData,archiveGuideUpdates} from './sector-guide.mjs';
import {caseRemoved} from './case-lifecycle.mjs';
export const safeCover=value=>typeof value==='string'&&!value.includes('..')&&/^(?:systems\/|worlds\/|icons\/|https?:\/\/)[^<>"'\\\s]+\.(?:png|webp|jpe?g|svg)$/i.test(value)?value:'systems/pms/assets/hub/sector-exterior-v2.png';
export function publicOfferProfile(data){return {setting:String(data.avatarCatalog.setting).slice(0,160),duration:Number.isFinite(data.end-data.start)?Math.max(0,data.end-data.start):0,
 teaser:data.id==='tetove'?'Rod barona z Tétů provází neštěstí. Smrt nejstaršího syna je poslední ranou. Náhoda, nebo souvislost, kterou zatím nikdo nevidí?':String(data.intro).slice(0,500),
 cover:data.id==='tetove'?'systems/pms/assets/hub/tetove-cover-v1.png':'systems/pms/assets/hub/sector-exterior-v2.png'};}
export class CaseCatalogService{
 constructor(avatars){this.avatars=avatars;this.listeners=new Set();avatars.onChange(()=>this.notify());
  for(const event of ['createJournalEntry','updateJournalEntry','deleteJournalEntry','updateJournalEntryPage'])Hooks.on(event,()=>this.notify());
 }
 onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 notify(){for(const fn of this.listeners)fn();}
 get state(){return this.avatars.state;}
 get managementCases(){return game.user.isGM?game.pms?.caseLifecycle?.entries??[]:[];}
 get bundledStarter(){return game.user.isGM?game.pms?.starterCase?.entry??null:null;}
 get guide(){return game.journal.find(d=>d.getFlag('pms','kind')==='sectorGuide'&&d.testUserPermission(game.user,'OBSERVER'));}
 get offers(){
  const players=this.avatars.eligibleOwnerIds.map(id=>game.users.get(id));
  return game.journal.filter(d=>d.getFlag('pms','kind')==='caseOffer'&&!caseRemoved(d.getFlag('pms','caseId'))&&d.testUserPermission(game.user,'OBSERVER')&&(d.ownership?.default??0)>=2&&players.every(u=>d.testUserPermission(u,'OBSERVER')))
   .map(document=>{const p=document.getFlag('pms','offerProfile')??{},caseId=document.getFlag('pms','caseId'),visited=(this.state?.caseVisits??[]).some(v=>v.caseId===caseId&&v.mode==='real');
    return {id:document.id,caseId,title:document.name,document,setting:String(p.setting??'Jiná realita').slice(0,160),teaser:String(p.teaser??'Otevřete pověření pro zadání tohoto případu.').slice(0,500),duration:Number.isFinite(p.duration)?p.duration:0,cover:safeCover(p.cover),visited};});
 }
 get newOffers(){return this.offers.filter(o=>o.caseId!=='tetove'&&!o.visited);}
 get introComplete(){return introductionComplete(this.state);}
 async ensureGuide(){if(!this.avatars.isAuthority)return;const existing=game.journal.find(d=>d.getFlag('pms','kind')==='sectorGuide');if(existing){const updates=archiveGuideUpdates(existing.pages.contents);if(updates.length)await existing.updateEmbeddedDocuments('JournalEntryPage',updates);return existing;}
  let folder=game.folders.find(f=>f.type==='JournalEntry'&&f.getFlag('pms','sectorLibrary'));if(!folder)folder=await Folder.create({name:'PMS · sektor a pověření',type:'JournalEntry',flags:{pms:{sectorLibrary:true}}});
  return JournalEntry.create({...sectorGuideData(),folder:folder.id});
 }
 async openBallot(ownerIds,caseIds){return this.avatars.submit({type:'hubOpenBallot',ballotId:foundry.utils.randomID(),ownerIds,caseIds});}
 vote(caseId){return this.avatars.submit({type:'hubVote',ballotId:this.state?.hubBallot?.id,caseId});}
 confirm(caseId){return this.avatars.submit({type:'hubConfirmBallot',ballotId:this.state?.hubBallot?.id,caseId});}
 cancel(){return this.avatars.submit({type:'hubCancelBallot',ballotId:this.state?.hubBallot?.id});}
 async prepare(caseId){
  if(!game.user.isGM||!this.avatars.isAuthority)throw new Error('Výpravu připravuje hlavní připojený vypravěč.');
  const offer=this.offers.find(o=>o.caseId===caseId);if(!offer)throw new Error('Pověření není dostupné.');
  if(!offer.visited&&caseId!=='tetove'&&this.state?.hubBallot?.selectedCaseId!==caseId)throw new Error('Nejdřív potvrďte společnou volbu pro další sezení.');
  await game.pms.cases.select(caseId);return game.pms.openAvatarCreation();
 }
}
