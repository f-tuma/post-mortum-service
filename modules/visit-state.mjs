import { validateEventGraph, rescheduleEvent } from "./timeline-state.mjs";
export const VITALS = { vitality: "Vitalita", agility: "Hbitost", intelligence: "Inteligence" };
export const SKILLS = { movement: "Pohyb", stealth: "Nenápadnost", perception: "Vnímání", analysis: "Analýza", negotiation: "Jednání", knowledge: "Znalosti", craft: "Zručnost", combat: "Boj" };
export const OUTCOMES = { full: "Plný úspěch", partial: "Částečný úspěch", failure: "Neúspěch" };
const zero = () => ({ vitality: 0, agility: 0, intelligence: 0 });
const fail = message => { throw new Error(message); };
const integer = (n, min, max) => { if (!Number.isInteger(n) || n < min || n > max) fail(`Hodnota musí být celé číslo ${min}–${max}.`); return n; };
const identifier = value => { if (typeof value !== "string" || !/^[\w-]{1,64}$/.test(value)) fail("Neplatný identifikátor."); return value; };
const text = (s, max = 1000) => { if (typeof s !== "string" || s.length > max) fail("Neplatný nebo příliš dlouhý text."); return s; };
const sum = v => Object.values(v).reduce((a, b) => a + b, 0);
const vitals = value => Object.fromEntries(Object.keys(VITALS).map(k => [k, integer(value?.[k] ?? 0, 0, 10)]));
const activeStatuses = ["offered", "ready", "running", "awaitingRoll"];

export function canOfferAction(state, avatar) {
  return Boolean(state?.status === "active" && avatar?.alive
    && (state.round.phase === "planning" || (state.pause?.kind === "reaction" && state.pause.eligible.includes(avatar.id)))
    && !state.actions.some(a => a.avatarId === avatar.id && activeStatuses.includes(a.status)));
}

