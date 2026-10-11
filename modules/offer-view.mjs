import { escape as esc, icon } from './view-utils.mjs';
import { VITALS, SKILLS } from './visit-state.mjs';

export const SKILL_ICONS = { movement: 'boot', stealth: 'user-ninja', perception: 'eye', analysis: 'magnifying-glass', negotiation: 'comment', knowledge: 'book-open', craft: 'screwdriver-wrench', combat: 'khanda' };
export const VITAL_ICONS = { vitality: 'heart', agility: 'feather-pointed', intelligence: 'eye' };
export const RANKS = ['Neutrální', 'Zkušený', 'Mistr'];
export const KINDS = [
  { id: 'risk', icon: 'dice', label: 'Zkouška', note: 'hod kostkami' },
  { id: 'auto', icon: 'circle-check', label: 'Jistá akce', note: 'bez hodu' },
  { id: 'rest', icon: 'moon', label: 'Odpočinek', note: '30 min' },
  { id: 'meal', icon: 'utensils', label: 'Jídlo', note: '15 min' }
];
export const KIND_HINTS = {
  risk: 'Hráč v deníku rozhodne, kolik vitálek utratí, a potvrdí akci. Po uplynutí času hodí kostkami.',
  auto: 'Akce proběhne bez hodu. Stačí záměr, délka a co z ní vzejde.',
  rest: 'Odpočinek trvá 30 minut. Hráč si v deníku rozdělí 3 body obnovy.',
  meal: 'Jídlo trvá 15 minut a spotřebuje jednu porci. Po dokončení obnoví 2 Vitality.'
};
const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
export const OFFER_DEFAULTS = { kind: 'risk', duration: 10, difficulty: 6, required: 2, tolerance: 1 };

/** Clickable row of diamonds bound to a real number input, so typing and keyboard still work. */
function picker(name, label, value, { max = 10, min = 0, tone = 'gold', hint = '' } = {}) {
  return `<div class="pms-offer-picker tone-${tone}" data-picker="${name}">
    <div class="pms-offer-picker-head"><label for="pms-offer-${name}">${label}</label>${hint ? `<small>${hint}</small>` : ''}<span class="pms-offer-stepper"><button type="button" data-step="-1" aria-label="${label}: méně">${icon('minus')}</button><input id="pms-offer-${name}" type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="1" required><button type="button" data-step="1" aria-label="${label}: více">${icon('plus')}</button></span></div>
    <div class="pms-offer-diamonds" aria-hidden="true">${Array.from({ length: max }, (_, n) => `<button type="button" tabindex="-1" data-set="${n + 1}" class="${n < value ? 'filled' : ''}" title="${label} ${n + 1}"><span></span></button>`).join('')}</div>
  </div>`;
}

function avatarColumn(av, img) {
  const [name, role] = av.name.split('·').map(x => x.trim());
  return `<aside class="pms-offer-avatar">
    ${img ? `<img src="${esc(img)}" alt="">` : ''}
    <small class="pms-offer-kicker">Avatar</small>
    <h2>${esc(name)}</h2>${role ? `<p class="pms-offer-role">${esc(role)}</p>` : ''}
    <ul class="pms-offer-vitals">${Object.entries(VITALS).map(([k, label]) => `<li class="${k}"><span>${icon(VITAL_ICONS[k])} ${label}</span><b>${av.vitals[k]}<small>/10</small></b><span class="pms-offer-minidiamonds" aria-hidden="true">${Array.from({ length: 10 }, (_, n) => `<i class="${n < av.vitals[k] ? 'filled' : ''}"></i>`).join('')}</span></li>`).join('')}</ul>
    <ul class="pms-offer-skills">${Object.entries(SKILLS).map(([k, label]) => `<li class="rank-${av.skills[k] ?? 0}">${icon(SKILL_ICONS[k])}<span>${label}</span><small>${RANKS[av.skills[k] ?? 0]}</small></li>`).join('')}</ul>
    <p class="pms-offer-food">${icon('utensils')} Porce jídla <b>${av.food}</b></p>
  </aside>`;
}

