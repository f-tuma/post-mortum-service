import { BOARD_SIZE, BOARD_BOUNDS } from "./board-state.mjs";
import { archiveMarkup } from "./archive-view.mjs";
import {escape,icon} from './view-utils.mjs';
import {boardActionsMarkup} from './board-actions.mjs';
export {escape,icon} from './view-utils.mjs';
const pin = `<span class="pms-pin-head"></span><span class="pms-pin-shadow"></span>`;

export function surfaceMarkup(camera) {
  const {left,top,right,bottom}=BOARD_BOUNDS,corner=220;
  const corners=`M ${left+corner} ${top} H ${left} V ${top+corner} M ${right-corner} ${top} H ${right} V ${top+corner} M ${right} ${bottom-corner} V ${bottom} H ${right-corner} M ${left+corner} ${bottom} H ${left} V ${bottom-corner}`;
  return `<svg class="pms-board-surface" width="100%" height="100%" aria-hidden="true"><g class="pms-board-surface-camera" transform="translate(${camera.pan.x} ${camera.pan.y}) scale(${camera.zoom})"><rect class="pms-board-frame" x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" vector-effect="non-scaling-stroke"></rect><path class="pms-board-corners" d="${corners}" vector-effect="non-scaling-stroke"></path></g></svg>`;
}

export function cardMarkup(card, evidence, selected, firstPin = null) {
  const source = evidence.find(e => e.id === card.evidenceId);
  const title = card.kind === "note" ? "Poznámka" : (source?.title ?? "Nález již není zveřejněný");
  const paper = card.kind === "photo"
    ? `<div class="pms-art">${source?.image ? `<img src="${escape(source.image)}" alt="${escape(title)}" draggable="false">` : ""}</div><h3>${escape(title)}</h3>`
    : card.kind === "note" ? `<p class="pms-note-text">${escape(card.text)}</p>`
      : `<h3>${escape(title)}</h3><div class="pms-paper-rule"></div><blockquote>${escape(source?.text)}</blockquote>`;
  return `<article class="pms-card ${card.kind} ${card.color ?? ""} ${selected === card.id ? "selected" : ""}" data-card-id="${escape(card.id)}" style="left:${card.x}px;top:${card.y}px;transform:rotate(${card.rotation}deg)" tabindex="0" aria-label="${escape(title)}">
    <button class="pms-pin" data-pin-id="${escape(card.id)}" aria-pressed="${firstPin === card.id}" title="Táhni na jinou kartu, nebo klikni a vyber druhý špendlík" aria-label="Špendlík: ${escape(title)}">${pin}</button>${paper}
    <div class="pms-card-tools"><button data-card-action="detail" title="Detail" aria-label="Detail: ${escape(title)}">${icon("expand")}</button><button data-card-action="rotate" title="Otočit" aria-label="Otočit: ${escape(title)}">${icon("rotate-right")}</button><button data-card-action="unpin" title="${card.kind === "note" ? "Smazat poznámku (Delete)" : "Odepnout; nález zůstane v archivu (Delete)"}" aria-label="${card.kind === "note" ? "Smazat" : "Odepnout"}: ${escape(title)}">${icon(card.kind === "note" ? "trash" : "xmark")}</button></div>
  </article>`;
}

/** Where a card's pin sits on the board; strings start and end here. */
export const pinPoint = c => ({ x: c.x + (c.kind === "note" ? 140 : 180), y: c.y + 10 });

