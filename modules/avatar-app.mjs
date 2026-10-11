import {wizardMarkup,partyMarkup,screenBarMarkup,preparationBlocker,preparationSetup} from './avatar-view.mjs';
import {draftBudget} from './avatar-state.mjs';
import {avatarIntermission,IntermissionFocus} from './avatar-intermission.mjs';
import {captureFocus,restoreFocus} from './ui-focus.mjs';
const editable=['name','role','origin','motivation','biography','portrait','contactId','relationshipId','kitId','vitals','skills'];
const build=d=>Object.fromEntries(editable.map(k=>[k,structuredClone(d[k])]));
export class AvatarCreationApplication extends foundry.applications.api.ApplicationV2 {
 static DEFAULT_OPTIONS={id:'pms-avatar-creation',classes:['pms-app','pms-avatar-creation'],window:{frame:false,positioned:false,minimizable:false,resizable:false,controls:[]}};
 constructor(service){super();this.service=service;this.view={ownerId:game.user.id,previewId:game.user.id,step:0,local:null,busy:false,error:'',message:''};this.preparationId=null;this.revision=0;this.dirty=false;this.focusGuard=new IntermissionFocus(()=>{if(!this.intermission.locked)this.close();});this.unsubscribe=service.onChange(()=>this.changed());}
 get visitState(){return (game.pms?.visits??this.service.visits)?.state;}
 get intermission(){return avatarIntermission(this.service.state,this.visitState,game.user);}
 sync(){const p=this.service.state?.preparation;if(p?.id!==this.preparationId){this.preparationId=p?.id??null;this.dirty=false;this.view.local=null;this.view.step=0;this.view.message='';this.view.error='';this.view.cancelConfirm=false;this.view.previewId=p?.drafts[game.user.id]?game.user.id:p?.ownerIds[0];}
  const d=p?.drafts[game.user.id];if(d&&!this.dirty&&!this.flushing){this.view.local=build(d);this.revision=d.revision;}this.view.authority=game.user.isGM?this.service.isAuthority:!!this.service.authority;this.view.authorityMessage=game.user.isGM&&!this.service.isAuthority?(game.pmsAuthority?.message??'Toto okno je pouze pro čtení. Přípravu řídí hlavní okno vypravěče.'):'';this.view.activeVisit=this.visitState?.status==='active';this.view.launchPending=this.view.activeVisit&&this.visitState.preparationId===p?.id&&!this.visitState.launchReady;this.view.cases=game.pms?.cases.availableCases??[];this.view.caseId=game.pms?.cases.data?.id;if(game.user.isGM)this.view.setup=preparationSetup(this.service.state,this.view.setup,game.users?.contents??[],this.view.cases,this.view.caseId);this.view.locked=this.intermission.locked;this.view.intermissionPending=this.intermission.pending;}
 changed(){this.sync();const phase=this.intermission;
  if(this.releasing)return;
  if(this.wasIntermission&&!phase.engaged){if(this.rendered)this.close({animate:false});this.wasIntermission=false;return;}
  if(phase.engaged&&!this.rendered){if(!this.opening&&this.dismissedPreparation!==this.preparationId){this.opening=this.openIntermission().catch(e=>ui.notifications.error(e.message)).finally(()=>{this.opening=null;});}return;}
  if(!this.rendered)return;if(this.flushing||this.element?.contains(document.activeElement)&&document.activeElement.matches('input[name]'))this.patchParty();else this.render({force:true});}
 async openIntermission(){
  let renderedPreparation=this.preparationId;
  while(true){
   await this.render({force:true});
   // Projections may arrive while the fullscreen render is pending. Decide
   // again from current state even if _onRender cleared wasIntermission.
   if(!this.intermission.engaged||this.dismissedPreparation===this.preparationId){this.wasIntermission=false;if(this.rendered)await this.close({animate:false});return;}
   const current=this.service.state?.preparation?.id;if(current===renderedPreparation)return;renderedPreparation=current;
  }
 }
 patchParty(){if(!this.rendered)return;const focus=captureFocus(this.element),state=this.service.state;this.element.querySelector('.mhd-party-slot')?.replaceChildren(...this.nodes(partyMarkup(game.user.isGM&&!this.intermission.engaged?{...state,preparation:null}:state,this.view,game.users.contents)));
  this.element.querySelector('.mhd-screen-bar')?.replaceChildren(...this.nodes(screenBarMarkup(state,this.view,game.user.isGM)));
  const d=state?.preparation?.drafts[this.view.ownerId];if(d&&this.view.previewId===this.view.ownerId){const b=draftBudget({...d,...this.view.local});const cost=this.element.querySelector('[data-own-cost]'),top=this.element.querySelector('[data-own-topup]');if(cost)cost.textContent=b.cost;if(top)top.textContent=d.status==='confirmed'?d.paidValueH:b.topUp;}
  this.bindParty();this.feedback();restoreFocus(this.element,focus);}
 nodes(markup){const div=document.createElement('div');div.innerHTML=markup;return [...div.childNodes];}
 async _renderHTML(){this.sync();const div=document.createElement('div');div.innerHTML=wizardMarkup(this.service.state,this.view,game.users.contents,game.user.isGM);return div.firstElementChild;}
 _replaceHTML(result,content){this.focusSnapshot=captureFocus(this.element);content.replaceChildren(result);}
 _onRender(){this.wasIntermission=this.intermission.engaged;this.element.setAttribute('role','dialog');this.element.setAttribute('aria-modal','true');this.element.setAttribute('aria-label','MHD · tvorba Avatarů');this.element.tabIndex=-1;this.element.dataset.keyboardFocus='true';restoreFocus(this.element,this.focusSnapshot);this.focusSnapshot=null;this.focusGuard.enable(this.element);
  this.element.querySelector('.mhd-screen').addEventListener('click',e=>{const button=e.target.closest('[data-command]');if(button&&!button.disabled&&!button.closest('.mhd-party-slot'))this.run(()=>this.action(button.dataset.command,button.dataset.value));});this.bindParty();
  const selector=this.element.querySelector('[name=caseId]');selector?.addEventListener('change',()=>this.run(()=>this.action('selectCase',selector.value)));
  this.element.querySelector('[name=mode]')?.addEventListener('change',event=>{this.view.setup.mode=event.target.value;});
  this.element.querySelectorAll('[name=participant]').forEach(input=>input.addEventListener('change',()=>{const ids=new Set(this.view.setup.ownerIds);input.checked?ids.add(input.value):ids.delete(input.value);this.view.setup.ownerIds=[...ids];}));
  const shell=this.element.querySelector('.mhd-shell');
  shell.querySelectorAll('input[name]').forEach(input=>input.addEventListener('input',()=>{if(!this.view.local||!editable.includes(input.name)||game.user.isGM)return;this.view.local[input.name]=input.value;this.edit(false);}));}
 bindParty(){this.element.querySelectorAll('.mhd-party [data-command]').forEach(button=>button.addEventListener('click',()=>this.run(()=>this.action(button.dataset.command,button.dataset.value))));}
 feedback(){const el=this.element?.querySelector('.mhd-feedback'),blocked=preparationBlocker(this.service.state,this.view,game.users.contents,game.user.isGM);if(el){el.textContent=this.view.error||(game.user.isGM&&!this.view.authority?blocked:this.view.message||(this.dirty||this.flushing?'Ukládání sestavy…':blocked||'Sestava sdílena s partou.'));el.dataset.blocked=String(!!blocked);}}
 edit(render=true){this.dirty=true;this.view.error='';this.view.message='';clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.run(()=>this.flush()),350);if(render)this.render({force:true});else this.patchParty();}
 flush(){clearTimeout(this.saveTimer);if(this.flushing)return this.flushing;
  const job=async()=>{while(this.dirty){const p=this.service.state?.preparation,d=p?.drafts[game.user.id];if(!d||d.status!=='editing'||p.id!==this.preparationId)throw new Error('Tato sestava už není otevřená.');
    const snapshot=structuredClone(this.view.local);this.dirty=false;try{await this.service.submit({type:'draft',preparationId:p.id,expectedRevision:this.revision,draft:snapshot});this.revision=this.service.state.preparation.drafts[game.user.id].revision;}catch(e){this.dirty=true;this.view.error=e.message;this.revision=this.service.state?.preparation?.drafts[game.user.id]?.revision??this.revision;throw e;}}
  };
  this.flushing=job().finally(()=>{this.flushing=null;this.sync();if(this.rendered&&!this.releasing){this.patchParty();if(this.view.previewId!==game.user.id)this.render({force:true});}});return this.flushing;}
 async run(fn){try{await fn();}catch(e){this.view.error=e.message;ui.notifications.warn(e.message);this.feedback();}}
 async action(command,value){
  if(game.user.isGM&&['prepare','launch','unconfirm','cancelPreparation','confirmCancelPreparation'].includes(command)&&!this.service.isAuthority)throw new Error(this.view.authorityMessage||'Přípravu řídí hlavní okno vypravěče.');
  if(command==='cancelPreparation'){if(!game.user.isGM)return;this.cancelingPreparationId=this.preparationId;this.view.cancelConfirm=true;return this.render({force:true});}
  if(command==='keepPreparation'){this.view.cancelConfirm=false;return this.render({force:true});}
  if(command==='confirmCancelPreparation'){
   if(!game.user.isGM||!this.view.cancelConfirm)return;
   if(this.cancelingPreparationId!==this.service.state?.preparation?.id)throw new Error('Příprava se mezitím změnila. Zkontroluj nynější výpravu.');
   this.view.busy=true;this.render({force:true});
   try{await this.service.cancelPreparation();this.view.cancelConfirm=false;}
   finally{this.view.busy=false;if(this.rendered)this.render({force:true});}return;
  }
  if(command==='dismiss')return this.close();
  if(command==='preview'){this.view.previewId=value;this.view.error='';return this.render({force:true});}
  if(command==='sheet'){if(this.intermission.locked)return;await this.close();return game.user.character?.sheet.render({force:true});}
  if(command==='mine'){this.view.previewId=game.user.id;return this.render({force:true});}
  if(command==='selectCase'){await game.pms.cases.select(value);return this.render({force:true});}
  if(command==='prepare'){const ownerIds=[...this.element.querySelectorAll('input[name=participant]:checked')].map(e=>e.value),mode=this.element.querySelector('[name=mode]').value;
   const caseId=this.element.querySelector('[name=caseId]')?.value??game.pms.cases.data?.id;if(!caseId)throw new Error('Nejdřív importuj případ.');if(!ownerIds.length)throw new Error('Vyber alespoň jednoho hráče.');if(mode==='reflection'&&ownerIds.some(id=>!this.service.state?.savedAvatars[`${caseId}:${id}`]))throw new Error('Každý účastník odrazu potřebuje uloženého Avatara z tohoto případu.');
   this.view.busy=true;try{if(!this.service.state?.initialized)await this.service.initializePool(ownerIds);await this.service.openPreparation({caseId,mode,ownerIds});}finally{this.view.busy=false;this.render({force:true});}return;
  }
  if(command==='launch'){this.view.busy=true;this.render({force:true});try{await game.pms.cases.launchPrepared();}finally{this.view.busy=false;if(this.intermission.engaged)this.render({force:true});}return;}
  if(command==='step'||command==='next'||command==='back'){this.view.step=command==='step'?Number(value):Math.max(0,Math.min(5,this.view.step+(command==='next'?1:-1)));return this.render({force:true});}
  if(command==='unconfirm'){const ownerId=game.user.isGM?this.view.previewId:game.user.id,d=this.service.state?.preparation?.drafts[ownerId];if(!d||d.status!=='confirmed')return;
   this.view.busy=true;this.render({force:true});
   try{await this.service.submit({type:'unconfirm',preparationId:this.preparationId,expectedRevision:d.revision,...(game.user.isGM?{ownerId}:{})});this.dirty=false;this.view.local=null;this.view.step=0;this.view.message=game.user.isGM?'Sestava je vrácená hráči do úprav.':'Sestava je znovu otevřená, energie se vrátila do zásoby.';}
   finally{this.view.busy=false;this.render({force:true});}return;}
  const d=this.service.state?.preparation?.drafts[game.user.id];if(!d||d.status!=='editing'||game.user.isGM||this.view.previewId!==game.user.id)return;
  if(command==='confirm'){this.view.busy=true;this.render({force:true});try{await this.flush();await this.service.submit({type:'confirm',preparationId:this.preparationId,expectedRevision:this.revision});this.view.message='Avatar potvrzen. Čekáme na společný odjezd.';}finally{this.view.busy=false;this.render({force:true});}return;}
  const local=this.view.local;if(command==='skill'||command==='vital'){const[k,n]=value.split(':');local[command==='skill'?'skills':'vitals'][k]=Number(n);}
  else if(command==='kit')local.kitId=value;
  else if(this.service.state.preparation.mode!=='reflection'){if(command==='portrait')local.portrait=value;if(command==='contact'){local.contactId=value;local.relationshipId='';}if(command==='relationship')local.relationshipId=value;}
  this.edit();
 }
 async close(options={}){if(this.intermission.locked)return this;if(this.releasing)return this.releasing;
  if(game.user.isGM&&this.intermission.engaged)this.dismissedPreparation=this.preparationId;
  this.releasing=(async()=>{try{await this.flush();}catch{}return super.close({...options,animate:false});})();
  try{return await this.releasing;}finally{this.releasing=null;}}
 _onClose(){this.focusGuard.disable();this.wasIntermission=false;}
}
