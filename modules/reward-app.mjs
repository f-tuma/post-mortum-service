import {rewardMarkup} from './reward-view.mjs';
import {rewardKey} from './reward-state.mjs';
import {firstSheetPosition} from './sheet-ui.mjs';
import {escape as esc} from './view-utils.mjs';
export class RewardApplication extends foundry.applications.api.ApplicationV2 {
 static DEFAULT_OPTIONS={id:'pms-rewards',classes:['pms-reward-app'],window:{title:'Rozluštění a energie',resizable:true},position:{width:1120,height:850}};
 constructor(service,controls){super();this.service=service;this.controls=controls;this.view={tab:'rewards',filter:'all',selected:null,note:'',message:''};this.busy=false;
  service.avatars.onChange(()=>{if(this.rendered&&!this.busy)this.render({force:true});});
  service.visits.onChange(()=>{if(this.rendered&&!this.busy)this.render({force:true});});
 }
 async _renderHTML(){
  if(!game.user.isGM)throw new Error('Karta rozluštění patří vypravěči.');
  const div=document.createElement('div');
  try{this.book=await this.service.read();this.catalog=this.service.catalog;if(!this.catalog.rewards.some(r=>r.id===this.view.selected)){this.view.selected=this.catalog.rewards[0]?.id??null;this.view.note='';}
   div.innerHTML=rewardMarkup(this.catalog,this.book,this.service.avatars.state,this.service.visits.privateState,{...this.view,busy:this.busy,authority:this.service.avatars.isAuthority});
  }catch(e){div.innerHTML=`<div class="pms-rewards pms-reward-unavailable"><h1>Karta rozluštění</h1><p>${esc(e.message)}</p></div>`;}
  return div.firstElementChild;
 }
 _replaceHTML(result,content){
  this.listTop=content.querySelector('.pms-reward-list')?.scrollTop??0;
  this.detailTop=this.resetDetail?0:content.querySelector('.pms-reward-detail')?.scrollTop??0;this.resetDetail=false;
  const field=content.querySelector('[name="rewardNote"]');
  this.noteFocus=field===document.activeElement?{start:field.selectionStart,end:field.selectionEnd}:null;
  content.replaceChildren(result);
 }
 async _onFirstRender(){this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));}
 _onRender(){
  const list=this.element.querySelector('.pms-reward-list'),detail=this.element.querySelector('.pms-reward-detail');
  if(list){list.scrollTop=this.listTop??0;list.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest'});}
  if(detail)detail.scrollTop=this.detailTop??0;
  const field=this.element.querySelector('[name="rewardNote"]');if(field&&this.noteFocus){field.focus({preventScroll:true});field.setSelectionRange(this.noteFocus.start,this.noteFocus.end);}
  this.element.querySelectorAll('[data-reward-select]').forEach(el=>el.addEventListener('click',()=>{this.view.selected=el.dataset.rewardSelect;this.view.note='';this.view.message='';this.resetDetail=true;this.render({force:true});}));
  this.element.querySelectorAll('[data-reward-tab]').forEach(el=>el.addEventListener('click',()=>{this.view.tab=el.dataset.rewardTab;this.render({force:true});}));
  this.element.querySelectorAll('[data-reward-filter]').forEach(el=>el.addEventListener('click',()=>{this.view.filter=el.dataset.rewardFilter;const rows=this.catalog.rewards.filter(r=>this.view.filter==='all'||(this.view.filter==='done')===!!this.book.awards[rewardKey(this.catalog.caseId,r.id)]?.active);if(rows.length&&!rows.some(r=>r.id===this.view.selected)){this.view.selected=rows[0].id;this.view.note='';}this.render({force:true});}));
  this.element.querySelector('[name="rewardNote"]')?.addEventListener('input',e=>{this.view.note=e.target.value;});
  this.element.querySelectorAll('[data-reward-action]').forEach(el=>el.addEventListener('click',()=>this.run(el.dataset.rewardAction)));
 }
 async run(action){
  if(this.busy)return;this.busy=true;
  const revision=this.book.revision,selected=this.view.selected;
  this.element.querySelectorAll('[data-reward-action]').forEach(button=>button.disabled=true);
  try{
   let command,result;
   const persist=async command=>{result=await this.service.submit({...command,expectedRevision:revision});};
   if(action==='award')command={type:'award',rewardId:selected,note:this.view.note};
   else if(action==='convert'){
    const visit=this.service.visits.privateState,carrier=(visit?.avatars??[]).filter(a=>a.alive);
    const f=await this.controls.promptForm('Předání úlomku v hubu',`<p>Potvrď skutečný převoz schránky a dokončené zpracování. Poznání R08 se odměňuje samostatně.</p><label>Živý nosič při návratu<select name="carrier">${carrier.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label><label class="pms-checkbox"><input type="checkbox" name="delivered" required>Bezpečně uzavřenou schránku tento Avatar skutečně přivezl MHD.</label><label class="pms-checkbox"><input type="checkbox" name="processed" required>Úlomek byl předán zařízení PMS a zpracování dokončeno.</label><label>Poznámka<textarea name="note" required maxlength="2000" rows="3"></textarea></label>`,{label:`Připsat ${this.catalog.shard.amount} energie`,submit:f=>persist({type:'convert',rewardId:this.catalog.shard.id,carrierId:f.get('carrier'),delivered:f.has('delivered'),processed:f.has('processed'),note:f.get('note')})});
    if(!f)return;
   }else{
    const rewardId=action==='correct-shard'?this.catalog.shard.id:selected,a=this.book.awards[rewardKey(this.catalog.caseId,rewardId)],energy=this.service.avatars.state.energy;
    const enough=energy>=a.amount;
    const f=await this.controls.promptForm('Oprava odměny',`<p><strong>${esc(a.title)}</strong> · připsáno ${a.amount} energie.</p><p>${enough?'Odebrání vrátí položku mezi nesplněné a sníží zásobu. Historie zůstane.':'Na odebrání nyní chybí energie. Zaznamenej omyl a nejdřív oprav navazující nákup nebo odpovídající zálohu; nevznikne herní dluh.'}</p><label>Postup<select name="type">${enough?'<option value="revoke">Odebrat omylem připsanou odměnu</option>':''}<option value="dispute">Zaznamenat omyl bez změny energie</option></select></label><label>Důvod opravy<textarea name="note" required maxlength="2000" rows="3"></textarea></label>`,{label:'Zapsat opravu',submit:f=>persist({type:f.get('type'),rewardId,note:f.get('note')})});
    if(!f)return;
   }
   if(command)await persist(command);this.view.note='';this.view.message=result.amount?`${result.amount>0?'+':''}${result.amount} energie · uloženo.`:'Omyl zaznamenán. Energie zůstává beze změny.';
  }catch(e){this.view.message=e.message;}
  finally{this.busy=false;if(this.rendered)this.render({force:true});}
 }
}
