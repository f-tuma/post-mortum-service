import { boardMarkup, stringsMarkup, escape, pinPoint } from "./board-view.mjs";
import { clampCardPosition, freeCardSpot } from "./board-state.mjs";
import {fitBoardCamera,overviewBoardCamera,MIN_BOARD_ZOOM,MAX_BOARD_ZOOM} from "./board-camera.mjs";
import {archiveResults,archiveEntriesMarkup,ARCHIVE_TABS} from './archive-view.mjs';
import {captureFocus,restoreFocus} from './ui-focus.mjs';
import {ValidatedDialog} from './validated-dialog.mjs';
import {pendingBoardActions,boardActionsMarkup} from './board-actions.mjs';
const { ApplicationV2, DialogV2 } = foundry.applications.api;

export class BoardApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "pms-board", classes: ["pms-app","pms-board-fullscreen"], window: { title: "Tabule důkazů", positioned:false,minimizable:false,resizable:false,controls:[] } };
  constructor(service) {
    super(); this.service = service; this.pendingMoves = new Map();
    this.view = { search: "", archiveType:'all',archiveCase:'all',archiveSort:'newest', zoom: 1, pan: { x: 0, y: 0 }, selected: null, connecting: false, firstPin: null, archiveHidden: true, status: "" };
    this.unsubscribe = service.onChange(() => { if(!this.rendered)return;if(this.dragging||this.editing)this.needsRefresh=true;else this.render({ force: true }); });
  }
  async openCase({caseId=null,archive=false}={}) {
    // Finish this client's writes before changing the camera and optimistic card overlay.
    await this.service.localQueue;
    const previous=this.service.document?.id;
    this.service.selectCase(caseId);
    if(previous!==this.service.document.id){
      this.cancelDrag?.();this.pendingMoves.clear();
      Object.assign(this.view,{search:'',archiveType:'all',archiveCase:'all',archiveSort:'newest',selected:null,connecting:false,firstPin:null,status:'',zoom:1,pan:{x:0,y:0}});
      this.viewportSize=null;
    }
    this.view.archiveHidden=!archive;
    this.view.returnToArchive=caseId!==null&&archive;
    await this.render({force:true});
    if(previous!==this.service.document.id)this.fit();
    return this;
  }
  async _renderHTML() { this.bindVisits();this.view.playerActions=pendingBoardActions(game.pms?.visits.state,game.user);const div = document.createElement("div"); div.innerHTML = boardMarkup(this.service, this.view, this.displayState); return div.firstElementChild; }
  bindVisits(){const visits=game.pms?.visits;if(this.visitService===visits)return;this.unsubscribeVisits?.();this.visitService=visits;this.unsubscribeVisits=visits?.onChange(()=>{if(this.rendered)this.updatePlayerActions();});}
  updatePlayerActions(){const slot=this.element?.querySelector('.pms-player-actions');if(!slot)return;const focus=captureFocus(this.element);this.view.playerActions=pendingBoardActions(this.visitService?.state,game.user);slot.innerHTML=boardActionsMarkup(this.view.playerActions);slot.querySelector('button')?.addEventListener('click',()=>this.run(()=>this.action('playerActions')));restoreFocus(this.element,focus);}
  /** Board state with this client's unconfirmed moves applied, so a dropped card never jumps back. */
  get displayState() {
    const state = this.service.state;
    if (!this.pendingMoves.size) return state;
    const cards = state.cards.map(c => this.pendingMoves.has(c.id) ? { ...c, ...this.pendingMoves.get(c.id) } : c);
    return { ...state, cards: [...cards.filter(c => !this.pendingMoves.has(c.id)), ...cards.filter(c => this.pendingMoves.has(c.id))] };
  }
  _replaceHTML(result, content) { this.focusSnapshot=captureFocus(this.element); content.replaceChildren(result); }
  _onRender() {
    this.needsRefresh=false;
    const root = this.element;
    root.setAttribute('role','dialog');root.setAttribute('aria-label','Tabule důkazů');root.tabIndex=-1;root.dataset.keyboardFocus='true';
    if(!root.dataset.pmsBoardKeys){
      root.dataset.pmsBoardKeys='true';
      root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();if(this.view.connecting){this.view.connecting=false;this.view.firstPin=null;this.render({force:true});}else if(!this.view.archiveHidden){this.view.archiveHidden=true;this.archiveVisibility();}else this.run(()=>this.action('closeBoard'));}else if((e.key==='Delete'||e.key==='Backspace')&&!e.target.closest('input,textarea,select')){
        // Delete removes what is focused or selected: a string, or a card (notes ask first).
        const stringId=e.target.closest('[data-string-id]')?.dataset.stringId;
        const cardId=e.target.closest('.pms-card')?.dataset.cardId??this.view.selected,card=this.service.state.cards.find(c=>c.id===cardId);
        if(stringId){e.preventDefault();this.run(()=>this.service.submit({type:'disconnect',stringId}));}
        else if(card&&this.service.writable){e.preventDefault();this.run(()=>this.cardAction('unpin',card));}
      }else if(e.code==='Space'&&!e.target.closest('input,textarea,select,button')){e.preventDefault();this.spacePan=true;root.classList.add('pms-panning');}});
      root.addEventListener('keyup',e=>{if(e.code==='Space'){this.spacePan=false;root.classList.remove('pms-panning');}});
      root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget)){this.spacePan=false;root.classList.remove('pms-panning');}});
    }
    root.querySelector("input[type=search]")?.addEventListener("input", e => {
      this.view.search = e.target.value;
      this.updateArchive();
    });
    root.querySelectorAll('[data-archive-filter]').forEach(el=>el.addEventListener('change',()=>{this.view[el.dataset.archiveFilter]=el.value;this.updateArchive();}));
    root.querySelectorAll(".pms-shell [data-action]").forEach(el => {if(!el.closest('.pms-archive-list'))el.addEventListener("click", e => this.run(() => this.action(el.dataset.action, el.dataset.archiveType??el.dataset.evidenceId, e)));});
    root.querySelectorAll('[role="tab"]').forEach(el=>el.addEventListener('keydown',e=>{
      const tabs=[...root.querySelectorAll('.pms-archive-tabs [role="tab"]')],i=tabs.indexOf(el);
      const target=e.key==='Home'?0:e.key==='End'?tabs.length-1:['ArrowRight','ArrowDown'].includes(e.key)?(i+1)%tabs.length:['ArrowLeft','ArrowUp'].includes(e.key)?(i+tabs.length-1)%tabs.length:null;
      if(target===null)return;e.preventDefault();this.view.archiveType=tabs[target].dataset.archiveType;this.updateArchive();tabs[target].focus();
    }));
    this.bindArchiveEntries();
    const viewport = root.querySelector(".pms-board-viewport");
    viewport.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
    viewport.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("application/x-pms-evidence")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; viewport.classList.add("drop-active"); } });
    viewport.addEventListener("dragleave", e => { if (!viewport.contains(e.relatedTarget)) viewport.classList.remove("drop-active"); });
    viewport.addEventListener("drop", e => {
      e.preventDefault(); e.stopPropagation(); viewport.classList.remove("drop-active");
      const value = e.dataTransfer.getData("application/x-pms-evidence"); if (!value) return;
      this.archiveDragging=false;root.classList.remove('pms-archive-dragging');
      this.view.archiveHidden=true;this.archiveVisibility();
      this.run(async () => { const data = JSON.parse(value), p = this.toWorld(e.clientX, e.clientY); await this.pin(data.evidenceId, p.x - 180, p.y - 25); });
    });
    // Proportional zoom: a trackpad's many small steps and a mouse wheel's notches feel the same.
    viewport.addEventListener("wheel", e => { e.preventDefault(); const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1); this.zoom(this.view.zoom * Math.exp(-Math.max(-300, Math.min(300, delta)) * .0015), e.clientX, e.clientY); }, { passive: false });
    viewport.addEventListener("dblclick", e => { if (e.target.closest(".pms-card,button,.pms-toolbar,.pms-string-hit,.pms-archive") || !this.service.writable) return; const p = this.toWorld(e.clientX, e.clientY); this.run(() => this.newNote(p.x - 140, p.y - 40)); });
    viewport.addEventListener("pointerdown", e => this.onPointerDown(e));
    root.querySelectorAll(".pms-card").forEach(el => {
      const excerpt=el.querySelector('blockquote,.pms-note-text');
      if(excerpt){const cue=document.createElement('button');cue.type='button';cue.className='pms-full-note';cue.dataset.cardAction='detail';cue.textContent='Celý zápis';cue.hidden=true;el.append(cue);}
      el.addEventListener("dblclick", () => this.run(() => this.detail(el.dataset.cardId)));
      el.addEventListener("keydown", e => {
        if (e.target !== el) return;
        if (e.key === "Enter") this.run(() => this.detail(el.dataset.cardId));
        const step = e.shiftKey ? 30 : 10, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) { e.preventDefault(); const [x, y] = moves[e.key]; this.run(() => this.queueKeyboardMove(el.dataset.cardId,x,y)); }
      });
    });
    root.querySelectorAll("[data-card-action]").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); const card = this.service.state.cards.find(c => c.id === el.closest(".pms-card").dataset.cardId); this.run(() => this.cardAction(el.dataset.cardAction, card)); }));
    root.querySelectorAll("[data-pin-id]").forEach(el => {
      el.addEventListener("click", e => { e.stopPropagation(); if (this.suppressPinClick) return; this.run(() => this.selectPin(el.dataset.pinId)); });
      el.addEventListener("pointerdown", e => this.dragString(e, el));
    });
    root.querySelectorAll("[data-string-id]").forEach(el => {
      el.addEventListener("dblclick", () => this.run(() => this.stringDetail(el.dataset.stringId)));
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault();e.stopPropagation();this.run(() => this.stringDetail(el.dataset.stringId)); } });
    });
    this.resizeView();
    this.markOverflow();
    document.fonts?.ready.then(()=>{if(this.rendered)this.markOverflow();});
    this.archiveVisibility(false);
    restoreFocus(root,this.focusSnapshot);this.focusSnapshot=null;
    this.updatePlayerActions();
  }
  markOverflow(){for(const card of this.element?.querySelectorAll('.pms-card')??[]){const text=card.querySelector('blockquote,.pms-note-text'),cue=card.querySelector('.pms-full-note');if(!text||!cue)continue;const overflow=text.scrollHeight>text.clientHeight+1;card.classList.toggle('has-overflow',overflow);cue.hidden=!overflow;}}
  archiveVisibility(focus=true){
    const root=this.element,panel=root.querySelector('.pms-archive'),open=!this.view.archiveHidden;
    root.querySelector('.pms-shell').classList.toggle('archive-hidden',!open);
    panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
    const button=root.querySelector('.pms-toolbar [data-action="toggleArchive"]');
    button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Zavřít archiv nálezů':'Otevřít archiv nálezů');
    if(focus)(open?panel.querySelector('input[type=search]'):button).focus({preventScroll:true});
  }
  bindArchiveEntries(){
    const root=this.element;
    root.querySelectorAll('.pms-archive-entry').forEach(el=>{
      el.addEventListener('dragstart',e=>{
        e.dataTransfer.setData('application/x-pms-evidence',JSON.stringify({evidenceId:el.dataset.evidenceId}));
        e.dataTransfer.setData('text/plain',el.dataset.evidenceId);e.dataTransfer.effectAllowed='copy';
        e.dataTransfer.setDragImage(el,24,24);
        this.archiveDragging=true;
        requestAnimationFrame(()=>{if(this.archiveDragging)root.classList.add('pms-archive-dragging');});
      });
      el.addEventListener('dragend',()=>{this.archiveDragging=false;root.classList.remove('pms-archive-dragging');});
      el.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===el){e.preventDefault();this.run(()=>this.action('source',el.dataset.evidenceId));}});
      el.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>this.run(()=>this.action(button.dataset.action,el.dataset.evidenceId))));
    });
  }
  updateArchive(){
    const root=this.element,{entries,counts,total}=archiveResults(this.service.evidence,this.view);
    root.querySelector('.pms-archive-list').innerHTML=archiveEntriesMarkup(entries);
    this.bindArchiveEntries();
    root.querySelectorAll('[data-archive-count]').forEach(el=>el.textContent=counts[el.dataset.archiveCount]);
    root.querySelectorAll('.pms-archive-tabs [role=tab]').forEach(el=>{const selected=el.dataset.archiveType===this.view.archiveType;el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;});
    root.querySelector('.pms-archive-results').setAttribute('aria-labelledby',`pms-archive-tab-${this.view.archiveType}`);
    root.querySelector('[data-archive-summary]').textContent=`${entries.length} z ${total} nálezů`;
    const empty=root.querySelector('.pms-archive-empty');empty.hidden=!!entries.length;
    empty.querySelector('h3').textContent=total?'Žádná stopa neodpovídá filtrům.':'Kartotéka čeká na první nález.';
    empty.querySelector('p').textContent=total?'Zkus jiné hledání nebo zruš filtry.':'Získané nálezy sem založí vypravěč.';
  }
  async _onFirstRender() {this.resizeObserver=new ResizeObserver(()=>this.resizeView());this.resizeObserver.observe(this.element);this.element.tabIndex=-1;this.element.dataset.keyboardFocus='true';this.element.focus({preventScroll:true});requestAnimationFrame(()=>this.fit());}
  resizeView(){const viewport=this.element?.querySelector('.pms-board-viewport');if(!viewport)return;const r=viewport.getBoundingClientRect();if(this.viewportSize){this.view.pan.x+=(r.width-this.viewportSize.width)/2;this.view.pan.y+=(r.height-this.viewportSize.height)/2;}this.viewportSize={width:r.width,height:r.height};this.setTransform();}
  _onClose(options){this.resizeObserver?.disconnect();this.cancelDrag?.();this.spacePan=false;this.viewportSize=null;super._onClose(options);}
  async run(fn) {
    try { await fn(); }
    catch (error) { this.view.status = error.message; ui.notifications.warn(error.message); await this.render({ force: true }); }
  }
  queueKeyboardMove(cardId,dx,dy){
    const documentId=this.service.document?.id;
    // Repeated keys represent successive deltas, not independent snapshots of
    // one revision. Wait for our prior write before choosing the next revision.
    const job=(this.keyboardMoves??Promise.resolve()).then(async()=>{
      await this.service.localQueue;
      if(this.service.document?.id!==documentId)throw new Error('Tabule se mezitím změnila. Vyber kartu na nynější tabuli.');
      const card=this.service.state.cards.find(c=>c.id===cardId);
      if(!card)throw new Error('Karta už na tabuli není.');
      const position=clampCardPosition(card.x+dx,card.y+dy);
      if(position.x===card.x&&position.y===card.y)return;
      return this.service.submit({type:'move',cardId,expectedRevision:card.revision,...position});
    });
    this.keyboardMoves=job.catch(()=>{});
    return job;
  }
  toWorld(x, y) { const r = this.element.querySelector(".pms-board-viewport").getBoundingClientRect(); return { x: (x - r.left - this.view.pan.x) / this.view.zoom, y: (y - r.top - this.view.pan.y) / this.view.zoom }; }
  setTransform() {
    const world = this.element.querySelector(".pms-board-world");
    if (world) world.style.transform = `translate(${this.view.pan.x}px,${this.view.pan.y}px) scale(${this.view.zoom})`;
    this.element.querySelector(".pms-string-camera")?.setAttribute("transform",`translate(${this.view.pan.x} ${this.view.pan.y}) scale(${this.view.zoom})`);
    this.element.querySelector(".pms-board-surface-camera")?.setAttribute("transform",`translate(${this.view.pan.x} ${this.view.pan.y}) scale(${this.view.zoom})`);
    const output = this.element.querySelector(".pms-zoom output"); if (output) output.textContent = `${Math.round(this.view.zoom * 100)} %`;
  }
  zoom(value, x, y) {
    const r = this.element.querySelector(".pms-board-viewport").getBoundingClientRect();
    x ??= r.left + r.width / 2; y ??= r.top + r.height / 2;
    const p = this.toWorld(x, y); this.view.zoom = Math.max(MIN_BOARD_ZOOM, Math.min(MAX_BOARD_ZOOM, value));
    this.view.pan = { x: x - r.left - p.x * this.view.zoom, y: y - r.top - p.y * this.view.zoom }; this.setTransform();
  }
  fit() {
    if (!this.rendered) return;
    const r = this.element.querySelector(".pms-board-viewport").getBoundingClientRect();
    const world=this.element.querySelector('.pms-board-world').getBoundingClientRect();
    const boxes=[...this.element.querySelectorAll('.pms-card')].map(el=>{const b=el.getBoundingClientRect();return {left:(b.left-world.left)/this.view.zoom,top:(b.top-world.top)/this.view.zoom,right:(b.right-world.left)/this.view.zoom,bottom:(b.bottom-world.top)/this.view.zoom};});
    Object.assign(this.view,fitBoardCamera(boxes,r));
    this.setTransform();
  }
  overview() {
    if (!this.rendered) return;
    const r = this.element.querySelector('.pms-board-viewport').getBoundingClientRect();
    Object.assign(this.view,overviewBoardCamera(r));
    this.setTransform();
  }
  async pin(evidenceId, x, y) { await this.service.submit({ type: "pin", cardId: foundry.utils.randomID(), evidenceId, ...freeCardSpot(this.service.state.cards, x, y) }); this.view.status = ""; }
  async action(action, evidenceId) {
    if(action==='chat'){const chat=await ui.chat.renderPopout();chat.bringToFront();return;}
    if(action==='playerActions'){const action=pendingBoardActions(game.pms?.visits.state,game.user)[0],actor=action&&game.actors.get(action.actorId);if(!actor)return;if(!actor.testUserPermission(game.user,'OWNER'))throw new Error('Deník této postavy není dostupný.');const sheet=actor.sheet;if(Object.hasOwn(sheet,'tab'))sheet.tab='character';await sheet.render({force:true});sheet.bringToFront();[...sheet.element.querySelectorAll('[data-action-id]')].find(el=>el.dataset.actionId===action.actionId)?.scrollIntoView({block:'nearest'});return;}
    if (action === "visit" && this.service.caseId===this.service.activeCaseId) return game.pms.openTimeline();
    switch (action) {
      case "closeBoard": await this.close();if(this.view.returnToArchive)return game.pms.openSectorArchive();return;
      case "toggleArchive": this.view.archiveHidden = !this.view.archiveHidden; this.archiveVisibility(); return;
      case "archiveTab": if(ARCHIVE_TABS.some(t=>t.id===evidenceId)){this.view.archiveType=evidenceId;this.updateArchive();}return;
      case "archiveReset": this.view.search='';this.view.archiveType='all';this.view.archiveCase='all';this.view.archiveSort='newest';this.element.querySelector('input[type=search]').value='';this.element.querySelectorAll('[data-archive-filter]').forEach(el=>el.value=this.view[el.dataset.archiveFilter]);this.updateArchive();return;
      case "zoomIn": return this.zoom(this.view.zoom * 1.2);
      case "zoomOut": return this.zoom(this.view.zoom / 1.2);
      case "resetZoom": return this.zoom(1);
      case "fit": return this.fit();
      case "overview": return this.overview();
      case "connect": this.view.connecting = !this.view.connecting; this.view.firstPin = null; return this.render({ force: true });
      case "note": return this.newNote();
      case "source": return this.showSource(this.service.evidence.find(e => e.id === evidenceId));
      case "pin": { this.view.archiveHidden=true;this.archiveVisibility();const r = this.element.querySelector(".pms-board-viewport").getBoundingClientRect(); const p = this.toWorld(r.left + r.width / 2, r.top + r.height / 2); return this.pin(evidenceId, p.x - 180, p.y - 160); }
      case "caseClue": if(this.service.caseId===game.pms.cases.data?.id&&this.service.caseId===this.service.activeCaseId)return game.pms.cases.run("reveal");return;
      case "publish": return this.publish();
      case "sample": await this.service.seedArchive(); return;
    }
  }
  onPointerDown(event) {
    if (![0,1].includes(event.button) || event.target.closest("input,textarea,.pms-toolbar") || event.button===0&&event.target.closest("button,.pms-string-hit")) return;
    const el = this.spacePan||event.button===1?null:event.target.closest(".pms-card"), start = { x: event.clientX, y: event.clientY };
    const card = el ? this.service.state.cards.find(c => c.id === el.dataset.cardId) : null;
    if (card && !this.service.writable) return;
    event.preventDefault();
    (el??this.element).focus({preventScroll:true});
    // Whatever you pick up is lifted above everything else straight away.
    if (el) { if (el.nextElementSibling) el.parentElement.appendChild(el); this.element.querySelectorAll(".pms-card.selected").forEach(c => c.classList.remove("selected")); el.classList.add("selected"); }
    const original = card ? { x: card.x, y: card.y } : { ...this.view.pan };
    this.dragging = true; this.view.selected = card?.id ?? null;
    let moved = false, preview;
    const move = e => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      if (!moved && el) el.classList.add("is-dragging");
      moved = true;
      if (card) {
        preview = { id: card.id, ...clampCardPosition(original.x+dx/this.view.zoom,original.y+dy/this.view.zoom) };
        el.style.left = `${preview.x}px`; el.style.top = `${preview.y}px`;
        this.element.querySelector(".pms-strings").outerHTML = stringsMarkup(this.service.state, preview, this.view);
      } else { this.view.pan = { x: original.x + dx, y: original.y + dy }; this.setTransform(); }
    };
    const up = async () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      this.cancelDrag=null;
      this.dragging = false;
      el?.classList.remove("is-dragging");
      if (card && moved) {
        this.pendingMoves.set(card.id, { x: preview.x, y: preview.y });
        try { await this.run(() => this.service.submit({ type: "move", cardId: card.id, expectedRevision: card.revision, x: preview.x, y: preview.y })); }
        finally { this.pendingMoves.delete(card.id); }
      }
      if (this.rendered&&(card||this.needsRefresh)) await this.render({ force: true });
    };
    const cancel = () => { moved = false; up(); };
    this.cancelDrag=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);this.dragging=false;this.cancelDrag=null;};
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true }); window.addEventListener("pointercancel", cancel, { once: true });
  }
  /** Drag from a pin: a string follows the pointer and connects to the card it is dropped on. */
  dragString(event, pin) {
    if (event.button !== 0 || !this.service.writable) return;
    event.stopPropagation(); event.preventDefault();
    const fromId = pin.dataset.pinId, from = this.service.state.cards.find(c => c.id === fromId);
    if (!from) return;
    this.cancelDrag?.();
    const start = { x: event.clientX, y: event.clientY }, origin = pinPoint(from);
    const camera = this.element.querySelector(".pms-string-camera");
    let draft = null, target = null;
    const targetAt = e => { const card = document.elementFromPoint(e.clientX, e.clientY)?.closest(".pms-card"); return card && card.dataset.cardId !== fromId ? card : null; };
    pin.setPointerCapture(event.pointerId);
    const move = e => {
      if (!draft && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      if (!draft) {
        draft = document.createElementNS("http://www.w3.org/2000/svg", "path"); draft.setAttribute("class", "pms-string pms-string-draft"); camera?.append(draft);
        this.dragging = true; this.element.classList.add("pms-stringing");
      }
      const p = this.toWorld(e.clientX, e.clientY), sag = Math.min(65, Math.abs(origin.x - p.x) * .08);
      draft.setAttribute("d", `M ${origin.x} ${origin.y} Q ${(origin.x + p.x) / 2} ${(origin.y + p.y) / 2 + sag} ${p.x} ${p.y}`);
      const next = targetAt(e);
      if (next !== target) { target?.classList.remove("connect-target"); next?.classList.add("connect-target"); target = next; }
    };
    const cleanup = () => {
      pin.removeEventListener("pointermove", move); pin.removeEventListener("pointerup", up); pin.removeEventListener("pointercancel", up);
      draft?.remove(); target?.classList.remove("connect-target"); this.element?.classList.remove("pms-stringing"); this.dragging = false;
      if(pin.hasPointerCapture?.(event.pointerId))pin.releasePointerCapture(event.pointerId);
      if(this.cancelDrag===cleanup)this.cancelDrag=null;
    };
    const up = e => {
      const moved=!!draft,to=moved&&e.type === "pointerup" ? targetAt(e)?.dataset.cardId : null;
      cleanup();
      if (!moved) {if(this.rendered&&this.needsRefresh)this.render({force:true});return;}
      this.suppressPinClick = true; setTimeout(() => { this.suppressPinClick = false; });
      if (!to) {if(this.rendered)this.render({force:true});return;}
      this.view.connecting = true; this.view.firstPin = fromId;
      this.run(() => this.selectPin(to));
    };
    this.cancelDrag=cleanup;
    pin.addEventListener("pointermove", move); pin.addEventListener("pointerup", up); pin.addEventListener("pointercancel", up);
  }
  async selectPin(id) {
    if (!this.view.connecting) { this.view.connecting = true; this.view.firstPin = id; await this.render({ force: true }); return; }
    if (!this.view.firstPin) { this.view.firstPin = id; return this.render({ force: true }); }
    if (id === this.view.firstPin) return;
    await this.promptForm("Propojit stopy", `<label>Popisek spojení<input name="label" maxlength="160" placeholder="Co podle vás souvisí?"></label>`, "Propojit", data=>this.service.submit({ type: "connect", stringId: foundry.utils.randomID(), from: this.view.firstPin, to: id, label: data.label }));
    this.view.connecting = false; this.view.firstPin = null; return this.render({ force: true });
  }
  async promptForm(title, html, label = "Uložit", submit=null) {
    this.editing = true;
    try { const data=await ValidatedDialog.wait({ window: { title, resizable:true }, position:{width:Math.min(760,window.innerWidth-48)}, classes: ["pms-dialog"], content: `<div class="pms-form">${html}</div>`, buttons: [{ action: "save", label, default: true, callback: async (_event, _button, dialog) => {const values=Object.fromEntries(new FormData(dialog.element.querySelector("form")));if(submit)await submit(values);return values;} }, { action: "cancel", label: "Zrušit", callback: () => null }], rejectClose: false });return data&&typeof data==='object'?data:null; }
    finally { this.editing = false;if(this.rendered)await this.render({force:true}); }
  }
  async newNote(x, y) {
    await this.promptForm("Nová poznámka", `<label>Poznámka<textarea name="text" rows="4" maxlength="2000" required></textarea></label><label>Barva<select name="color"><option value="yellow">Žlutá</option><option value="pink">Růžová</option><option value="blue">Modrá</option></select></label>`, "Uložit", async data=>{
      if (!data.text?.trim())throw new Error('Napiš alespoň krátkou poznámku.');
      if (x === undefined) { const r = this.element.querySelector(".pms-board-viewport").getBoundingClientRect(), p = this.toWorld(r.left + r.width / 2, r.top + r.height / 2); x = p.x - 140; y = p.y - 100; }
      await this.service.submit({ type: "note", cardId: foundry.utils.randomID(), text: data.text, color: data.color, ...freeCardSpot(this.service.state.cards, x, y) });
    });
  }
  async detail(cardId) {
    const card = this.service.state.cards.find(c => c.id === cardId); if (!card) return;
    if (card.kind !== "note") return this.showSource(this.service.evidence.find(e => e.id === card.evidenceId));
    await this.promptForm("Upravit poznámku", `<label>Poznámka<textarea name="text" rows="5" maxlength="2000">${escape(card.text)}</textarea></label>`, "Uložit", data=>this.service.submit({ type: "editNote", cardId, expectedRevision: card.revision, text: data.text }));
  }
  async showSource(source) {
    if (!source) return;
    const item = game.items.get(source.itemId);
    if (item) return item.sheet.render({force:true});
    return DialogV2.wait({ window: { title: source.title }, position: { width: Math.min(780,window.innerWidth-48) }, classes: ["pms-dialog"], content: `<article class="pms-detail">${source.image ? `<img src="${escape(source.image)}" alt="${escape(source.title)}">` : ""}<p>${escape(source.text)}</p><small>Zdroj: ${escape(source.sourceCase)} · návštěva ${escape(source.sourceVisit)} · ${escape(source.acquiredAt)}</small></article>`, buttons: [{ action: "close", label: "Zavřít", default: true }], rejectClose: false });
  }
  async cardAction(action, card) {
    if (action === "detail") return this.detail(card.id);
    if (action === "rotate") return this.service.submit({ type: "rotate", cardId: card.id, expectedRevision: card.revision, rotation: card.rotation >= 8 ? -8 : card.rotation + 4 });
    if (action === "unpin") {
      if (card.kind === "note" && !await DialogV2.confirm({ window: { title: "Smazat poznámku" }, classes: ["pms-dialog"], content: "<p>Poznámka zmizí z tabule pro všechny a nedá se obnovit.</p>", rejectClose: false })) return;
      await this.service.submit({ type: "unpin", cardId: card.id, expectedRevision: card.revision });
      if (this.view.selected === card.id) this.view.selected = null;
      this.view.status = card.kind === "note" ? "" : "Nález je odepnutý, v archivu zůstává.";
      return this.render({ force: true });
    }
  }
  async stringDetail(stringId) {
    await this.promptForm("Provázek", `<p>Odebrání spojení nezmění nálezy ani jejich obsah.</p>`, "Odebrat spojení",()=>this.service.submit({ type: "disconnect", stringId }));
  }
  async publish() {
    await this.promptForm("Zveřejnit nález", `<label>Název<input name="title" maxlength="160" required></label><label>Text<textarea name="text" maxlength="5000" rows="4"></textarea></label><label>Obrázek<input name="image" placeholder="worlds/… nebo https://…"></label><label>Typ<select name="kind"><option value="paper">Dokument</option><option value="photo">Obrazový nález</option></select></label>`, "Zveřejnit",data=>this.service.publishEvidence(data));
  }
}
