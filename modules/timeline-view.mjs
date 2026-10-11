import { escape as esc, icon, time, span } from './view-utils.mjs';
import {caseTime} from './case-clock.mjs';
import { canOfferAction } from './visit-state.mjs';
import { eventConnections, eventThreads, forecastEvents, chronological } from './timeline-state.mjs';
import { layoutThreads, timelineWidth, timelineTickStep, isCompactScale, CARD_METRICS, LABEL_WIDTH, CANVAS_PAD, TRACK_HEIGHT } from './timeline-layout.mjs';

export const STATUS = { pending: 'Čeká', happened: 'Nastalo', skipped: 'Odkloněno' };
export const FORECAST = {
  likely: { label: 'Nastane', icon: 'circle-check', hint: 'Při současném stavu světa nastane.' },
  blocked: { label: 'Nenastane', icon: 'circle-xmark', hint: 'Při současném stavu světa nenastane.' },
  happened: { label: 'Nastalo', icon: 'check', hint: 'Událost proběhla.' },
  skipped: { label: 'Odkloněno', icon: 'ban', hint: 'Událost se neuskutečnila.' }
};
const VISIBILITY = {
  hidden: { icon: 'eye-slash', label: 'Skrytá · hráči ji nevidí' },
  observed: { icon: 'eye', label: 'Vidí ji celá výprava' },
  ask: { icon: 'user-check', label: 'Vypravěč určí svědky' }
};
const ACTION_STATUS = { offered: 'čeká na hráče', ready: 'připraveno', running: 'probíhá', awaitingRoll: 'čeká na hod', paused: 'přerušeno', completed: 'hotovo', cancelled: 'zrušeno' };
const LINK_KIND = { required: 'Navazuje', enables: 'Umožní', blocks: 'Zablokuje' };
// How a related card relates to the selected one, read from that card's point of view.
const RELATION = {
  up: { required: 'Předpoklad', enables: 'Umožní ji', blocks: 'Zablokuje ji' },
  down: { required: 'Navazuje', enables: 'Umožní', blocks: 'Zablokuje' }
};
const KIND_ICON = { required: 'link', enables: 'unlock', blocks: 'lock' };
const strongest = kinds => kinds.has('blocks') ? 'blocks' : kinds.has('enables') ? 'enables' : 'required';

/** Direct causes ("up") and consequences ("down") of the selected event, with the reasons. */
export function eventRelations(links, selected) {
  const map = new Map();
  if (!selected) return map;
  const add = (id, dir, l) => {
    const r = map.get(id) ?? { dir, kinds: new Set(), keys: new Set(), delay: null };
    r.kinds.add(l.kind); if (l.key) r.keys.add(l.key); if (l.kind === 'required') r.delay = l.delay;
    map.set(id, r);
  };
  for (const l of links) { if (l.to === selected && l.from !== selected) add(l.from, 'up', l); else if (l.from === selected && l.to !== selected) add(l.to, 'down', l); }
  for (const r of map.values()) r.kind = strongest(r.kinds);
  return map;
}

/** Everything the timeline derives from the private visit state, computed once per render. */
export function timelineModel(s, ui = {}) {
  const events = chronological(s.events);
  const threads = eventThreads(events);
  const scale = ui.scale ?? 1, compact = isCompactScale(scale), card = compact ? CARD_METRICS.compact : CARD_METRICS.full;
  const layout = layoutThreads(threads, s.start, scale, card);
  const links = eventConnections(events);
  const forecast = forecastEvents(s);
  const relations = eventRelations(links, ui.selected);
  const neighbours = new Map(events.map(e => [e.id, { up: new Set(), down: new Set() }]));
  for (const l of links) { neighbours.get(l.to)?.up.add(l.from); neighbours.get(l.from)?.down.add(l.to); }
  const threadOf = new Map(threads.flatMap(t => t.events.map(e => [e.id, t])));
  return { events, threads, layout, links, forecast, relations, neighbours, threadOf, scale, compact, card, multiDay:s.end>=1440, x: at => CANVAS_PAD + (at - s.start) * scale };
}