/** The GM's "Zadat akci" form, styled like the character journal. `last` pre-fills repeat values. */
export function offerFormMarkup(av, { img = '', last = {} } = {}) {
  const v = { ...OFFER_DEFAULTS, ...last };
  return `<div class="pms-offer" data-avatar-vitals="${esc(JSON.stringify(av.vitals))}" data-avatar-skills="${esc(JSON.stringify(av.skills))}">
    ${avatarColumn(av, img)}
    <section class="pms-offer-intent">
      <h3>Záměr</h3>
      <div class="pms-offer-kinds" role="radiogroup" aria-label="Druh akce">${KINDS.map(k => `<label class="pms-offer-kind"><input type="radio" name="kind" value="${k.id}" ${v.kind === k.id ? 'checked' : ''}><span>${icon(k.icon)}<strong>${k.label}</strong><small>${k.note}</small></span></label>`).join('')}</div>
      <label class="pms-offer-field">Název akce<input name="title" value="" placeholder="Např. Prohlídka sedla" autocomplete="off"></label>
      <label class="pms-offer-field">Co chce Avatar udělat<textarea name="goal" rows="3" placeholder="Záměr, jak jej popsal hráč"></textarea></label>
      <div class="pms-offer-duration"><label for="pms-offer-duration">Délka</label><span class="pms-offer-stepper"><button type="button" data-step="-5" aria-label="Kratší">${icon('minus')}</button><input id="pms-offer-duration" type="number" name="duration" value="${v.duration}" min="1" max="720" step="1" required><button type="button" data-step="5" aria-label="Delší">${icon('plus')}</button></span><span class="pms-offer-unit">min</span>
        <div class="pms-offer-chips" data-duration-chips>${DURATIONS.map(n => `<button type="button" data-duration="${n}" aria-pressed="${n === v.duration}">${n}</button>`).join('')}</div></div>
      <label class="pms-offer-field">Co je v sázce a co může následovat<textarea name="stakes" rows="3" placeholder="Co se stane při neúspěchu nebo částečném úspěchu"></textarea></label>
    </section>
    <section class="pms-offer-roll" data-risk-fields>
      <h3>Hod</h3>
      <div class="pms-offer-pickers">
        ${picker('difficulty', 'Obtížnost', v.difficulty, { tone: 'rose', hint: 'odečte se od 10 kostek' })}
        ${picker('required', 'Potřebné úspěchy', v.required, { min: 1, tone: 'sage', hint: 'padne 5 nebo 6' })}
        ${picker('tolerance', 'Tolerance', Math.min(v.tolerance, v.required), { max: 10, tone: 'blue', hint: 'o kolik lze minout na částečný úspěch' })}
      </div>
      <h4>Použitelné dovednosti <small>platí nejvyšší úroveň</small></h4>
      <div class="pms-offer-skillpick">${Object.entries(SKILLS).map(([k, label]) => `<label class="rank-${av.skills[k] ?? 0}"><input type="checkbox" name="skill" value="${k}"><span>${icon(SKILL_ICONS[k])} ${label}${av.skills[k] ? `<b>−${av.skills[k]}</b>` : ''}</span></label>`).join('')}</div>
      <h4>Kolik vitálek smí hráč utratit</h4>
      <div class="pms-offer-caps">${Object.entries(VITALS).map(([k, label]) => `<div class="pms-offer-cap ${k}" data-picker="${k}"><span>${icon(VITAL_ICONS[k])} ${label}</span><div class="pms-offer-diamonds" aria-hidden="true">${Array.from({ length: 10 }, (_, n) => `<button type="button" tabindex="-1" data-set="${n + 1}" class="${n >= av.vitals[k] ? 'over' : ''}" title="${label}: až ${n + 1}"><span></span></button>`).join('')}</div><input type="number" name="${k}" value="0" min="0" max="10" step="1" aria-label="Limit útraty: ${label}"></div>`).join('')}</div>
      <h4>Vlivy na hod</h4>
      <div class="pms-offer-influences">
        <div class="pms-offer-segment" role="radiogroup" aria-label="Postih za zranění">${['Bez zranění', 'Zranění +1', 'Těžké +2'].map((t, n) => `<label><input type="radio" name="injury" value="${n}" ${n ? '' : 'checked'}><span>${t}</span></label>`).join('')}</div>
        <label class="pms-offer-toggle"><input type="checkbox" name="help" value="1"><span>${icon('handshake')} Podpora ostatních −1</span></label>
        <label class="pms-offer-toggle"><input type="checkbox" name="clue" value="1"><span>${icon('file-lines')} Pomoc vodítka −1</span></label>
      </div>
      <output class="pms-offer-preview" data-offer-preview></output>
    </section>
    <section class="pms-offer-calm" data-calm-panel hidden><p class="pms-offer-kind-icon" data-calm-icon></p><p data-kind-hint></p></section>
  </div>`;
}

const binomialAtLeast = (n, k, p = 1 / 3) => {
  if (k <= 0) return 1;
  let total = 0;
  for (let i = k; i <= n; i++) { let c = 1; for (let j = 0; j < i; j++) c = c * (n - j) / (j + 1); total += c * p ** i * (1 - p) ** (n - i); }
  return total;
};

/** Dice and success chances before and after the most the player may spend. */
export function offerPreview({ difficulty, required, tolerance, injury, help, clue, skills, caps }, av) {
  const skill = Math.max(0, ...skills.map(k => av.skills[k] ?? 0));
  const raw = difficulty + injury - skill - help - clue;
  const maxSpend = Object.keys(VITALS).reduce((n, k) => n + Math.min(caps[k] ?? 0, av.vitals[k] ?? 0), 0);
  const scenario = spend => { const d = Math.min(10, Math.max(0, raw - spend)), dice = 10 - d; return { difficulty: d, dice, full: binomialAtLeast(dice, required), partial: binomialAtLeast(dice, required - tolerance) }; };
  return { skill, raw, maxSpend: Math.min(maxSpend, Math.max(0, raw)), base: scenario(0), best: scenario(Math.min(maxSpend, Math.max(0, raw))) };
}
