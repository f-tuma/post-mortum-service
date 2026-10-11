import {escape as esc} from './board-view.mjs';
import {firstSheetPosition} from './sheet-ui.mjs';
import {HubParallax,HubPresence,hubCamera,hubConstrainView,HUB_BACKGROUND_DEPTH} from './hub-atmosphere.mjs';
import {HubPanEasing} from './hub-pan.mjs';
import {publicOfferProfile} from './case-catalog.mjs';
import {presentScene} from './scene-transition.mjs';
import {caseRemoved} from './case-lifecycle.mjs';

export const HUB_ACTIONS={cases:{label:'Případy',icon:'book-open'},mhd:{label:'MHD',icon:'train-subway'},archive:{label:'Archiv',icon:'boxes-stacked'},board:{label:'Tabule',icon:'thumbtack'}};
export const HUB_LEVEL='pmsHubGround0001';
export const HUB_SIZE={width:2800,height:1200};
export const HUB_ART='systems/pms/assets/hub/';
export const HUB_LAYERS=[
 {id:'pmsHubInterior01',key:'interior',name:'Vnitřek · architektura',asset:'sector-interior-v4.png',depth:.004},
 {id:'pmsHubShadows001',key:'shadows',name:'Vybavení · kontaktní stíny',asset:'sector-shadows-v2.png',depth:.002},
 {id:'pmsHubEquipment1',key:'archive',name:'Vybavení · archiv',asset:'sector-archive-v2.png',depth:.002,registration:{source:[1355,1160],bounds:[76,11,1291,1115],target:[180,90,960,850]}},
 {id:'pmsHubCounter001',key:'cases',name:'Vybavení · recepce',asset:'sector-counter-v2.png',depth:.002,registration:{source:[1916,821],bounds:[265,55,1788,730],target:[1150,540,1800,825]}},
 {id:'pmsHubTram000001',key:'mhd',name:'MHD · vůz',asset:'sector-mhd-v2.png',depth:HUB_BACKGROUND_DEPTH,registration:{source:[1915,821],bounds:[1273,267,1626,661],target:[2010,505,2250,773]}},
 {id:'pmsHubForeground',key:'foreground',name:'Vnitřek · popředí',asset:'sector-foreground-v3.png',depth:.025,geometry:{x:-440,y:-100,width:3484,height:1400}}
];
export function hubSceneData(){return {
 name:'Sektor PMS',...HUB_SIZE,padding:0,grid:{type:0,size:100,distance:1,units:'m'},tokenVision:false,'fog.mode':0,
 navigation:true,ownership:{default:2},initial:{x:1400,y:600,scale:.6},initialLevel:HUB_LEVEL,
 environment:{darknessLevel:0,globalLight:{enabled:true,bright:true}},
 levels:[{_id:HUB_LEVEL,name:'Sektor PMS',elevation:{bottom:0,top:null},background:{src:HUB_ART+'sector-exterior-v2.png',color:'#101725'},textures:{fit:'fill'}}],
 flags:{pms:{hubVista:true,hubVersion:7,hubAtmosphere:true}},tiles:[...hubArtTileData(),...hubTileData()],lights:hubLightData()
};}
export function hubLayerGeometry(layer){
 if(layer.geometry)return layer.geometry;const r=layer.registration;if(!r)return {x:0,y:0,...HUB_SIZE};
 const [sw,sh]=r.source,[left,top,right,bottom]=r.bounds,[tx,ty,tr,tb]=r.target,sx=(tr-tx)/(right-left),sy=(tb-ty)/(bottom-top);
 return {x:Math.round(tx-left*sx),y:Math.round(ty-top*sy),width:Math.round(sw*sx),height:Math.round(sh*sy)};
}
export function hubArtTileData(){return HUB_LAYERS.map((l,i)=>({_id:l.id,name:l.name,...hubLayerGeometry(l),levels:[HUB_LEVEL],elevation:0,sort:i*100,
 alpha:1,hidden:false,locked:true,texture:{src:HUB_ART+l.asset,fit:'fill',anchorX:0,anchorY:0},restrictions:{light:false,weather:false},occlusion:{modes:[],alpha:1},
 flags:{pms:{hubLayer:{key:l.key,depth:l.depth}}}}));}
