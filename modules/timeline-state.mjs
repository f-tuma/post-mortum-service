export function validateEventGraph(events) {
  const byId = new Map(events.map(e => [e.id, e]));
  const visiting = new Set(), done = new Set();
  function visit(e) {
    if (visiting.has(e.id)) throw new Error("Události nesmějí tvořit kruhovou závislost.");
    if (done.has(e.id)) return;
    visiting.add(e.id);
    for (const dep of e.dependencies ?? []) {
      const source = byId.get(dep.id);
      if (!source || source.id === e.id) throw new Error("Neplatný předpoklad události.");
      visit(source);
      if (source.at + dep.delay > e.at) throw new Error("Událost musí nastat až po svých předpokladech a prodlevě.");
    }
    visiting.delete(e.id); done.add(e.id);
  }
  events.forEach(visit);
}
export function rescheduleEvent(events, id, at, { clock, end, ripple = false } = {}) {
  const event = events.find(e => e.id === id);
  if (!event || event.status !== "pending") throw new Error("Přesouvat lze pouze budoucí událost.");
  if (!Number.isInteger(at) || at <= clock || at > end) throw new Error("Událost musí zůstat před MHD a po aktuálním čase.");
  const delta = at - event.at;
  event.at = at; event.revision = (event.revision ?? 0) + 1;
  if (ripple && delta) {
    const affected = new Set([id]);
    let changed = true;
    while (changed) { changed = false; for (const e of events) if (!affected.has(e.id) && (e.dependencies ?? []).some(d => affected.has(d.id))) { affected.add(e.id); changed = true; } }
    for (const e of events) if (e.id !== id && affected.has(e.id)) {
      if (e.status !== "pending") throw new Error("Posun by přepsal proběhlou návaznou událost.");
      e.at += delta; e.revision = (e.revision ?? 0) + 1;
    }
    for (let pass = 0; pass < events.length; pass++) for (const e of events) if (affected.has(e.id)) e.at = Math.max(e.at, ...(e.dependencies ?? []).map(d => events.find(s => s.id === d.id).at + d.delay));
    if (events.some(e => affected.has(e.id) && (e.at <= clock || e.at > end))) throw new Error("Návazný posun přesahuje časové okno výpravy.");
  }
  validateEventGraph(events);
}

/** Events in the order they can fire: by time, prerequisites first within the same minute. */
export function chronological(events) {
  const byId = new Map(events.map(e => [e.id, e])), depth = new Map();
  const depthOf = e => {
    if (depth.has(e.id)) return depth.get(e.id);
    depth.set(e.id, 0);
    const d = Math.max(0, ...(e.dependencies ?? []).map(x => byId.has(x.id) ? depthOf(byId.get(x.id)) + 1 : 0));
    depth.set(e.id, d); return d;
  };
  return events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || depthOf(a.e) - depthOf(b.e) || a.i - b.i).map(x => x.e);
}

/**
 * Every causal link between events: a fixed prerequisite, or an earlier change of a world value
 * that a later event requires ("enables") or that contradicts its requirement and is not
 * undone by a later enabling change ("blocks").
 */
export function eventConnections(events) {
  const links = [];
  for (const target of events) {
    for (const d of target.dependencies ?? []) links.push({ from: d.id, to: target.id, kind: "required", delay: d.delay });
    for (const [key, value] of Object.entries(target.condition ?? {})) {
      const setters = events.filter(source => source.id !== target.id && source.at <= target.at && Object.hasOwn(source.changes ?? {}, key));
      // A contradicting change matters only if nothing restores the required value after it.
      const lastEnabler = Math.max(-Infinity, ...setters.filter(x => x.changes[key] === value).map(x => x.at));
      for (const source of setters) {
        const enables = source.changes[key] === value;
        if (enables || source.at > lastEnabler) links.push({ from: source.id, to: target.id, kind: enables ? "enables" : "blocks", key, value: source.changes[key] });
      }
    }
  }
  return links;
}

