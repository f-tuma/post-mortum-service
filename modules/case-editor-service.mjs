import {editorDraft,validateEditorDraft,publishEditorDraft,assertEditorWrite,validateInitialSnapshot,removeEditorRecord} from './case-editor-state.mjs';
import {caseEntry} from './case-definition.mjs';
import {validateCase} from './case-state.mjs';
import {captureCaseSnapshot,assertNativeCaseSnapshot} from './case-snapshot.mjs';
import {escape as escapeHTML} from './view-utils.mjs';
import {buildCasePackage} from './case-package.mjs';
import {readFoundryAsset,packageProgress} from './case-package-foundry.mjs';
import {assertCaseAvailable} from './case-lifecycle.mjs';
const flag=(doc,key)=>doc.getFlag('pms',key);
export class CaseEditorService {
 constructor(cases){this.cases=cases;this.queue=Promise.resolve();}
 get context(){return {isGM:game.user.isGM,isAuthority:this.cases.visits.isAuthority,active:this.cases.visits.state?.status==='active',preparing:game.pms?.avatars.state?.preparation?.status==='preparing'};}
 guard(publish=false){assertEditorWrite(this.context,publish);}
 vault(id){return game.journal.find(d=>flag(d,'kind')==='caseVault'&&flag(d,'caseId')===id);}
 serial(run){const job=this.queue.then(()=>{this.guard();return run();});this.queue=job.catch(()=>{});return job;}
 campaignWrite(run){const avatars=game.pms.avatars;const job=(avatars.queue??Promise.resolve()).then(()=>{this.guard(true);return run();});avatars.queue=job.catch(()=>{});return job;}
 currentDraft(draft){assertCaseAvailable(draft.caseId);const vault=this.vault(draft.caseId);if(!vault||(flag(vault,'editorRevision')??0)!==draft.revision)throw new Error('Návrh se mezitím změnil. Načti jej znovu.');return vault;}
 async load(id){this.guard();const data=this.cases.reloadDefinition?await this.cases.reloadDefinition(id):this.cases.forCase(id);if(!data)throw new Error('Případ není importovaný.');const sealed=this.vault(id)?.getFlag('pms','editorDraft');
  if(sealed){const saved=validateEditorDraft(await this.cases.visits.unseal(sealed));return {...saved,definition:editorDraft(saved.definition,saved.snapshot).definition};}
  const memory=game.pms.avatars.state?.initialized?await this.cases.memory.read():null;
  const draft=editorDraft(data,data.initialSnapshot??memory?.templates[id]?.snapshot??null);draft.revision=flag(this.vault(id),'editorRevision')??0;return draft;
 }
 save(draft){return this.serial(async()=>{assertCaseAvailable(draft.caseId);validateEditorDraft(draft);const vault=this.vault(draft.caseId);if(!vault)throw new Error('Příprava případu chybí.');
  if((flag(vault,'editorRevision')??0)!==draft.revision)throw new Error('Návrh změnil jiný editor. Načti aktuální návrh; tato okna jej nesmějí přepsat.');
  const next=structuredClone(draft);next.revision++;
  await vault.update({'flags.pms.editorDraft':await this.cases.visits.seal(next),'flags.pms.editorRevision':next.revision});return next;
 });}
 publish(draft){return this.serial(()=>this.campaignWrite(()=>this.publishQueued(draft)));}
 async publishQueued(draft){this.guard(true);assertCaseAvailable(draft.caseId);const vault=this.vault(draft.caseId);
  if((flag(vault,'editorRevision')??0)!==draft.revision)throw new Error('Návrh se mezitím změnil. Načti jej znovu.');
  const current=await this.cases.visits.unseal(flag(vault,'sealed')),data=publishEditorDraft(draft,current.contentVersion);
  assertNativeCaseSnapshot(data.initialSnapshot);
  // Definition and initial native world are committed together. Memory adopts the version on departure.
  const next=editorDraft(data,data.initialSnapshot);next.revision=draft.revision+1;
  await vault.update({name:`${data.title} · příprava vypravěče`,'flags.pms.sealed':await this.cases.visits.seal(data),'flags.pms.editorDraft':await this.cases.visits.seal(next),'flags.pms.editorRevision':next.revision});
  this.cases.definitions.set(data.id,data);this.cases.runtimeDefinitions.delete(data.id);
  if(this.cases.guideCaseId===data.id){await this.cases.guideApplication?.close();this.cases.guideApplication=undefined;}
  try{await game.pms.hub.publishOffer(data,{update:true});}catch(error){console.error('PMS public offer refresh',error);ui.notifications.warn('Příprava je vydaná. Pověření se obnoví při dalším načtení světa.');}return next;
 }
 capture(draft){this.guard(true);const next=structuredClone(draft),d=next.definition;
  const snapshot=captureCaseSnapshot({caseId:d.id,actors:game.actors.contents,scenes:game.scenes.contents,items:game.items.contents});
  d.scenePlans=d.scenePlans.map(plan=>{const scene=snapshot.scenes.find(s=>s.flags.pms.caseScene===plan.id);if(!scene)throw new Error(`Chybí scéna ${plan.name}.`);
   return {...plan,name:scene.name,width:scene.width,height:scene.height,grid:scene.grid.size,levels:scene.levels.map(l=>({id:l._id,key:l.flags?.pms?.levelKey??l._id,name:l.name,bottom:l.elevation.bottom,top:l.elevation.top,asset:l.background?.src??''})),edges:[],stairs:[],tokens:[]};});
  d.npcs=d.npcs.map(n=>{const a=snapshot.actors.find(a=>a.flags.pms.caseNpc===n.id);if(!a)throw new Error(`Chybí NPC ${n.name}.`);return {...n,name:a.name,role:a.system.role,biography:a.system.biography,...(a.img?{img:a.img}:{})};});
  caseEntry(d);next.snapshot=validateInitialSnapshot(snapshot,d);return next;
 }
 attach(draft,document){return this.serial(()=>this.campaignWrite(()=>{this.currentDraft(draft);return this.attachQueued(draft,document);}));}
 async attachQueued(draft,document){this.guard(true);if(document.pack)throw new Error('Nejdřív importuj dokument z kompendia do světa.');const kind=document.documentName;
  if(!['Scene','Actor','Item'].includes(kind)||document.parent)throw new Error('Přetáhni scénu, NPC nebo samostatný předmět ze světa.');
  if(flag(document,'caseBundle')&&flag(document,'caseBundle')!==draft.caseId)throw new Error('Dokument patří jinému případu.');
  if(kind==='Scene'&&flag(document,'hubVista')||kind==='Actor'&&document.type!=='npc'||kind==='Item'&&(flag(document,'sourceVisit')||document.system.published))throw new Error('Hub, Avataři a archivní nálezy nejsou výchozí svět.');
  const next=structuredClone(draft),d=next.definition,id=flag(document,kind==='Scene'?'caseScene':kind==='Actor'?'caseNpc':'caseTemplateItem')??foundry.utils.randomID();
  if(kind==='Scene'&&!d.scenePlans.some(p=>p.id===id))d.scenePlans.push({id,name:document.name,width:document.width,height:document.height,grid:document.grid.size,version:1,levels:document.levels.map(l=>({id:l.id,key:flag(l,'levelKey')??l.id,name:l.name,bottom:l.elevation.bottom,top:l.elevation.top,asset:l.background.src})),edges:[],tokens:[],stairs:[]});
  if(kind==='Actor'&&!d.npcs.some(n=>n.id===id))d.npcs.push({id,name:document.name,role:document.system.role,biography:document.system.biography,guide:''});
  const key=kind==='Scene'?'caseScene':kind==='Actor'?'caseNpc':'caseTemplateItem';await document.update({'flags.pms.caseBundle':draft.caseId,[`flags.pms.${key}`]:id});
  next.snapshot=null;return next;
 }
 async export(draft){this.guard();const data=publishEditorDraft(draft,draft.publishedVersion);data.contentVersion=draft.publishedVersion;
  const progress=packageProgress('Připravuji balíček případu');let bundle;
  try{bundle=await buildCasePackage(data,{readAsset:readFoundryAsset,onProgress:state=>{this.guard();progress.update(state);}});}finally{progress.close();}
  this.guard();const content=`<p><strong>${escapeHTML(data.title)}</strong> · ${(bundle.bytes.byteLength/1024/1024).toFixed(1)} MiB</p><ul><li>${data.initialSnapshot.scenes.length} scén včetně zdí, dveří, podlaží a světel.</li><li>${data.npcs.length} NPC a autorská příprava.</li><li>${bundle.fileCount} přibalených souborů: mapy, portréty, tokeny, obrázky a zvuky.</li></ul>`;
  const form=await this.cases.controls.promptForm('Export celého případu',`<p>Jeden ZIP pro přenos do jiného světa. Import nahraje soubory a upraví jejich cesty. Balíček obsahuje řešení případu a patří vypravěči.</p>${content}`,{label:'Stáhnout ZIP',position:{width:680}});
  if(form){this.guard();foundry.utils.saveDataToFile(bundle.bytes,'application/zip',`${draft.caseId}-v${data.contentVersion}.zip`);}
 }
 detach(draft,document){return this.serial(()=>this.campaignWrite(()=>{this.currentDraft(draft);return this.detachQueued(draft,document);}));}
 async detachQueued(draft,document){this.guard(true);if(flag(document,'caseBundle')!==draft.caseId)throw new Error('Dokument nepatří otevřenému případu.');const kind=document.documentName,key=kind==='Scene'?'caseScene':kind==='Actor'?'caseNpc':kind==='Item'?'caseTemplateItem':null;if(!key)throw new Error('Tento dokument nelze odpojit.');
  let next=structuredClone(draft);const id=flag(document,key);
  if(kind==='Scene'){if(next.definition.entry.sceneId===id)throw new Error('Nejdřív zvol jinou vstupní scénu.');next.definition.scenePlans=next.definition.scenePlans.filter(p=>p.id!==id);if(next.definition.roomNotes)next.definition.roomNotes=next.definition.roomNotes.filter(n=>n.sceneId!==id);if(next.definition.guidePages)next.definition.guidePages=next.definition.guidePages.filter(p=>p.flags?.pms?.roomSceneId!==id);}
  if(kind==='Actor'){if(game.scenes.some(s=>flag(s,'caseBundle')===draft.caseId&&s.tokens.some(t=>t.actorId===document.id)))throw new Error('Nejdřív odstraň tokeny tohoto NPC ze scén případu.');next=removeEditorRecord(next,'npcs',id);}
  await document.update({'flags.pms.caseBundle':new foundry.data.operators.ForcedDeletion(),[`flags.pms.${key}`]:new foundry.data.operators.ForcedDeletion()});next.snapshot=null;return next;
 }
 async create({id,title}){this.guard(true);const levelId=foundry.utils.randomID(),sceneId=foundry.utils.randomID();
  const data=validateCase({format:'pms-case',version:2,contentVersion:1,draftOnly:true,id,title,intro:'',start:480,end:1200,npcs:[],clues:[],guide:[],guidePages:[],events:[],world:{},worldFields:[],stateGroups:[],resultFields:[],rewards:[],
   scenePlans:[{id:sceneId,name:`${title} · vstup`,width:2000,height:1200,grid:100,version:1,levels:[{id:levelId,key:'ground',name:'Přízemí',bottom:0,top:null,asset:''}],edges:[],tokens:[],stairs:[]}],entry:{sceneId,levelKey:'ground',x:400,y:600,spacing:100},briefing:{name:'Pověření',source:'PMS'},avatarCatalog:{id,caseId:id,title,setting:'Nová realita',description:'',contacts:[],kits:[{id:'basic',name:'Základ',description:'',items:[{id:'tool',name:'Osobní vybavení',description:'',quantity:1}]}]}});
  if(this.vault(id))throw new Error('Případ s tímto identifikátorem již existuje, případně je v koši.');await this.cases.install(data);return this.load(id);
 }
}