/** Native AmbientLights: GM can move, recolour and animate them with Foundry tools. */
export function hubLightData(){return [
 {id:'pmsHubLight00001',name:'Archiv · stolní lampa',x:.276,y:.55,dim:2.4,bright:.25,color:'#e8bb77',alpha:.16},
 {id:'pmsHubLight00002',name:'Pověření · lampa',x:.438,y:.514,dim:2.5,bright:.3,color:'#e8bb77',alpha:.16},
 {id:'pmsHubLight00003',name:'Mosazná sféra',x:.5,y:.14,dim:3.6,bright:.3,color:'#dcb979',alpha:.1},
 {id:'pmsHubLight00004',name:'MHD · nástupiště',x:.781,y:.51,dim:2.8,bright:.2,color:'#86bdb7',alpha:.12},
 {id:'pmsHubLight00005',name:'Hala · levá lucerna',x:.324,y:.28,dim:1.5,bright:.1,color:'#e8bb77',alpha:.1},
 {id:'pmsHubLight00006',name:'Hala · pravá lucerna',x:.682,y:.3,dim:1.5,bright:.1,color:'#e8bb77',alpha:.1}
].map(({id,x,y,...config})=>{const {name,...light}=config;return {_id:id,name,x:Math.round(x*HUB_SIZE.width),y:Math.round(y*HUB_SIZE.height),levels:[HUB_LEVEL],elevation:0,walls:false,locked:true,
 config:{...light,attenuation:.8,luminosity:.1,animation:{type:'torch',speed:1,intensity:1}},flags:{pms:{hubLight:true}}};});}
/** Interaction zones are ordinary Tiles, linked to the depth of their illustrated place. */
export function hubTileData(){return [
 {_id:'pmsHubArchive001',action:'archive',layer:'archive',label:'Archiv',hint:'Úvod do sektoru, pověření a nálezy',x:240,y:170,width:670,height:670},
 {_id:'pmsHubCases00001',action:'cases',layer:'cases',label:'Případy',hint:'Pověření pro další výpravu',x:1140,y:590,width:650,height:250},
 {_id:'pmsHubMhd0000001',action:'mhd',layer:'mhd',label:'MHD',hint:'Příprava Avatarů a společný odjezd',x:1980,y:510,width:330,height:330}
].map(({action,layer,label,hint,...tile})=>({...tile,name:label,levels:[HUB_LEVEL],elevation:0,alpha:0,hidden:false,locked:true,texture:{src:'icons/svg/circle.svg'},flags:{pms:{hubHotspot:{action,layer,label,hint}}}}));}
/** Upgrade the stock vista once; custom panoramas and additional native documents survive. */
export async function upgradeHubVista(scene){
 const version=scene.getFlag('pms','hubVersion')??1;
 if(version>=7){
  const interior=scene.tiles.get('pmsHubInterior01');
  if(!['sector-interior-v2.png','sector-interior-v3.png'].some(asset=>interior?.texture.src===HUB_ART+asset))return false;
  // Replace only the stock illustration; preserve all manual placement and parallax settings.
  await scene.updateEmbeddedDocuments('Tile',[{_id:interior.id,'texture.src':HUB_ART+'sector-interior-v4.png'}]);return true;
 }
 const level=scene.levels?.get(HUB_LEVEL);
 if(version>=2){
  if(level?.background.src!==HUB_ART+'sector-exterior-v2.png')return false;
  await scene.updateEmbeddedDocuments('Level',[{_id:HUB_LEVEL,'background.color':'#101725'}]);
  const update=hubArtTileData().filter(d=>scene.tiles.get(d._id)).map(data=>{
   const existing=scene.tiles.get(data._id);
   // Move only the previous stock frame. Keep any manual placement of native Tiles.
   const oldFrame=data.flags.pms.hubLayer.key==='foreground'&&existing.x===-200&&existing.y===-100&&existing.width===3200&&existing.height===1400;
   if(!oldFrame)for(const key of ['x','y','width','height','rotation'])delete data[key];
   return data;
  });await scene.updateEmbeddedDocuments('Tile',update);
  const create=hubArtTileData().filter(d=>!scene.tiles.get(d._id));if(create.length)await scene.createEmbeddedDocuments('Tile',create,{keepId:true});
  await scene.update({'flags.pms.hubVersion':7});return true;
 }
 const pending=scene.getFlag('pms','hubVistaUpgrade');
 if(!level||(level.background.src!==HUB_ART+'sector-v1.png'&&!pending))return false;
 const old=pending??{width:scene.width,height:scene.height,level:level.toObject(),tiles:scene.tiles.filter(t=>t.getFlag('pms','hubHotspot')).map(t=>t.toObject())};
 if(!pending)await scene.update({'flags.pms.hubVistaUpgrade':old});
 const create=[],update=[];
 for(const data of [...hubArtTileData(),...hubTileData()]){
  const existing=scene.tiles.get(data._id);if(existing)update.push(data);else create.push(data);
 }
 if(create.length)await scene.createEmbeddedDocuments('Tile',create,{keepId:true});
 if(update.length)await scene.updateEmbeddedDocuments('Tile',update);
 const lights=hubLightData().filter(d=>!scene.lights.get(d._id));if(lights.length)await scene.createEmbeddedDocuments('AmbientLight',lights,{keepId:true});
 await scene.updateEmbeddedDocuments('Level',[{_id:HUB_LEVEL,'background.src':HUB_ART+'sector-exterior-v2.png','background.color':'#101725'}]);
 await scene.update({...HUB_SIZE,initial:{x:1400,y:600,scale:.6},'environment.globalLight.enabled':true,'environment.globalLight.bright':true,
  'flags.pms.hubVersion':7,'flags.pms.hubPreviousVista':old,'flags.pms.hubVistaUpgrade':null});return true;
}

