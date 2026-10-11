import { escape as esc } from "./board-view.mjs";
import { VITALS, SKILLS, OUTCOMES, actionPreview, canOfferAction } from "./visit-state.mjs";
import {rollDescription,successTarget,firstSheetPosition,caseDisplayName,clueArchiveStatus,sharedClueOwnership,characterHeading} from "./sheet-ui.mjs";
import {npcPreparation,npcSections,npcSectionGroups} from "./npc-sheet.mjs";
import {captureFocus,restoreFocus} from './ui-focus.mjs';
import {caseTime} from './case-clock.mjs';
import {automaticNpcToken} from './npc-token-art.mjs';
const ranks=["Neutrální","Zkušený","Mistr"];
const icons={movement:"boot",stealth:"user-ninja",perception:"eye",analysis:"magnifying-glass",negotiation:"comment",knowledge:"book-open",craft:"screwdriver-wrench",combat:"khanda"};
const input=(name,label,value,area=false)=>`<label><span>${label}</span>${area?`<textarea name="${name}">${esc(value??"")}</textarea>`:`<input name="${name}" value="${esc(String(value??""))}">`}</label>`;
async function saveSheet(event,form,formData) {
  if(!this.isEditable || (event.type==="change"&&!event.target.name))return;
  const data=foundry.utils.expandObject(formData.object);
  const linked=game.pms?.visits.state;
  if(this.document.documentName==="Actor" && linked?.status==="active" && linked.avatars.some(a=>a.actorId===this.document.id)) {
    for(const key of ["vitals","skills","alive","food"])if(data.system)delete data.system[key];
  }
  if(data.system && this.document.type==="clue")delete data.system.published;
  await this.document.update(data);
}
export class PMSActorSheet extends foundry.applications.sheets.ActorSheetV2 {
  static DEFAULT_OPTIONS={classes:["pms-actor-sheet"],position:{width:1000,height:940},window:{resizable:true},form:{handler:saveSheet,submitOnChange:true,closeOnSubmit:false}};
  constructor(options){super(options);this.tab="character";this.npcTab="personality";this.npcDetails=new Map();this.editing=false;this.drafts=new Map();this.unsubscribe=game.pms?.visits.onChange(()=>{if(this.rendered)this.render({force:true});});}
  get title(){return this.actor.name;}
  async _onFirstRender(context,options){await super._onFirstRender(context,options);this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));}
  get roster(){const s=game.pms?.visits.state;return s?.avatars.find(a=>a.actorId===this.actor.id);}
  async _renderHTML(){const root=document.createElement("div");root.innerHTML=this.markup();return root.firstElementChild;}
  _replaceHTML(result,content){
    this.focusSnapshot=captureFocus(this.element);
    const focused=document.activeElement;
    this.editValue=content.contains(focused)&&focused.matches('input[name],textarea[name]')?{name:focused.name,value:focused.value}:null;
    const old=content.querySelector('.pms-character');
    const same=old?.dataset.activeTab===this.tab && old?.dataset.activeNpcTab===this.npcTab;
    const main=same?old.querySelector('.pms-character-main')?.scrollTop??0:0;
    const rail=old?.querySelector('.pms-portrait-rail')?.scrollTop??0;
    old?.querySelectorAll('[data-npc-detail]').forEach(detail=>this.npcDetails.set(detail.dataset.npcDetail,detail.open));
    content.replaceChildren(result);
    content.querySelectorAll('[data-npc-detail]').forEach(detail=>{detail.open=this.npcDetails.get(detail.dataset.npcDetail)??false;});
    const next=content.querySelector('.pms-character-main');if(next)next.scrollTop=main;
    const portrait=content.querySelector('.pms-portrait-rail');if(portrait)portrait.scrollTop=rail;
  }
  markup(){
    const actor=this.actor, sys=actor.system, s=game.pms?.visits.state, av=this.roster, active=av&&s.status==="active", values=active?av:sys;
    const editable=this.isEditable&&!active;
    const portrait=actor.img===CONST.DEFAULT_TOKEN?"systems/pms/assets/avatar.svg":actor.img;
    const kind=actor.type==="npc"?"Postava případu":values.alive===false?"Duše":"Avatar";
    const profile=actor.type==="npc";
    return `<div class="pms-character" data-character-kind="${actor.type}" data-active-tab="${this.tab}" data-active-npc-tab="${this.npcTab}"><aside class="pms-portrait-rail"><img src="${esc(portrait)}" alt="Portrét ${esc(actor.name)}" ${this.isEditable?'data-action="editImage" data-edit="img"':''}><dl>${[["Původ",sys.origin],["Motivace",sys.motivation],["Kontakt",sys.contact]].filter(([,value])=>!profile||String(value??"").trim()).map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value||"—")}</dd></div>`).join("")}</dl>${profile?this.npcTokenMarkup():""}${actor.type==="avatar"?`<div class="pms-food-count"><i class="fa-solid fa-utensils" aria-hidden="true"></i><span>Porce jídla</span><strong>${values.food}</strong></div>`:""}<nav class="pms-sheet-shortcuts" aria-label="Nástroje případu"><button type="button" data-sheet="board"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i><span>Tabule</span></button>${game.user.isGM?'<button type="button" data-sheet="timeline"><i class="fa-solid fa-clock" aria-hidden="true"></i><span>Časová osa</span></button>':""}</nav></aside><main class="pms-character-main"><header class="pms-character-name"><div><p class="pms-sheet-overline">${kind}</p>${(h=>`<h1 title="${esc(actor.name)}">${esc(h.name)}</h1>${h.role?`<p class="pms-character-role">${esc(h.role)}</p>`:""}`)(characterHeading(actor.name,sys.role))}</div><button type="button" class="pms-sheet-icon-button ${this.editing?"active":""}" data-sheet="edit" aria-label="Upravit postavu" aria-pressed="${this.editing}" title="Upravit postavu" ${!this.isEditable?"disabled":""}><i class="fa-solid fa-pen-nib" aria-hidden="true"></i></button></header><nav class="pms-sheet-tabs" aria-label="Deník postavy">${[["character","Postava"],["inventory","Inventář"],["story","Příběh"]].map(([key,label])=>`<button type="button" data-tab="${key}" class="${this.tab===key?"active":""}" aria-pressed="${this.tab===key}">${label}</button>`).join("")}</nav>
    ${this.editing?`<section class="pms-sheet-editor" aria-label="Úprava postavy">${input("name","Jméno",actor.name)}${input("system.role",profile?"Role":"Povolání",sys.role)}${input("system.origin","Původ",sys.origin)}${input("system.motivation","Motivace",sys.motivation)}${input("system.contact","Kontakt",sys.contact)}${!profile?`<label><span>Porce jídla</span><input type="number" name="system.food" min="0" max="100" value="${values.food}" ${!editable?"disabled":""}></label>`:""}<p>${active?"Kondici během výpravy spravují akce a vypravěč.":"Změny se ukládají do postavy."}</p><button type="submit" class="pms-primary"><i class="fa-solid fa-check" aria-hidden="true"></i>Uložit postavu</button></section>`:""}
    ${this.tab==="character"?`${profile?`${this.npcMarkup()}`:`${active?'<p class="pms-resource-lock"><i class="fa-solid fa-lock" aria-hidden="true"></i>Kondici během výpravy mění akce a vypravěč.</p>':""}<section class="pms-resources" aria-label="Vitálky">${Object.entries(VITALS).map(([k,label])=>{const reserved=(s?.actions??[]).filter(a=>a.avatarId===av?.id&&["ready","running","awaitingRoll"].includes(a.status)).reduce((n,a)=>n+a.spend[k],0);const icon={vitality:"heart",agility:"feather-pointed",intelligence:"eye"}[k];return `<div class="pms-resource ${k}"><div class="pms-resource-value"><span class="pms-resource-icon"><i class="fa-solid fa-${icon}" aria-hidden="true"></i></span><div><span class="pms-resource-label">${label}</span><strong>${values.vitals[k]}<small> / 10</small></strong></div></div><div class="pms-diamonds" aria-label="${label}: ${values.vitals[k]} z 10">${Array.from({length:10},(_,n)=>`<button type="button" class="${n<values.vitals[k]?"filled":""}" data-vital="${k}" data-value="${n+1}" aria-label="${label} ${n+1}" title="${label} ${n+1}" ${!editable?"disabled":""}><span aria-hidden="true"></span></button>`).join("")}</div>${reserved?`<small class="pms-resource-reserved">${reserved} rezervováno</small>`:""}${this.editing&&editable?`<input aria-label="${label}" type="number" name="system.vitals.${k}" min="0" max="10" value="${values.vitals[k]}">`:""}</div>`;}).join("")}</section><section class="pms-skills"><div class="pms-skills-heading"><h2>Dovednosti</h2>${ranks.map(r=>`<small>${r}</small>`).join("")}</div>${Object.entries(SKILLS).map(([k,label])=>`<div class="pms-skill-row"><span class="pms-skill-name"><i class="fa-solid fa-${icons[k]}" aria-hidden="true"></i><span>${label}</span></span>${ranks.map((r,n)=>`<button type="button" data-skill="${k}" data-rank="${n}" aria-label="${label}: ${r}" aria-pressed="${values.skills[k]===n}" class="${values.skills[k]===n?"selected":""}" ${!editable?"disabled":""}><span aria-hidden="true"></span></button>`).join("")}</div>`).join("")}</section>`}${this.actionSection(s,av)}`:this.tab==="inventory"?this.inventoryMarkup():`<section class="pms-story"><h2>Příběh postavy</h2>${this.isEditable?input("system.biography",profile?"Veřejný popis":"Poznámky a minulost",sys.biography,true):`<p class="pms-character-biography">${esc(sys.biography||"Zatím bez zápisu.")}</p>`}${this.isEditable?'<button type="submit" class="pms-primary"><i class="fa-solid fa-check" aria-hidden="true"></i>Uložit zápis</button>':""}${profile&&game.user.isGM?'<p class="pms-sheet-hint">Sem patří veřejný popis. Příprava vypravěče je na záložce Postava.</p>':""}<p class="pms-contact-note"><i class="fa-solid fa-address-book" aria-hidden="true"></i>Kontakt: ${esc(sys.contact||"Nevybraný")}</p></section>`}
    </main></div>`;
  }
  npcTokenMarkup(){
    if(!game.user.isGM)return '';
    const src=(this.actor.isToken?this.actor.token.texture.src:this.actor.prototypeToken.texture.src)||this.actor.img;
    return `<div class="pms-npc-token-preview"><img src="${esc(src)}" alt="Token ${esc(this.actor.name)}"><div><strong>Token</strong><small>${automaticNpcToken(this.actor)?'Z portrétu':'Vlastní obrázek'}</small></div><button type="button" class="pms-sheet-icon-button" data-sheet="npcToken" aria-label="Obnovit token z portrétu" title="Obnovit token z horní části portrétu" ${!this.isEditable||!game.pms?.npcTokens?.isAuthority?'disabled':''}><i class="fa-solid fa-rotate" aria-hidden="true"></i></button></div>`;
  }
  npcMarkup(){
    const publicProfile=`<section class="pms-npc-profile"><h2>Na první pohled</h2><p class="pms-character-biography">${esc(this.actor.system.biography||"Zatím bez zápisu.")}</p></section>`;
    if(!game.user.isGM)return publicProfile;
    const preparation=npcPreparation(this.actor,game.pms?.cases.forCase(this.actor.getFlag('pms','caseBundle')),true);
    if(!preparation)return publicProfile+'<p class="pms-sheet-hint">Tato postava nemá propojenou přípravu případu.</p>';
    const groups=npcSectionGroups(npcSections(foundry.utils.cleanHTML(preparation.content)))
      .map(group=>({...group,sections:group.sections.filter(section=>section.html.trim())}))
      .filter(group=>group.sections.length);
    const group=groups.find(g=>g.key===this.npcTab)??groups[0];
    if(!group)return publicProfile;
    this.npcTab=group.key;
    const facts=group.sections.filter(s=>!s.detail),details=group.sections.filter(s=>s.detail);
    const sectionHeading=s=>`<i class="fa-solid fa-${s.icon}" aria-hidden="true"></i><span>${esc(s.title)}</span>`;
    const panelId=`pms-npc-preparation-${this.actor.id}`;
    return `<section class="pms-npc-briefing" aria-label="Příprava vypravěče"><header><span><i class="fa-solid fa-lock" aria-hidden="true"></i>Příprava vypravěče</span><button type="button" data-npc-guide data-case-id="${esc(this.actor.getFlag('pms','caseBundle'))}" data-page-id="${esc(preparation.pageId)}"><i class="fa-solid fa-book-open" aria-hidden="true"></i>Příručka</button></header>
    <nav class="pms-npc-tabs" aria-label="Oddíly přípravy NPC">${groups.map(g=>`<button type="button" data-npc-tab="${g.key}" aria-pressed="${g.key===this.npcTab}" aria-controls="${panelId}"><i class="fa-solid fa-${g.icon}" aria-hidden="true"></i><span>${g.label}</span></button>`).join('')}</nav>
    <section id="${panelId}" class="pms-npc-panel" aria-label="${group.label}">${group.key==='personality'?publicProfile:''}
    ${facts.length?`<div class="pms-npc-facts">${facts.map(s=>`<section class="pms-npc-fact ${s.wide?'wide':''}" data-tone="${s.tone??'neutral'}"><h3>${sectionHeading(s)}</h3>${s.html}</section>`).join('')}</div>`:''}
    ${details.length?`<div class="pms-npc-details">${details.map(s=>`<details class="pms-npc-detail" data-npc-detail="${esc(s.key)}" data-tone="${s.tone??'neutral'}"><summary>${sectionHeading(s)}</summary><div>${s.html}</div></details>`).join('')}</div>`:''}</section></section>`;
  }
  inventoryMarkup(){return `<section class="pms-inventory"><header><h2>Vodítka a výbava</h2>${this.isEditable?'<button type="button" data-sheet="newItem"><i class="fa-solid fa-plus" aria-hidden="true"></i>Předmět</button>':""}</header><p class="pms-sheet-hint">Přetáhni sem předmět ze seznamu Foundry.</p>${this.actor.items.contents.map(i=>`<article class="draggable pms-inventory-item" draggable="true" data-item-id="${i.id}"><img src="${esc(i.img)}" alt=""><button type="button" data-sheet="item" data-id="${i.id}">${esc(i.name)}<small>${i.type==="clue"?"Vodítko":`Zásoba · ${i.system.quantity}`}</small></button>${i.type==="clue"?`<button type="button" data-sheet="shareClue" data-id="${i.id}" title="Ukázat vodítko skupině" aria-label="Ukázat vodítko skupině"><i class="fa-solid fa-comment" aria-hidden="true"></i></button>`:""}</article>`).join("")||'<div class="pms-empty-inventory">Zatím žádné předměty.</div>'}</section>`;}
  actionSection(s,av){
    if(this.actor.type==="npc")return "";
    if(!av)return '<section class="pms-sheet-actions"><h2>Akce</h2><p>Vypravěč zařadí Avatara do výpravy.</p></section>';
    const actions=s.actions.filter(a=>a.avatarId===av.id), current=actions.filter(a=>!["completed","cancelled"].includes(a.status));
    return `<section class="pms-sheet-actions"><header><h2>${av.alive?"Akce":"Duše"}</h2><span>${caseTime(s.clock,s.end>=1440)}</span>${game.user.isGM&&s.status==="active"?`<button type="button" data-sheet="offer" title="${esc(canOfferAction(s,av)?"Zadej záměr a délku akce":!av.alive?"Duše nemůže konat fyzické akce":"Avatar má rozpracovanou akci nebo nyní čeká na pokračování kola")}" ${canOfferAction(s,av)?"":"disabled"}><i class="fa-solid fa-plus" aria-hidden="true"></i>Zadat akci</button>`:""}</header>${s.status==="returned"?'<p>MHD vrátilo skupinu. Záznam zůstává v deníku.</p>':!av.alive?'<p>Nasloucháš a řešíš případ s ostatními. Se světem už fyzicky neinteraguješ.</p>':""}${current.map(a=>this.actionMarkup(a,av,s)).join("")||'<p class="pms-sheet-hint">Žádná rozpracovaná akce.</p>'}${actions.some(a=>a.result)?`<details class="pms-action-history"><summary>Minulé akce</summary>${actions.filter(a=>a.result).slice().reverse().map(a=>this.actionMarkup(a,av,s)).join("")}</details>`:""}</section>`;
  }
  actionMarkup(a,av,s){
    const draft=this.drafts.get(a.id)??{spend:{vitality:0,agility:0,intelligence:0},recovery:{vitality:3,agility:0,intelligence:0}};this.drafts.set(a.id,draft);
    const preview=actionPreview(a,av,a.status==="offered"?draft.spend:a.spend), own=this.isEditable;
    const state={offered:"Připrav akci",ready:"Připraveno",running:"Probíhá",awaitingRoll:"Čeká na hod",paused:"Přerušeno",completed:"Dokončeno",cancelled:"Zrušeno"};
    return `<article class="pms-sheet-action" data-status="${a.status}" data-action-id="${a.id}" data-action-revision="${a.revision}" aria-label="${esc(a.title)}"><header><i class="fa-solid fa-${a.kind==="rest"?"moon":a.kind==="meal"?"utensils":"magnifying-glass"}"></i><h3>${esc(a.title)}</h3><small>${a.duration} min</small></header><p>${esc(a.goal)}</p><div class="pms-action-meta"><span class="pms-action-status">${state[a.status]}</span>${a.kind==="risk"?`<strong data-preview>${rollDescription(a.result?.diceCount??preview.diceCount,a.result?.difficulty??preview.difficulty)}</strong><small title="Plný úspěch vyžaduje uvedený počet úspěchů. Tolerance připouští částečný úspěch.">${successTarget(a.required)} · tolerance: ${a.tolerance}</small>`:""}</div>${a.status==="offered"&&own?`<div class="pms-allocate">${Object.entries(VITALS).map(([k,label])=>a.kind==="risk"?`<label>${label}<input type="number" data-spend="${k}" value="${draft.spend[k]}" min="0" max="${Math.min(a.caps[k],av.vitals[k])}" aria-label="Útrata: ${label}"><small>max ${Math.min(a.caps[k],av.vitals[k])}</small></label>`:a.kind==="rest"?`<label>${label}<input type="number" data-recovery="${k}" value="${draft.recovery[k]}" min="0" max="3" aria-label="Obnova: ${label}"></label>`:"").join("")}</div><p class="pms-sheet-hint">${a.kind==="risk"?"Vitálky se odečtou při hodu.":a.kind==="rest"?"Rozděl přesně 3 body obnovy.":a.kind==="meal"?"Obnova až po dokončení.":"Akce proběhne po uplynutí času bez hodu."}</p><button type="button" class="pms-primary" data-sheet="confirm" data-id="${a.id}">Potvrdit akci</button>`:""}
    ${a.status==="awaitingRoll"&&own?`<button type="button" class="pms-primary" data-sheet="roll" data-id="${a.id}"><i class="fa-solid fa-dice" aria-hidden="true"></i>Hodit ${preview.diceCount}d6</button>`:""}${a.status==="ready"&&own?`<button type="button" data-sheet="cancel" data-id="${a.id}">Zrušit připravenou akci</button>`:""}${a.status==="running"?`<p>${a.elapsed} / ${a.duration} min</p>${own&&s.pause?.eligible?.includes(av.id)?`<button type="button" data-sheet="interrupt" data-id="${a.id}">Přerušit a reagovat</button>`:""}`:""}${a.status==="paused"?`<p>Hotovo ${a.elapsed} / ${a.duration} min</p>${game.user.isGM?`<button type="button" data-sheet="resume" data-id="${a.id}">Navázat na práci</button>`:""}`:""}${a.result?`<div class="pms-sheet-result"><strong>${OUTCOMES[a.result.category]}</strong><div class="pms-dice-faces">${a.result.dice.map(n=>`<span class="${n>=5?"success":""}">${n}</span>`).join("")}</div><p>${a.result.successes===null?(a.kind==="auto"?"Dokončeno bez hodu":"Obnova dokončena"):`${a.result.successes} úspěchů / potřeba ${a.required}`}</p>${a.consequence?`<blockquote>${esc(a.consequence)}</blockquote>`:""}${game.user.isGM?`<button type="button" data-sheet="consequence" data-id="${a.id}">Popsat následek</button>`:""}</div>`:""}</article>`;
  }
  async _onRender(context,options){await super._onRender(context,options);this.element.tabIndex=-1;this.element.dataset.keyboardFocus='true';if(this.editValue){const input=this.element.querySelector(`[name="${CSS.escape(this.editValue.name)}"]`);if(input)input.value=this.editValue.value;this.editValue=null;}
    this.element.querySelectorAll("[data-tab]").forEach(el=>el.addEventListener("click",()=>{this.tab=el.dataset.tab;this.render({force:true});}));
    this.element.querySelectorAll("[data-npc-tab]").forEach(el=>el.addEventListener("click",()=>{this.npcTab=el.dataset.npcTab;this.render({force:true});}));
    this.element.querySelectorAll("[data-sheet]").forEach(el=>el.addEventListener("click",async()=>{el.disabled=true;try{await this.run(()=>this.command({...el.dataset,renderedRevision:el.closest("[data-action-revision]")?.dataset.actionRevision}));}finally{if(el.isConnected)el.disabled=false;}}));
    this.element.querySelectorAll("[data-npc-guide]").forEach(el=>el.addEventListener("click",event=>{event.preventDefault();this.run(()=>game.pms.cases.showGuide({caseId:el.dataset.caseId??this.actor.getFlag("pms","caseBundle"),pageId:el.dataset.pageId,anchor:el.dataset.anchor}));}));
    this.element.querySelectorAll("[data-vital]").forEach(el=>el.addEventListener("click",()=>this.run(()=>this.actor.update({[`system.vitals.${el.dataset.vital}`]:Number(el.dataset.value)}))));
    this.element.querySelectorAll("[data-skill]").forEach(el=>el.addEventListener("click",()=>this.run(()=>this.actor.update({[`system.skills.${el.dataset.skill}`]:Number(el.dataset.rank)}))));
    this.element.querySelectorAll("[data-spend],[data-recovery]").forEach(el=>el.addEventListener("input",()=>{const card=el.closest("[data-action-id]"),draft=this.drafts.get(card.dataset.actionId);draft[el.dataset.spend?"spend":"recovery"][el.dataset.spend??el.dataset.recovery]=Number(el.value);const a=game.pms.visits.state.actions.find(a=>a.id===card.dataset.actionId),v=actionPreview(a,this.roster,draft.spend);const preview=card.querySelector("[data-preview]");if(preview)preview.textContent=rollDescription(v.diceCount,v.difficulty);}));
    restoreFocus(this.element,this.focusSnapshot);this.focusSnapshot=null;
  }
  async command(d){
    if(d.sheet==="edit"){this.editing=!this.editing;return this.render({force:true});}
    if(d.sheet==="board"){const caseId=this.actor.system.caseId||this.actor.getFlag("pms","caseBundle")||null;return game.pms.openBoard({caseId,archive:Boolean(caseId&&caseId!==game.pms.visits.state?.caseId)});}
    if(d.sheet==="timeline")return game.pms.openTimeline();
    if(d.sheet==="npcToken"){
      if(this.actor.type!=='npc'||!this.isEditable)return;
      const result=await game.pms.npcTokens.sync(this.actor,{force:true});
      if(result.skipped)throw new Error('Tokeny NPC spravuje hlavní připojený vypravěč.');
      return this.render({force:true});
    }
    if(d.sheet==="item")return this.actor.items.get(d.id).sheet.render({force:true});
    if(d.sheet==="newItem"){if(!this.isEditable)return;return Item.createDialog({}, {parent:this.actor}, {types:["clue","supply"],classes:["pms-flow-dialog"],window:{title:"Nový předmět"}});}
    if(d.sheet==="shareClue"){const i=this.actor.items.get(d.id);return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:this.actor}),content:`<div class="pms-chat-result"><h3>${esc(i.name)}</h3><p>${esc(i.system.description)}</p></div>`});}
    const service=game.pms.visits,a=service.state?.actions.find(a=>a.id===d.id);
    const renderedRevision=Number(d.renderedRevision);if(a&&d.renderedRevision!==undefined&&a.revision!==renderedRevision)throw new Error("Akce se mezitím změnila. Použij aktualizovanou kartu.");
    if(["offer","resume","consequence"].includes(d.sheet))return game.pms.visit.command({visitCommand:d.sheet,id:d.id,avatar:this.roster.id});
    if(!a||d.renderedRevision===undefined)throw new Error("Akce už není dostupná. Použij aktualizovanou kartu.");
    const draft=this.drafts.get(a.id);
    return service.submit({type:d.sheet,actionId:a.id,expectedRevision:renderedRevision,...(d.sheet==="confirm"?{spend:a.kind==="risk"?draft.spend:{},recovery:a.kind==="rest"?draft.recovery:{}}:{})});
  }
  async run(fn){try{await fn();}catch(e){ui.notifications.warn(e.message);}}
  _onClose(options){super._onClose(options);}
}
export class PMSItemSheet extends foundry.applications.sheets.ItemSheetV2 {
  static DEFAULT_OPTIONS={classes:["pms-item-sheet"],position:{width:760,height:780},window:{resizable:true},form:{handler:saveSheet,submitOnChange:true,closeOnSubmit:false}};
  get title(){return this.item.name;}
  async _onFirstRender(context,options){await super._onFirstRender(context,options);this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));}
  async _renderHTML(){
    const i=this.item,s=i.system,editable=this.isEditable;
    const image=i.type==='clue'&&i.img===Item.DEFAULT_ICON?'systems/pms/assets/clue.svg':i.img;
    const medium={paper:"Listina",photo:"Obraz",testimony:"Výpověď",object:"Předmět"};
    const field=(name,label,value)=>editable?input(name,label,value):`<div class="pms-item-fact"><dt>${label}</dt><dd>${esc(value||"—")}</dd></div>`;
    const publication=i.type==="clue"?clueArchiveStatus(i,game.pms.service.caseId,game.users.filter(u=>!u.isGM&&u.role>=1)):null;
    const caseName=caseDisplayName(s.caseId,game.pms.visits.state,game.pms.cases.data,game.pms.avatars.state?.caseLabels);
    const root=document.createElement("div");
    root.innerHTML=`<div class="pms-item-paper ${editable?"editable":"readonly"}"><header><img src="${esc(image)}" alt="${esc(i.name)}" ${editable?'data-action="editImage" data-edit="img"':''}><div><p class="pms-sheet-overline"><i class="fa-solid fa-${i.type==="clue"?"file-lines":"box"}" aria-hidden="true"></i>${i.type==="clue"?"Vodítko":"Zásoba"}</p>${editable?input("name","Název",i.name):`<h1>${esc(i.name)}</h1>`}</div></header>${i.type==="clue"?`<${editable?"div":"dl"} class="pms-item-provenance">${field("system.source","Původ",s.source)}${field("system.acquiredAt","Nalezeno",s.acquiredAt)}${editable?field("system.caseId","Případ",s.caseId):`<div class="pms-item-fact"><dt>Případ</dt><dd>${esc(caseName)}</dd></div>`}${editable?`<label><span>Podoba</span><select name="system.medium">${Object.entries(medium).map(([k,v])=>`<option value="${k}" ${s.medium===k?"selected":""}>${v}</option>`).join("")}</select></label>`:`<div class="pms-item-fact"><dt>Podoba</dt><dd>${medium[s.medium]}</dd></div>`}</${editable?"div":"dl"}>`:`${editable?`<label><span>Počet</span><input type="number" name="system.quantity" min="0" value="${s.quantity}"></label>`:`<div class="pms-supply-quantity"><i class="fa-solid fa-box" aria-hidden="true"></i><span>Počet</span><strong>${s.quantity}</strong></div>`}`}${editable?input("system.description",i.type==="clue"?"Co jsme skutečně zjistili":"Popis",s.description,true):`<section class="pms-item-description"><h2>${i.type==="clue"?"Co jsme skutečně zjistili":"Popis"}</h2><p>${esc(s.description||"Zatím bez zápisu.")}</p></section>`}${i.type==="clue"?`<div class="pms-publication-state" role="status"><i class="fa-solid fa-${publication.available?"circle-check":"lock"}" aria-hidden="true"></i><span>${publication.label}</span></div>`:""}<footer class="pms-item-footer">${editable?'<button type="submit" class="pms-primary"><i class="fa-solid fa-check" aria-hidden="true"></i>Uložit předmět</button>':""}${i.type==="clue"&&game.user.isGM?`<button type="button" data-publish-clue ${publication.available?"disabled":""}><i class="fa-solid fa-thumbtack" aria-hidden="true"></i>${publication.action}</button>`:""}<p class="pms-sheet-hint">${i.type==="clue"?publication.hint+" Nález sám nepotvrzuje pravdu.":"Předmět lze přetáhnout do inventáře postavy."}</p></footer></div>`;
    return root.firstElementChild;
  }
  _replaceHTML(result,content){content.replaceChildren(result);}
  async _onRender(context,options){await super._onRender(context,options);this.element.querySelector("[data-publish-clue]")?.addEventListener("click",async()=>{try{await this.submit();const i=this.item;if(i.parent)await game.pms.service.publishEvidence({title:i.name,text:i.system.description,image:i.img.startsWith("icons/")?"":i.img,kind:i.system.medium==="photo"?"photo":"paper",sourceCase:i.system.caseId,sourceVisit:i.getFlag("pms","sourceVisit"),source:i.system.source,acquiredAt:i.system.acquiredAt});else await i.update({"system.published":true,"flags.pms.caseBundle":i.system.caseId||i.getFlag("pms","caseBundle")||game.pms.service.caseId,"system.caseId":i.system.caseId||i.getFlag("pms","caseBundle")||game.pms.service.caseId,ownership:sharedClueOwnership(i.ownership,game.users.filter(u=>!u.isGM&&u.role>=1))});ui.notifications.info(i.parent?"Kopie nálezu je ve společném archivu.":"Vodítko je ve společném archivu.");this.render({force:true});}catch(e){ui.notifications.warn(e.message);}});}
}
