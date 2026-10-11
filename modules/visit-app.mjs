import { escape as esc } from "./board-view.mjs";
import { VITALS, SKILLS } from "./visit-state.mjs";
import {bindOfferForm,offerFormData} from "./action-form.mjs";
import { offerFormMarkup } from "./offer-view.mjs";
import { knownStateKeys, stateRowsMarkup, readStateRows, bindStateRows } from "./timeline-form.mjs";
const { DialogV2 } = foundry.applications.api;
import { ValidatedDialog } from "./validated-dialog.mjs";
import { time } from "./view-utils.mjs";
export { time };
const button = (type, label, attrs = "") => `<button type="button" data-visit-command="${type}" ${attrs}>${label}</button>`;
const number = (name, label, value, max = 10, min = 0) => `<label>${label}<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="1" required></label>`;
const field = (name, label, value = "", area = false) => `<label>${label}${area ? `<textarea name="${name}">${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}">`}</label>`;
const checks = (entries, name, selected = []) => Object.entries(entries).map(([k,v]) => `<label class="pms-checkbox"><input type="checkbox" name="${name}" value="${k}" ${selected.includes(k) ? "checked" : ""}>${esc(v)}</label>`).join("");

export class VisitControls {
  constructor(service) { this.service=service; this.editing=false; }
  pauseControls(p) {
    if (p.pause?.kind === "observation") {
      const e=p.events.find(e=>e.id===p.pause.eventId);
      return `<section class="pms-boundary"><h3>${esc(e.title)} · kdo to zaznamenal?</h3><p>${esc(e.description)}</p><form data-observe>${checks(Object.fromEntries(p.avatars.map(a=>[a.id,a.name])),"observer")}<button type="submit">Potvrdit svědky</button></form></section>`;
    }
    if(p.pause?.kind==="reaction") return `<section class="pms-boundary"><h3>Prostor pro reakci</h3><p>Po potvrzení nových akcí pokračujte. Dosavadní čas se neztrácí.</p>${button("continue","Pokračovat po reakci")}</section>`;
    if(p.pause?.kind==="ordering") return `<section class="pms-boundary"><h3>Pořadí v ${time(p.clock)}</h3>${p.actions.filter(a=>a.status==="running"&&a.end<=p.clock).map(a=>button("resolveBoundary",`Dokončit: ${esc(a.title)}`,`data-target="action" data-target-id="${a.id}"`)).join("")}${p.events.filter(e=>e.status==="pending"&&e.at<=p.clock).map(e=>button("resolveBoundary",`Událost: ${esc(e.title)}`,`data-target="event" data-target-id="${e.id}"`)).join("")}</section>`;
    return "";
  }
  async promptForm(title,content,{render,label="Uložit",position,classes=[],submit}={}) {
    this.editing=true;
    try{const result=await ValidatedDialog.wait({classes:['pms-flow-dialog',...classes],window:{title,resizable:true},position:{width:Math.min(800,window.innerWidth-48),...position},render,content:`<div class="pms-visit-dialog">${content}</div>`,buttons:[{action:"save",label,default:true,callback:async(_e,_b,d)=>{const form=d.element.querySelector('form'),data=new FormData(form);for(const editor of form.querySelectorAll('prose-mirror[name]'))data.set(editor.name,editor.value);await submit?.(data);return data;}},{action:"cancel",label:"Zrušit",callback:()=>null}],rejectClose:false});return typeof result?.get==='function'?result:null;}finally{this.editing=false;}
  }
  async command(d) {
    const type=d.visitCommand, s=this.service.state, a=s?.actions.find(a=>a.id===d.id);
    if(type==="close")return;
    if(type==="board")return game.pms.openBoard();
    if(type==="demo")return this.service.demo();
    if(type==="create")return game.pms.openAvatarCreation();
    if(type==="offer") {
      const av=s.avatars.find(a=>a.id===d.avatar);if(!av)throw new Error("Avatar neexistuje.");
      const content=offerFormMarkup(av,{img:game.actors.get(av.actorId)?.img,last:this.lastOffer});
      const f=await this.promptForm(`Zadat akci · ${av.name.split("·")[0].trim()}`,content,{label:"Odeslat hráči",classes:["pms-offer-dialog"],position:{width:Math.min(1180,window.innerWidth-48)},render:(_event,dialog)=>{const form=dialog.element.querySelector("form");bindOfferForm(form);form.querySelector('[name="title"]')?.focus();},submit:f=>this.service.submit({type,actionId:foundry.utils.randomID(),avatarId:d.avatar,...offerFormData(f)})});
      if(f){const data=offerFormData(f);this.lastOffer={kind:data.kind,duration:data.duration,...(data.kind==="risk"?{difficulty:data.difficulty,required:data.required,tolerance:data.tolerance}:{})};}
      return;
    }
    if(type==="addEvent")return game.pms.timeline.command('add');
    if(type==="sceneReaction") {
      const f=await this.promptForm("Reakce v aktuální scéně",`<p>Otevři reakci například při příchodu do rozběhnutého děje. Vyber pouze Avatary, kteří situaci skutečně vnímají. Čas ani proběhlé události se nevracejí.</p>${field("description","Co přítomní vnímají", "", true)}${checks(Object.fromEntries(s.avatars.map(a=>[a.id,a.name])),"observer")}`,{label:"Otevřít reakci",submit:f=>this.service.submit({type,description:f.get("description"),observers:f.getAll("observer")})});
      return;
    }
    if(type==="world") {
      if(game.pms.cases.data?.id&&game.pms.cases.data.id===s?.caseId)return game.pms.cases.conditions();
      const p=this.service.privateState,keys=knownStateKeys([],p?.world,p?.events);
      const f=await this.promptForm("Stav scény",`<p>Zapiš, co ve scéně skutečně platí. Budoucí události podle toho nastanou, nebo se odkloní.</p>${stateRowsMarkup("changes",p?.world,keys,"Scéna zatím nemá žádný zapsaný stav.")}`,{render:(_event,dialog)=>bindStateRows(dialog.element.querySelector("form"),keys),submit:f=>this.service.submit({type,changes:readStateRows(f,"changes",keys)})});return;
    }
    if(type==="consequence") {const f=await this.promptForm("Následek akce",field("text","Co se stalo",a.consequence,true),{submit:f=>this.service.submit({type,actionId:a.id,expectedRevision:a.revision,text:f.get("text")})});return;}
    if(type==="resume") {const f=await this.promptForm("Navázat na práci",number("remaining","Zbývající minuty",a.duration-a.elapsed,720,1),{submit:f=>this.service.submit({type,actionId:a.id,expectedRevision:a.revision,remaining:Number(f.get("remaining"))})});return;}
    if(type==="death") {const yes=await DialogV2.confirm({window:{title:"Smrt Avatara"},content:"<p>Avatar přejde do podoby duše. Při smrti posledního živého Avatara se celá skupina okamžitě vrátí skrze MHD.</p>"});if(!yes)return;}
    return this.service.submit({type,...(a?{actionId:a.id,expectedRevision:a.revision}:{}),...(d.avatar?{avatarId:d.avatar}:{}),...(d.target?{target:d.target,targetId:d.targetId}:{})});
  }
  parseTime(value){if(!/^\d{1,2}:\d{2}$/.test(value))throw new Error("Použijte čas HH:MM.");const [h,m]=value.split(":").map(Number);if(h>23||m>59)throw new Error("Neplatný čas.");return h*60+m;}
}