export function primaryCommand(s) {
  if (s.status !== 'active') return null;
  const planning = s.round.phase === 'planning', done = s.round.phase === 'done';
  const disabled = Boolean(s.pause || s.actions.some(a => a.status === 'awaitingRoll') || (planning && (!s.actions.some(a => a.status === 'ready') || s.actions.some(a => a.status === 'offered'))));
  return { command: planning ? 'start' : done ? 'nextRound' : 'advance', label: planning ? 'Zahájit kolo' : done ? 'Další kolo' : 'Další mezník', icon: planning ? 'play' : done ? 'forward-step' : 'forward', disabled };
}

export function blockerText(s) {
  if (s.status !== 'active' || s.round.phase === 'done') return '';
  if (s.pause) return s.pause.kind === 'observation' ? 'Urči svědky události.' : s.pause.kind === 'reaction' ? 'Dokončete reakci a potvrď pokračování.' : 'Vyber pořadí souběžných dějů.';
  const waiting = s.actions.filter(a => a.status === 'awaitingRoll' || s.round.phase === 'planning' && a.status === 'offered');
  if (waiting.length) return `Čekáme na ${waiting.some(a => a.status === 'awaitingRoll') ? 'hod' : 'potvrzení akce'}: ${[...new Set(waiting.map(a => s.avatars.find(av => av.id === a.avatarId)?.name ?? a.title))].join(', ')}.`;
  return s.round.phase === 'planning' && !s.actions.some(a => a.status === 'ready') ? 'Zadej akce výpravě. Kolo začne po jejich potvrzení.' : '';
}

function phaseText(s) {
  if (s.status === 'returned') return 'Výprava se vrátila';
  return `Kolo ${s.round.number} · ${s.round.phase === 'planning' ? 'plánování' : s.round.phase === 'running' ? 'běží' : 'dokončeno'}`;
}

/** Czech labels for world values, provided by the case when one is installed. */
export const plainLabels = { label: key => key, value: (_key, v) => typeof v === 'boolean' ? (v ? 'Ano' : 'Ne') : String(v ?? '—'), field: () => null };

function toolbar(s, ui, ctx) {
  const time=at=>caseTime(at,s.end>=1440);
  const primary = primaryCommand(s), blocker = ctx.writable?blockerText(s):'', remaining = s.end - s.clock;
  return `<header class="pms-tl-bar">
    <div class="pms-tl-clock"><strong>${time(s.clock)}</strong><div><span>${esc(phaseText(s))}</span><span>${s.status === 'active' ? `MHD ${time(s.end)} · zbývá ${span(remaining)}` : `MHD ${time(s.end)}`}</span></div></div>
    <div class="pms-tl-flow">${primary ? `<button type="button" class="pms-primary" data-visit-command="${primary.command}" ${primary.disabled||!ctx.writable ? 'disabled' : ''}>${icon(primary.icon)} ${primary.label}</button>` : `<button type="button" class="pms-primary" data-timeline="create" ${!ctx.writable?'disabled':''}>${icon('train-subway')} Připravit odjezd v MHD</button>`}${blocker ? `<p class="pms-tl-status" role="status">${icon('circle-info')} ${esc(blocker)}</p>` : ''}</div>
    <nav class="pms-tl-tools" aria-label="Ovládání časové osy">
      <div class="pms-tl-group" role="group" aria-label="Měřítko"><button type="button" data-timeline="zoomOut" title="Oddálit (Ctrl + kolečko)" aria-label="Oddálit">${icon('minus')}</button><button type="button" data-timeline="fit" aria-pressed="${ui.overview}" title="Zobrazit celý případ">${icon('arrows-left-right-to-line')}<span>Celý případ</span></button><button type="button" data-timeline="zoomIn" title="Přiblížit (Ctrl + kolečko)" aria-label="Přiblížit">${icon('plus')}</button></div>
      <button type="button" data-timeline="now" title="Posunout na aktuální čas">${icon('location-crosshairs')}<span>Teď</span></button>
      ${s.status==='active'&&s.round.phase==='running'?`<button type="button" data-visit-command="sceneReaction" ${!ctx.writable||s.pause||s.actions.some(a=>a.status==='awaitingRoll')?'disabled':''} title="Otevřít reakci na právě zaznamenanou situaci, například při příchodu do rozběhnutého děje">${icon('bolt')}<span>Reakce</span></button>`:''}
      <span class="pms-tl-sep" aria-hidden="true"></span>
      <button type="button" data-timeline="add" ${!ctx.writable||s.status !== 'active' ? 'disabled' : ''} title="Přidat budoucí událost">${icon('calendar-plus')}<span>Událost</span></button>
      <button type="button" data-timeline="conditions" ${!ctx.writable||s.status!=='active'?'disabled':''} title="${ctx.hasCase ? 'Stav případu' : 'Stav scény'}">${icon('sliders')}<span>Stav</span></button>
      ${ctx.hasCase?`<button type="button" data-timeline="rewards" title="Rozluštění a energie">${icon('square-check')}<span>Poznání</span></button>`:''}
      ${ctx.hasCase&&s.status==='returned'?`<button type="button" data-timeline="result" title="Skutečný výsledek prvního průchodu">${icon('book-bookmark')}<span>Výsledek</span></button>`:''}
      <button type="button" data-timeline="guide" title="Příručka vypravěče" aria-label="Příručka vypravěče">${icon('book-open')}</button>
      <button type="button" data-timeline="fullscreen" title="${ctx.fullscreen ? 'Zobrazit v okně' : 'Na celou obrazovku'}" aria-label="${ctx.fullscreen ? 'Zobrazit v okně' : 'Na celou obrazovku'}">${icon(ctx.fullscreen ? 'down-left-and-up-right-to-center' : 'up-right-and-down-left-from-center')}</button>
      ${ctx.fullscreen ? `<button type="button" data-timeline="close" title="Zavřít časovou osu">${icon('arrow-left')}<span>Zpět do hry</span></button>` : ''}
    </nav>
  </header>`;
}

