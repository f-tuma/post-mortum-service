import {unsealVisit,sealVisit} from './visit-vault.mjs';

/** One writable GM tab in the authenticated GM profile. The browser releases the
 * lock on a crash/reload; another tab can take over without competing queues. */
export class GMClientAuthority {
  constructor({locks,name,verify,onChange=()=>{}}){Object.assign(this,{locks,name,verify,onChange});this.canWrite=false;this.message='Ověřuji relaci vypravěče.';this.abort=new AbortController();this.stopped=false;}
  async start(){
    if(!this.locks?.request){this.message='Tento prohlížeč nepodporuje ochranu souběžného zápisu. PMS zde zůstává pouze pro čtení.';this.onChange(this);return this;}
    let resolveInitial;const initial=new Promise(resolve=>{resolveInitial=resolve;});
    const hold=async lock=>{
      if(!lock){this.message='PMS řídí jiné otevřené okno vypravěče. Toto okno je pouze pro čtení; po jeho zavření převezme řízení.';this.onChange(this);resolveInitial();return;}
      try{await this.verify();if(this.stopped){resolveInitial();return;}
        this.canWrite=true;this.message='Toto okno řídí PMS.';this.onChange(this);resolveInitial();
        await new Promise(resolve=>{this.release=resolve;});
      }catch(error){this.message=error.message||'Soukromou přípravu nelze ověřit. PMS zůstává pouze pro čtení.';this.failed=true;this.onChange(this);resolveInitial();}
      finally{this.canWrite=false;this.release=null;this.onChange(this);}
    };
    this.lockTask=this.locks.request(this.name,{ifAvailable:true},hold).catch(error=>{this.failed=true;this.message=error.message;this.onChange(this);resolveInitial();});
    await initial;
    if(!this.canWrite&&!this.failed&&!this.stopped)this.waitTask=this.locks.request(this.name,{signal:this.abort.signal},hold).catch(error=>{if(error.name!=='AbortError'){this.message=error.message;this.onChange(this);}});
    return this;
  }
  stop(){this.stopped=true;this.abort.abort();this.release?.();this.canWrite=false;}
}

export const clientCanWrite=()=>globalThis.game?.pmsAuthority?.canWrite!==false;
export function electedPMSAuthority(users,journal=[]){
  const active=users.filter(u=>u.active&&u.isGM),proof=journal.find(d=>d.getFlag('pms','kind')==='authorityProof');
  if(proof)return active.find(u=>u.id===proof.getFlag('pms','authorityUserId'))??null;
  return active.sort((a,b)=>a.id.localeCompare(b.id))[0]??null;
}

export async function verifyAuthorityProfile({journal,settings,userId,worldId,createJournal}){
    const protectedDocument=journal.find(d=>d.getFlag('pms','kind')==='authorityProof')??journal.find(d=>d.getFlag('pms','sealed')||d.getFlag('pms','caseMemory')||d.getFlag('pms','rewardVault'));
    let key=settings.get('pms','visitKey');
    if(protectedDocument){
      const sealed=protectedDocument.getFlag('pms','sealed')??protectedDocument.getFlag('pms','caseMemory')??protectedDocument.getFlag('pms','rewardVault');
      try{await unsealVisit(sealed,key);}catch{throw new Error('Tento profil nemá klíč uložené přípravy PMS. Použij původní profil vypravěče; toto okno je pouze pro čtení.');}
    }
    if(!key){key=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');await settings.set('pms','visitKey',key);}
    const proof=journal.find(d=>d.getFlag('pms','kind')==='authorityProof');
    if(proof)await proof.update({'flags.pms.authorityUserId':userId});
    else await createJournal({name:'PMS · ověření profilu vypravěče',ownership:{default:0},flags:{pms:{kind:'authorityProof',authorityUserId:userId,sealed:await sealVisit({kind:'pmsAuthority',worldId},key)}}});
}
export async function initializeGMClientAuthority(){
  if(!game.user.isGM)return;
  const verify=()=>verifyAuthorityProfile({journal:game.journal,settings:game.settings,userId:game.user.id,worldId:game.world.id,createJournal:data=>JournalEntry.create(data)});
  let warning;
  game.pmsAuthority=new GMClientAuthority({locks:globalThis.navigator?.locks,name:`pms-authority:${game.world.id}`,verify,onChange:state=>{if(state.canWrite&&warning){warning.remove();warning=null;ui.notifications.info('Toto okno převzalo řízení PMS.');}Hooks.callAll('pmsAuthorityChanged',state);}});
  await game.pmsAuthority.start();
  if(!game.pmsAuthority.canWrite)warning=ui.notifications.warn(game.pmsAuthority.message,{permanent:true});
  window.addEventListener('pagehide',()=>game.pmsAuthority.stop(),{once:true});
}