export function actionPreview(action, avatar, spend = zero()) {
  const skill = Math.max(0, ...action.skills.map(k => avatar.skills[k] ?? 0));
  const raw = action.difficulty + action.injury - skill - action.help - action.clue;
  const difficulty = Math.min(10, Math.max(0, raw - sum(spend)));
  return { skill, raw, maxUsefulSpend: Math.max(0, raw), difficulty, diceCount: 10 - difficulty };
}
export function outcome(successes, required, tolerance) {
  integer(required, 1, 10); integer(tolerance, 0, required);
  return successes >= required ? "full" : successes >= required - tolerance ? "partial" : "failure";
}
export function createVisit({ id, title, start = 480, end = 1200, avatars = [], events = [], world = {}, caseId = "", mode='real', preparationId='' }) {
  identifier(id); integer(start, 0, 100000); integer(end, start + 1, start + 10080);
  if (!avatars.length) fail("Výprava potřebuje alespoň jednoho Avatara.");
  const roster = avatars.map(a => ({ id: identifier(a.id), actorId: a.actorId ?? null, ownerId: identifier(a.ownerId), name: text(a.name, 160), alive: a.alive !== false, vitals: vitals(a.vitals), skills: Object.fromEntries(Object.keys(SKILLS).map(k => [k, integer(a.skills?.[k] ?? 0, 0, 2)])), food: integer(a.food ?? 0, 0, 100) }));
  if (new Set(roster.map(a => a.id)).size !== roster.length) fail("Avatar je uvedený vícekrát.");
  if (new Set(events.map(e => e.id)).size !== events.length) fail("Událost je uvedená vícekrát.");
  const validatedEvents = events.map(e => validateEvent(e, start, end, roster));
  validateEventGraph(validatedEvents);
  if(!['real','reflection'].includes(mode))fail('Neplatný druh návštěvy.');
  if(preparationId)identifier(preparationId);
  return { schemaVersion: 1, id, title: text(title, 160), caseId: text(caseId,64), mode, preparationId, launchReady:!preparationId, start, end, clock: start, revision: 0, status: "active", returnReason: null,
    avatars: roster, actions: [], events: validatedEvents, world: validateChanges(world), eventLog: [], history: [], receipts: [],
    round: { number: 1, phase: "planning", start, end: start, slots: [] }, pause: null };
}
function validateEvent(e, start, end, avatars) {
  const seenBy = e.seenBy ?? [];
  if (!seenBy.every(id => avatars.some(a => a.id === id))) fail("Neplatný pozorovatel události.");
  if (!["hidden", "observed", "ask"].includes(e.visibility ?? "ask")) fail("Neplatná viditelnost události.");
  const condition = validateChanges(e.condition ?? {}), changes = validateChanges(e.changes ?? {});
  const dependencies = e.dependencies ?? [];
  if (!Array.isArray(dependencies) || dependencies.length > 30 || new Set(dependencies.map(d=>d.id)).size !== dependencies.length) fail("Neplatné závislosti.");
  const links = dependencies.map(d => ({ id: identifier(d.id), delay: integer(d.delay ?? 0, 0, 10080) }));
  const color = ["sage", "rose", "gold", "blue"].includes(e.color) ? e.color : "sage";
  return { id: identifier(e.id), title: text(e.title, 160), description: text(e.description ?? ""), location: text(e.location ?? "", 160), thread: text(e.thread ?? "", 80), at: integer(e.at, start, end),
    visibility: e.visibility ?? "ask", canReact: Boolean(e.canReact), seenBy: [...seenBy], condition, changes, dependencies: links, color, revision: 0, witnesses: text(e.witnesses ?? "", 500), trace: text(e.trace ?? "", 1000), status: "pending" };
}
function validateChanges(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 64) fail("Neplatná změna scény.");
  const pairs = Object.entries(value).map(([k, v]) => { identifier(k); if (["__proto__", "constructor", "prototype"].includes(k)) fail("Vyhrazený název podmínky."); if (!["boolean", "string", "number"].includes(typeof v) || (typeof v === "string" && v.length > 500) || (typeof v === "number" && !Number.isFinite(v))) fail("Neplatná hodnota scény."); return [k, v]; });
  return Object.fromEntries(pairs);
}
function offerSpec(c, avatar) {
  const kind = c.kind ?? "risk";
  if (!["risk", "auto", "rest", "meal"].includes(kind)) fail("Neplatný typ akce.");
  const skills = c.skills ?? [];
  if (!Array.isArray(skills) || skills.length > 8 || !skills.every(k => k in SKILLS)) fail("Neplatná použitelná dovednost.");
  return { kind, title: text(c.title, 160), goal: text(c.goal ?? "", 1000), duration: kind === "rest" ? 30 : kind === "meal" ? 15 : integer(c.duration, 1, 720),
    difficulty: integer(c.difficulty ?? 0, 0, 10), required: integer(c.required ?? 2, 1, 10), tolerance: integer(c.tolerance ?? 1, 0, c.required ?? 2),
    skills: [...new Set(skills)], caps: kind === "risk" ? vitals(c.caps) : zero(), injury: integer(c.injury ?? 0, 0, 2), help: integer(c.help ?? 0, 0, 1), clue: integer(c.clue ?? 0, 0, 1),
    stakes: text(c.stakes ?? "", 1000), avatarId: avatar.id };
}
export function publicVisit(state) {
  if (!state) return null;
  const { events, world, eventLog, ...projection } = structuredClone(state);
  projection.pause = state.pause ? { kind: state.pause.kind, eligible: state.pause.eligible ?? [] } : null;
  // Future events, hidden world changes and GM notes never enter the public document.
  return projection;
}
function log(state, message) { state.history.push({ at: state.clock, message }); }
function recalculateEnd(state) {
  state.round.end = Math.max(state.clock, ...state.actions.filter(a => a.round === state.round.number && a.status === "running").map(a => a.end));
}
function due(state) {
  return { actions: state.actions.filter(a => a.status === "running" && a.end <= state.clock), events: state.events.filter(e => e.status === "pending" && e.at <= state.clock) };
}
function returnVisit(state, reason) {
  state.status = "returned"; state.returnReason = reason; state.pause = null; state.round.phase = "done";
  for (const action of state.actions) if (action.status !== "completed" && action.status !== "cancelled") { action.status = "cancelled"; action.spend = zero(); action.revision++; }
  log(state, reason === "death" ? "Poslední živý Avatar zemřel. MHD vrací celou skupinu." : reason === "test" ? "Vypravěč uzavřel zkušební výpravu; její záznam zůstává uložený." : "Časové okno skončilo. MHD vrací celou skupinu.");
}
function refresh(state) {
  if (state.status !== "active" || state.pause?.kind === "reaction" || state.pause?.kind === "observation") return;
  const d = due(state);
  state.pause = d.actions.length + d.events.length ? { kind: "ordering" } : null;
  if (state.pause || state.actions.some(a => a.status === "awaitingRoll")) return;
  if (state.clock >= state.end) return returnVisit(state, "window");
  if (state.round.phase === "running" && !state.actions.some(a => a.status === "running")) state.round.phase = "done";
}
function startReady(state) {
  for (const a of state.actions.filter(a => a.round === state.round.number && a.status === "ready")) {
    const avatar = state.avatars.find(v => v.id === a.avatarId);
    if (a.kind === "meal" && !a.mealConsumed) { if (avatar.food < 1) fail("Avatar nemá porci jídla."); avatar.food--; a.mealConsumed = true; }
    a.start = state.clock; a.end = state.clock + (a.duration - a.elapsed); a.status = "running"; a.revision++;
  }
  recalculateEnd(state);
}
function settle(state, action) {
  if (action.kind === "risk") { action.status = "awaitingRoll"; action.revision++; return; }
  const avatar = state.avatars.find(a => a.id === action.avatarId);
  const recovery = action.kind === "meal" ? { ...zero(), vitality: 2 } : action.kind === "rest" ? action.recovery : zero();
  const restored = zero();
  for (const k of Object.keys(VITALS)) { restored[k] = Math.min(10 - avatar.vitals[k], recovery[k]); avatar.vitals[k] += restored[k]; }
  action.status = "completed"; action.result = { category: "full", dice: [], successes: null, restored, at: state.clock }; action.revision++;
  log(state, `${avatar.name}: ${action.title} dokončeno${sum(restored) ? `, obnova ${sum(restored)} bodů` : ""}.`);
}
function fireEvent(state, event) {
  const sources = (event.dependencies ?? []).map(d => ({ ...d, event: state.events.find(e=>e.id===d.id) }));
  if (sources.some(d=>d.event?.status === "pending")) fail("Nejdřív vyřešte předpoklad této události.");
  const applies = sources.every(d=>d.event?.status === "happened" && d.event.at+d.delay <= state.clock) && Object.entries(event.condition).every(([key, value]) => state.world[key] === value);
  event.status = applies ? "happened" : "skipped";
  state.eventLog.push({ id: event.id, at: state.clock, status: event.status, title: event.title, description: event.description, trace: event.trace, witnesses: event.witnesses });
  if (!applies) return;
  Object.assign(state.world, event.changes);
  if (event.visibility === "ask") { state.pause = { kind: "observation", eventId: event.id }; return; }
  if (event.visibility === "observed") observeEvent(state, event, event.seenBy);
}
function observeEvent(state, event, observers) {
  if (!Array.isArray(observers) || !observers.every(id => state.avatars.some(a => a.id === id))) fail("Neplatní pozorovatelé.");
  event.seenBy = [...new Set(observers)];
  if (observers.length) log(state, `${event.title}: ${event.description}`);
  state.pause = event.canReact && observers.length ? { kind: "reaction", eventId: event.id, eligible: [...observers] } : null;
}