function relationText(r, ctx) {
  const detail = [...r.keys].map(k => ctx.label(k));
  if (r.kinds.has('required') && r.delay) detail.unshift(`prodleva ${span(r.delay)}`);
  return `${RELATION[r.dir][r.kind]}${detail.length ? `: ${detail.join(', ')}` : ''}`;
}

function eventCard(e, m, ui, ctx) {
  const time=at=>caseTime(at,m.multiDay);
  const p = m.layout.positions.get(e.id), f = m.forecast.get(e.id), fc = FORECAST[f.outcome], vis = VISIBILITY[e.visibility] ?? VISIBILITY.ask;
  const r = m.relations.get(e.id), n = m.neighbours.get(e.id);
  const rel = e.id === ui.selected ? 'is-selected' : r ? `rel-${r.dir} rel-${r.kind}` : '';
  const reason = f.outcome === 'blocked' ? ` · ${f.blockers.length} ${f.blockers.length === 1 ? 'překážka' : f.blockers.length < 5 ? 'překážky' : 'překážek'}` : '';
  const relation = r ? relationText(r, ctx) : '';
  const tag = r ? `<span class="pms-tl-rel">${icon(KIND_ICON[r.kind])}<span>${RELATION[r.dir][r.kind]}</span></span>` : '';
  return `<button type="button" class="pms-tl-event tone-${e.color ?? 'sage'} fc-${f.outcome} ${rel}" data-event-id="${esc(e.id)}" data-up="${esc([...n.up].join(' '))}" data-down="${esc([...n.down].join(' '))}" style="left:${p.x}px;top:${p.y}px" aria-pressed="${e.id === ui.selected}" aria-label="${esc(`${time(e.at)} ${e.title} · ${fc.label}${relation ? ` · ${relation}` : ''}`)}" title="${esc(`${e.title}\n${time(e.at)} · ${fc.hint}${reason}${relation ? `\n${relation}` : ''}`)}">
    <span class="pms-tl-event-head"><time>${time(e.at)}</time>${tag || `<span class="pms-tl-event-icons">${e.canReact ? `<i class="fa-solid fa-bolt" title="Možná reakce"></i>` : ''}<i class="fa-solid fa-${vis.icon}" title="${vis.label}"></i><i class="fa-solid fa-${fc.icon} pms-tl-fc" title="${fc.hint}"></i></span>`}</span>
    <strong>${esc(e.title)}</strong>
  </button>`;
}

/** Ruler marks: always visible, so a related event off screen still shows when it happens. */
function rulerMarks(s, m, ui, ctx) {
  const time=at=>caseTime(at,s.end>=1440);
  if (!ui.selected) return '';
  const selected = s.events.find(e => e.id === ui.selected);
  const marks = [...m.relations].map(([id, r]) => { const e = s.events.find(x => x.id === id); return e ? `<button type="button" class="pms-tl-mark rel-${r.dir} rel-${r.kind}" data-select-event="${esc(id)}" style="left:${m.x(e.at)}px" title="${esc(`${time(e.at)} · ${e.title}\n${relationText(r, ctx)}`)}" aria-label="${esc(`${e.title}, ${relationText(r, ctx)}`)}"></button>` : ''; });
  return marks.join('') + (selected ? `<span class="pms-tl-mark is-selected" style="left:${m.x(selected.at)}px" aria-hidden="true"></span>` : '');
}

