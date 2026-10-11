export const SCHEMA_VERSION = 1;
export const BOARD_SIZE = { width: 12000, height: 8000 };
export const BOARD_LIMITS = { min: -200, maxX: BOARD_SIZE.width - 400, maxY: BOARD_SIZE.height - 400 };
// Include the existing edge allowance so saved cards stay within the visible frame.
export const BOARD_BOUNDS = { left: BOARD_LIMITS.min, top: BOARD_LIMITS.min, right: BOARD_SIZE.width, bottom: BOARD_SIZE.height };
export const clampCardPosition = (x,y) => ({x:Math.max(BOARD_LIMITS.min,Math.min(BOARD_LIMITS.maxX,x)),y:Math.max(BOARD_LIMITS.min,Math.min(BOARD_LIMITS.maxY,y))});

export class BoardError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const reject = (code, message) => { throw new BoardError(code, message); };
// The last card is painted on top; a card someone just handled belongs there for everyone.
const raise = (state, card) => { state.cards = [...state.cards.filter(c => c !== card), card]; };
const text = (value, max = 2000) => {
  if (typeof value !== "string" || value.length > max) reject("invalid", "Text je příliš dlouhý nebo neplatný.");
  return value;
};
const id = value => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) reject("invalid", "Neplatný identifikátor.");
  return value;
};
const point = (value,max) => {
  if (!Number.isFinite(value) || value < BOARD_LIMITS.min || value > max) reject("invalid", "Umístění je mimo tabuli.");
  return Math.round(value);
};

export function emptyBoard() {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, title: "Tabule Popohřební služby", cards: [], strings: [], receipts: [] };
}

/** Pure command handler. User identity comes from the server-owned User document, never request payload. */
export function applyBoardCommand(current, command, user, evidence = []) {
  if (current.schemaVersion !== SCHEMA_VERSION) reject("schema", "Tabule používá nepodporovanou verzi dat.");
  if (!user?.id || !user.canEdit) reject("permission", "Nemáte oprávnění upravovat tabuli.");
  id(command?.requestId);
  const requestKey = `${user.id}:${command.requestId}`;
  const previous = current.receipts.find(r => r.key === requestKey);
  if (previous) return { state: current, receipt: previous, duplicate: true };
  if (current.receipts.length >= 5000) reject("capacity", "Prototyp dosáhl limitu historie. Vypravěč musí tabuli zálohovat.");
  const next = structuredClone(current);
  let receipt;
  try {
    const target = () => {
      const card = next.cards.find(c => c.id === id(command.cardId));
      if (!card) reject("missing", "Karta už na tabuli není.");
      if (command.expectedRevision !== card.revision) reject("conflict", "Kartu mezitím změnil spoluhráč. Zkus úpravu znovu.");
      return card;
    };
    switch (command.type) {
      case "pin": {
        const source = evidence.find(e => e.id === command.evidenceId && e.published);
        if (!source) reject("permission", "Tento nález není zveřejněný v archivu.");
        const cardId = id(command.cardId);
        if (next.cards.some(c => c.id === cardId)) reject("duplicate", "Karta již existuje.");
        next.cards.push({ id: cardId, evidenceId: source.id, kind: source.kind === "photo" ? "photo" : "paper", x: point(command.x,BOARD_LIMITS.maxX), y: point(command.y,BOARD_LIMITS.maxY), rotation: 0, revision: 0, createdBy: user.id });
        break;
      }
      case "note": {
        const cardId = id(command.cardId);
        if (next.cards.some(c => c.id === cardId)) reject("duplicate", "Poznámka již existuje.");
        if (!["yellow", "pink", "blue"].includes(command.color)) reject("invalid", "Neplatná barva poznámky.");
        next.cards.push({ id: cardId, kind: "note", text: text(command.text), color: command.color, x: point(command.x,BOARD_LIMITS.maxX), y: point(command.y,BOARD_LIMITS.maxY), rotation: 0, revision: 0, createdBy: user.id });
        break;
      }
      case "move": { const c = target(); c.x = point(command.x,BOARD_LIMITS.maxX); c.y = point(command.y,BOARD_LIMITS.maxY); c.revision++; raise(next, c); break; }
      case "rotate": { const c = target(); if (!Number.isFinite(command.rotation) || Math.abs(command.rotation) > 180) reject("invalid", "Neplatné otočení."); c.rotation = command.rotation; c.revision++; raise(next, c); break; }
      case "editNote": { const c = target(); if (c.kind !== "note") reject("permission", "Zdrojový důkaz se upravuje pouze v archivu."); c.text = text(command.text); c.revision++; raise(next, c); break; }
      case "unpin": { const c = target(); next.cards = next.cards.filter(n => n.id !== c.id); next.strings = next.strings.filter(s => s.from !== c.id && s.to !== c.id); break; }
      case "connect": {
        const from = id(command.from), to = id(command.to);
        if (from === to || !next.cards.some(c => c.id === from) || !next.cards.some(c => c.id === to)) reject("invalid", "Vyberte špendlíky dvou různých karet.");
        if (next.strings.some(s => (s.from === from && s.to === to) || (s.from === to && s.to === from))) reject("duplicate", "Tyto karty už jsou propojené.");
        next.strings.push({ id: id(command.stringId), from, to, color: "#78202c", label: text(command.label ?? "", 160) });
        break;
      }
      case "disconnect": { const stringId = id(command.stringId); next.strings = next.strings.filter(s => s.id !== stringId); break; }
      default: reject("permission", "Tento příkaz není povolený.");
    }
    if (next.cards.length > 150 || next.strings.length > 300) reject("capacity", "Překročen rozsah této prototypové tabule.");
    next.revision++;
    receipt = { key: requestKey, ok: true, revision: next.revision };
  } catch (error) {
    if (!(error instanceof BoardError)) throw error;
    // A rejected request changes no cards, but its receipt must also survive reconnect/retry.
    Object.assign(next, structuredClone(current));
    receipt = { key: requestKey, ok: false, code: error.code, message: error.message, revision: current.revision };
  }
  next.receipts.push(receipt);
  return { state: next, receipt, duplicate: false };
}

/** Shifts a new card off any card already lying at the same spot, so stacked drops stay visible. */
export function freeCardSpot(cards, x, y, step = 36) {
  let spot = clampCardPosition(x, y);
  for (let i = 0; i < 20 && cards.some(c => Math.abs(c.x - spot.x) < 24 && Math.abs(c.y - spot.y) < 24); i++) spot = clampCardPosition(spot.x + step, spot.y + step);
  return spot;
}
