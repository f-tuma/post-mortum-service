import { escape as esc, time, span } from "./view-utils.mjs";
import { timelineMarkup, emptyTimelineMarkup } from "./timeline-view.mjs";
import { fitTimelineScale, zoomTimeline, scrollToMoment, LABEL_WIDTH, RULER_HEIGHT } from "./timeline-layout.mjs";
import { eventThreads } from "./timeline-state.mjs";
import { knownStateKeys, stateRowsMarkup, readStateRows, bindStateRows } from "./timeline-form.mjs";
import { firstSheetPosition } from "./sheet-ui.mjs";
import {caseClock,readCaseClock,caseTime} from './case-clock.mjs';
import {captureFocus,restoreFocus} from './ui-focus.mjs';
const { ApplicationV2, DialogV2 } = foundry.applications.api;
const stateLabels={archiveServiceOpen:'Služební vstup do archivu',attackStarted:'Hlavní útok začal',audienceDone:'Přijetí u barona dokončeno',auditRunning:'Probíhá kontrola cechu',backupStarted:'Záložní útok začal',copy242Exists:'Průpis 242 existuje',falseRosterIssued:'Falešný rozpis vydán',letterTorn:'Dopis roztrhán',meetingCompleted:'Porada dokončena',meetingRunning:'Probíhá porada',raining:'Prší',saddleMoved:'Výstroj přemístěna',terezaPlace:'Poloha Terezy'};
const SNAP=5;
const COLORS=[["sage","Šalvějová"],["rose","Růžová"],["gold","Zlatá"],["blue","Modrá"]];
const VISIBILITY=[["ask","Vypravěč určí svědky"],["observed","Vidí celá výprava"],["hidden","Skrytá"]];