function rowRelations(row, m) {
  const ids = m.threads.find(t => t.id === row.id)?.events.map(e => e.id) ?? [];
  const up = ids.filter(id => m.relations.get(id)?.dir === 'up').length, down = ids.filter(id => m.relations.get(id)?.dir === 'down').length;
  if (!up && !down) return '';
  return `<span class="pms-tl-rowrel">${up ? `<b class="rel-up" title="Příčiny vybrané události v této linii">${icon('arrow-right')} ${up}</b>` : ''}${down ? `<b class="rel-down" title="Důsledky vybrané události v této linii">${icon('arrow-left')} ${down}</b>` : ''}</span>`;
}

function stage(s, m, ui, ctx) {
  const time=at=>caseTime(at,s.end>=1440);
  const width = timelineWidth(s.end - s.start, m.scale), canvasWidth = width - LABEL_WIDTH;
  const tracksTop = m.layout.height + 30, height = tracksTop + s.avatars.length * TRACK_HEIGHT + 24;
  const step = timelineTickStep(m.multiDay?m.scale*.6:m.scale);
  let ticks = '', grid = '';
  const first = Math.ceil(s.start / step) * step;
  for (let at = first; at <= s.end; at += step) { ticks += `<span class="pms-tl-tick" style="left:${m.x(at)}px">${time(at)}</span>`; grid += `<span class="pms-tl-gridline${at % 60 ? ' minor' : ''}" style="left:${m.x(at)}px"></span>`; }
  const rows = m.layout.rows.map((r, i) => `<div class="pms-tl-rowband${i % 2 ? ' alt' : ''}" style="top:${r.top}px;height:${r.height}px"></div>`).join('');
  const labels = m.layout.rows.map(r => `<div class="pms-tl-rowlabel" style="top:${r.top}px;height:${r.height}px"><strong title="${esc(r.label)}">${esc(r.label)}</strong><small>${r.count} ${r.count === 1 ? 'událost' : r.count < 5 ? 'události' : 'událostí'}${rowRelations(r, m)}</small></div>`).join('')
    + `<div class="pms-tl-rowlabel pms-tl-section" style="top:${tracksTop - 26}px;height:26px"><small>Výprava</small></div>`
    + s.avatars.map((av, i) => `<div class="pms-tl-rowlabel pms-tl-tracklabel" style="top:${tracksTop + i * TRACK_HEIGHT}px;height:${TRACK_HEIGHT}px"><button type="button" data-actor="${esc(av.actorId)}" title="Otevřít deník">${av.alive ? icon('user') : icon('ghost')} ${esc(av.name.split('·')[0].trim())}</button></div>`).join('');
  const tracks = s.avatars.map((av, i) => `<div class="pms-tl-track${i % 2 ? ' alt' : ''}" style="top:${tracksTop + i * TRACK_HEIGHT}px;height:${TRACK_HEIGHT}px">${s.actions.filter(a => a.avatarId === av.id && a.start !== null).map(a => {
    const end = a.end ?? a.start + a.duration;
    return `<button type="button" class="pms-tl-action st-${a.status} kind-${a.kind}" data-actor="${esc(av.actorId)}" style="left:${m.x(a.start)}px;width:${Math.max(28, (end - a.start) * m.scale)}px" title="${esc(`${a.title} · ${time(a.start)}–${time(end)} · ${ACTION_STATUS[a.status] ?? a.status}`)}">${esc(a.title)}</button>`;
  }).join('')}</div>`).join('');
  return `<div class="pms-tl-scroll" tabindex="-1"><div class="pms-tl-stage">
    <div class="pms-tl-corner"><span>Linie</span></div>
    <div class="pms-tl-ruler" style="width:${canvasWidth}px">${ticks}<span class="pms-tl-ruler-now" style="left:${m.x(s.clock)}px">${time(s.clock)}</span>${rulerMarks(s, m, ui, ctx)}</div>
    <div class="pms-tl-labels" style="min-height:${height}px">${labels}</div>
    <div class="pms-tl-canvas" style="width:${canvasWidth}px;min-height:${height}px">
      ${rows}<div class="pms-tl-sectionband" style="top:${tracksTop - 26}px"></div><div class="pms-tl-trackbg" style="top:${tracksTop}px"></div>${grid}
      <div class="pms-tl-past" style="width:${Math.max(0, m.x(s.clock))}px"></div>
      <div class="pms-tl-end" style="left:${m.x(s.end)}px"><span>MHD</span></div>
      ${m.events.map(e => eventCard(e, m, ui, ctx)).join('')}
      ${tracks}
      <div class="pms-tl-now" style="left:${m.x(s.clock)}px"></div>
    </div>
  </div></div>`;
}

