import {validateCase} from './case-state.mjs';
import {caseRemoved} from './case-lifecycle.mjs';

export const STARTER_CASE='tetove';
export const STARTER_CASE_PATH='systems/pms/cases/tetove.json';

/** Install once in a new world; the world marker outlives case deletion. */
export class StarterCaseService {
 constructor(cases,{previouslyInitialized=false,fetch=globalThis.fetch}={}){Object.assign(this,{cases,previouslyInitialized,fetch});}
 get state(){return game.settings.get('pms','starterCase');}
 get entry(){
  const installed=game.journal.some(d=>d.getFlag('pms','kind')==='caseVault'&&d.getFlag('pms','caseId')===STARTER_CASE);
  return {caseId:STARTER_CASE,title:'Zkáza rodu Tétů',cover:'systems/pms/assets/hub/tetove-cover-v1.png',status:caseRemoved(STARTER_CASE)?'trashed':this.state==='installing'?'incomplete':installed?'installed':'available',busy:!!this.installing};
 }
 async dismiss(caseId=STARTER_CASE){if(caseId===STARTER_CASE&&this.cases.visits.isAuthority&&this.state!=='done')await game.settings.set('pms','starterCase','done');}
 ensure(){return this.start(false);}
 installFromMenu(){this.cases.gm();return this.start(true);}
 start(manual){
  if(this.installing)return this.installing;
  this.installing=this.prepare({manual}).finally(()=>{this.installing=null;game.pms?.catalog?.notify();});return this.installing;
 }
 async prepare({manual=false}={}){
  if(!this.cases.visits.isAuthority||!manual&&this.state==='done')return false;
  const existing=game.journal.some(d=>d.getFlag('pms','kind')==='caseVault');
  const starterExists=game.journal.some(d=>d.getFlag('pms','kind')==='caseVault'&&d.getFlag('pms','caseId')===STARTER_CASE);
  if(caseRemoved(STARTER_CASE)){if(manual)throw new Error('Tétové jsou v koši. Obnov je ve Správě případů → Koš.');await this.dismiss();return false;}
  if(manual&&starterExists&&this.state!=='installing')return false;
  if(!manual&&this.state!=='installing'&&(this.previouslyInitialized||existing)){await this.dismiss();return false;}
  if(this.cases.visits.state?.status==='active'||this.cases.visits.privateState?.status==='active'||game.pms?.avatars.state?.preparation?.status==='preparing'){
   if(manual)throw new Error('Připrav úvod mezi výpravami a mimo tvorbu Avatarů.');return false;
  }
  // A partial first install resumes its saved definition rather than silently
  // replacing it with a newer system package after a reconnect.
  let data=this.state==='installing'?this.cases.forCase(STARTER_CASE):null;
  this.cases.gm();await game.settings.set('pms','starterCase','installing');
  if(!data){
   const response=await this.fetch(STARTER_CASE_PATH);
   if(!response.ok)throw new Error('Úvodní Tétovy se nepodařilo načíst z instalace PMS. Obnov připojení nebo zkontroluj aktualizaci systému.');
   data=validateCase(await response.json());
   if(data.id!==STARTER_CASE)throw new Error('Vestavěný úvod neobsahuje případ Tétů.');
  }
  this.cases.gm();
  await this.cases.install(data,{onlyIfMissing:!starterExists});
  await this.dismiss();return true;
 }
}
