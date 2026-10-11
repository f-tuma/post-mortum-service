import { escape as esc, icon } from './view-utils.mjs';

const CUSTOM = '__custom';

/** Every world value the GM can reference: case fields first, then anything already in play. */
export function knownStateKeys(fields = [], world = {}, events = [], label = key => key) {
  const keys = new Map();
  for (const f of fields) keys.set(f.key, { key: f.key, label: f.label, choices: f.choices ?? null, type: f.choices ? 'choice' : 'boolean' });
  const seen = [world, ...events.flatMap(e => [e.condition ?? {}, e.changes ?? {}])];
  for (const values of seen) for (const [key, value] of Object.entries(values)) {
    if (!keys.has(key)) keys.set(key, { key, label: label(key), choices: null, type: typeof value === 'boolean' ? 'boolean' : 'text' });
  }
  return [...keys.values()].sort((a, b) => a.label.localeCompare(b.label, 'cs'));
}

export function stateValueControl(name, spec, value) {
  if (spec?.choices) return `<select name="${name}-value" aria-label="Hodnota">${Object.entries(spec.choices).map(([k, v]) => `<option value="${esc(k)}" ${value === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  if (!spec || spec.type === 'boolean') return `<select name="${name}-value" aria-label="Hodnota"><option value="true" ${value !== false ? 'selected' : ''}>Ano</option><option value="false" ${value === false ? 'selected' : ''}>Ne</option></select>`;
  return `<input name="${name}-value" value="${esc(value ?? '')}" aria-label="Hodnota">`;
}

export function stateRowMarkup(name, keys, key = keys[0]?.key, value, custom = false) {
  const spec = keys.find(k => k.key === key), free = custom || (key && !spec);
  const keyControl = free
    ? `<input name="${name}-key" value="${esc(key ?? '')}" data-state-key aria-label="Klíč stavu" placeholder="např. doorOpen" pattern="[A-Za-z0-9_-]{1,64}">`
    : `<select name="${name}-key" data-state-key aria-label="Stav světa">${keys.map(k => `<option value="${esc(k.key)}" ${k.key === key ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}<option value="${CUSTOM}">Vlastní klíč…</option></select>`;
  return `<div class="pms-state-row">${keyControl}${stateValueControl(name, spec ?? (free ? { type: 'text' } : undefined), value)}<button type="button" data-remove-state-row title="Odebrat" aria-label="Odebrat">${icon('xmark')}</button></div>`;
}

export function stateRowsMarkup(name, values, keys, empty) {
  const rows = Object.entries(values ?? {}).map(([k, v]) => stateRowMarkup(name, keys, k, v)).join('');
  return `<div class="pms-state-rows" data-state-rows="${name}">${rows}<p class="pms-state-empty" ${rows ? 'hidden' : ''}>${esc(empty)}</p></div><button type="button" class="pms-state-add" data-add-state-row="${name}">${icon('plus')} Přidat</button>`;
}

const parse = (raw, spec) => {
  if (spec?.choices) return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (spec?.type === 'text' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return raw;
};

/** Reads rows written by stateRowsMarkup back into a { key: value } object. */
export function readStateRows(form, name, keys) {
  const k = form.getAll(`${name}-key`), v = form.getAll(`${name}-value`), out = {};
  k.forEach((key, i) => { key = String(key).trim(); if (key && key !== CUSTOM) out[key] = parse(String(v[i] ?? ''), keys.find(x => x.key === key)); });
  return out;
}

export function bindStateRows(root, keys) {
  const refresh = list => { list.querySelector('.pms-state-empty').hidden = !!list.querySelector('.pms-state-row'); };
  root.addEventListener('click', event => {
    const add = event.target.closest('[data-add-state-row]'), remove = event.target.closest('[data-remove-state-row]');
    if (add) { const list = root.querySelector(`[data-state-rows="${add.dataset.addStateRow}"]`); list.querySelector('.pms-state-empty').insertAdjacentHTML('beforebegin', stateRowMarkup(add.dataset.addStateRow, keys)); refresh(list); list.querySelector('.pms-state-row:last-of-type select, .pms-state-row:last-of-type input')?.focus(); }
    if (remove) { const list = remove.closest('[data-state-rows]'); remove.closest('.pms-state-row').remove(); refresh(list); }
  });
  root.addEventListener('change', event => {
    const select = event.target.closest('select[data-state-key]'); if (!select) return;
    const row = select.closest('.pms-state-row'), name = select.closest('[data-state-rows]').dataset.stateRows;
    if (select.value === CUSTOM) { const fresh = document.createElement('div'); fresh.innerHTML = stateRowMarkup(name, keys, '', '', true); const next = fresh.firstElementChild; row.replaceWith(next); next.querySelector("input")?.focus(); return; }
    row.querySelector(`[name="${name}-value"]`).outerHTML = stateValueControl(name, keys.find(k => k.key === select.value));
  });
}
