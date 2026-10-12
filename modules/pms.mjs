import { AvatarModel, SupplyModel, ClueModel } from "./models.mjs";
import { PMSActorSheet, PMSItemSheet } from "./sheets.mjs";
import { TimelineApplication } from "./timeline-app.mjs";
import { BoardService } from "./board-service.mjs";
import { initializeGMClientAuthority } from "./gm-authority.mjs";
import { BoardApplication } from "./board-app.mjs";
import { VisitService } from "./visit-service.mjs";
import { VisitControls } from "./visit-app.mjs";
import { CaseService, PMSCaseJournal } from "./case-service.mjs";
import { CaseMenu } from "./case-menu.mjs";
import { AvatarService } from "./avatar-service.mjs";
import { AvatarCreationApplication } from "./avatar-app.mjs";
import { RewardService } from './reward-service.mjs';
import { RewardApplication } from './reward-app.mjs';
import {CaseMemoryService} from './case-memory-service.mjs';
import {HubVistaService,PMSCaseOfferJournal,registerHubHooks} from './hub-vista.mjs';
import {createVistaTileDocument} from './vista-tile-document.mjs';
import {CaseCatalogService} from './case-catalog.mjs';
import {CaseCatalogApplication,SectorArchiveApplication} from './hub-menu-app.mjs';
import {registerActionChatHooks,refreshActionChat} from './action-chat.mjs';
import {CaseEditorService} from './case-editor-service.mjs';
import {CaseEditorApplication} from './case-editor-app.mjs';
import {CaseLifecycleService} from './case-lifecycle.mjs';
import {StarterCaseService} from './starter-case.mjs';
import {registerSoulTokenHooks} from './soul-token.mjs';
import {NpcTokenService,registerNpcTokenHooks} from './npc-token-service.mjs';
import {RoomNoteService,createRoomNoteClass,registerRoomNoteHooks} from './room-note-service.mjs';

