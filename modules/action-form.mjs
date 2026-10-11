import { KIND_HINTS, KINDS, offerPreview } from './offer-view.mjs';
const zero=()=>({vitality:0,agility:0,intelligence:0});
export const actionKindHints=KIND_HINTS;
const fallbackTitle={risk:'Zkouška',auto:'Akce',rest:'Odpočinek',meal:'Jídlo'};
export function offerFormData(form){
  const kind=form.get('kind'),risk=kind==='risk';
  return {title:String(form.get('title')??'').trim()||fallbackTitle[kind]||'Akce',goal:form.get('goal')??'',kind,duration:kind==='rest'?30:kind==='meal'?15:Number(form.get('duration')),
    difficulty:risk?Number(form.get('difficulty')):0,required:risk?Number(form.get('required')):2,tolerance:risk?Number(form.get('tolerance')):1,
    skills:risk?form.getAll('skill'):[],caps:risk?Object.fromEntries(Object.keys(zero()).map(k=>[k,Number(form.get(k))])):zero(),
    injury:risk?Number(form.get('injury')):0,help:risk?Number(form.get('help')):0,clue:risk?Number(form.get('clue')):0,stakes:form.get('stakes')??''};
}
const clamp=(input,value)=>{const min=Number(input.min||0),max=Number(input.max||10);return Math.max(min,Math.min(max,Math.round(Number(value)||0)));};
const pct=n=>`${Math.round(n*100)} %`;
/** What the form shows for a kind; a custom duration survives a detour through rest or meal. */
export function kindLayout(kind,duration,freeDuration){
  const risk=kind==='risk',fixed=kind==='rest'||kind==='meal';
  return {risk,fixed,duration:fixed?(kind==='rest'?'30':'15'):freeDuration,hint:actionKindHints[kind]??''};
}
const kindValue=form=>form.querySelector('[name="kind"]:checked')?.value??form.querySelector('[name="kind"]')?.value;

/** Wires the offer form: kind switching, diamond pickers, duration chips and the live dice preview. */
export function bindOfferForm(form){
  const duration=form.querySelector('[name="duration"]'),avatarData=form.querySelector('[data-avatar-vitals]');
  const av=avatarData?{vitals:JSON.parse(avatarData.dataset.avatarVitals),skills:JSON.parse(avatarData.dataset.avatarSkills)}:null;
  let freeDuration=duration.value;
  const syncPicker=picker=>{const input=picker.querySelector('input[type="number"]'),value=Number(input.value);picker.querySelectorAll('[data-set]').forEach(b=>b.classList.toggle('filled',Number(b.dataset.set)<=value));};
  const preview=()=>{
    const out=form.querySelector('[data-offer-preview]');if(!out||!av||kindValue(form)!=='risk')return;
    const num=n=>Number(form.querySelector(`[name="${n}"]`)?.value??0);
    const p=offerPreview({difficulty:num('difficulty'),required:num('required'),tolerance:num('tolerance'),injury:Number(form.querySelector('[name="injury"]:checked')?.value??0),help:form.querySelector('[name="help"]')?.checked?1:0,clue:form.querySelector('[name="clue"]')?.checked?1:0,skills:[...form.querySelectorAll('[name="skill"]:checked')].map(i=>i.value),caps:Object.fromEntries(Object.keys(zero()).map(k=>[k,num(k)]))},av);
    const row=(label,x)=>`<div><span>${label}</span><b>${x.dice} ${x.dice===1?'kostka':x.dice>=2&&x.dice<=4?'kostky':'kostek'}</b><span class="pms-offer-odds"><em>plný ${pct(x.full)}</em><em>aspoň částečný ${pct(x.partial)}</em></span></div>`;
    out.innerHTML=`${row('Bez útraty',p.base)}${p.maxSpend?row(`S útratou ${p.maxSpend}`,p.best):''}<small>Výsledná obtížnost ${p.base.difficulty}${p.skill?` · dovednost −${p.skill}`:''}${p.maxSpend?` · hráč ji může snížit až na ${p.best.difficulty}`:''}</small>`;
  };
  const update=()=>{
    const kind=kindValue(form);
    if(!duration.readOnly)freeDuration=duration.value;
    const {risk,fixed,duration:shown,hint:hintText}=kindLayout(kind,duration.value,freeDuration);
    form.querySelectorAll('[data-risk-fields]').forEach(group=>{group.hidden=!risk;group.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=!risk);});
    duration.value=shown;duration.readOnly=fixed;
    form.querySelector('.pms-offer-duration')?.classList.toggle('is-fixed',fixed);
    form.querySelectorAll('[data-duration]').forEach(b=>{b.disabled=fixed;b.setAttribute('aria-pressed',String(b.dataset.duration===duration.value));});
    const calm=form.querySelector('[data-calm-panel]');
    if(calm){calm.hidden=risk;const k=KINDS.find(x=>x.id===kind);form.querySelector('[data-calm-icon]').innerHTML=k?`<i class="fa-solid fa-${k.icon}" aria-hidden="true"></i>`:'';}
    const hint=form.querySelector('[data-kind-hint]');if(hint)hint.textContent=hintText;
    const tolerance=form.querySelector('[name="tolerance"]'),required=form.querySelector('[name="required"]');
    if(tolerance&&required){tolerance.max=required.value;if(Number(tolerance.value)>Number(required.value))tolerance.value=required.value;
      form.querySelectorAll('[data-picker="tolerance"] [data-set]').forEach(b=>b.hidden=Number(b.dataset.set)>Number(required.value));}
    form.querySelectorAll('[data-picker]').forEach(syncPicker);
    preview();
  };
  form.addEventListener('change',update);
  form.addEventListener('input',event=>{if(event.target.matches('input[type="number"]'))update();});
  form.addEventListener('click',event=>{
    const set=event.target.closest('[data-set]'),step=event.target.closest('[data-step]'),chip=event.target.closest('[data-duration]');
    if(set){const input=set.closest('[data-picker]').querySelector('input[type="number"]'),n=Number(set.dataset.set);
      // Clicking the last filled diamond again steps back, so zero is always one click away.
      input.value=clamp(input,Number(input.value)===n?n-1:n);update();}
    if(step){const input=step.closest('.pms-offer-stepper').querySelector('input');if(!input.readOnly){input.value=clamp(input,Number(input.value)+Number(step.dataset.step));update();}}
    if(chip&&!duration.readOnly){duration.value=chip.dataset.duration;freeDuration=duration.value;update();}
  });
  update();
}
