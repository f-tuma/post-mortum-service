import {validateCase,withUpdatedGuide} from './case-state.mjs';
import {planWalls,planStairs} from './map-plans.mjs';
import {caseEntry} from './case-definition.mjs';
import {applySceneArt,sceneArtSettings,sceneLevelData} from './scene-art.mjs';
import {emptyBoard} from './board-state.mjs';
import {escape as esc} from './board-view.mjs';
import {time} from './visit-app.mjs';
import {buildCaseGuide} from './case-guide.mjs';
import {firstSheetPosition} from './sheet-ui.mjs';
import {cluePickerMarkup,bindCluePicker} from './clue-picker.mjs';
import {realResultPages} from './case-result-view.mjs';
import {availablePreparationRoster} from './avatar-state.mjs';
import {presentScene} from './scene-transition.mjs';
import {assertSnapshotIdentities,assertNativeCaseSnapshot} from './case-snapshot.mjs';
import {enqueueCaseWrite} from './case-write-queue.mjs';
import {readCaseFile,restorePackageAssets} from './case-package.mjs';
import {nativeCaseAssetStorage,packageProgress} from './case-package-foundry.mjs';
import {versionImportedCase} from './case-content-version.mjs';
import {installCaseNpcPortraits} from './npc-art.mjs';
import {buildPreparationPlan,preparationProgress,setPreparationTask,viewPreparationMap,preparationActor,PREPARATION_PAGES} from './case-preparation.mjs';
import {preparationPages} from './case-preparation-view.mjs';
import {caseRemoved,assertCaseAvailable} from './case-lifecycle.mjs';
import {updateCaseZip} from './case-update.mjs';
const NS='pms';
const marked=(d,key)=>d.getFlag(NS,key);
export class PMSCaseJournal extends foundry.applications.sheets.journal.JournalEntrySheet {
 static DEFAULT_OPTIONS={classes:['pms-case-guide'],position:{width:1280,height:900}};
 constructor(options){
  const caseId=options.document?.getFlag('pms','caseId');
  const data=game.user.isGM&&(options.caseData??(caseId?game.pms?.cases.forCase(caseId):game.pms?.cases.data));
  if(!data){super(options);return;}
  const markdown=new window.showdown.Converter({tables:true});
  const guide=buildCaseGuide(data,value=>markdown.makeHtml(value));
  const pages=[...(options.preparation?preparationPages(data,options.preparation,options.completed):[]),...guide].map(({id,key,...page})=>({...page,text:{...page.text,content:foundry.utils.cleanHTML(page.text.content)}}));
  const first=guide[0]?.flags.pms??{guideCategoryId:'pmsGuideGroup001',guideGroupName:'Začít zde',guideGroupOrder:0};
  const help={_id:'pmsFoundryHelp01',name:'Ovládání ve Foundry',type:'text',sort:1500,category:first.guideCategoryId,ownership:{default:0},title:{show:true,level:1},text:{format:1,content:`<h2>Odjezd a deníky</h2><ul><li><strong>Připravit odjezd v MHD</strong> otevře společnou tvorbu Avatarů. Po potvrzení celé party vypravěč odešle výpravu do výchozí scény případu.</li><li>Hráči otevírají nativní deník postavy. Akci zadáš z deníku nebo časové osy; hráč v deníku připraví vitálky a potvrdí ji.</li></ul><h2>Vodítka a tabule</h2><ul><li><strong>Vodítka případu</strong> nabídnou připravené nálezy. Zveřejni jen skutečně získaná fakta a podle potřeby uprav text.</li><li><strong>Archiv</strong> otevře boční kartotéku se záložkami, hledáním a filtrem případu. Nativní předměty přetáhni na tabuli; poznámky a provázky doplní vaše teorie.</li><li><strong>Celá tabule</strong> ukáže rám pracovní plochy. <strong>Zobrazit vše</strong> přiblíží rozmístěné důkazy. Karta, se kterou hýbeš, je vždy navrchu; dvojklik do plochy přidá poznámku.</li><li><strong>Vlastní nález</strong> vytvoří další společný předmět. Připravená vodítka i výbavu lze otevřít v seznamu Items.</li></ul><h2>Čas a skutečný stav</h2><ul><li>Časová osa řadí události do dějových linií a pod ně akce party. Každá budoucí událost ukazuje, zda při současném stavu světa <strong>nastane</strong>, nebo <strong>nenastane</strong>. Kliknutím zvýrazníš, co ji podmiňuje a co ovlivňuje; v detailu můžeš rovnou přepnout skutečný stav. Tažením karty přesuneš budoucí událost, Ctrl + kolečko mění měřítko a tažením prázdné plochy se posouváš.</li><li><strong>Stav případu</strong> zapisuje provedené zásahy a skutečné polohy. Změna rozkazu sama nepotvrdí jeho doručení. Změna polohy v přehledu neposouvá token.</li><li>Urči svědky a vyřeš reakce pod časovou osou. Kontroly útoku nikoho automaticky nezabíjejí.</li></ul><h2>Rozluštění a energie</h2><ul><li><strong>Poznání</strong> na časové ose nebo <strong>Rozluštění a energie</strong> v přípravě otevře neveřejnou kartu. Vyber položku, zapiš vysvětlení hráčů a potvrď odměnu. Stejné poznání se napříč návštěvami vyplácí jednou.</li><li>Historie uchovává odměny a opravy. Omyl lze odebrat, pokud zásoba pokryje opravu; jinak jej zaznamenej a nejdřív oprav navazující nákup nebo zálohu.</li><li>Přeměna úlomku je samostatná: po skutečném návratu potvrď živého nosiče, převoz uzavřené schránky a dokončené předání zařízení v hubu. Odraz ji nevyplácí.</li></ul><h2>Návrat a odrazy</h2><ul><li>Skutečný průchod skončí vypršením okna nebo smrtí posledního Avatara. <strong>Skutečný výsledek</strong> v nabídce Podklady a příprava otevře soukromý nativní deník; zápis následků doplníš v jeho hlavičce.</li><li>Před odrazem otevři MHD v režimu <strong>Odraz</strong>. Hráči použijí své uložené Avatary a mohou změnit balíček nebo přeskládat již zaplacenou sílu. Všichni znovu potvrdí sestavu.</li><li>Odjezd obnoví začátek světa, NPC, dveře a události i plnou počáteční kondici a výbavu. Archiv, tabule, energie a již přiznaná poznání zůstávají. Nálezy mají uvedený průchod, ze kterého pocházejí.</li><li>Zásahy odrazu se při návratu zahodí; skutečný konec nepřepíšou. Pokud se odjezd přeruší, zopakuj jej. Hráči se uvolní až po dokončení celé přípravy.</li></ul><h2>Scény a podlaží</h2><ul><li>Tokeny, dveře, zdi a podlaží ovládej nativními nástroji Foundry.</li><li>Výchozí scéna a podlaží jsou součástí definice případu. Přesun po schodech může nabídnout změnu podlaží.</li></ul><h2>Najít a aktualizovat přípravu</h2><p>Levý obsah a hledání jsou nativní Foundry. Podnadpisy vedou přímo k potřebné části; odkazy propojují vodítka, místa a události.</p><p>Autorskou přípravu uprav v Editoru případů. Při importu použij Aktualizovat jen příručku pro změnu dokumentace bez zásahu do rozehrané výpravy. Tato příručka je místní, pouze pro vypravěče.</p>`},flags:{pms:{...first,guideKey:'foundry-help'}}};
  pages.splice(options.preparation?pages.length:1,0,help);
  const categories=[...new Map(pages.map(p=>{const f=p.flags.pms;return [f.guideCategoryId,{_id:f.guideCategoryId,name:f.guideGroupName,sort:f.guideGroupOrder*1000}];})).values()];
  // Only a local GM view: Foundry v14 sends world documents regardless of sidebar ownership.
  const journal=new JournalEntry({name:`${data.title} · ${options.preparation?'příprava na sezení':'příručka vypravěče'}`,ownership:{default:0},categories,flags:{core:{locked:true,viewMode:1}},pages});
  super({...options,document:journal});
 }
 async _onFirstRender(context,options){await super._onFirstRender(context,options);this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));}
 _getHeaderControls(){return super._getHeaderControls().filter(c=>!['showPlayers','configCategories','configureOwnership','configureSheet'].includes(c.action));}
 get isEditable(){return false;}
 _preparePageData(){const pages=super._preparePageData();for(const page of Object.values(pages))page.editable=false;return pages;}
 _getEntryContextOptions(){return [];}
 async _prepareContext(options){const c=await super._prepareContext(options);for(const p of Object.values(c.pages??{}))p.editable=false;return c;}
 async _onEditPage(){ui.notifications.info('Autorskou přípravu uprav v editoru případu.');}
 async _onShowPlayers(){ui.notifications.warn('Příprava patří vypravěči. Pro hráče zveřejni konkrétní vodítko.');}
}
export class PMSPreparationJournal extends PMSCaseJournal {
 static DEFAULT_OPTIONS={classes:['pms-case-guide','pms-gm-preparation'],form:{submitOnChange:false}};
 constructor(options){super(options);this.caseData=options.caseData;this.preparation=options.preparation;this.pendingTasks=new Set();this.openingResource=false;}
 guard(){if(!game.user.isGM||game.pmsAuthority?.failed)throw new Error('Příprava patří připojenému vypravěči.');}
 get progressContext(){return {settings:game.settings,user:game.user,worldId:game.world.id,caseId:this.caseData.id,plan:this.preparation};}
 syncProgress(){const completed=preparationProgress(this.progressContext),root=this.element;
  // Journal sheets lock their form fields. Enable only our private checklist and resource actions.
  for(const input of root.querySelectorAll('[data-prep-task]')){input.checked=completed.has(input.dataset.prepTask);input.disabled=this.pendingTasks.has(input.dataset.prepTask);}
  for(const button of root.querySelectorAll('[data-prep-action]'))button.disabled=this.openingResource||(button.dataset.prepAction==='map'&&!this.preparation.maps.some(m=>m.available&&m.planId===button.dataset.planId&&m.levelKey===button.dataset.levelKey));
  const progress=root.querySelector('[data-prep-progress]');if(progress)progress.value=completed.size;
  const count=root.querySelector('[data-prep-count]');if(count)count.textContent=`${completed.size} / ${this.preparation.tasks.length} kroků projito`;
 }
 async _onRender(context,options){this.guard();await super._onRender(context,options);this.syncProgress();const root=this.element;if(root.dataset.preparationBound)return;root.dataset.preparationBound='true';
  root.addEventListener('change',async event=>{const input=event.target.closest('[data-prep-task]');if(!input)return;event.stopPropagation();this.pendingTasks.add(input.dataset.prepTask);input.disabled=true;
   try{await setPreparationTask({...this.progressContext,taskId:input.dataset.prepTask,completed:input.checked,guard:()=>this.guard()});}
   catch(error){ui.notifications.warn(error.message);}finally{this.pendingTasks.delete(input.dataset.prepTask);this.syncProgress();}
  });
  root.addEventListener('click',async event=>{const button=event.target.closest('[data-prep-action]');if(!button||button.disabled||this.openingResource)return;event.preventDefault();event.stopPropagation();this.openingResource=true;this.syncProgress();
   try{this.guard();if(button.dataset.prepAction==='map'){await viewPreparationMap(this.caseData,button.dataset.planId,button.dataset.levelKey,{user:game.user,scenes:game.scenes,canvas:globalThis.canvas});await this.minimize();}
    else if(button.dataset.prepAction==='npc')await preparationActor(this.caseData,button.dataset.npcId,{user:game.user,actors:game.actors}).sheet.render({force:true});
   }catch(error){ui.notifications.warn(error.message);}finally{this.openingResource=false;this.syncProgress();}
  });
 }
}
export class PMSResultJournal extends foundry.applications.sheets.journal.JournalEntrySheet {
 static DEFAULT_OPTIONS={classes:['pms-case-guide'],position:{width:1160,height:820},actions:{writeResult:function(){return this.cases.writeResult(this.caseId).catch(error=>ui.notifications.warn(error.message));}}};
 constructor(options,cases,caseId){super(options);this.cases=cases;this.caseId=caseId;}
 get isEditable(){return false;}
 _getHeaderControls(){return [{action:'writeResult',icon:'fa-solid fa-pen',label:'Zapsat skutečný konec'},...super._getHeaderControls().filter(c=>!['showPlayers','configCategories','configureOwnership','configureSheet'].includes(c.action))];}
 async _onFirstRender(context,options){await super._onFirstRender(context,options);this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));}
 async _prepareContext(options){const c=await super._prepareContext(options);for(const p of Object.values(c.pages??{}))p.editable=false;return c;}
 async _onEditPage(){return this.cases.writeResult(this.caseId).catch(error=>ui.notifications.warn(error.message));}
 async _onShowPlayers(){ui.notifications.warn('Skutečný výsledek patří vypravěči. Zveřejni jen konkrétní nález.');}
}
export class CaseService {
 constructor(visits,controls){this.visits=visits;this.controls=controls;this.definitions=new Map();this.runtimeDefinitions=new Map();this.selectedId=null;this.busy=false;}
 get data(){return this.forCase(this.selectedId);}
 set data(value){if(!value){this.selectedId=null;return;}this.definitions.set(value.id,value);this.selectedId=value.id;}
 get vault(){return game.journal.find(d=>marked(d,'kind')==='caseVault'&&marked(d,'caseId')===this.selectedId);}
 forCase(id){return game.user.isGM&&!caseRemoved(id)?this.definitions.get(id)??null:null;}
 definitionFor(id){const authored=this.forCase(id),runtime=this.runtimeDefinitions.get(id);return authored?{...authored,...(runtime&&!(authored.initialSnapshot&&authored.contentVersion>runtime.contentVersion)?runtime:{})}:null;}
 get availableCases(){return game.user.isGM?[...this.definitions.values()].filter(d=>!caseRemoved(d.id)).map(d=>({id:d.id,title:d.title})):[];}
 async reloadDefinition(id){if(!game.user.isGM)return null;assertCaseAvailable(id);const vault=game.journal.find(d=>marked(d,'kind')==='caseVault'&&marked(d,'caseId')===id);if(!vault)return this.forCase(id);const data=validateCase(await this.visits.unseal(marked(vault,'sealed')));this.definitions.set(id,data);return data;}
 async initialize(){if(!game.user.isGM||game.pmsAuthority?.failed)return;if(!this.lifecycleHook)this.lifecycleHook=Hooks.on('deleteJournalEntry',doc=>{if(marked(doc,'kind')==='caseVault'){const id=marked(doc,'caseId');this.definitions.delete(id);this.runtimeDefinitions.delete(id);if(this.selectedId===id)this.selectedId=null;}});if(!this.authorityHook){this.authorityHook=Hooks.on('pmsAuthorityChanged',()=>{if(this.visits.isAuthority)this.initialize().then(()=>ui.controls.render({force:true})).catch(e=>ui.notifications.warn(e.message));});}for(const vault of game.journal.filter(d=>marked(d,'kind')==='caseVault'&&!caseRemoved(marked(d,'caseId')))){try{this.data=await this.reloadDefinition(marked(vault,'caseId'));}catch(e){ui.notifications.warn(e.message);}}
  const campaign=game.journal.find(d=>marked(d,'kind')==='avatarCampaign')?.getFlag(NS,'campaign');
  const preferred=campaign?.preparation?.caseId??this.visits.state?.caseId;if(this.definitions.has(preferred))this.selectedId=preferred;
 }
 async refreshTemplates(){if(!this.memory?.avatars.state?.initialized)return;const memory=await this.memory.read();for(const [id,template] of Object.entries(memory.templates))this.runtimeDefinitions.set(id,template.definition);}
 async preparationDefinition(id){this.gm();await this.reloadDefinition(id);await this.refreshTemplates();const data=this.definitionFor(id);if(!data)throw new Error('Nejdřív importuj vybraný případ.');return data;}
 async select(id){this.gm();assertCaseAvailable(id);if(!this.forCase(id))throw new Error('Případ není importovaný.');if(this.visits.state?.status==='active'&&this.visits.state.caseId!==id)throw new Error('Nejdřív dokonči aktuální návštěvu.');
  const p=game.pms?.avatars.state?.preparation;if(p?.status==='preparing'&&p.caseId!==id)throw new Error('Nejdřív dokonči otevřenou přípravu Avatarů.');
  this.selectedId=id;if(this.guideApplication)await this.guideApplication.close();this.guideApplication=undefined;
 }
 gm(){if(!this.visits.isAuthority)throw new Error('Případ připravuje hlavní připojený vypravěč.');}
 async importDialog(){this.gm();return this.controls.promptForm('Import přípravy případu',`<p>Vyber ZIP celého případu nebo starší PMS JSON.</p><p>ZIP obsahuje i použité soubory. Import je nahraje do tohoto světa a upraví cesty. Celý import obnoví výchozí scény a NPC; použij jej mezi výpravami. Archiv a skutečný výsledek zůstanou uložené.</p><label>Soubor případu<input type="file" name="caseFile" accept=".zip,application/zip,.json,application/json" required></label>${this.data?'<label class="pms-checkbox"><input type="checkbox" name="guideOnly" checked>Aktualizovat jen příručku</label><p>Zachová nastavení případu, postavy, scény i probíhající výpravu. Nahrají se jen soubory použité v příručce.</p>':''}`,{submit:f=>this.importFile(f.get('caseFile'),{guideOnly:Boolean(f.get('guideOnly'))})});}
 async importFile(file,{guideOnly=false}={}){
  this.gm();const progress=packageProgress('Načítám přípravu případu');
  try{
   const bundle=await readCaseFile(file,{validate:validateCase,onProgress:s=>progress.update(s)});this.gm();
   const prepare=bundle.manifest?async data=>restorePackageAssets(bundle,data,{store:nativeCaseAssetStorage(()=>this.gm()),guard:()=>this.gm(),onProgress:s=>progress.update(s)}):undefined;
   return await (guideOnly?this.updateGuide(bundle.data,{prepare}):this.install(bundle.data,{prepare}));
  }finally{progress.close();}
 }
 async updateGuide(raw,{prepare}={}){this.gm();if(this.busy)throw new Error('Import již probíhá.');if(!this.data||!this.vault)throw new Error('Nejdřív importuj celý případ.');this.busy=true;const caseId=this.selectedId;
  try{return await enqueueCaseWrite(this,async()=>{assertCaseAvailable(caseId);const vault=game.journal.find(d=>marked(d,'kind')==='caseVault'&&marked(d,'caseId')===caseId),installed=await this.reloadDefinition(caseId);let data=withUpdatedGuide(installed,raw);
   if(prepare){const guide=await prepare({id:raw.id,guide:raw.guide,guidePages:raw.guidePages});this.gm();data=withUpdatedGuide(installed,{...raw,...guide});}
   const revision=(marked(vault,'editorRevision')??0)+1;
   const update={'flags.pms.sealed':await this.visits.seal(data),'flags.pms.editorRevision':revision};
   if(marked(vault,'editorDraft')){const draft=await this.visits.unseal(marked(vault,'editorDraft'));draft.definition=withUpdatedGuide(draft.definition,{...raw,guide:data.guide,guidePages:data.guidePages});draft.revision=revision;update['flags.pms.editorDraft']=await this.visits.seal(draft);}
   await vault.update(update);this.definitions.set(data.id,data);if(this.guideApplication)await this.guideApplication.close();this.guideApplication=undefined;ui.notifications.info('Příručka aktualizována. Rozehraná výprava zůstává zachována.');return this.showGuide({caseId});});}finally{this.busy=false;}
 }
 async install(raw,{prepare,expectedRevision,onlyIfMissing=false}={}){this.gm();if(this.busy)throw new Error('Import již probíhá.');const incoming=validateCase(raw);this.busy=true;
  try{return await enqueueCaseWrite(this,async()=>{assertCaseAvailable(incoming.id);const currentVault=game.journal.find(d=>marked(d,'kind')==='caseVault'&&marked(d,'caseId')===incoming.id);if(onlyIfMissing&&currentVault)return false;if(expectedRevision!==undefined&&(!currentVault||(marked(currentVault,'editorRevision')??0)!==expectedRevision))throw new Error('Případ se změnil od potvrzení aktualizace. Vyber ZIP znovu.');if(this.visits.state?.status==='active'||game.pms?.avatars.state?.preparation?.status==='preparing'||this.launching)throw new Error('Celý import a doplnění scén dokonči až po návratu a mimo tvorbu Avatarů. Při výpravě lze aktualizovat jen příručku.');const installed=await this.reloadDefinition(incoming.id),memory=game.pms?.avatars.state?.initialized?await this.memory.read():null;
   if(incoming.initialSnapshot){assertSnapshotIdentities(incoming.initialSnapshot,{actors:game.actors,scenes:game.scenes,items:game.items});assertNativeCaseSnapshot(incoming.initialSnapshot);}
   const prepared=prepare?validateCase(await prepare(incoming)):incoming;this.gm();
   const data=versionImportedCase(prepared,installed,memory?.templates[incoming.id]);if(data.initialSnapshot)assertNativeCaseSnapshot(data.initialSnapshot);
   const sealed=await this.visits.seal(data),vault=game.journal.find(d=>marked(d,'kind')==='caseVault'&&marked(d,'caseId')===data.id);if(vault)await vault.update({'flags.pms.sealed':sealed,'flags.pms.editorRevision':(marked(vault,'editorRevision')??0)+1,'flags.pms.editorDraft':new foundry.data.operators.ForcedDeletion(),'flags.core.sheetClass':'pms.PMSCaseJournal'});else await JournalEntry.create({name:`${data.title} · příprava vypravěče`,ownership:{default:0},flags:{core:{sheetClass:'pms.PMSCaseJournal'},pms:{kind:'caseVault',caseId:data.id,sealed}}});
   const selected=this.selectedId,preparing=game.pms?.avatars.state?.preparation;this.data=data;if((this.visits.state?.status==='active'&&this.visits.state.caseId!==data.id)||(preparing?.status==='preparing'&&preparing.caseId!==data.id))this.selectedId=selected;
   this.guideApplication=undefined;const physical=await this.preparationDefinition(data.id);
   let actorFolder=game.folders.find(f=>f.type==='Actor'&&marked(f,'caseBundle')===data.id);if(!actorFolder)actorFolder=await Folder.create({name:data.title,type:'Actor',flags:{pms:{caseBundle:data.id}}});
   if(data.initialSnapshot){await this.memory.restore(data.initialSnapshot);}else{
   for(const npc of physical.npcs)if(!game.actors.some(a=>marked(a,'caseNpc')===npc.id&&marked(a,'caseBundle')===data.id))await Actor.create({name:npc.name,type:'npc',folder:actorFolder.id,img:npc.img??'systems/pms/assets/avatar.svg',ownership:{default:0},system:{role:npc.role,biography:npc.biography,caseId:data.id,food:0},prototypeToken:{actorLink:true,disposition:0,texture:{src:npc.img??'systems/pms/assets/avatar.svg'}},flags:{pms:{caseBundle:data.id,caseNpc:npc.id}}});
   for(const actor of game.actors.filter(a=>a.type==='avatar'&&!a.prototypeToken.sight.enabled))await actor.update({'prototypeToken.sight.enabled':true});
   for(const plan of physical.scenePlans){let scene=game.scenes.find(s=>marked(s,'caseScene')===plan.id&&marked(s,'caseBundle')===data.id);
    if(!scene)scene=await Scene.create({name:plan.name,...sceneArtSettings(plan),levels:sceneLevelData(plan),navigation:true,ownership:{default:2},flags:{pms:{caseBundle:data.id,caseScene:plan.id}},walls:planWalls(plan),regions:planStairs(plan)},{keepId:true});
    if(!scene)throw new Error('Foundry nevytvořilo scénu. Příprava je uložená; oprav podklad a použij Doplnit scény.');
    const result=await applySceneArt(scene,plan),levelIds=result.levelIds??Object.fromEntries(scene.levels.map(l=>[marked(l,'levelKey')??'ground',l.id]));
    const missing=(plan.tokens??[]).filter(([id])=>!scene.tokens.some(t=>marked(t,'caseNpc')===id));if(missing.length)await scene.createEmbeddedDocuments('Token',missing.map(([id,x,y,hidden,level='ground'])=>{const actor=game.actors.find(a=>marked(a,'caseNpc')===id&&marked(a,'caseBundle')===data.id);return{name:actor.name,actorId:actor.id,actorLink:true,x,y,level:levelIds[level],elevation:plan.levels.find(l=>l.key===level)?.bottom??0,width:1,height:1,hidden,texture:{src:actor.prototypeToken.texture.src||actor.img},displayName:20,flags:{pms:{caseNpc:id}}};}));
   }
   }
   await game.pms?.npcTokens?.syncAll(data.id);
   await game.pms?.hub?.publishOffer(data);
   ui.notifications.info(`${data.title}: ${physical.npcs.length} NPC, ${physical.scenePlans.length} scén a neveřejná příprava.`);ui.controls.render({force:true});
  });}finally{this.busy=false;}
 }
 async updateDialog(caseId=this.selectedId){this.gm();assertCaseAvailable(caseId);if(!this.forCase(caseId))throw new Error('Vyber importovaný případ.');const form=await this.controls.promptForm('Vybrat novější ZIP případu',`<p><strong>${esc(this.forCase(caseId).title)}</strong></p><p>Po ověření balíčku uvidíš verze a rozsah změn před potvrzením.</p><label>ZIP případu<input type="file" name="caseFile" accept=".zip,application/zip" required></label>`,{label:'Ověřit ZIP',position:{width:700}});if(form)return updateCaseZip(this,caseId,form.get('caseFile'));}
 async repair(){if(!this.data)throw new Error('Nejdřív importuj přípravu.');return this.install(this.data);}
 installNpcPortraits(caseId=this.selectedId){return installCaseNpcPortraits(this,caseId);}
 async showEditor(){return game.pms.openCaseEditor();}
 async showGuide(options={}){this.gm();const caseId=options.caseId??this.selectedId,data=this.forCase(caseId);if(!data)return this.importDialog();
  if(this.guideCaseId!==caseId){if(this.guideApplication)await this.guideApplication.close();this.guideApplication=undefined;}
  this.guideCaseId=caseId;this.guideApplication??=new PMSCaseJournal({caseData:data});return this.guideApplication.render({force:true,...options});}
 async showPreparation(options={}){
  if(!game.user.isGM||game.pmsAuthority?.failed)throw new Error('Příprava patří připojenému vypravěči.');
  const caseId=options.caseId??this.selectedId,data=await this.reloadDefinition(caseId);
  if(!data)throw new Error('Nejdřív importuj celý vybraný případ.');
  const markdown=new window.showdown.Converter({tables:true}),pages=buildCaseGuide(data,value=>markdown.makeHtml(value));
  const preparation=await buildPreparationPlan(data,pages,game.scenes);
  const completed=preparationProgress({settings:game.settings,user:game.user,worldId:game.world.id,caseId,plan:preparation});
  if(this.preparationApplication)await this.preparationApplication.close();
  this.preparationApplication=new PMSPreparationJournal({caseData:data,preparation,completed});
  return this.preparationApplication.render({force:true,pageId:PREPARATION_PAGES.overview});
 }
 async showResult(caseId=this.selectedId){
  this.gm();const data=this.forCase(caseId);if(!data)throw new Error('Nejdřív importuj přípravu případu.');
  const settled=this.visits.queue.then(()=>this.visits.publish());this.visits.queue=settled.catch(()=>{});await settled;
  const memory=await this.memory.read(),result=memory.realResults[caseId];
  if(!result)throw new Error('Skutečný průchod ještě neskončil. Výsledek se uloží při návratu MHD.');
  const rewards=await game.pms.rewards.read(),definition=memory.templates[caseId]?.definition??{};
  const resultData={...data,...definition,worldFields:definition.worldFields??data.worldFields};
  const journal=new JournalEntry({name:`${data.title} · skutečný výsledek`,ownership:{default:0},flags:{core:{locked:true,viewMode:1}},
   pages:realResultPages(result,resultData,rewards).map(({content,...page})=>({...page,_id:foundry.utils.randomID(),ownership:{default:0},title:{show:true,level:1},text:{format:1,content}}))});
  if(this.resultApplication)await this.resultApplication.close();
  this.resultApplication=new PMSResultJournal({document:journal},this,caseId);return this.resultApplication.render({force:true});
 }
 async writeResult(caseId=this.selectedId){
  this.gm();const result=(await this.memory.read()).realResults[caseId];if(!result)throw new Error('Skutečný průchod ještě není uzavřený.');
  const form=await this.controls.promptForm('Zápis skutečného konce',`<p>Popiš následky první skutečné výpravy. Tento zápis doplňuje uložený stav při návratu; pozdější odrazy jej nemění.</p><label>Výsledek a následky<textarea name="summary" maxlength="3000" required>${esc(result.report?.summary??'')}</textarea></label><label>Odpovědnost a osudy NPC<textarea name="responsibility" maxlength="3000">${esc(result.report?.responsibility??'')}</textarea></label>`);
  if(!form)return;await this.memory.updateReport(caseId,{summary:form.get('summary'),responsibility:form.get('responsibility')});return this.showResult(caseId);
 }