Hooks.once("init", () => {
  CONFIG.Tile.documentClass=createVistaTileDocument(CONFIG.Tile.documentClass);
  CONFIG.Note.objectClass=createRoomNoteClass(CONFIG.Note.objectClass);
  CONFIG.Actor.dataModels.avatar = AvatarModel;
  CONFIG.Actor.dataModels.npc = AvatarModel;
  CONFIG.Item.dataModels.supply = SupplyModel;
  CONFIG.Item.dataModels.clue = ClueModel;
  CONFIG.Item.typeIcons.clue = 'fa-solid fa-file-lines';
  CONFIG.Item.typeIcons.supply = 'fa-solid fa-box';
  foundry.documents.collections.Actors.registerSheet("pms",PMSActorSheet,{types:["avatar","npc"],makeDefault:true,label:"Deník PMS"});
  foundry.documents.collections.Items.registerSheet("pms",PMSItemSheet,{types:["supply","clue"],makeDefault:true,label:"Předmět PMS"});
  foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry,'pms',PMSCaseJournal,{makeDefault:false,label:'Příprava případu PMS'});
  foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry,'pms',PMSCaseOfferJournal,{makeDefault:false,label:'Pověření PMS'});
  registerHubHooks();
  registerActionChatHooks();
  registerSoulTokenHooks();
  registerNpcTokenHooks();
  registerRoomNoteHooks();
  game.settings.register("pms", "visitKey", { scope: "client", config: false, type: String, default: "" });
  game.settings.register("pms", "timelineFullscreen", { scope: "client", config: false, type: Boolean, default: true });
  game.settings.register("pms", "gmPreparationProgress", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register("pms", "starterCase", { scope: "world", config: false, type: String, default: "" });
});
Hooks.on('preCreateActor',actor=>{
  if(actor.type==='avatar')actor.updateSource({'prototypeToken.sight.enabled':true});
});
Hooks.on('preCreateItem',item=>{
  if(item.type==='clue'&&item.img===Item.DEFAULT_ICON)item.updateSource({img:'systems/pms/assets/clue.svg'});
});
Hooks.once("ready", async () => {
  document.body.classList.add("pms-system");
  const previouslyInitialized=game.journal.some(d=>d.getFlag('pms','kind')==='authorityProof');
  await initializeGMClientAuthority();
  const service = new BoardService();
  await service.initialize();
  const board = new BoardApplication(service);
  const visits = new VisitService();
  await visits.initialize();
  const visit = new VisitControls(visits);
  const timeline = new TimelineApplication(visits,visit);
  const cases=new CaseService(visits,visit);await cases.initialize();
  const avatars=new AvatarService(visits);await avatars.initialize();
  const avatarWizard=new AvatarCreationApplication(avatars);
  const rewards=new RewardService(avatars,visits,cases);
  const rewardCard=new RewardApplication(rewards,visit);
  const memory=new CaseMemoryService(avatars,visits,cases);cases.memory=memory;
  visits.handleReturn=state=>memory.finishReturn(state);
  if(game.user.isGM){try{await cases.refreshTemplates();}catch(error){ui.notifications.error(error.message);}}
  const caseMenu=game.user.isGM?new CaseMenu(cases):null;
  const hub=new HubVistaService();
  const npcTokens=new NpcTokenService();
  const roomNotes=new RoomNoteService(cases);
  const catalog=new CaseCatalogService(avatars),caseCatalog=new CaseCatalogApplication(catalog);
  game.pms = { service, board, visits, visit, timeline, cases, caseMenu, hub, avatars, avatarWizard, rewards, rewardCard, memory, openHub:()=>hub.enter().catch(error=>ui.notifications.warn(error.message)), openRewards:()=>{if(game.user.isGM)return rewardCard.render({force:true});}, openAvatarCreation:()=>avatarWizard.render({force:true}), openBoard: options => board.openCase(options).catch(error=>ui.notifications.warn(error.message)), openTimeline: () => {if(!game.user.isGM)return;return timeline.render({force:true});} };
  Object.assign(game.pms,{npcTokens,roomNotes,catalog,caseCatalog,sectorArchive:new SectorArchiveApplication(catalog),openSectorArchive:()=>game.pms.sectorArchive.render({force:true})});
  if(game.user.isGM)game.pms.caseLifecycle=new CaseLifecycleService(cases);
  const starterCase=new StarterCaseService(cases,{previouslyInitialized});game.pms.starterCase=starterCase;
  Hooks.on('pmsAuthorityChanged',()=>{if(visits.isAuthority)starterCase.ensure().catch(error=>ui.notifications.error(error.message));});
  await npcTokens.syncAll();
  if(game.user.isGM){const editorService=new CaseEditorService(cases),caseEditor=new CaseEditorApplication(editorService);Object.assign(game.pms,{editorService,caseEditor,openCaseEditor:()=>caseEditor.open().catch(e=>ui.notifications.warn(e.message))});}
  visits.onReturnReady=state=>hub.returnFromVisit(state);
  if(visits.isAuthority){try{await hub.ensure();await hub.startup();await catalog.ensureGuide();}catch(error){ui.notifications.error(error.message);}
   try{await starterCase.ensure();}catch(error){ui.notifications.error(error.message);}
   try{for(const data of cases.definitions.values())await hub.publishOffer(data);}catch(error){ui.notifications.error(error.message);}
   try{await roomNotes.ensureAll();}catch(error){ui.notifications.warn(error.message);}
  }
  if(canvas.ready)hub.mount();avatars.onChange(()=>hub.energy());
  if(visits.isAuthority&&visits.privateState?.status==='returned'&&avatars.state?.initialized){try{await visits.publish();}catch(error){ui.notifications.error(error.message);}}
  visits.onChange(()=>avatarWizard.changed());
  visits.onChange(refreshActionChat);
  refreshActionChat();
  avatarWizard.changed();
  ui.controls.render({force:true});
  try{await hub.startup();}catch(error){ui.notifications.error(error.message);}
});
Hooks.on("getSceneControlButtons",controls=>{
  controls.pms={name:"pms",title:"Popohřební služba",icon:"fa-solid fa-feather-pointed",order:90,tools:{
    hub:{name:"hub",title:"Sektor PMS",icon:"fa-solid fa-door-open",button:true,onChange:()=>game.pms?.openHub()},
    caseCatalog:{name:'caseCatalog',title:'Recepce · pověření',icon:'fa-solid fa-book-open',button:true,onChange:()=>game.pms?.caseCatalog.render({force:true})},
    sectorArchive:{name:'sectorArchive',title:'Archiv služby · úvod do sektoru',icon:'fa-solid fa-box-archive',button:true,onChange:()=>game.pms?.openSectorArchive()},
    board:{name:"board",title:"Tabule důkazů",icon:"fa-solid fa-thumbtack",button:true,onChange:()=>game.pms?.openBoard()},
    character:{name:"character",title:"Deník postavy",icon:"fa-solid fa-address-book",button:true,onChange:()=>{const actor=game.user.character??game.actors.find(a=>a.type==="avatar"&&a.isOwner);actor?.sheet.render({force:true});}},
    avatar:{name:"avatar",title:"Tvorba Avatara · MHD",icon:"fa-solid fa-train-subway",button:true,onChange:()=>game.pms?.openAvatarCreation()},
    timeline:{name:"timeline",title:"Časová osa",icon:"fa-solid fa-timeline",button:true,visible:game.user.isGM,onChange:()=>game.pms?.openTimeline()},
    caseClue:{name:"caseClue",title:"Vodítka případu",icon:"fa-solid fa-magnifying-glass",button:true,visible:game.user.isGM,onChange:()=>game.pms?.cases.run('reveal')},
    caseConditions:{name:"caseConditions",title:"Stav případu",icon:"fa-solid fa-sliders",button:true,visible:game.user.isGM,onChange:()=>game.pms?.cases.run('conditions')},
    rewards:{name:'rewards',title:'Rozluštění a energie',icon:'fa-solid fa-square-check',button:true,visible:game.user.isGM,onChange:()=>game.pms?.openRewards()},
    caseEditor:{name:'caseEditor',title:'Editor případů',icon:'fa-solid fa-feather',button:true,visible:game.user.isGM,onChange:()=>game.pms?.openCaseEditor()},
    caseTools:{name:"caseTools",title:"Podklady a příprava",icon:"fa-solid fa-folder-open",button:true,visible:game.user.isGM,onChange:event=>game.pms?.caseMenu.open(event)}
  }};
});