export class TimelineApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS={id:"pms-timeline",classes:["pms-timeline"],window:{title:"Časová osa",resizable:true},position:{width:1480,height:860}};
  constructor(service,controls){
    super();this.service=service;this.controls=controls;
    this.ui={scale:1,overview:true,selected:null};this.scroll={left:0,top:0};this.dragging=false;
    this.authorityHook=Hooks.on('pmsAuthorityChanged',()=>{this.cancelEventDrag?.();if(this.rendered){this.captureScroll();this.render({force:true});}});
    this.unsubscribe=service.onChange(()=>{if(this.rendered&&!this.dragging&&!controls.editing){this.captureScroll();this.render({force:true});}});
  }
  get writable(){return this.service.isAuthority===true&&globalThis.game?.pmsAuthority?.canWrite!==false;}
  get authorityMessage(){return globalThis.game?.pmsAuthority?.canWrite===false?game.pmsAuthority.message:'Zápisy řídí hlavní okno vypravěče. Zde můžeš prohlížet průběh případu.';}
  assertWritable(){if(!this.writable)throw new Error(this.authorityMessage);}
  get title(){return `Časová osa · ${this.service.state?.title??"Případ"}`;}
  /** Case labels for world values; falls back to readable keys outside a prepared case. */
  get context(){
    const data=game.pms.cases.data,s=this.service.privateState,fields=data?.worldFields??[],field=key=>fields.find(f=>f.key===key);
    return {hasCase:Boolean(data&&data.id===s?.caseId),fields,field,label:key=>field(key)?.label??stateLabels[key]??key,
      value:(key,v)=>field(key)?.choices?.[v]??(typeof v==="boolean"?(v?"Ano":"Ne"):v===undefined?"—":String(v)),pauseHtml:s?this.controls.pauseControls(s):"",fullscreen:this.fullscreen,writable:this.writable,authorityMessage:this.authorityMessage};
  }
  async _renderHTML(){
    if(!game.user.isGM)throw new Error("Časová osa budoucích událostí patří vypravěči.");
    const s=this.withCaseThreads(this.service.privateState),root=document.createElement("div");
    if(s&&this.ui.selected&&!s.events.some(e=>e.id===this.ui.selected))this.ui.selected=null;
    root.innerHTML=s?timelineMarkup(s,this.ui,this.context):emptyTimelineMarkup(this.context);
    return root.firstElementChild;
  }
  /** A visit launched before threads existed borrows them from the re-imported case by event id. */
  withCaseThreads(s){
    const events=game.pms.cases.data?.id===s?.caseId?game.pms.cases.data.events:null;
    if(!events||s.events.every(e=>e.thread))return s;
    return {...s,events:s.events.map(e=>e.thread?e:{...e,thread:events.find(x=>x.id===e.id)?.thread??""})};
  }
  _replaceHTML(result,content){this.focusSnapshot=captureFocus(this.element);content.replaceChildren(result);}
  get fullscreen(){try{return game.settings.get("pms","timelineFullscreen");}catch{return true;}}
  /** Fullscreen like the evidence board by default; the windowed mode stays one click away. */
  applyMode(){
    this.element.classList.toggle("pms-timeline-fullscreen",this.fullscreen);
    if(!this.fullscreen)this.setPosition(firstSheetPosition(this.position,window.innerWidth,window.innerHeight));
  }
  async toggleFullscreen(){await game.settings.set("pms","timelineFullscreen",!this.fullscreen);this.applyMode();requestAnimationFrame(()=>this.ui.overview?this.fitAll():this.render({force:true}));}
  async _onFirstRender(){this.applyMode();this.fitAll();}
  _onRender(){
    const root=this.element;root.tabIndex=-1;root.dataset.keyboardFocus="true";const scroll=root.querySelector(".pms-tl-scroll"),content=root.querySelector(".pms-tl,.pms-tl-empty");
    root.querySelector(".window-title").textContent=this.title;
    // Bind each rendered tree once, even if a nested render finishes before this pass does.
    if(!content||content.dataset.bound)return;
    content.dataset.bound="true";
    if(!root.dataset.pmsTimelineKeys){
      root.dataset.pmsTimelineKeys="true";
      // Escape first clears the selection; only a second Escape reaches Foundry and closes the window.
      root.addEventListener("keydown",event=>{if(event.key==="Escape"&&this.ui.selected&&!event.target.closest("input,select,textarea")){event.preventDefault();event.stopPropagation();this.select(null);}});
    }
    if(scroll){
      scroll.scrollLeft=this.scroll.left;scroll.scrollTop=this.scroll.top;
      this.bindStage(scroll);
      if(this.reveal){this.revealEvent(this.reveal);this.reveal=null;}
    }
    root.querySelectorAll("[data-timeline]").forEach(el=>el.addEventListener("click",()=>this.run(()=>this.command(el.dataset.timeline),!["guide","create","conditions","fullscreen","close"].includes(el.dataset.timeline))));
    root.querySelectorAll("[data-visit-command]").forEach(el=>el.addEventListener("click",()=>this.run(()=>{this.assertWritable();return this.controls.command(el.dataset);})));
    root.querySelectorAll("[data-actor]").forEach(el=>el.addEventListener("click",()=>game.actors.get(el.dataset.actor)?.sheet.render({force:true})));
    root.querySelectorAll("[data-select-event]").forEach(el=>el.addEventListener("click",()=>this.select(el.dataset.selectEvent,{reveal:true})));
    root.querySelectorAll("button[data-world-key]").forEach(el=>el.addEventListener("click",()=>{if(el.getAttribute("aria-pressed")!=="true")this.setWorld(el.dataset.worldKey,el.dataset.worldValue==="true");}));
    root.querySelectorAll("select[data-world-key]").forEach(el=>el.addEventListener("change",()=>this.setWorld(el.dataset.worldKey,el.value)));
    root.querySelector("form[data-observe]")?.addEventListener("submit",ev=>{ev.preventDefault();this.run(()=>{this.assertWritable();return this.service.submit({type:"observe",observers:new FormData(ev.target).getAll("observer")});});});
    restoreFocus(root,this.focusSnapshot,{fallback:scroll??root});this.focusSnapshot=null;
  }
  bindStage(scroll){
    scroll.addEventListener("scroll",()=>{if(!this.zoomFrame)this.captureScroll();},{passive:true});
    scroll.addEventListener("wheel",event=>{
      if(!event.ctrlKey||!this.service.privateState)return;
      event.preventDefault();event.stopPropagation();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?scroll.clientHeight:1);
      if(!delta)return;
      const factor=Math.exp(-Math.max(-400,Math.min(400,delta))*.002);
      Object.assign(this.ui,this.zoomed(scroll,factor,event.clientX-scroll.getBoundingClientRect().left));
      this.scroll.top=scroll.scrollTop;
      this.zoomFrame??=requestAnimationFrame(()=>{this.zoomFrame=null;if(this.rendered)this.render({force:true});});
    },{passive:false});
    // Dragging empty space pans like a map; middle button pans anywhere.
    scroll.addEventListener("pointerdown",event=>{
      if(event.button===0&&event.target.closest("button,select,input,a,label"))return;
      if(![0,1].includes(event.button))return;
      event.preventDefault();
      const start={x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};
      scroll.setPointerCapture(event.pointerId);scroll.classList.add("is-panning");
      const move=ev=>{scroll.scrollLeft=start.left-(ev.clientX-start.x);scroll.scrollTop=start.top-(ev.clientY-start.y);};
      const up=ev=>{
        scroll.removeEventListener("pointermove",move);scroll.removeEventListener("pointerup",up);scroll.removeEventListener("pointercancel",up);scroll.classList.remove("is-panning");this.captureScroll();
        // A plain click on empty space (no panning) clears the selection.
        if(ev.type==="pointerup"&&event.button===0&&Math.hypot(ev.clientX-start.x,ev.clientY-start.y)<4&&this.ui.selected)this.select(null);
      };
      scroll.addEventListener("pointermove",move);scroll.addEventListener("pointerup",up);scroll.addEventListener("pointercancel",up);
    });
    const cards=[...scroll.querySelectorAll(".pms-tl-event")];
    for(const el of cards){
      const id=el.dataset.eventId,find=ids=>ids.split(" ").filter(Boolean).map(x=>scroll.querySelector(`.pms-tl-event[data-event-id="${CSS.escape(x)}"]`)).filter(Boolean);
      const hover=on=>{for(const [dir,ids] of [["up",el.dataset.up],["down",el.dataset.down]])for(const card of find(ids))card.classList.toggle(`hover-${dir}`,on);};
      el.addEventListener("pointerdown",ev=>this.drag(ev,el));
      el.addEventListener("click",()=>{if(this.suppressClick)return;this.select(this.ui.selected===id?null:id);});
      el.addEventListener("pointerenter",()=>hover(true));
      el.addEventListener("pointerleave",()=>hover(false));
      el.addEventListener("keydown",ev=>{
        const step=ev.key==="ArrowRight"?1:ev.key==="ArrowLeft"?-1:0;if(!step)return;
        ev.preventDefault();cards[(cards.indexOf(el)+step+cards.length)%cards.length].focus();
      });
    }
  }
  zoomed(scroll,factor,anchor){const s=this.service.privateState;return this.applyZoom(zoomTimeline({scale:this.ui.scale,scroll:this.zoomFrame?this.scroll.left:scroll.scrollLeft,viewportWidth:scroll.clientWidth,duration:s.end-s.start,factor,anchor}));}
  applyZoom({scale,scroll,overview}){this.scroll.left=scroll;return {scale,overview};}
  captureScroll(){const viewport=this.element?.querySelector(".pms-tl-scroll");if(viewport)this.scroll={left:viewport.scrollLeft,top:viewport.scrollTop};}
  select(id,{reveal=false}={}){this.captureScroll();this.ui.selected=id;if(reveal&&id)this.reveal=id;this.render({force:true});}
  revealEvent(id){
    const scroll=this.element.querySelector(".pms-tl-scroll"),el=scroll?.querySelector(`[data-event-id="${CSS.escape(id)}"]`);if(!el)return;
    const left=el.offsetLeft+LABEL_WIDTH,top=el.offsetTop+RULER_HEIGHT;
    if(left<scroll.scrollLeft+LABEL_WIDTH||left+el.offsetWidth>scroll.scrollLeft+scroll.clientWidth)scroll.scrollLeft=left-LABEL_WIDTH-Math.max(40,(scroll.clientWidth-LABEL_WIDTH-el.offsetWidth)/2);
    if(top<scroll.scrollTop+RULER_HEIGHT||top+el.offsetHeight>scroll.scrollTop+scroll.clientHeight)scroll.scrollTop=top-RULER_HEIGHT-Math.max(20,(scroll.clientHeight-el.offsetHeight)/3);
    this.captureScroll();el.focus({preventScroll:true});
  }
  _onClose(options){this.cancelEventDrag?.();if(this.zoomFrame)cancelAnimationFrame(this.zoomFrame);this.zoomFrame=null;super._onClose(options);}
  fitAll(){const s=this.service.privateState,r=this.element.querySelector(".pms-tl-scroll");if(!s||!r)return;this.ui.scale=fitTimelineScale(r.clientWidth,s.end-s.start);this.ui.overview=true;this.scroll={left:0,top:0};this.render({force:true});}
  setWorld(key,value){return this.run(()=>{this.assertWritable();return this.service.submit({type:"world",changes:{[key]:value}});});}
  drag(event,el){
    const s=this.service.privateState,e=s?.events.find(x=>x.id===el.dataset.eventId);
    if(!this.writable||event.button!==0||!e||s.status!=="active"||e.status!=="pending")return;
    event.stopPropagation();
    const startX=event.clientX,base=parseFloat(el.style.left),scale=this.ui.scale,label=el.querySelector("time");
    const earliest=Math.max(s.clock+1,...(e.dependencies??[]).map(d=>(s.events.find(x=>x.id===d.id)?.at??0)+d.delay));
    let moved=false,proposed=e.at;
    el.setPointerCapture(event.pointerId);
    const move=ev=>{
      const dx=ev.clientX-startX;if(!moved&&Math.abs(dx)<5)return;
      if(!moved){moved=true;this.dragging=true;el.classList.add("is-dragging");}
      proposed=Math.max(s.clock+1,Math.min(s.end,Math.round((e.at+dx/scale)/SNAP)*SNAP));
      el.style.left=`${base+(proposed-e.at)*scale}px`;label.textContent=caseTime(proposed,s.end>=1440);
      el.classList.toggle("is-invalid",proposed<earliest);
    };
    const detach=()=>{el.removeEventListener("pointermove",move);el.removeEventListener("pointerup",up);el.removeEventListener("pointercancel",up);this.cancelEventDrag=null;};
    const cancel=()=>{detach();this.dragging=false;el.classList.remove("is-dragging");if(el.hasPointerCapture?.(event.pointerId))el.releasePointerCapture(event.pointerId);};
    const up=ev=>{
      detach();
      if(ev?.type==="pointercancel"||!this.writable){this.dragging=false;if(this.rendered)this.render({force:true});return;}
      if(!moved)return;
      this.suppressClick=true;setTimeout(()=>{this.suppressClick=false;});
      this.dragging=false;el.classList.remove("is-dragging");this.captureScroll();
      if(proposed===e.at)return this.render({force:true});
      if(proposed<earliest){ui.notifications.warn(`„${e.title}“ nemůže nastat dřív než v ${caseTime(earliest,s.end>=1440)}, čeká na svůj předpoklad.`);return this.render({force:true});}
      this.ui.selected=e.id;
      this.run(async()=>{const ripple=await this.askRipple(s,e,proposed);if(ripple===null)return;this.assertWritable();await this.service.submit({type:"moveEvent",eventId:e.id,expectedEventRevision:e.revision??0,at:proposed,ripple});});
    };
    this.cancelEventDrag=cancel;el.addEventListener("pointermove",move);el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up);
  }
  /** true moves dependants too, false only this event, null cancels. Asks only when dependants exist. */
  async askRipple(s,e,at){
    const chain=new Set([e.id]);let grew=true;
    while(grew){grew=false;for(const x of s.events)if(!chain.has(x.id)&&(x.dependencies??[]).some(d=>chain.has(d.id))){chain.add(x.id);grew=true;}}
    chain.delete(e.id);if(!chain.size)return false;
    const dependants=s.events.filter(x=>chain.has(x.id)).sort((a,b)=>a.at-b.at),delta=at-e.at;
    const breaks=s.events.some(x=>(x.dependencies??[]).some(d=>d.id===e.id&&at+d.delay>x.at));
    this.controls.editing=true;
    try{
      const choice=await DialogV2.wait({classes:["pms-flow-dialog"],window:{title:"Návazné události"},position:{width:Math.min(560,window.innerWidth-48)},
        content:`<div class="pms-visit-dialog"><p><strong>${esc(e.title)}</strong> se přesune z ${caseTime(e.at,s.end>=1440)} na ${caseTime(at,s.end>=1440)} (${delta>0?"+":"−"}${span(Math.abs(delta))}).</p><p>Navazují na ni:</p><ul>${dependants.map(x=>`<li>${caseTime(x.at,s.end>=1440)} · ${esc(x.title)}</li>`).join("")}</ul>${breaks?"<p>Bez posunu návazných by předpoklady přestaly platit, proto je nutné posunout celý řetězec.</p>":""}</div>`,
        buttons:[{action:"ripple",label:`Posunout i návazné (${dependants.length})`,icon:"fa-solid fa-link",default:true},...(breaks?[]:[{action:"single",label:"Jen tuto událost",icon:"fa-solid fa-thumbtack"}]),{action:"cancel",label:"Zrušit"}],rejectClose:false});
      return choice==="ripple"?true:choice==="single"?false:null;
    }finally{this.controls.editing=false;}
  }
  async run(fn,refresh=true){try{await fn();}catch(e){ui.notifications.warn(e.message);}if(this.rendered&&refresh){this.captureScroll();this.render({force:true});}}
  async command(type){
    if(["conditions","add","edit"].includes(type))this.assertWritable();
    const s=this.service.privateState;
    if(type==="fit")return this.fitAll();
    if(type==="fullscreen")return this.toggleFullscreen();
    if(type==="close")return this.close();
    if(type==="guide")return game.pms.cases.showGuide();
    if(type==='rewards')return game.pms.openRewards();
    if(type==='result')return game.pms.cases.showResult();
    if(type==="conditions")return this.context.hasCase?game.pms.cases.conditions():this.controls.command({visitCommand:"world"});
    if(type==="create")return game.pms.openAvatarCreation();
    if(type==="deselect"){this.ui.selected=null;return;}
    const viewport=this.element.querySelector(".pms-tl-scroll");
    if(type==="zoomIn"||type==="zoomOut"){this.captureScroll();Object.assign(this.ui,this.applyZoom(zoomTimeline({scale:this.ui.scale,scroll:viewport?.scrollLeft??this.scroll.left,viewportWidth:viewport?.clientWidth??800,duration:s.end-s.start,factor:type==="zoomIn"?1.5:1/1.5})));return;}
    if(type==="now"){this.captureScroll();this.scroll.left=scrollToMoment(s.clock,s.start,this.ui.scale);return;}
    if(type==="add"||type==="edit")return this.eventForm(type==="edit"?this.withCaseThreads(s).events.find(e=>e.id===this.ui.selected):null);
  }
  async eventForm(e){
    this.assertWritable();
    const s=this.service.privateState,ctx=this.context,keys=knownStateKeys(ctx.fields,s.world,s.events,ctx.label);
    const threads=[...new Set(eventThreads(s.events).filter(t=>t.id!=="loose").map(t=>t.label))];
    const deps=s.events.filter(x=>x.id!==e?.id).sort((a,b)=>a.at-b.at).map(x=>{const d=e?.dependencies?.find(d=>d.id===x.id);return `<div class="pms-event-dependency"><label class="pms-checkbox"><input type="checkbox" name="dependency" value="${esc(x.id)}" ${d?"checked":""}>${caseTime(x.at,s.end>=1440)} · ${esc(x.title)}</label><label>+<input type="number" name="delay-${esc(x.id)}" min="0" max="10080" value="${d?.delay??0}" aria-label="Prodleva v minutách"> min</label></div>`;}).join("");
    const content=`<div class="pms-event-form">
      <div class="pms-event-grid"><label>Název<input name="title" value="${esc(e?.title??"")}" required></label><label>Čas<input type="time" name="at" step="300" value="${caseClock(e?.at??s.clock+5).clock}" required></label><label>Den návštěvy<input type="number" name="atDay" min="1" max="77" value="${caseClock(e?.at??s.clock+5).day}" required></label></div>
      <div class="pms-event-grid"><label>Místo<input name="location" value="${esc(e?.location??"")}"></label><label>Dějová linie<input name="thread" list="pms-thread-list" value="${esc(e?.thread??"")}" placeholder="Automaticky podle návazností"><datalist id="pms-thread-list">${threads.map(t=>`<option value="${esc(t)}">`).join("")}</datalist></label></div>
      <label>Co se stane<textarea name="description" rows="3">${esc(e?.description??"")}</textarea></label>
      <div class="pms-event-options"><label>Barva stuhy<select name="color">${COLORS.map(([k,v])=>`<option value="${k}" ${e?.color===k?"selected":""}>${v}</option>`).join("")}</select></label><label>Viditelnost<select name="visibility">${VISIBILITY.map(([k,v])=>`<option value="${k}" ${(e?.visibility??"ask")===k?"selected":""}>${v}</option>`).join("")}</select></label><label class="pms-checkbox"><input type="checkbox" name="canReact" ${e?.canReact?"checked":""}> Možnost reakce</label></div>
      <fieldset><legend>Co musí platit</legend><p class="pms-sheet-hint">Událost nastane, jen když v jejím čase platí všechny podmínky. Jinak se odkloní.</p>${stateRowsMarkup("condition",e?.condition,keys,"Bez podmínek, nastane vždy.")}</fieldset>
      <details class="pms-event-details" ${e?.dependencies?.length?"open":""}><summary>Pevné předpoklady · ${e?.dependencies?.length??0}</summary><p class="pms-sheet-hint">Událost počká, až předpoklad skutečně nastane, a ještě zadanou prodlevu.</p>${deps||"<p>Žádné jiné události.</p>"}</details>
      <fieldset><legend>Co změní</legend>${stateRowsMarkup("changes",e?.changes,keys,"Nemění stav světa.")}</fieldset>
      <details class="pms-event-details" ${e?.trace||e?.witnesses?"open":""}><summary>Stopa a svědci</summary><label>NPC svědci<input name="witnesses" value="${esc(e?.witnesses??"")}"></label><label>Zanechaná stopa<textarea name="trace" rows="2">${esc(e?.trace??"")}</textarea></label></details>
    </div>`;
    await this.controls.promptForm(e?"Upravit událost":"Nová událost",content,{label:e?"Uložit změny":"Přidat událost",position:{width:Math.min(820,window.innerWidth-48)},render:(_event,dialog)=>bindStateRows(dialog.element.querySelector("form"),keys),submit:async f=>{
    const spec={id:e?.id??foundry.utils.randomID(),title:f.get("title"),at:readCaseClock(f.get("at"),f.get("atDay")),description:f.get("description"),location:f.get("location"),thread:String(f.get("thread")??"").trim(),color:f.get("color"),visibility:f.get("visibility"),canReact:f.has("canReact"),
      dependencies:f.getAll("dependency").map(id=>({id,delay:Number(f.get(`delay-${id}`))})),condition:readStateRows(f,"condition",keys),changes:readStateRows(f,"changes",keys),witnesses:f.get("witnesses"),trace:f.get("trace")};
    this.assertWritable();await this.service.submit(e?{type:"editEvent",eventId:e.id,expectedEventRevision:e.revision??0,event:spec}:{type:"addEvent",event:spec});
    this.ui.selected=spec.id;this.reveal=spec.id;}});
  }
}