function badge(outcome) { const f = FORECAST[outcome]; return `<span class="pms-tl-badge fc-${outcome}" title="${f.hint}">${icon(f.icon)} ${f.label}</span>`; }
const eventButton = (e, extra = '') => e ? `<button type="button" class="pms-tl-link" data-select-event="${esc(e.id)}">${esc(e.title)}</button>${extra}` : '<span>Neznámá událost</span>';

function lever(key, s, ctx) {
  const field = ctx.field(key), current = s.world[key];
  if (field?.choices) return `<label class="pms-tl-lever"><span>Ve světě teď</span><select data-world-key="${esc(key)}" ${!ctx.writable?'disabled':''}>${Object.entries(field.choices).map(([k, v]) => `<option value="${esc(k)}" ${current === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  if (typeof current === 'boolean' || field) return `<div class="pms-tl-lever" role="group" aria-label="Ve světě teď: ${esc(ctx.label(key))}"><span>Ve světě teď</span>${[true, false].map(v => `<button type="button" data-world-key="${esc(key)}" data-world-value="${v}" aria-pressed="${Boolean(current) === v}"${!ctx.writable?' disabled':''}>${esc(ctx.value(key, v))}</button>`).join('')}</div>`;
  return '';
}

function conditionRows(e, f, s, m, ctx) {
  const time=at=>caseTime(at,s.end>=1440);
  const byId = id => s.events.find(x => x.id === id);
  const editable = s.status === 'active' && e.status === 'pending';
  const deps = (e.dependencies ?? []).map(d => {
    const src = byId(d.id), sf = m.forecast.get(d.id)?.outcome ?? 'blocked', ok = ['happened', 'likely'].includes(sf);
    return `<li class="${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'xmark')}<div><span class="pms-tl-cond-label">Po události ${eventButton(src)}</span><small>${d.delay ? `nejdřív za ${span(d.delay)} · ` : ''}${FORECAST[sf].label.toLowerCase()}</small></div></li>`;
  });
  const conds = Object.entries(e.condition ?? {}).map(([key, expected]) => {
    const blocker = f.blockers.find(b => b.kind === 'condition' && b.key === key), ok = !blocker;
    const enablers = s.events.filter(x => x.id !== e.id && x.status === 'pending' && x.at <= e.at && x.changes?.[key] === expected);
    const note = blocker
      ? `<small>v ${time(e.at)} bude: <b>${esc(ctx.value(key, blocker.actual))}</b>${blocker.setBy ? ` (změní ${eventButton(byId(blocker.setBy))})` : ''}${enablers.length ? ` · zajistit může ${enablers.map(x => eventButton(x, ` <em class="fc-${m.forecast.get(x.id).outcome}">${FORECAST[m.forecast.get(x.id).outcome].label.toLowerCase()}</em>`)).join(', ')}` : ''}</small>`
      : '';
    return `<li class="${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'xmark')}<div><span class="pms-tl-cond-label">${esc(ctx.label(key))} <b>= ${esc(ctx.value(key, expected))}</b></span>${note}${editable ? lever(key, s, ctx) : ''}</div></li>`;
  });
  return [...deps, ...conds].join('');
}

function inspector(e, s, m, ctx) {
  const time=at=>caseTime(at,s.end>=1440);
  const f = m.forecast.get(e.id), vis = VISIBILITY[e.visibility] ?? VISIBILITY.ask, thread = m.threadOf.get(e.id);
  const byId = id => s.events.find(x => x.id === id);
  const requirements = conditionRows(e, f, s, m, ctx);
  const changes = Object.entries(e.changes ?? {}).map(([k, v]) => `<li><span>${esc(ctx.label(k))}</span><b>${esc(ctx.value(k, v))}</b></li>`).join('');
  const effects = m.links.filter(l => l.from === e.id).map(l => {
    const target = byId(l.to), tf = m.forecast.get(l.to)?.outcome ?? 'blocked';
    return `<li class="kind-${l.kind}"><span class="pms-tl-kind">${LINK_KIND[l.kind]}</span><div>${eventButton(target)}<small>${time(target?.at ?? 0)}${l.key ? ` · ${esc(ctx.label(l.key))}` : ''} · ${FORECAST[tf].label.toLowerCase()}</small></div></li>`;
  }).join('');
  return `<div class="pms-tl-detail tone-${e.color ?? 'sage'}">
    <header>
      <div class="pms-tl-detail-meta"><time>${time(e.at)}</time>${badge(f.outcome)}<button type="button" class="pms-tl-icon" data-timeline="deselect" title="Zpět na přehled" aria-label="Zpět na přehled">${icon('xmark')}</button></div>
      <h2>${esc(e.title)}</h2>
      <ul class="pms-tl-chips">${e.location ? `<li>${icon('location-dot')} ${esc(e.location)}</li>` : ''}<li>${icon(vis.icon)} ${vis.label}</li>${e.canReact ? `<li>${icon('bolt')} Možná reakce</li>` : ''}${thread ? `<li>${icon('code-branch')} ${esc(thread.label)}</li>` : ''}</ul>
    </header>
    ${e.description ? `<p class="pms-tl-desc">${esc(e.description)}</p>` : ''}
    <section><h3>Co musí platit</h3>${requirements ? `<ul class="pms-tl-conds">${requirements}</ul>` : '<p class="pms-tl-muted">Nastane vždy, nic ji nepodmiňuje.</p>'}</section>
    <section><h3>Co změní</h3>${changes ? `<ul class="pms-tl-changes">${changes}</ul>` : '<p class="pms-tl-muted">Nemění stav světa.</p>'}</section>
    <section><h3>Na co má vliv</h3>${effects ? `<ul class="pms-tl-effects">${effects}</ul>` : '<p class="pms-tl-muted">Žádná další událost na ní nezávisí.</p>'}</section>
    ${e.trace || e.witnesses ? `<section class="pms-tl-notes">${e.trace ? `<h3>Zanechaná stopa</h3><p>${esc(e.trace)}</p>` : ''}${e.witnesses ? `<h3>NPC svědci</h3><p>${esc(e.witnesses)}</p>` : ''}</section>` : ''}
    ${s.status === 'active' && e.status === 'pending' ? `<footer><button type="button" data-timeline="edit" ${!ctx.writable?'disabled':''}>${icon('pen')} Upravit událost</button></footer>` : ''}
  </div>`;
}

function agenda(s, m, ctx) {
  const time=at=>caseTime(at,s.end>=1440);
  const pending = m.events.filter(e => e.status === 'pending');
  const next = pending.slice(0, 8), blocked = pending.filter(e => m.forecast.get(e.id).outcome === 'blocked');
  const row = e => { const f = m.forecast.get(e.id).outcome; return `<li><button type="button" class="pms-tl-agenda-item tone-${e.color ?? 'sage'} fc-${f}" data-select-event="${esc(e.id)}"><time>${time(e.at)}</time><span><strong>${esc(e.title)}</strong><small>za ${span(e.at - s.clock)}</small></span>${icon(FORECAST[f].icon)}</button></li>`; };
  return `<div class="pms-tl-agenda">
    <h2>Nadcházející</h2>
    ${next.length ? `<ol>${next.map(row).join('')}</ol>` : '<p class="pms-tl-muted">Žádná další připravená událost.</p>'}
    ${blocked.length ? `<h3>${icon('circle-xmark')} Při současném stavu nenastane · ${blocked.length}</h3><ol class="pms-tl-blocked">${blocked.map(row).join('')}</ol>` : ''}
    <dl class="pms-tl-legend">
      <div><dt><span class="pms-tl-swatch fc-likely"></span></dt><dd>Nastane, pokud se nic nezmění</dd></div>
      <div><dt><span class="pms-tl-swatch fc-blocked"></span></dt><dd>Nenastane · otevři ji a uvidíš proč</dd></div>
      <div><dt><span class="pms-tl-swatch rel-up"></span></dt><dd>Příčina vybrané události</dd></div>
      <div><dt><span class="pms-tl-swatch rel-down"></span></dt><dd>Důsledek vybrané události</dd></div>
      <div><dt><span class="pms-tl-swatch rel-blocks"></span></dt><dd>Zablokuje, nebo je blokována</dd></div>
    </dl>
    <p class="pms-tl-hint">${icon('hand-pointer')} Klikni na událost: související karty dostanou štítek a na pravítku nahoře uvidíš, kdy se dějí. ${ctx.writable?'Tažením karty ji přesuneš. ':''}Ctrl + kolečko mění měřítko, tažením prázdné plochy se posouváš.</p>
  </div>`;
}

function party(s, ctx) {
  const time=at=>caseTime(at,s.end>=1440);
  return `<footer class="pms-tl-party" aria-label="Výprava">${s.avatars.map(av => {
    const current = s.actions.filter(a => a.avatarId === av.id && ['offered', 'ready', 'running', 'awaitingRoll', 'paused'].includes(a.status)).at(-1);
    return `<div class="pms-tl-member${av.alive ? '' : ' is-dead'}"><button type="button" class="pms-tl-member-name" data-actor="${esc(av.actorId)}" title="Otevřít deník">${icon(av.alive ? 'user' : 'ghost')} ${esc(av.name)}</button><span class="pms-tl-member-state">${current ? `${esc(current.title)} · ${ACTION_STATUS[current.status]}${current.status === 'running' && current.end ? ` do ${time(current.end)}` : ''}` : av.alive ? 'bez akce' : 'duše'}</span>${s.status === 'active' && av.alive ? `<button type="button" data-visit-command="offer" data-avatar="${esc(av.id)}" ${ctx.writable&&canOfferAction(s, av) ? '' : 'disabled'}>${icon('plus')} Akce</button><button type="button" class="pms-tl-icon" data-visit-command="death" data-avatar="${esc(av.id)}" ${!ctx.writable?'disabled':''} title="Smrt Avatara" aria-label="Smrt Avatara: ${esc(av.name)}">${icon('skull')}</button>` : ''}</div>`;
  }).join('')}</footer>`;
}

const authorityNotice=ctx=>ctx.writable?'':`<div class="pms-tl-authority" role="status">${icon('lock')}<span><strong>Pouze pro čtení</strong> · ${esc(ctx.authorityMessage||'Zápisy řídí hlavní okno vypravěče.')}</span></div>`;
export function emptyTimelineMarkup(ctx = {writable:true}) {
  return `<div class="pms-tl-empty"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i><h2>Časová osa případu</h2>${authorityNotice(ctx)}<p>Připrav výpravu ze skutečných Avatarů ve Foundry.</p><button type="button" class="pms-primary" data-timeline="create" ${!ctx.writable?'disabled':''}>${icon('train-subway')} Připravit odjezd v MHD</button></div>`;
}

/** Full GM timeline. `ctx` supplies case labels and the pause controls rendered by VisitControls. */
export function timelineMarkup(s, ui, ctx = {}) {
  ctx = { ...plainLabels, hasCase: false, pauseHtml: '', writable:true, authorityMessage:'', ...ctx };
  const m = timelineModel(s, ui), selected = s.events.find(e => e.id === ui.selected);
  return `<div class="pms-tl ${ui.overview ? 'overview' : 'detail'}${m.compact ? ' compact' : ''}${selected ? ' has-selection' : ''}${ui.inspectorHidden ? ' inspector-hidden' : ''}${ctx.writable?'':' is-readonly'}${m.multiDay?' is-multi-day':''}">
    ${toolbar(s, ui, ctx)}
    ${authorityNotice(ctx)}
    ${ctx.pauseHtml ? `<div class="pms-tl-decision" role="alert">${ctx.writable?ctx.pauseHtml:`<fieldset disabled class="pms-tl-readonly-pause">${ctx.pauseHtml}</fieldset>`}</div>` : ''}
    <div class="pms-tl-body">${stage(s, m, ui, ctx)}<aside class="pms-tl-inspector" aria-label="${selected ? 'Detail události' : 'Přehled'}">${selected ? inspector(selected, s, m, ctx) : agenda(s, m, ctx)}</aside></div>
    ${party(s, ctx)}
  </div>`;
}