/**
 * Plays the remaining events against the current world exactly as the visit reducer would
 * if the GM let every minute run unchanged. Shows which future events will fire and why not.
 */
export function forecastEvents({ events, world = {} }) {
  const sim = { ...world }, setBy = new Map(), result = new Map();
  for (const e of chronological(events)) {
    if (e.status !== "pending") { result.set(e.id, { outcome: e.status, blockers: [] }); continue; }
    const blockers = [];
    for (const d of e.dependencies ?? []) {
      const source = events.find(x => x.id === d.id), f = result.get(d.id);
      if (!source || !["happened", "likely"].includes(f?.outcome)) blockers.push({ kind: "dependency", id: d.id, outcome: f?.outcome ?? "missing" });
    }
    for (const [key, expected] of Object.entries(e.condition ?? {})) {
      if (sim[key] !== expected) blockers.push({ kind: "condition", key, expected, actual: sim[key], setBy: setBy.get(key) ?? null });
    }
    if (!blockers.length) for (const [key, value] of Object.entries(e.changes ?? {})) { sim[key] = value; setBy.set(key, e.id); }
    result.set(e.id, { outcome: blockers.length ? "blocked" : "likely", blockers });
  }
  return result;
}

const firstWord = title => String(title ?? "").trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, "") ?? "";

/**
 * Story threads for the swimlanes. An explicit `thread` wins; otherwise events joined by fixed
 * prerequisites form one thread, and a lone event joins the thread whose changes it reads.
 */
export function eventThreads(events) {
  const parent = new Map(events.map(e => [e.id, e.id]));
  const find = id => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const explicit = events.filter(e => e.thread?.trim()), implicit = events.filter(e => !e.thread?.trim());
  const implicitIds = new Set(implicit.map(e => e.id));
  for (const e of implicit) for (const d of e.dependencies ?? []) if (implicitIds.has(d.id)) union(d.id, e.id);
  const size = id => implicit.filter(e => find(e.id) === find(id)).length;
  for (const e of implicit) {
    if (size(e.id) > 1) continue;
    const reads = new Set([...Object.keys(e.condition ?? {}), ...Object.keys(e.changes ?? {})]);
    const partner = implicit.find(o => o.id !== e.id && size(o.id) > 1 && Object.keys(o.changes ?? {}).some(k => reads.has(k)));
    if (partner) union(partner.id, e.id);
  }
  const groups = new Map();
  for (const e of explicit) { const key = `thread:${e.thread.trim()}`; if (!groups.has(key)) groups.set(key, { id: key, label: e.thread.trim(), events: [] }); groups.get(key).events.push(e); }
  const loose = [];
  for (const e of implicit) {
    if (size(e.id) === 1) { loose.push(e); continue; }
    const key = `auto:${find(e.id)}`;
    if (!groups.has(key)) groups.set(key, { id: key, label: "", events: [] });
    groups.get(key).events.push(e);
  }
  for (const group of groups.values()) {
    group.events.sort((a, b) => a.at - b.at);
    if (group.label) continue;
    const counts = new Map();
    for (const e of group.events) { const w = firstWord(e.title); if (w) counts.set(w, (counts.get(w) ?? 0) + 1); }
    const [word, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    group.label = count >= 2 ? word : group.events[0].title;
  }
  const threads = [...groups.values()].sort((a, b) => a.events[0].at - b.events[0].at);
  if (loose.length) threads.push({ id: "loose", label: "Samostatné události", events: loose.sort((a, b) => a.at - b.at) });
  return threads;
}

/** Direct causes and direct consequences of one event, for highlighting on the timeline. */
export function relatedEvents(links, id) {
  const upstream = new Set(), downstream = new Set();
  for (const l of links) { if (l.to === id) upstream.add(l.from); if (l.from === id) downstream.add(l.to); }
  return { upstream, downstream };
}