export function stringsMarkup(state, preview, camera={zoom:1,pan:{x:0,y:0}}) {
  const cards = state.cards.map(c => preview?.id === c.id ? { ...c, ...preview } : c);
  const point = id => { const c = cards.find(n => n.id === id); return c ? pinPoint(c) : null; };
  return `<svg class="pms-strings" width="100%" height="100%" aria-label="Provázky"><g class="pms-string-camera" transform="translate(${camera.pan.x} ${camera.pan.y}) scale(${camera.zoom})">${state.strings.map(s => {
    const from = point(s.from), to = point(s.to); if (!from || !to) return "";
    const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2 + Math.min(65, Math.abs(from.x - to.x) * .08);
    const d = `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
    return `<g data-string-id="${escape(s.id)}"><path class="pms-string-shadow" d="${d}"></path><path class="pms-string" d="${d}"></path><path class="pms-string-hit" d="${d}" tabindex="0" role="button" aria-label="Provázek ${escape(s.label || "bez popisku")}"></path>${s.label ? `<text x="${midX}" y="${midY - 10}">${escape(s.label)}</text>` : ""}</g>`;
  }).join("")}</g></svg>`;
}

export function boardMarkup(service, view, state = service.state) {
  return `<div class="pms-shell ${view.archiveHidden ? "archive-hidden" : ""}">
    <header class="pms-header"><div class="pms-brand"><svg viewBox="0 0 30 42" aria-hidden="true"><path d="M15 39V4M15 29L5 19M15 24L24 11M15 17L8 6M15 34L25 23M6 13L5 19L11 19M23 5L24 11L18 12M6 2L8 6L12 5M27 18L25 23L19 23"/></svg><span>Tabule důkazů</span></div><h1 title="${escape(service.state.title)}">${escape(service.state.title)}</h1><div class="pms-header-actions"><span class="pms-player-actions" role="status" aria-live="polite">${boardActionsMarkup(view.playerActions)}</span><button type="button" data-action="chat" aria-label="Otevřít chat Foundry v samostatném okně" title="Chat Foundry">${icon("comments")} <span>Chat</span></button>${game.user.isGM&&service.caseId===service.activeCaseId?'<button data-action="visit">Časová osa</button>':""}<button data-action="closeBoard" aria-label="${view.returnToArchive?'Zavřít tabuli a vrátit se do spisu':'Zavřít tabuli a vrátit se do hry'}">${icon("arrow-left")} ${view.returnToArchive?'Zpět do spisu':'Zpět do hry'}</button></div></header>
    <div class="pms-body">${archiveMarkup(service,view)}
      <section class="pms-board-viewport" aria-label="Tabule důkazů"><div class="pms-toolbar"><div><button data-action="toggleArchive" aria-label="Otevřít archiv nálezů" aria-controls="pms-archive-panel" aria-expanded="${!view.archiveHidden}">${icon("box-archive")} <span>Archiv</span></button><button data-action="note">${icon("pen")} <span>Poznámka</span></button><button data-action="connect" aria-pressed="${view.connecting}" class="${view.connecting ? "active" : ""}">${icon("link")} <span>Propojit</span></button><button data-action="fit" aria-label="Zobrazit všechny důkazy" title="Přiblížit ke všem důkazům">${icon("eye")} <span>Zobrazit vše</span></button><button data-action="overview" aria-label="Zobrazit celou tabuli" title="Vystředit a zobrazit celou tabuli">${icon("expand")} <span>Celá tabule</span></button></div><div class="pms-zoom"><button data-action="zoomOut" aria-label="Oddálit">${icon("minus")}</button><button data-action="resetZoom" class="pms-zoom-reset" aria-label="Zobrazit ve skutečné velikosti" title="Skutečná velikost"><output>${Math.round(view.zoom * 100)} %</output></button><button data-action="zoomIn" aria-label="Přiblížit">${icon("plus")}</button></div></div>
        ${surfaceMarkup(view)}${stringsMarkup(state,undefined,view)}<div class="pms-board-world" data-board-width="${BOARD_SIZE.width}" data-board-height="${BOARD_SIZE.height}" style="width:0;height:0;transform:translate(${view.pan.x}px,${view.pan.y}px) scale(${view.zoom})">${state.cards.map(c => cardMarkup(c, service.evidence, view.selected, view.firstPin)).join("")}</div>
        ${state.cards.length ? "" : `<div class="pms-empty-board"><span class="pms-empty-pin"></span><h2>Začni jednou stopou.</h2><p>Přetáhni nález z archivu. Poznámky a propojení jsou na vás.</p></div>`}
        <p class="pms-board-help">Tažením posuneš plochu · kolečkem přiblížíš · dvojklik do plochy přidá poznámku · tažením špendlíku propojíš karty · Delete odepne vybranou kartu · mezerník + tažení posouvá i přes karty</p><div class="pms-board-status" role="status">${escape(view.connecting ? (view.firstPin ? "Vyber druhý špendlík · Esc zruší" : "Vyber dva špendlíky, které chceš propojit · Esc zruší") : (view.status || (service.writable ? "" : "Úpravy čekají na vypravěče.")))}</div>
      </section></div></div>`;
}