export function hubHotspots(scene,levelId=null){
 if(!scene?.getFlag('pms','hubVista'))return [];
 return [...scene.tiles].flatMap(tile=>{
  const config=tile.getFlag('pms','hubHotspot');
  if(tile.hidden||(levelId&&tile.levels?.size&&!tile.levels.has(levelId))||(levelId&&Array.isArray(tile.levels)&&tile.levels.length&&!tile.levels.includes(levelId))||!Object.hasOwn(HUB_ACTIONS,config?.action??'')||![tile.x,tile.y,tile.width,tile.height,tile.rotation??0].every(Number.isFinite)||tile.width<=0||tile.height<=0)return [];
  return [{tile,action:config.action,label:String(config.label||HUB_ACTIONS[config.action].label).slice(0,80),hint:String(config.hint??'').slice(0,180),layer:['interior','archive','cases','mhd','foreground'].includes(config.layer)?config.layer:config.action}];
 });
}
/** Use the native camera transform, so zoom and pan keep hit regions attached to the illustration. */
export function projectHubRect(tile,project){
 const cx=tile.x+tile.width/2,cy=tile.y+tile.height/2,r=(tile.rotation??0)*Math.PI/180;
 const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{const dx=x*tile.width/2,dy=y*tile.height/2;return project({x:cx+dx*Math.cos(r)-dy*Math.sin(r),y:cy+dx*Math.sin(r)+dy*Math.cos(r)});});
 const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));
 return {left,top,width:Math.max(...corners.map(p=>p.x))-left,height:Math.max(...corners.map(p=>p.y))-top};
}

export function hubPointInTile(point,tile,offset={x:0,y:0}){
 const cx=tile.x+offset.x+tile.width/2,cy=tile.y+offset.y+tile.height/2,r=-(tile.rotation??0)*Math.PI/180,dx=point.x-cx,dy=point.y-cy;
 const x=dx*Math.cos(r)-dy*Math.sin(r),y=dx*Math.sin(r)+dy*Math.cos(r);return Math.abs(x)<=tile.width/2&&Math.abs(y)<=tile.height/2;
}