 roster(ids){return ids.map(id=>{const a=game.actors.get(id);if(a?.type!=='avatar')throw new Error('Vyber skutečné Avatary.');const owner=game.users.find(u=>!u.isGM&&a.testUserPermission(u,'OWNER'))??game.user;return{id:foundry.utils.randomID(),actorId:a.id,ownerId:owner.id,name:a.name,alive:a.system.alive,vitals:a.system.vitals.toObject?.()??a.system.vitals,skills:a.system.skills.toObject?.()??a.system.skills,food:a.system.food};});}
 async start(){this.gm();return game.pms.openAvatarCreation();}
 async launchPrepared(){this.gm();if(this.launching)throw new Error('Odjezd již probíhá.');this.launching=true;
  const job=this.visits.queue.then(()=>this.completeDeparture());this.visits.queue=job.catch(()=>{});
  try{return await job;}finally{this.launching=false;}
 }
 async completeDeparture(){
   if(!this.data)throw new Error('Nejdřív importuj přípravu případu.');
   const preparation=game.pms.avatars.state?.preparation;
   if(!preparation)throw new Error('Otevři společnou přípravu Avatarů.');
   const data=await this.preparationDefinition(preparation.caseId);this.selectedId=data.id;
   const persisted=this.visits.privateState;
   const resuming=persisted?.status==='active'&&persisted.preparationId===preparation.id&&!persisted.launchReady;
   if(this.visits.state?.status==='active'&&!resuming)throw new Error('Nejdřív dokonči aktuální výpravu.');
   if(!resuming&&preparation.status!=='preparing')throw new Error('Tato příprava už odjela.');
   const initial=caseEntry(data,preparation.ownerIds.length);
   if(!game.scenes.some(s=>marked(s,'caseScene')===initial.plan.id&&marked(s,'caseBundle')===data.id))throw new Error('Chybí výchozí scéna případu. Doplň scény a zopakuj odjezd.');
   let avatars;
   if(resuming){await this.visits.ensureActors();await this.visits.publish();avatars=this.visits.privateState.avatars;}
   else{availablePreparationRoster(game.pms.avatars.state);await this.visits.publish();const definition=await this.memory.prepare(preparation,data);this.runtimeDefinitions.set(data.id,definition);avatars=await game.pms.avatars.readyAvatars();
    const events=definition.events.map(e=>({...e,seenBy:e.visibility==='observed'?avatars.map(a=>a.id):[]}));
    if(!game.journal.some(d=>marked(d,'kind')==='board'&&marked(d,'caseId')===data.id))await JournalEntry.create({name:`${data.title} · tabule důkazů`,ownership:{default:2},flags:{pms:{kind:'board',caseId:data.id,board:{...emptyBoard(),title:data.title}}}});
    await this.visits.create({title:definition.title,start:definition.start,end:definition.end,caseId:data.id,mode:preparation.mode,preparationId:preparation.id,world:definition.world,events,avatars});
   }
   if(game.pms.avatars.state.preparation.status==='preparing')await game.pms.avatars.markLaunched(this.visits.privateState.id);
   await this.sharedGear();
   const scene=game.scenes.find(s=>marked(s,'caseScene')===initial.plan.id&&marked(s,'caseBundle')===data.id);
   if(scene){const {plan,level}=initial;
    for(const [i,a] of avatars.entries()){const actor=game.actors.get(a.actorId);if(!actor)throw new Error('Avatar při odjezdu chybí.');
     const nativeLevel=scene.levels.find(l=>marked(l,'levelKey')===level.key)??scene.levels.get(level.id);if(!nativeLevel)throw new Error('Chybí výchozí podlaží. Doplň scény.');
     const position={x:initial.x+i*initial.spacing,y:initial.y,level:nativeLevel.id,elevation:level.bottom};
     const existing=scene.tokens.find(t=>t.actorId===a.actorId);
     if(existing)await scene.updateEmbeddedDocuments('Token',[{_id:existing.id,hidden:false}],{movement:{[existing.id]:{waypoints:[{...position,action:'displace'}],showRuler:false,constrainOptions:{ignoreWalls:true,ignoreCost:true}}},animate:false});
     else{const token=await actor.getTokenDocument({...position,hidden:false,actorLink:true,flags:{pms:{visitParty:this.visits.privateState.id}}});await scene.createEmbeddedDocuments('Token',[token.toObject()]);}
    }
    await presentScene(scene,{activate:true});
   }
   if(!game.items.some(i=>marked(i,'caseClue')==='intro'&&marked(i,'caseBundle')===data.id&&marked(i,'sourceVisit')===this.visits.privateState.id))await Item.create({name:data.briefing.name,type:'clue',ownership:{default:2},system:{caseId:data.id,published:true,source:`${data.briefing.source} · ${preparation.mode==='reflection'?'odraz':'skutečný průchod'}`,acquiredAt:time(this.visits.privateState.start),medium:'paper',description:data.intro},flags:{pms:{caseBundle:data.id,caseClue:'intro',sourceVisit:this.visits.privateState.id,sourceMode:preparation.mode}}});
   for(const a of avatars){const owner=game.users.get(a.ownerId);if(owner&&owner.character?.id!==a.actorId)await owner.update({character:a.actorId});}
   await this.visits.completeLaunchReady();game.pms.timeline.render({force:true});
 }
 async sharedGear(){
  for(const [id,name,description] of [['detector','Detekční pomůcka PMS','Společná pomůcka pro potvrzení dostupného úlomku zblízka.'],['container','Uzavíratelná schránka PMS','Společná schránka pro izolaci úlomku. Převoz vyžaduje uzavření a živého nosiče při návratu.']]){
   const existing=game.items.find(i=>marked(i,'expeditionGear')===`${this.data.id}:${id}`);
   const data={name,type:'supply',img:'icons/svg/chest.svg',ownership:{default:2},system:{quantity:1,description},flags:{pms:{expeditionGear:`${this.data.id}:${id}`}}};
   if(existing)await existing.update(data);else await Item.create(data);
  }
 }
 async reveal(){this.gm();if(!this.data)throw new Error('Nejdřív importuj případ.');
  const visit=this.visits.privateState,data=this.definitionFor(this.selectedId);if(visit?.caseId!==this.data.id||visit.status!=='active')throw new Error('Vodítko zveřejni během právě hrané návštěvy.');
  const item=id=>game.items.find(i=>marked(i,'caseBundle')===this.data.id&&marked(i,'caseClue')===id&&marked(i,'sourceVisit')===visit.id);
  const revealed=new Set(data.clues.filter(c=>item(c.id)).map(c=>c.id)),detail={at:time(this.visits.state?.clock??this.data.start)};
  const f=await this.controls.promptForm('Vodítka případu',cluePickerMarkup(data.clues,revealed,{},detail),{label:'Zveřejnit nález',classes:['pms-clue-dialog'],position:{width:Math.min(1180,window.innerWidth-48)},
   render:(_event,dialog)=>bindCluePicker(dialog.element.querySelector('.pms-clue-picker'),{clues:data.clues,revealed,detail,save:dialog.element.querySelector('[data-action="save"]'),onOpen:id=>{item(id)?.sheet.render({force:true});dialog.close();}})});
  if(!f?.get('clue'))return;
  const job=this.visits.queue.then(async()=>{
   if(this.visits.privateState?.id!==visit.id||this.visits.privateState.status!=='active')throw new Error('Tato návštěva už skončila. Otevři vodítka znovu pro aktuální průchod.');
   const c=data.clues.find(c=>c.id===f.get('clue'));if(!c||item(c.id))return;
   const created=await Item.create({name:f.get('name'),type:'clue',ownership:{default:2},system:{caseId:this.data.id,published:true,source:`${f.get('source')} · ${visit.mode==='reflection'?'odraz':'skutečný průchod'}`,acquiredAt:f.get('at'),medium:c.medium,description:f.get('description')},flags:{pms:{caseBundle:this.data.id,caseClue:c.id,sourceVisit:visit.id,sourceMode:visit.mode}}});created.sheet.render({force:true});
  });this.visits.queue=job.catch(()=>{});return job;
 }
 async conditions(){this.gm();const s=this.visits.privateState,data=this.definitionFor(s?.caseId);if(s?.caseId!==this.data?.id||s?.status!=='active')throw new Error('Podmínky patří aktuální návštěvě případu.');
  const renderField=f=>f.choices?`<label>${esc(f.label)}<select name="${f.key}">${Object.entries(f.choices).map(([k,v])=>`<option value="${k}" ${s.world[f.key]===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`:`<label class="pms-checkbox"><input type="checkbox" name="${f.key}" ${s.world[f.key]?'checked':''}>${esc(f.label)}</label>`;
  const groups=structuredClone(data.stateGroups??[]),used=new Set(groups.flatMap(g=>g.keys));
  const remaining=data.worldFields.filter(f=>!used.has(f.key)).map(f=>f.key);if(remaining.length)groups.push({title:'Stav světa',keys:remaining});
  const fields=groups.map(group=>{const own=data.worldFields.filter(f=>group.keys.includes(f.key));return `<section class="pms-case-state-group"><h3>${esc(group.title)}</h3>${own.some(f=>f.choices)?`<div class="pms-case-state-places">${own.filter(f=>f.choices).map(renderField).join('')}</div>`:''}<div class="pms-case-state-flags">${own.filter(f=>!f.choices).map(renderField).join('')}</div></section>`;}).join('');
  const form=await this.controls.promptForm('Stav případu',`<p class="pms-case-state-intro">Zaznamenej již provedené zásahy a skutečné polohy. Změna rozkazu není jeho doručení. Poloha v tomto přehledu nepřemístí token.</p><div class="pms-case-state-grid">${fields}</div>`,{classes:['pms-case-state-dialog'],position:{width:Math.min(1080,window.innerWidth-48)}});if(!form)return;
  if(this.visits.privateState?.id!==s.id||this.visits.privateState.status!=='active')throw new Error('Tato návštěva už skončila. Otevři stav případu znovu.');
  const changes=Object.fromEntries(data.worldFields.map(f=>[f.key,f.choices?form.get(f.key):Boolean(form.get(f.key))]));await this.visits.submit({type:'world',changes});
 }
 async run(action){try{await this[action]();}catch(e){ui.notifications.warn(e.message);}}
}
