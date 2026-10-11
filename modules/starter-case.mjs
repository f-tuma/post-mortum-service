import {validateCase} from './case-state.mjs';
import {caseRemoved} from './case-lifecycle.mjs';

export const STARTER_CASE='tetove';
export const STARTER_CASE_PATH='systems/pms/cases/tetove.json';

/** Install once in a new world; the world marker outlives case deletion. */
export class StarterCaseService {
 constructor(cases,{previouslyInitialized=false,fetch=globalThis.fetch}={}){Object.assign(this,{cases,previouslyInitialized,fetch});}
 get state(){return game.settings.get('pms','starterCase');}
 async dismiss(caseId=STARTER_CASE){if(caseId===STARTER_CASE&&this.cases.visits.isAuthority&&this.state!=='done')await game.settings.set('pms','starterCase','done');}
 ensure(){
  if(this.installing)return this.installing;
  this.installing=this.prepare().finally(()=>{this.installing=null;});return this.installing;
 }
 async prepare(){
  if(!this.cases.visits.isAuthority||this.state==='done')return false;
  const existing=game.journal.some(d=>d.getFlag('pms','kind')==='caseVault');
  const starterExists=game.journal.some(d=>d.getFlag('pms','kind')==='caseVault'&&d.getFlag('pms','caseId')===STARTER_CASE);
  if(caseRemoved(STARTER_CASE)||this.state!=='installing'&&(this.previouslyInitialized||existing)){await this.dismiss();return false;}
  if(this.cases.visits.state?.status==='active'||game.pms?.avatars.state?.preparation?.status==='preparing')return false;
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
