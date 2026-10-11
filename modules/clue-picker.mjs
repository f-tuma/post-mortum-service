import { escape as esc, icon } from './view-utils.mjs';
import { ARCHIVE_TABS, searchable } from './archive-view.mjs';

const tabOf = medium => ARCHIVE_TABS.find(t => t.id === medium) ?? ARCHIVE_TABS[1];

/** Case clues the GM can still reveal, filtered like the archive. */
export function filterClues(clues, revealed, { search = '', medium = 'all', hideRevealed = false } = {}) {
  const query = searchable(search);
  const counts = Object.fromEntries(ARCHIVE_TABS.map(t => [t.id, clues.filter(c => t.id === 'all' || c.medium === t.id).length]));
  const list = clues.filter(c => (medium === 'all' || c.medium === medium) && !(hideRevealed && revealed.has(c.id))
    && (!query || searchable(`${c.id} ${c.name} ${c.source} ${c.description}`).includes(query)));
  return { list, counts };
}

export function clueListMarkup(clues, revealed, view) {
  const { list } = filterClues(clues, revealed, view);
  if (!list.length) return `<p class="pms-clue-empty">${icon('folder-closed')} Žádné vodítko neodpovídá hledání.</p>`;
  return list.map(c => {
    const tab = tabOf(c.medium), done = revealed.has(c.id);
    return `<div role="button" tabindex="0" class="pms-clue-row medium-${esc(c.medium)}${c.id === view.selected ? ' is-selected' : ''}${done ? ' is-revealed' : ''}" data-clue="${esc(c.id)}" aria-pressed="${c.id === view.selected}">
      <span class="pms-file-icon medium-${esc(c.medium)}" title="${esc(tab.label)}">${icon(tab.icon)}</span>
      <span class="pms-clue-text"><small><b>${esc(c.id)}</b> · ${esc(c.source)}</small><strong>${esc(c.name)}</strong></span>
      ${done ? `<span class="pms-clue-done" title="Už je ve společném archivu">${icon('circle-check')}</span>` : ''}
    </div>`;
  }).join('');
}

export function clueDetailMarkup(clue, revealed, { at = '' } = {}) {
  if (!clue) return `<div class="pms-clue-placeholder">${icon('magnifying-glass')}<p>Vyber vodítko vlevo. Zveřejni jen to, co skupina skutečně našla nebo slyšela.</p></div>`;
  const tab = tabOf(clue.medium), done = revealed.has(clue.id);
  return `<div class="pms-clue-detail medium-${esc(clue.medium)}">
    <header><span class="pms-file-icon medium-${esc(clue.medium)}">${icon(tab.icon)}</span><div><small>${esc(clue.id)} · ${esc(tab.label)} · ${esc(clue.source)}</small><h3>${esc(clue.name)}</h3></div></header>
    ${done ? `<p class="pms-clue-status">${icon('circle-check')} Toto vodítko už je ve společném archivu.</p><button type="button" data-open-clue="${esc(clue.id)}">${icon('up-right-from-square')} Otevřít nález</button>` : `
    <input type="hidden" name="clue" value="${esc(clue.id)}">
    <label class="pms-clue-field">Název pro hráče<input name="name" value="${esc(clue.name)}" required></label>
    <label class="pms-clue-field">Co skupina skutečně zjistila<textarea name="description" rows="9">${esc(clue.description)}</textarea></label>
    <div class="pms-clue-meta"><label class="pms-clue-field">Skutečný zdroj<input name="source" value="${esc(clue.source)}" required></label><label class="pms-clue-field">Čas nálezu<input name="at" value="${esc(at)}"></label></div>
    <p class="pms-clue-hint">${icon('circle-info')} Uprav text podle detailů, které hráči opravdu získali. Archivace nepřesouvá originál.</p>`}
    ${clue.guide ? `<details class="pms-clue-guide"><summary>${icon('book-open')} Příprava vypravěče</summary><div>${esc(clue.guide.replace(/^##[^\n]*\n+/, '').replace(/\*\*/g, ''))}</div></details>` : ''}
  </div>`;
}

export function cluePickerMarkup(clues, revealed, view, detail = {}) {
  const { counts } = filterClues(clues, revealed, view);
  return `<div class="pms-clue-picker">
    <section class="pms-clue-browser">
      <label class="pms-search">${icon('magnifying-glass')}<input type="search" data-clue-search placeholder="Hledat kód, název, místo…" aria-label="Hledat vodítko" value="${esc(view.search ?? '')}"></label>
      <nav class="pms-archive-tabs pms-clue-tabs" role="tablist" aria-label="Druhy vodítek">${ARCHIVE_TABS.map(t => `<button type="button" role="tab" data-clue-medium="${t.id}" aria-selected="${(view.medium ?? 'all') === t.id}">${icon(t.icon)}<span>${t.id === 'all' ? 'Vše' : t.label}</span><small>${counts[t.id]}</small></button>`).join('')}</nav>
      <button type="button" class="pms-clue-toggle" data-clue-hide aria-pressed="${Boolean(view.hideRevealed)}">${icon('eye-slash')} Skrýt už zveřejněná <small>${revealed.size}</small></button>
      <div class="pms-clue-list" data-clue-list>${clueListMarkup(clues, revealed, view)}</div>
    </section>
    <section class="pms-clue-pane" data-clue-detail>${clueDetailMarkup(clues.find(c => c.id === view.selected), revealed, detail)}</section>
  </div>`;
}

/** Live filtering and selection inside the dialog; `save` is the dialog's submit button. */
export function bindCluePicker(root, { clues, revealed, detail, save, onOpen }) {
  const view = { search: '', medium: 'all', hideRevealed: false, selected: null };
  const list = root.querySelector('[data-clue-list]'), pane = root.querySelector('[data-clue-detail]');
  const sync = () => {
    list.innerHTML = clueListMarkup(clues, revealed, view);
    root.querySelectorAll('[data-clue-medium]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.clueMedium === view.medium)));
    if (save) save.disabled = !view.selected || revealed.has(view.selected);
  };
  const select = (id, focus = true) => { view.selected = id; pane.innerHTML = clueDetailMarkup(clues.find(c => c.id === id), revealed, detail); sync(); if (focus) pane.querySelector('input[name="name"]')?.focus(); };
  root.querySelector('[data-clue-search]').addEventListener('input', e => { view.search = e.target.value; sync(); });
  const hide = root.querySelector('[data-clue-hide]');
  hide.addEventListener('click', () => { view.hideRevealed = !view.hideRevealed; hide.setAttribute('aria-pressed', String(view.hideRevealed)); sync(); });
  root.addEventListener('click', e => {
    const tab = e.target.closest('[data-clue-medium]'), row = e.target.closest('[data-clue]'), open = e.target.closest('[data-open-clue]');
    if (tab) { view.medium = tab.dataset.clueMedium; sync(); }
    if (row) select(row.dataset.clue);
    if (open) onOpen?.(open.dataset.openClue);
  });
  root.addEventListener('keydown', e => {
    const row = e.target.closest?.('[data-clue]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(row.dataset.clue); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || !e.target.closest('[data-clue-list],[data-clue-search]')) return;
    const rows = [...list.querySelectorAll('[data-clue]')]; if (!rows.length) return;
    e.preventDefault();
    const i = rows.findIndex(r => r.dataset.clue === view.selected), next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    select(next.dataset.clue, false); list.querySelector(`[data-clue="${CSS.escape(next.dataset.clue)}"]`)?.focus();
  });
  sync();
  return view;
}