export function publicCaseOffer(data){return {
 name:data.title,ownership:{default:data.draftOnly?0:2},flags:{core:{sheetClass:'pms.PMSCaseOfferJournal'},pms:{kind:'caseOffer',caseId:data.id,offerVersion:data.contentVersion,offerProfile:publicOfferProfile(data)}},
 pages:[{name:'Pověření',type:'text',title:{show:true,level:1},text:{format:1,content:`<h2>${esc(data.title)}</h2><p><em>${esc(data.avatarCatalog.setting)}</em></p><p>${esc(data.intro).replaceAll('\n','<br>')}</p><h3>Vstup do reality</h3><p>Skupina zvolí případ a vypravěč připraví společný odjezd v MHD. V první výpravě tvoříte nové Avatary. Pro odrazy zůstávají vaše postavy a již zaplacená hodnota.</p>`}}]
};}

export class HubVistaService {
 constructor(){this.root=null;this.returnedVisit=null;this.busy=false;}
 get scene(){return game.scenes.find(s=>s.getFlag('pms','hubVista'));}
 async ensure(){
  if(!game.pms?.visits.isAuthority)throw new Error('Sektor připravuje hlavní připojený vypravěč.');
  this.installing??=(async()=>{if(!this.scene)await Scene.create(hubSceneData(),{keepId:true});else await upgradeHubVista(this.scene);})().finally(()=>{this.installing=null;});await this.installing;return this.scene;
 }
 async enter(){
  if(game.pms?.visits.state?.status==='active')throw new Error('Nejdřív dokončete návštěvu reality.');
  const scene=this.scene??(game.user.isGM?await this.ensure():null);
  if(!scene)throw new Error('Vypravěč nejdřív připraví sektor PMS.');
  await presentScene(scene,{activate:game.pms.visits.isAuthority});canvas.tokens.activate();
 }
 async returnFromVisit(visit){
  if(!this.scene||!game.pms.visits.isAuthority||visit.status!=='returned'||this.returnedVisit===visit.id)return;
  await presentScene(this.scene,{activate:true});this.returnedVisit=visit.id;
 }
 async parkForReset(caseId){
  if(!game.pms?.visits.isAuthority)throw new Error('Obnovu scén řídí hlavní okno vypravěče.');
  // Replacing visible native Levels also destroys their canvas textures. Leave
  // the case before restoring its documents, including on an interrupted retry.
  const belongs=scene=>scene?.getFlag('pms','caseBundle')===caseId;
  if(!belongs(game.scenes.active)&&!belongs(canvas.scene))return;
  const sector=this.scene??await this.ensure();
  await presentScene(sector,{activate:true});
 }
 async publishOffer(data,{update=false}={}){
  if(!game.pms?.visits.isAuthority)throw new Error('Pověření vydává hlavní okno vypravěče.');
  if(caseRemoved(data.id))return null;
  const existing=game.journal.find(d=>d.getFlag('pms','kind')==='caseOffer'&&d.getFlag('pms','caseId')===data.id);
  if(existing){if(update||existing.getFlag('pms','offerVersion')!==data.contentVersion){const offer=publicCaseOffer(data);await existing.update({name:offer.name,ownership:offer.ownership,'flags.pms.offerProfile':publicOfferProfile(data)});const pages=offer.pages.map((p,i)=>({...p,_id:existing.pages.contents[i]?.id}));for(const p of pages){if(p._id)await existing.updateEmbeddedDocuments('JournalEntryPage',[p]);else await existing.createEmbeddedDocuments('JournalEntryPage',[p]);}await existing.setFlag('pms','offerVersion',data.contentVersion);}else if(!existing.getFlag('pms','offerProfile'))await existing.setFlag('pms','offerProfile',publicOfferProfile(data));return existing;}return JournalEntry.create({...publicCaseOffer(data),folder:game.pms?.catalog?.guide?.folder?.id??null});
 }
 async openCases(){
  if(game.pms?.caseCatalog)return game.pms.caseCatalog.render({force:true});
  const offers=game.journal.filter(d=>d.getFlag('pms','kind')==='caseOffer'&&d.testUserPermission(game.user,'OBSERVER'));
  if(!offers.length){if(game.user.isGM)return game.pms.cases.importDialog();ui.notifications.info('Vypravěč zatím nepřipravil žádné pověření.');return;}
  if(offers.length===1)return offers[0].sheet.render({force:true});
  // The catalog is a native Journal, with native navigation and links into individual offers.
  const journal=new JournalEntry({name:'PMS · nabídka případů',ownership:{default:2},flags:{core:{sheetClass:'pms.PMSCaseOfferJournal'}},pages:offers.map((offer,i)=>({name:offer.name,type:'text',sort:i*1000,title:{show:true,level:1},text:{format:1,content:`<h2>${esc(offer.name)}</h2><p><a class="content-link" data-uuid="JournalEntry.${esc(offer.id)}"><i class="fa-solid fa-book-open"></i> Otevřít pověření</a></p>${offer.pages.contents.map(p=>p.text.content).join('')}`}}))});
  return new PMSCaseOfferJournal({document:journal}).render({force:true});
 }
 async activate(action){
  if(!Object.hasOwn(HUB_ACTIONS,action))throw new Error('Neznámá interakce sektoru.');
  if(this.busy)return;this.busy=true;
  try{
   if(action==='cases')return await this.openCases();
   if(action==='mhd')return await game.pms.openAvatarCreation();
   if(action==='board')return await game.pms.openBoard();
   if(game.pms.openSectorArchive)return await game.pms.openSectorArchive();
   game.pms.board.view.archiveHidden=false;return await game.pms.openBoard();
  }finally{this.busy=false;}
 }
 mount(){
  const focused=this.root?.contains(document.activeElement)?document.activeElement.dataset.hubTile:null;
  this.unmount();const hotspots=hubHotspots(canvas.scene,canvas.level?.id);if(!canvas.scene?.getFlag('pms','hubVista'))return;
  const root=document.createElement('div');root.className='pms-hub-vista';root.setAttribute('aria-label','Interakce sektoru PMS');
  // Keep native button/Tab behavior while a hotspot is focused, without firing
  // Foundry's window-level canvas shortcuts or leaving previously held keys down.
  root.addEventListener('focusin',()=>game.keyboard?.releaseKeys());
  for(const event of ['keydown','keyup'])root.addEventListener(event,e=>e.stopPropagation());
  this.buttons=hotspots.map(spot=>{const button=document.createElement('button');button.type='button';button.className='pms-hub-hit';button.dataset.hubAction=spot.action;button.dataset.hubTile=spot.tile.id;button.setAttribute('aria-label',`${spot.label}. ${spot.hint}`);button.innerHTML=`<span class="pms-hub-hit-label"><i class="fa-solid fa-${HUB_ACTIONS[spot.action].icon}" aria-hidden="true"></i><b>${esc(spot.label)}</b><small>${esc(spot.hint)}</small></span>`;
   button.addEventListener('click',()=>this.activate(spot.action).catch(e=>ui.notifications.warn(e.message)));
   const presence=new HubPresence(active=>{button.classList.toggle('is-active',active);this.hovered=(this.buttons?.find(b=>b.presence.pointer)??this.buttons?.find(b=>b.presence.focus))?.spot??null;Hooks.callAll('pmsHubHover',spot.tile,active,{layer:spot.layer,mesh:this.parallax?.layers?.find(l=>l.key===spot.layer)?.mesh});});
   for(const [event,kind,value] of [['focus','focus',true],['blur','focus',false]])button.addEventListener(event,()=>presence.set(kind,value));
   root.append(button);return {button,tile:spot.tile,presence,spot};});
  const footer=document.createElement('div');footer.className='pms-hub-caption';footer.innerHTML='<span>Sektor PMS</span><p>Vyber místo · pohled posuneš pravým tažením</p><strong data-hub-energy></strong>';root.append(footer);
  document.body.append(root);this.root=root;
  const controls=document.createElement('div');controls.className='pms-hub-tools';
  controls.innerHTML=`<button type="button" data-hub-foundry aria-pressed="false"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> ${game.user.isGM?'Nástroje Foundry':'Rozhraní Foundry'}</button>`;
  controls.querySelector('button').addEventListener('click',()=>this.toggleTools());root.append(controls);
  if(canvas.scene.getFlag('pms','hubVersion')>=2){
   this.parallax=new HubParallax({canvas,document,window,enabled:()=>game.settings.get('pms','hubMotion')&&canvas.scene.getFlag('pms','hubAtmosphere')!==false,editing:()=>this.editing(),covered:()=>!!this.root?.inert||!!game.pms?.board.rendered||!!game.pms?.avatarWizard.rendered,onFrame:()=>this.position()});this.parallax.mount();
  }
  this.panEasing=new HubPanEasing({canvas,constrain:position=>{const {sceneX,sceneY}=canvas.dimensions,screen=canvas.app.screen;const bounded=hubConstrainView({...position,x:position.x-sceneX,y:position.y-sceneY},canvas.scene.width,canvas.scene.height,screen.width,screen.height);return {...bounded,x:bounded.x+sceneX,y:bounded.y+sceneY};},enabled:()=>!this.editing()&&!this.root?.inert&&game.settings.get('pms','hubMotion')&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches});this.panEasing.mount();
  this.bindCanvas();this.immersive();this.fit();
  this.position();this.energy();if(focused&&!root.hidden&&!root.inert)this.buttons.find(b=>b.tile.id===focused)?.button.focus({preventScroll:true});
 }
 position(){
  if(!this.root||!canvas.ready||!canvas.stage)return;
  for(const {button} of this.buttons)button.hidden=this.editing();
  const view=canvas.app.view,rect=view.getBoundingClientRect(),screen=canvas.app.screen;
  const project=point=>{const p=canvas.stage.toGlobal({x:canvas.dimensions.sceneX+point.x,y:canvas.dimensions.sceneY+point.y});return {x:rect.left+p.x*rect.width/screen.width,y:rect.top+p.y*rect.height/screen.height};};
  for(const {button,tile,spot} of this.buttons){const offset=this.parallax?.offset(spot.layer)??{x:0,y:0};const box=projectHubRect({...tile,x:tile.x+offset.x,y:tile.y+offset.y,width:tile.width,height:tile.height,rotation:tile.rotation},project);Object.assign(button.style,Object.fromEntries(Object.entries(box).map(([key,value])=>[key,`${value}px`])));button.hidden=this.editing()||box.left+box.width<rect.left||box.left>rect.right||box.top+box.height<rect.top||box.top>rect.bottom;const label=button.querySelector('.pms-hub-hit-label'),half=Math.min(120,rect.width/2-16);label.style.left=`${Math.max(rect.left+half+16,Math.min(rect.right-half-16,box.left+box.width/2))-box.left}px`;}
 }
 bindCanvas(){
  const view=canvas.app.view;this.canvasView=view;
  this.canvasHover=e=>{
   if(this.editing()||this.root?.inert)return;
   const r=view.getBoundingClientRect(),screen=canvas.app.screen,p=canvas.stage.toLocal({x:(e.clientX-r.left)*screen.width/r.width,y:(e.clientY-r.top)*screen.height/r.height});
   const point={x:p.x-canvas.dimensions.sceneX,y:p.y-canvas.dimensions.sceneY};
   const hit=this.buttons.find(b=>hubPointInTile(point,b.tile,this.parallax?.offset(b.spot.layer)));
   for(const b of this.buttons)b.presence.set('pointer',b===hit);return hit;
  };
  this.canvasDown=e=>{if(e.button===2)this.panEasing.dragging=true;if(e.button===0)this.leftDown={x:e.clientX,y:e.clientY,tile:this.canvasHover(e)?.tile.id};};
  this.canvasUp=e=>{if(e.button===2)this.panEasing.dragging=false;const down=this.leftDown;this.leftDown=null;if(e.button!==0||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;const hit=this.canvasHover(e);if(hit&&hit.tile.id===down.tile)this.activate(hit.spot.action).catch(error=>ui.notifications.warn(error.message));};
  this.canvasLeave=()=>{if(this.panEasing)this.panEasing.dragging=false;for(const b of this.buttons)b.presence.set('pointer',false);};
  this.canvasWheel=e=>{if(!this.editing()){e.preventDefault();e.stopImmediatePropagation();}};
  view.addEventListener('wheel',this.canvasWheel,{capture:true,passive:false});
  for(const [event,fn] of [['pointermove',this.canvasHover],['pointerdown',this.canvasDown],['pointerup',this.canvasUp],['pointerleave',this.canvasLeave]])view.addEventListener(event,fn);
 }

 energy(){const value=game.pms?.avatars.state?.energy;const node=this.root?.querySelector('[data-hub-energy]');if(node)node.textContent=value===undefined?'':`${value} energie · společná zásoba`;}
 editing(){return Boolean(game.user.isGM&&canvas.activeLayer===canvas.tiles);}
 immersive(){document.body.classList.toggle('pms-hub-immersive',!!this.root&&!this.nativeTools&&!this.editing());this.root?.classList.toggle('is-native-tools',!!this.nativeTools);this.root?.querySelector('[data-hub-foundry]')?.setAttribute('aria-pressed',String(!!this.nativeTools));}
 toggleTools(){this.nativeTools=!this.nativeTools;if(!this.nativeTools)canvas.tokens.activate();this.immersive();this.parallax?.sync();if(!this.nativeTools)this.fit();this.position();}
 fit(){if(!this.root||!canvas.ready||this.nativeTools||this.editing()||this.fitting)return;this.fitting=true;try{const {width,height}=canvas.scene,{width:sw,height:sh}=canvas.app.screen;const view=hubCamera(width,height,sw,sh);canvas.pan({...view,x:view.x+canvas.dimensions.sceneX,y:view.y+canvas.dimensions.sceneY});}finally{this.fitting=false;}}
 pan(){
  if(!this.root)return;
  if(!this.editing()&&!this.constraining){
   const {sceneX,sceneY}=canvas.dimensions,{width,height}=canvas.scene,screen=canvas.app.screen,current={x:canvas.stage.pivot.x-sceneX,y:canvas.stage.pivot.y-sceneY,scale:canvas.stage.scale.x};
   const bounded=hubConstrainView(current,width,height,screen.width,screen.height);
   if(['x','y','scale'].some(k=>Math.abs(bounded[k]-current[k])>1e-6)){this.constraining=true;try{canvas.pan({...bounded,x:bounded.x+sceneX,y:bounded.y+sceneY});}finally{this.constraining=false;}return;}
  }
  this.parallax?.pan();this.position();
 }

 refresh(){this.immersive();this.parallax?.sync();this.position();}
 unmount(){this.panEasing?.destroy();this.panEasing=null;if(this.canvasView){this.canvasView.removeEventListener('wheel',this.canvasWheel,true);for(const [event,fn] of [['pointermove',this.canvasHover],['pointerdown',this.canvasDown],['pointerup',this.canvasUp],['pointerleave',this.canvasLeave]])this.canvasView.removeEventListener(event,fn);}this.canvasView=null;this.leftDown=null;for(const b of this.buttons??[])b.presence.clear();this.parallax?.destroy();this.parallax=null;this.hovered=null;this.root?.remove();this.root=null;this.buttons=[];document.body.classList.remove('pms-hub-immersive');}
}

export class PMSCaseOfferJournal extends foundry.applications.sheets.journal.JournalEntrySheet {
 static DEFAULT_OPTIONS={classes:['pms-case-guide'],position:{width:1040,height:780},actions:{prepareCase:async function(){try{await game.pms.cases.select(this.document.getFlag('pms','caseId'));await game.pms.openAvatarCreation();}catch(e){ui.notifications.warn(e.message);}}}};
 get isEditable(){return false;}
 async _onFirstRender(context,options){await super._onFirstRender(context,options);this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));}
 async _prepareContext(options){const c=await super._prepareContext(options);for(const p of Object.values(c.pages??{}))p.editable=false;return c;}
 _getHeaderControls(){const controls=super._getHeaderControls().filter(c=>!['showPlayers','configCategories','configureOwnership','configureSheet'].includes(c.action));return game.user.isGM&&this.document.getFlag('pms','caseId')?[{action:'prepareCase',icon:'fa-solid fa-train-subway',label:'Připravit tento případ v MHD'},...controls]:controls;}
 async _onEditPage(){}
}

