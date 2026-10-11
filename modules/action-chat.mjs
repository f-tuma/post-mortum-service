import { VITALS, OUTCOMES, actionPreview, canOfferAction } from './visit-state.mjs';
import {captureFocus,restoreFocus} from './ui-focus.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const zero = () => ({vitality:0,agility:0,intelligence:0});
const states = {offered:'Připrav akci',ready:'Připraveno',running:'Probíhá',awaitingRoll:'Čeká na hod',paused:'Přerušeno',completed:'Dokončeno',cancelled:'Zrušeno'};
const drafts = new Map();
let refreshQueue=Promise.resolve();

export function chatActionContext(visit, reference, user) {
  if (!visit || visit.id !== reference?.visitId) return null;
  const action = visit.actions.find(a => a.id === reference.actionId);
  const avatar = visit.avatars.find(a => a.id === action?.avatarId);
  if (!action || !avatar) return null;
  const own = visit.status === 'active' && avatar.alive && (user?.isGM || user?.id === avatar.ownerId);
  const interrupt = own && action.status === 'running' && visit.pause?.kind === 'reaction' && visit.pause.eligible.includes(avatar.id);
  // canOfferAction also checks another active action before offering to resume.
  const resume = own && user?.isGM && action.status === 'paused' && canOfferAction(visit, avatar);
  return {visit,action,avatar,own,interrupt,resume};
}

export function actionCardMarkup(visit, action, avatar, {own=false,interrupt=false,resume=false,openSheet=false,draft}={}) {
  draft ??= {spend:zero(),recovery:{...zero(),vitality:3}};
  const preview = actionPreview(action,avatar,action.status === 'offered' ? draft.spend : action.spend);
  const button = (command,label,primary=false) => `<button type="button" data-chat-command="${command}" class="${primary?'pms-primary':''}">${label}</button>`;
  const allocate = own && action.status === 'offered' && ['risk','rest'].includes(action.kind);
  const result = action.result;
  return `<article class="pms-action-chat" data-status="${action.status}" aria-label="${esc(action.title)}">
    <header><i class="fa-solid fa-${action.kind==='rest'?'moon':action.kind==='meal'?'utensils':'magnifying-glass'}" aria-hidden="true"></i><div><small>${esc(avatar.name)}</small><h3>${esc(action.title)}</h3></div><span>${action.duration} min</span></header>
    ${action.goal?`<p>${esc(action.goal)}</p>`:''}<div class="pms-chat-action-meta"><strong>${states[action.status]}</strong>${action.status==='running'||action.status==='paused'?`<span>${action.elapsed} / ${action.duration} min</span>`:''}</div>
    ${action.kind==='risk'?`<p class="pms-chat-roll-preview" data-chat-preview>${preview.diceCount}d6 · potřeba ${action.required} · tolerance ${action.tolerance}</p>${action.stakes?`<p class="pms-chat-stakes">${esc(action.stakes)}</p>`:''}`:''}
    ${allocate?`<div class="pms-chat-allocation">${Object.entries(VITALS).map(([key,label])=>{const recovery=action.kind==='rest',max=recovery?3:Math.min(action.caps[key],avatar.vitals[key]);return `<label>${label}<input type="number" min="0" max="${max}" step="1" data-chat-${recovery?'recovery':'spend'}="${key}" value="${draft[recovery?'recovery':'spend'][key]}" aria-label="${recovery?'Obnova':'Útrata'}: ${label}"><small>${recovery?'obnova':`max ${max}`}</small></label>`;}).join('')}</div>`:''}
    ${own&&action.status==='offered'?`<p class="pms-chat-hint">${action.kind==='risk'?'Vitálky se odečtou při hodu.':action.kind==='rest'?'Rozděl přesně 3 body obnovy.':action.kind==='meal'?'Jedna porce jídla · +2 vitality po dokončení.':'Bez hodu po uplynutí času.'}</p>`:''}
    ${result?`<section class="pms-chat-outcome"><strong>${action.kind==='risk'?OUTCOMES[result.category]:action.kind==='auto'?'Dokončeno bez hodu':'Obnova dokončena'}</strong>${action.kind==='risk'?`<div class="pms-dice-faces">${result.dice.map(n=>`<span class="${n>=5?'success':''}">${n}</span>`).join('')}</div><p>${result.successes} úspěchů / potřeba ${action.required}</p>`:result.restored?`<p>${Object.entries(VITALS).filter(([k])=>result.restored[k]>0).map(([k,label])=>`${label} +${result.restored[k]}`).join(' · ')||'Vitálky už jsou plné.'}</p>`:''}${action.consequence?`<blockquote>${esc(action.consequence)}</blockquote>`:''}</section>`:''}
    <footer>${own&&action.status==='offered'?button('confirm','Potvrdit akci',true):''}${own&&action.status==='awaitingRoll'?button('roll',`Hodit ${preview.diceCount}d6`,true):''}${interrupt?button('interrupt','Přerušit a reagovat',true):''}${resume?button('resume','Navázat na práci'):''}${own&&['offered','ready','paused'].includes(action.status)?button('cancel','Zrušit akci'):''}${openSheet?button('sheet','Otevřít deník'):''}</footer>
  </article>`;
}

