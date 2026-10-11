import {caseRewards} from './reward-catalog.mjs';
import {createRewardBook,applyRewardCommand} from './reward-state.mjs';
export class RewardService {
 constructor(avatars,visits,cases){this.avatars=avatars;this.visits=visits;this.cases=cases;}
 get catalog(){if(!game.user.isGM)throw new Error('Karta rozluštění patří vypravěči.');return caseRewards(this.cases.definitionFor?.(this.cases.data?.id)??this.cases.data);}
 async read(){
  if(!game.user.isGM)throw new Error('Karta rozluštění patří vypravěči.');
  const state=this.avatars.state;if(!state?.initialized)throw new Error('Nejdřív založ společnou zásobu v MHD.');
  const sealed=this.avatars.document.getFlag('pms','rewardVault');
  const book=sealed?await this.visits.unseal(sealed):createRewardBook(state.id);
  if(book.schemaVersion!==1||book.campaignId!==state.id)throw new Error('Karta odměn nepatří této kampani.');
  return book;
 }
 submit(command){
  const run=async()=>{
   if(!game.user.isGM||!this.avatars.isAuthority)throw new Error('Odměny zapisuje připojený hlavní vypravěč.');
   const book=await this.read(),result=applyRewardCommand(this.avatars.state,book,{...command,requestId:command.requestId??foundry.utils.randomID()},
    {user:{id:game.user.id,isGM:true},catalog:this.catalog,visit:this.visits.privateState});
   if(!result.duplicate){
    const sealed=await this.visits.seal(result.book);
    // One server write: a failure cannot credit energy without its durable private marker.
    await this.avatars.persist(result.campaign,{rewardVault:sealed});
   }
   this.avatars.notify();return result.receipt;
  };
  const job=this.avatars.queue.then(run);this.avatars.queue=job.catch(()=>{});return job;
 }
}