export function registerHubHooks(){
 game.settings.register('pms','hubMotion',{name:'Jemný pohyb v sektoru PMS',hint:'Paralaxa obrazových vrstev při posunu nativní kamery pravým tažením. Respektuje omezení pohybu systému. Světla a jejich animace se nastavují nativně ve Foundry.',scope:'client',config:true,type:Boolean,default:true,onChange:()=>game.pms?.hub.parallax?.sync()});
 Hooks.on('canvasReady',()=>game.pms?.hub.mount());Hooks.on('canvasTearDown',()=>game.pms?.hub.unmount());Hooks.on('canvasPan',()=>game.pms?.hub.pan());
 Hooks.on('activateCanvasLayer',()=>game.pms?.hub.refresh());
 for(const event of ['renderBoardApplication','closeBoardApplication','renderAvatarCreationApplication','closeAvatarCreationApplication'])Hooks.on(event,()=>game.pms?.hub.parallax?.sync());
 for(const event of ['createTile','updateTile','deleteTile'])Hooks.on(event,tile=>{if(tile.parent?.id===canvas.scene?.id)game.pms?.hub.mount();});
 Hooks.on('updateScene',scene=>{if(scene.id===canvas.scene?.id)game.pms?.hub.mount();});
 // A GM can also add a hotspot to any native Tile without a separate scene editor.
 Hooks.on('renderTileConfig',(app,element)=>{
  if(!app.document.parent?.getFlag('pms','hubVista'))return;
  const root=element instanceof HTMLElement?element:element[0],form=root.querySelector('form')??root;
  if(form.querySelector('.pms-hub-tile-options'))return;
  const config=app.document.getFlag('pms','hubHotspot')??{},layer=app.document.getFlag('pms','hubLayer')??{},section=document.createElement('fieldset');section.className='pms-hub-tile-options';
  section.innerHTML=`<legend>Interakce sektoru PMS</legend><div class="form-group"><label>Otevřít</label><div class="form-fields"><select name="flags.pms.hubHotspot.action"><option value="">Bez interakce</option>${Object.entries(HUB_ACTIONS).map(([id,a])=>`<option value="${id}" ${config.action===id?'selected':''}>${a.label}</option>`).join('')}</select></div></div><div class="form-group"><label>Název místa</label><div class="form-fields"><input name="flags.pms.hubHotspot.label" value="${esc(config.label??'')}" maxlength="80"></div></div><div class="form-group"><label>Krátká nápověda</label><div class="form-fields"><input name="flags.pms.hubHotspot.hint" value="${esc(config.hint??'')}" maxlength="180"></div></div>`;
  section.insertAdjacentHTML('beforeend',`<div class="form-group"><label>Vrstva místa</label><div class="form-fields"><select name="flags.pms.hubHotspot.layer"><option value="">Podle akce</option>${HUB_LAYERS.map(l=>`<option value="${l.key}" ${config.layer===l.key?'selected':''}>${l.name}</option>`).join('')}</select></div></div>${layer.key?`<div class="form-group"><label>Hloubka paralaxy</label><div class="form-fields"><input type="number" name="flags.pms.hubLayer.depth" min="0" max="1" step="0.001" value="${Number(layer.depth)||0}"></div><p class="hint">0 stojí, 1 označuje nejbližší popředí.</p></div>`:''}`);
  const main=root.querySelector('[data-tab="basic"]')??form;main.append(section);
 });
 window.addEventListener('resize',()=>{game.pms?.hub.fit();game.pms?.hub.position();});
 Hooks.on('renderSceneConfig',(app,element)=>{
  if(!app.document.getFlag('pms','hubVista'))return;
  const root=element instanceof HTMLElement?element:element[0],target=root.querySelector('[data-tab="ambience"]')??root.querySelector('form')??root;
  if(root.querySelector('.pms-hub-scene-options'))return;
  const section=document.createElement('div');section.className='form-group pms-hub-scene-options';section.innerHTML=`<label>Paralaxa sektoru PMS</label><div class="form-fields"><input type="checkbox" name="flags.pms.hubAtmosphere" ${app.document.getFlag('pms','hubAtmosphere')!==false?'checked':''}></div><p class="hint">Pohyb registrovaných obrazových vrstev. Světla a efekty upravujte nativními nástroji Foundry.</p>`;target.append(section);
 });
}