export function chatActionCommand(context, type, draft) {
  const {action,own,interrupt,resume} = context ?? {};
  const allowed = own && (type==='confirm'&&action.status==='offered' || type==='roll'&&action.status==='awaitingRoll' || type==='cancel'&&['offered','ready','paused'].includes(action.status) || type==='interrupt'&&interrupt || type==='resume'&&resume);
  if (!allowed) throw new Error('Karta se mezitím změnila nebo tuto akci nemůžeš ovládat.');
  return {type,actionId:action.id,expectedRevision:action.revision,...(type==='confirm'?{spend:action.kind==='risk'?draft?.spend??zero():{},recovery:action.kind==='rest'?draft?.recovery??{...zero(),vitality:3}:{}}:{})};
}

// One durable native message per action. A reconnect can finish an interrupted publish.
export async function syncActionMessages(visit, messages, create) {
  if (!visit) return;
  for (const action of visit.actions) {
    const avatar = visit.avatars.find(a=>a.id===action.avatarId), key=`${visit.id}:${action.id}`;
    if (!avatar) continue;
    const content=actionCardMarkup(visit,action,avatar);
    const existing=messages.find(m=>m.getFlag('pms','actionCard')===key);
    if (existing) { if(existing.content!==content) await existing.update({content},{notify:false}); }
    else await create({content,flags:{pms:{actionCard:key,visitId:visit.id,actionId:action.id}}},avatar);
  }
}

export function registerActionChatHooks() {
  Hooks.on('renderChatMessageHTML',(message,html)=>{
    const key=message.getFlag('pms','actionCard'); if(!key)return;
    const reference={visitId:message.getFlag('pms','visitId'),actionId:message.getFlag('pms','actionId')};
    const service=game.pms?.visits,context=chatActionContext(service?.state,reference,game.user);
    const root=html.querySelector('.pms-action-chat'); if(!root||!context)return;
    const {visit,action,avatar}=context;
    const draftKey=`${key}:${action.revision}`;
    if(action.status!=='offered')for(const k of drafts.keys())if(k.startsWith(`${key}:`))drafts.delete(k);
    const draft=drafts.get(draftKey)??{spend:zero(),recovery:{...zero(),vitality:3}};
    if(action.status==='offered')drafts.set(draftKey,draft);
    const actor=game.actors.get(avatar.actorId);
    root.outerHTML=actionCardMarkup(visit,action,avatar,{...context,openSheet:Boolean(actor?.isOwner||actor?.testUserPermission(game.user,'OBSERVER')),draft});
    const card=html.querySelector('.pms-action-chat');
    card.querySelectorAll('[data-chat-spend],[data-chat-recovery]').forEach(input=>input.addEventListener('input',()=>{
      draft[input.dataset.chatSpend?'spend':'recovery'][input.dataset.chatSpend??input.dataset.chatRecovery]=Number(input.value);
      const preview=card.querySelector('[data-chat-preview]');
      if(preview)preview.textContent=`${actionPreview(action,avatar,draft.spend).diceCount}d6 · potřeba ${action.required} · tolerance ${action.tolerance}`;
    }));
    card.querySelectorAll('[data-chat-command]').forEach(button=>button.addEventListener('click',async()=>{
      const type=button.dataset.chatCommand;button.disabled=true;
      try {
        // Retain the rendered revision: a stale card must not confirm a changed offer.
        const fresh=chatActionContext(service.state,reference,game.user);
        if(!fresh||fresh.action.revision!==action.revision)throw new Error('Akce se mezitím změnila. Použij aktualizovanou kartu.');
        if(type==='sheet'){if(actor?.isOwner||actor?.testUserPermission(game.user,'OBSERVER')){actor.sheet.tab='character';await actor.sheet.render({force:true});}return;}
        await service.submit(chatActionCommand(fresh,type,draft));
      }catch(error){ui.notifications.warn(error.message);}finally{button.disabled=false;}
    }));
  });
}

export function refreshActionChat() {
  // Foundry replaces the entire message, including focused allocation controls.
  // Serialize hydration so concurrent projections cannot remove the input after
  // a preceding refresh has restored it. Scope restoration to its actual log
  // (sidebar, notifications or popout), leaving other live windows alone.
  const job=refreshQueue.then(async()=>{
    const active=document.activeElement,card=active?.closest('.pms-action-chat');
    const log=card?.closest('[data-message-id]')?.parentElement;
    const focus=log?captureFocus(log):null;
    // Only messages actually mounted in chat or its popout need local control hydration.
    const ids=new Set(Array.from(document.querySelectorAll('[data-message-id] .pms-action-chat')).map(card=>card.closest('[data-message-id]').dataset.messageId));
    try{
      for(const id of ids){const message=game.messages.get(id);if(message)await ui.chat.updateMessage(message,{notify:false});}
    }finally{if(log)restoreFocus(log,focus,{fallback:null});}
  });
  refreshQueue=job.catch(error=>console.error('PMS action chat',error));
  return job;
}
