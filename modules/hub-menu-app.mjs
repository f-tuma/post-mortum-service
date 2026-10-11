import {catalogMarkup,sectorArchiveMarkup,archiveCases} from './hub-menu-view.mjs';
import {firstSheetPosition} from './sheet-ui.mjs';
import {searchable} from './archive-view.mjs';
import {captureFocus,restoreFocus} from './ui-focus.mjs';
class HubMenuApplication extends foundry.applications.api.ApplicationV2{
 static DEFAULT_OPTIONS={classes:['pms-app','pms-hub-menu'],position:{width:1280,height:890},window:{resizable:true,minimizable:true}};
 constructor(service){super();this.service=service;this.view={tab:'new',search:'',error:'',ownerIds:[],caseIds:[]};service.onChange(()=>{if(this.rendered&&!this.busy)this.render({force:true});});}
 async _onFirstRender(context,options){await super._onFirstRender(context,options);this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));this.element.tabIndex=-1;this.element.focus({preventScroll:true});}
 _replaceHTML(result,content){this.focusSnapshot=captureFocus(this.element);content.replaceChildren(result);}
 _onRender(){const root=this.element;root.dataset.keyboardFocus='true';
  if(!root.dataset.hubMenuKeys){root.dataset.hubMenuKeys='true';root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.close();}});root.addEventListener('keyup',e=>e.stopPropagation());}
  const body=root.querySelector('.hub-menu');
  body.addEventListener('click',e=>{const button=e.target.closest('[data-command]');if(button&&!button.disabled)this.run(()=>this.action(button.dataset.command,button.dataset.value));});
  body.querySelector('input[type=search]').addEventListener('input',e=>{this.view.search=e.target.value;this.filter();});
  body.querySelectorAll('[data-owner],[data-offer]').forEach(input=>input.addEventListener('change',()=>{const key=input.dataset.owner?'ownerIds':'caseIds',id=input.dataset.owner??input.dataset.offer;this.view[key]=input.checked?[...new Set([...this.view[key],id])]:this.view[key].filter(v=>v!==id);}));this.filter();restoreFocus(root,this.focusSnapshot);this.focusSnapshot=null;
 }
 filter(){const items=[...this.element.querySelectorAll('[data-search]')],query=searchable(this.view.search);for(const item of items)item.hidden=!!query&&!searchable(item.dataset.search).includes(query);
  const empty=this.element.querySelector('.hub-search-empty');if(empty){if(query)empty.textContent='Žádný záznam neodpovídá hledání.';empty.hidden=items.some(i=>!i.hidden)||(!query&&items.length>0);}
 }
 async run(fn){if(this.busy)return;this.busy=true;this.view.error='';try{await fn();}catch(error){this.view.error=error.message;ui.notifications.warn(error.message);}finally{this.busy=false;if(this.rendered)this.render({force:true});}}
 async action(command,value){if(command==='close')return this.close();if(command==='tab'){this.view.tab=value;this.view.search='';return;}
  if(command==='brief'){const offer=this.service.offers.find(o=>o.id===value);return offer?.document.sheet.render({force:true});}
 }
 async _renderHTML(){const div=document.createElement('div');div.innerHTML=this.markup();return div.firstElementChild;}
}
export class CaseCatalogApplication extends HubMenuApplication{
 static DEFAULT_OPTIONS={id:'pms-case-catalog',window:{title:'Recepce · pověření'}};
 constructor(service){super(service);this.view.ownerIds=[...service.avatars.eligibleOwnerIds];this.view.caseIds=service.newOffers.map(o=>o.caseId);}
 markup(){this.view.activeVisit=game.pms.visits.state?.status==='active';this.view.preparing=game.pms.avatars.state?.preparation?.status==='preparing';return catalogMarkup(this.service,this.view,game.users.contents,game.user);}
 async action(command,value){
  if(command==='installStarterCase'){
   if(!game.user.isGM)throw new Error('Úvodní případ připravuje vypravěč.');
   this.view.installingStarter=true;await this.render({force:true});
   try{await game.pms.starterCase.installFromMenu();this.view.tab='new';this.view.search='';}
   finally{this.view.installingStarter=false;}return;
  }
  if(['trash','restore','remove'].includes(command))return game.pms.caseLifecycle?.dialog(command,value);
  if(command==='updateCase')return game.pms.cases.updateDialog(value);
  if(command==='editCase'){await game.pms.caseEditor.open(value);return this.close();}
  if(command==='tab'&&['manage','trash'].includes(value)&&!game.user.isGM)throw new Error('Správa případů patří vypravěči.');
  if(command==='vote')return this.service.vote(value);if(command==='withdraw')return this.service.vote(null);
  if(command==='openVote')return this.service.openBallot(this.view.ownerIds,this.view.caseIds);
  if(command==='confirm')return this.service.confirm(value);if(command==='cancel')return this.service.cancel();
  if(command==='import')return game.pms.cases.importDialog();
  if(command==='gmPreparation'){await game.pms.cases.showPreparation({caseId:value});return this.close();}
  if(command==='prepare'){await this.service.prepare(value);return this.close();}
  return super.action(command,value);
 }
}
export class SectorArchiveApplication extends HubMenuApplication{
 static DEFAULT_OPTIONS={id:'pms-sector-archive',window:{title:'Archiv služby'}};
 constructor(service){super(service);this.view.tab='sector';game.pms?.service.onChange(()=>{if(this.rendered&&!this.busy)this.render({force:true});});}
 get cases(){return archiveCases(this.service.offers,game.pms.service.allEvidence,game.pms.service.archiveBoards);}
 markup(){return sectorArchiveMarkup(this.service,this.view,game.pms.service.allEvidence,game.user,game.pms.service.archiveBoards);}
 async action(command,value){
  if(command==='tab'){this.view.caseId=null;return super.action(command,value);}
  if(command==='case'){if(this.cases.some(c=>c.caseId===value)){this.view.caseId=value;this.view.tab='cases';this.view.search='';}return;}
  if(command==='caseBack'){this.view.caseId=null;this.view.search='';return;}
  if(command==='chapter')return this.service.guide?.sheet.render({force:true,pageId:value});
  if(command==='source'){const evidence=game.pms.service.allEvidence.find(e=>e.itemId===value&&e.sourceCase===this.view.caseId),item=evidence&&game.items.get(value);if(item?.testUserPermission(game.user,'OBSERVER'))return item.sheet.render({force:true});return;}
  if(command==='board'){if(value!==this.view.caseId||!this.cases.some(c=>c.caseId===value&&c.hasBoard))return;await game.pms.openBoard({caseId:value,archive:true});return this.close();}
  if(command==='catalog'){await this.close();return game.pms.caseCatalog.render({force:true});}
  return super.action(command,value);
 }
}