/** Canonical visit is encrypted in a GM-owned vault. Only this reducer mutates it. */
export function applyVisitCommand(current, command, user, { randomDie } = {}) {
  if (current.schemaVersion !== 1) fail("Nepodporovaná verze výpravy.");
  identifier(command?.requestId); identifier(user?.id);
  const key = `${user.id}:${command.requestId}`;
  const existing = current.receipts.find(r => r.key === key);
  if (existing) return { state: current, receipt: existing, duplicate: true };
  if (current.receipts.length >= 3000) fail("Výprava dosáhla limitu historie prototypu.");
  const state = structuredClone(current);
  let receipt;
  try {
    const gm = () => { if (!user.isGM) fail("Tuto změnu provádí pouze vypravěč."); };
    const avatar = id => state.avatars.find(a => a.id === identifier(id)) ?? fail("Avatar neexistuje.");
    const owner = a => { if (!user.isGM && a.ownerId !== user.id) fail("Toto není váš Avatar."); };
    const action = () => {
      const a = state.actions.find(a => a.id === identifier(command.actionId)) ?? fail("Akce neexistuje.");
      if (command.expectedRevision !== a.revision) fail("Akci mezitím změnil vypravěč nebo spoluhráč. Načtěte aktuální zadání.");
      return a;
    };
    if (state.status !== "active" && command.type !== "consequence") fail("Výprava už skončila.");
    if(state.launchReady===false)fail('Odjezd ještě není dokončený. Vypravěč nejdřív obnoví výchozí svět.');
    switch (command.type) {
      case "finishDemo": {gm();if(state.caseId)fail("Skutečný případ končí MHD nebo smrtí posledního Avatara.");returnVisit(state,"test");break;}
      case "offer": {
        gm(); const av = avatar(command.avatarId); if (!av.alive) fail("Duše nemůže provádět fyzickou akci.");
        const reaction = state.pause?.kind === "reaction" && state.pause.eligible.includes(av.id);
        if (state.round.phase !== "planning" && !reaction) fail("Další časovaná akce počká na nové kolo.");
        if (state.actions.some(a => a.avatarId === av.id && activeStatuses.includes(a.status))) fail("Avatar už má rozpracovanou akci; nejdřív ji přerušte.");
        const id = identifier(command.actionId); if (state.actions.some(a => a.id === id)) fail("Identifikátor akce již existuje.");
        state.actions.push({ ...offerSpec(command, av), id, round: state.round.number, reaction, status: "offered", revision: 0, spend: zero(), recovery: zero(), elapsed: 0, start: null, end: null, mealConsumed: false, result: null, consequence: "" });
        break;
      }
      case "confirm": {
        const a = action(), av = avatar(a.avatarId); owner(av);
        if (a.status !== "offered") fail("Akce už není ve fázi volby.");
        if (!av.alive) fail("Avatar není živý.");
        const spend = vitals(command.spend), recovery = vitals(command.recovery);
        if (a.kind !== "risk" && sum(spend)) fail("Za tuto akci se vitálky neutrácí.");
        for (const k of Object.keys(VITALS)) {
          const reserved = state.actions.filter(b => b.id !== a.id && b.avatarId === av.id && ["ready", "running", "awaitingRoll"].includes(b.status)).reduce((n, b) => n + b.spend[k], 0);
          if (spend[k] > a.caps[k] || spend[k] > av.vitals[k] - reserved) fail("Útrata překračuje limit akce nebo dostupnou rezervu.");
        }
        if (sum(spend) > actionPreview(a, av, zero()).maxUsefulSpend) fail("Tato část útraty už nesnižuje obtížnost.");
        if (a.kind === "rest" && sum(recovery) !== 3) fail("Rozdělte přesně 3 body obnovy.");
        if (a.kind !== "rest" && sum(recovery)) fail("Tato akce nemá volitelnou obnovu.");
        if (a.kind === "meal" && !a.mealConsumed && av.food < 1) fail("Avatar nemá porci jídla.");
        a.spend = spend; a.recovery = recovery; a.status = "ready"; a.revision++;
        break;
      }
      case "start": {
        gm(); if (state.round.phase !== "planning" || state.pause) fail("Kolo už běží nebo čeká na rozhodnutí.");
        const available = state.actions.filter(a => a.round === state.round.number && a.status === "ready");
        if (!available.length || state.actions.some(a => a.status === "offered")) fail("Nejdřív potvrďte zadání všech nabízených akcí.");
        state.round.slots = state.avatars.map(a => a.id); state.round.start = state.clock; state.round.phase = "running"; startReady(state);
        log(state, `Začíná kolo ${state.round.number}.`); break;
      }
      case "advance": {
        gm(); if (state.round.phase !== "running" || state.pause || state.actions.some(a => a.status === "awaitingRoll")) fail("Nejdřív dořešte akci nebo událost v aktuální minutě.");
        const alreadyDue = due(state);
        if (alreadyDue.actions.length + alreadyDue.events.length) { state.pause = { kind: "ordering" }; break; }
        const running = state.actions.filter(a => a.status === "running");
        const times = [...running.map(a => a.end), ...state.events.filter(e => e.status === "pending" && e.at > state.clock).map(e => e.at), state.round.end, state.end].filter(t => t > state.clock);
        if (!times.length) fail("Není kam posunout čas.");
        const next = Math.min(...times);
        for (const a of running) a.elapsed = Math.min(a.duration, a.elapsed + Math.max(0, Math.min(next, a.end) - state.clock));
        state.clock = next;
        const d = due(state);
        if (d.actions.length + d.events.length === 1) { if (d.actions.length) settle(state, d.actions[0]); else fireEvent(state, d.events[0]); }
        refresh(state); break;
      }
      case "resolveBoundary": {
        gm(); if (state.pause?.kind !== "ordering") fail("V této minutě není souběh k rozhodnutí.");
        const d = due(state); state.pause = null;
        if (command.target === "action") { const a = d.actions.find(a => a.id === command.targetId) ?? fail("Akce není dokončená v této minutě."); settle(state, a); }
        else { const e = d.events.find(e => e.id === command.targetId) ?? fail("Událost v této minutě nenastává."); fireEvent(state, e); }
        refresh(state); break;
      }
      case "observe": {
        gm(); if (state.pause?.kind !== "observation") fail("Událost nečeká na určení svědků.");
        const e = state.events.find(e => e.id === state.pause.eventId); observeEvent(state, e, command.observers); refresh(state); break;
      }
      case "sceneReaction": {
        gm();
        if (state.round.phase !== "running" || state.pause || state.actions.some(a => a.status === "awaitingRoll")) fail("Nejdřív dořešte aktuální mezník nebo hod.");
        const observers = command.observers;
        if (!Array.isArray(observers) || !observers.length || observers.length > state.avatars.length || new Set(observers).size !== observers.length || !observers.every(id => state.avatars.some(a => a.id === id))) fail("Vyberte skutečné svědky nové situace.");
        const description = text(command.description ?? "", 1000).trim();
        if (!description) fail("Popište, na co mohou přítomní reagovat.");
        state.pause = { kind: "reaction", eventId: null, eligible: [...observers] };
        log(state, `Nová situace: ${description}`);
        break;
      }
      case "continue": {
        gm(); if (state.pause?.kind !== "reaction") fail("Výprava nečeká na reakci.");
        if (state.actions.some(a => a.status === "offered")) fail("Nejdřív potvrďte nebo zrušte nové zadání.");
        state.pause = null; startReady(state); refresh(state); break;
      }
      case "interrupt": {
        const a = action(), av = avatar(a.avatarId); owner(av);
        if (a.status !== "running" || state.pause?.kind !== "reaction" || !state.pause.eligible.includes(av.id)) fail("Akci lze přerušit reakcí na zaznamenanou událost.");
        a.status = "paused"; a.spend = zero(); a.revision++; recalculateEnd(state);
        log(state, `${av.name}: přerušeno „${a.title}“, hotovo ${a.elapsed} z ${a.duration} minut.`); break;
      }
      case "cancel": {
        const a = action(), av = avatar(a.avatarId); owner(av);
        if (!["offered", "ready", "paused"].includes(a.status)) fail("Běžící akci nejdřív přerušte; dokončený hod nelze zrušit.");
        a.status = "cancelled"; a.spend = zero(); a.revision++; recalculateEnd(state); refresh(state); break;
      }
      case "resume": {
        gm(); const a = action(), av = avatar(a.avatarId);
        if (a.status !== "paused" || !av.alive) fail("Tuto práci nelze obnovit.");
        const reaction = state.pause?.kind === "reaction" && state.pause.eligible.includes(av.id);
        if (state.round.phase !== "planning" && !reaction) fail("Navázání počká na další kolo nebo reakci.");
        if (state.actions.some(b => b.avatarId === av.id && activeStatuses.includes(b.status))) fail("Avatar už má jinou akci.");
        if (command.remaining !== undefined) a.duration = a.elapsed + integer(command.remaining, 1, 720);
        a.round = state.round.number; a.reaction = reaction; a.status = "offered"; a.spend = zero(); a.recovery = zero(); a.revision++; break;
      }
      case "roll": {
        const a = action(), av = avatar(a.avatarId); owner(av);
        if (a.status !== "awaitingRoll" || !av.alive) fail("Tato akce ještě nečeká na hod nebo už byla vyhodnocená.");
        const preview = actionPreview(a, av, a.spend), dice = [];
        if (preview.diceCount && typeof randomDie !== "function") fail("Hod nemá platný generátor kostek.");
        for (let i = 0; i < preview.diceCount; i++) dice.push(integer(randomDie(), 1, 6));
        const successes = dice.filter(n => n >= 5).length;
        for (const k of Object.keys(VITALS)) { if (a.spend[k] > av.vitals[k]) fail("Rezervovaná vitálka není dostupná."); av.vitals[k] -= a.spend[k]; }
        a.result = { ...preview, dice, successes, category: outcome(successes, a.required, a.tolerance), spent: { ...a.spend }, at: state.clock };
        a.status = "completed"; a.revision++;
        log(state, `${av.name}: ${a.title} — ${OUTCOMES[a.result.category]} (${successes}/${a.required}).`); refresh(state); break;
      }
      case "nextRound": {
        gm(); if (state.round.phase !== "done" || state.pause) fail("Nejdřív dokončete aktuální kolo.");
        state.round = { number: state.round.number + 1, phase: "planning", start: state.clock, end: state.clock, slots: [] }; break;
      }
      case "addEvent": {
        gm(); const e = validateEvent(command.event, state.clock + 1, state.end, state.avatars);
        if (state.events.some(x => x.id === e.id)) fail("Událost již existuje."); state.events.push(e); validateEventGraph(state.events); break;
      }
      case "moveEvent": {
        gm(); const e = state.events.find(e=>e.id===command.eventId) ?? fail("Událost neexistuje.");
        if (command.expectedEventRevision !== (e.revision ?? 0)) fail("Událost se mezitím změnila.");
        rescheduleEvent(state.events,e.id,command.at,{clock:state.clock,end:state.end,ripple:Boolean(command.ripple)}); break;
      }
      case "editEvent": {
        gm(); const e = state.events.find(e=>e.id===command.eventId) ?? fail("Událost neexistuje.");
        if (e.status !== "pending" || command.expectedEventRevision !== (e.revision ?? 0)) fail("Událost už proběhla nebo se mezitím změnila.");
        const replacement = validateEvent({...command.event,id:e.id},state.clock+1,state.end,state.avatars);
        replacement.revision=(e.revision??0)+1; state.events[state.events.indexOf(e)]=replacement; validateEventGraph(state.events); break;
      }
      case "world": { gm(); Object.assign(state.world, validateChanges(command.changes)); break; }
      case "consequence": { gm(); const a = action(); if (a.status !== "completed") fail("Akce není vyhodnocená."); a.consequence = text(command.text); a.revision++; break; }
      case "death": {
        gm(); const av = avatar(command.avatarId); av.alive = false;
        for (const a of state.actions.filter(a => a.avatarId === av.id && a.status !== "completed")) { a.status = "cancelled"; a.spend = zero(); a.revision++; }
        log(state, `${av.name} zemřel; pokračuje jako duše.`);
        if (state.avatars.every(a => !a.alive)) returnVisit(state, "death"); else { recalculateEnd(state); refresh(state); } break;
      }
      default: fail("Tento příkaz není povolený.");
    }
    if (state.actions.length > 200 || state.events.length > 200) fail("Překročen rozsah prototypové návštěvy.");
    state.revision++; receipt = { key, ok: true, revision: state.revision };
  } catch (error) {
    Object.assign(state, structuredClone(current)); receipt = { key, ok: false, message: error.message, revision: current.revision };
  }
  state.receipts.push(receipt);
  return { state, receipt, duplicate: false };
}
