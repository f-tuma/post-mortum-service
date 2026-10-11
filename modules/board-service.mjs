import { applyBoardCommand, emptyBoard } from "./board-state.mjs";
import {clueArchiveStatus} from './sheet-ui.mjs';
import {clientCanWrite,electedPMSAuthority} from './gm-authority.mjs';

export const NS = "pms";
const isKind = (doc, kind) => doc.getFlag(NS, "kind") === kind;
export class BoardService {
  constructor() { this.listeners = new Set(); this.pending = new Map(); this.gmQueue = Promise.resolve(); this.localQueue = Promise.resolve(); this.selectedCaseId = null; }
  get activeCaseId() { return game.journal.find(d=>isKind(d,"visitProjection"))?.getFlag(NS,"visit")?.caseId??""; }
  get caseId() { return this.selectedCaseId ?? this.activeCaseId; }
  boardForCase(caseId) { return game.journal.find(doc => isKind(doc,"board") && (doc.getFlag(NS,"caseId")??"")===caseId); }
  boardById(id) { return game.journal.find(doc => doc.id===id && isKind(doc,"board")); }
  get document() { return this.boardForCase(this.caseId); }
  selectCase(caseId=null) {
    const target=caseId??this.activeCaseId,doc=this.boardForCase(target);
    if(!doc||!doc.testUserPermission(game.user,"OBSERVER"))throw new Error("Tabule tohoto případu zatím není dostupná.");
    this.selectedCaseId=caseId;
  }
  get state() { return this.document?.getFlag(NS, "board") ?? emptyBoard(); }
  get allEvidence() {
    const players=game.users.filter(u=>!u.isGM&&u.role>=1);
    return game.items.filter(d=>d.type==="clue"&&clueArchiveStatus(d,this.caseId,players).available&&d.testUserPermission(game.user,"OBSERVER"))
      .map(d=>({id:d.getFlag(NS,"evidenceId")??d.id,itemId:d.id,title:d.name,text:d.system.description,image:d.img.startsWith("icons/")?"":d.img,kind:d.system.medium==="photo"?"photo":"paper",medium:d.system.medium,published:true,sourceCase:d.system.caseId,sourceCaseLabel:game.pms?.avatars.state?.caseLabels?.[d.system.caseId]??game.folders.find(f=>f.type==='Actor'&&f.getFlag(NS,'caseBundle')===d.system.caseId)?.name??this.boardForCase(d.system.caseId)?.getFlag(NS,'board')?.title??'Další případ',sourceVisit:d.system.source,acquiredAt:d.system.acquiredAt,createdAt:d._stats?.createdTime}));
  }
  evidenceForCase(caseId) { return this.allEvidence.filter(e=>e.sourceCase===caseId); }
  get evidence() { return this.caseId ? this.evidenceForCase(this.caseId) : this.allEvidence; }
  get archiveBoards() { return game.journal.filter(d=>isKind(d,"board")&&d.getFlag(NS,"caseId")&&d.testUserPermission(game.user,"OBSERVER")).map(d=>({caseId:d.getFlag(NS,"caseId"),title:d.getFlag(NS,"board")?.title??d.name})); }
  get authority() { return electedPMSAuthority(game.users,game.journal); }
  get isAuthority() { return this.authority?.id === game.user.id && clientCanWrite(); }
  get writable() { return Boolean(this.authority && (!game.user.isGM||this.isAuthority) && this.document?.testUserPermission(game.user,"OBSERVER")); }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify() {
    for (const [requestId, waiting] of this.pending) {
      const receipt = this.boardById(waiting.boardId)?.getFlag(NS,"board")?.receipts.find(r => r.key === `${game.user.id}:${requestId}`);
      if (receipt) { clearTimeout(waiting.timer); this.pending.delete(requestId); receipt.ok ? waiting.resolve(receipt) : waiting.reject(new Error(receipt.message)); }
    }
    for (const listener of this.listeners) listener();
  }
  async initialize() {
    if (this.isAuthority) for (const doc of game.journal.filter(d=>isKind(d,"evidence"))) {
      if(game.items.some(d=>d.getFlag(NS,"evidenceId")===doc.id))continue;
      const e=doc.getFlag(NS,"evidence"); if(!e?.published)continue;
      await Item.create({name:e.title,type:"clue",img:e.image||"icons/svg/book.svg",ownership:{default:2},system:{description:e.text,source:e.sourceVisit??"",caseId:e.sourceCase??"",acquiredAt:e.acquiredAt??"",medium:e.kind==="photo"?"photo":"paper",published:true},flags:{[NS]:{evidenceId:doc.id}}});
    }
    if (this.isAuthority && !this.document) {
      await JournalEntry.create({ name: "PMS — tabule", ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }, flags: { [NS]: { kind: "board", caseId:this.caseId, board: emptyBoard() } } });
    }
    Hooks.on("updateJournalEntry", doc => { if (isKind(doc, "board") || isKind(doc, "evidence") || isKind(doc,'authorityProof')) this.notify();if(isKind(doc,'authorityProof')&&this.isAuthority)for(const user of game.users)this.enqueueUserRequest(user); });
    Hooks.on("createJournalEntry", () => this.notify());
    Hooks.on("deleteJournalEntry", () => this.notify());
    for(const event of ["createItem","updateItem","deleteItem"])Hooks.on(event,()=>this.notify());
    Hooks.on("updateUser", user => { this.notify(); if (this.isAuthority) this.enqueueUserRequest(user); });
    Hooks.on("userConnected", () => {
      this.notify();
      if (this.isAuthority) for (const user of game.users) this.enqueueUserRequest(user);
    });
    if (this.isAuthority) for (const user of game.users) this.enqueueUserRequest(user);
    Hooks.on('pmsAuthorityChanged',()=>{this.notify();if(this.isAuthority)for(const user of game.users)this.enqueueUserRequest(user);});
  }
  enqueueUserRequest(user) {
    const request = user.getFlag(NS, "boardRequest");
    if (!request?.requestId || !this.boardById(request.boardId)) return;
    // Only a server-permitted update to this User can submit its commands. Socket sender fields aren't trusted.
    this.gmQueue = this.gmQueue.then(() => this.process(request, user)).catch(error => console.error("PMS board command rejected", error));
  }
  async process(command, user) {
    const doc=this.boardById(command.boardId);
    if (!this.isAuthority || !doc || !doc.testUserPermission(user,"OBSERVER")) return;
    const caseId=doc.getFlag(NS,"caseId")??"",evidence=caseId?this.evidenceForCase(caseId):this.allEvidence;
    const { state, duplicate } = applyBoardCommand(doc.getFlag(NS,"board")??emptyBoard(), command, { id: user.id, canEdit: user.role >= CONST.USER_ROLES.PLAYER }, evidence);
    if (!duplicate) await doc.setFlag(NS, "board", state);
    this.notify();
  }
  submit(command) {
    const request = { ...command, requestId: command.requestId ?? foundry.utils.randomID(), boardId: this.document?.id };
    const run = async () => {
      const doc=this.boardById(request.boardId);
      if (!this.authority || !doc?.testUserPermission(game.user,"OBSERVER")) throw new Error("Úpravy čekají na připojeného vypravěče.");
      if(game.user.isGM&&!this.isAuthority)throw new Error(game.pmsAuthority?.message??'Tabuli řídí hlavní okno vypravěče.');
      if (this.isAuthority) {
        const result = this.gmQueue.then(() => this.process(request, game.user));
        this.gmQueue = result.catch(() => {});
        await result;
        const receipt = doc.getFlag(NS,"board").receipts.find(r => r.key === `${game.user.id}:${request.requestId}`);
        if (!receipt?.ok) throw new Error(receipt?.message ?? "Změnu se nepodařilo uložit.");
        return receipt;
      }
      const confirmation = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(request.requestId); reject(new Error("Potvrzení ještě nedorazilo. Po připojení vypravěče se čekající změna může dokončit.")); }, 20000);
        this.pending.set(request.requestId, { resolve, reject, timer, boardId:request.boardId });
      });
      // Prevent an unhandled rejection if the document update fails before we await confirmation.
      confirmation.catch(() => {});
      try { await game.user.setFlag(NS, "boardRequest", request); this.notify(); return await confirmation; }
      catch (error) { const p = this.pending.get(request.requestId); if (p) { clearTimeout(p.timer); this.pending.delete(request.requestId); p.reject(error); } throw error; }
    };
    const result = this.localQueue.then(run);
    this.localQueue = result.catch(() => {});
    return result;
  }
  async publishEvidence({ title, text, image = "", kind = "paper", published = true, sourceCase, sourceVisit, source, acquiredAt }) {
    if (!this.isAuthority) throw new Error(game.pmsAuthority?.message??"Nálezy zveřejňuje hlavní vypravěč.");
    if (!published) throw new Error("Prototyp archivu ukládá pouze zveřejněné nálezy. Neveřejné podklady ponechte mimo světové dokumenty.");
    if (!title?.trim() || title.length > 160 || text.length > 5000) throw new Error("Vyplňte název a přiměřeně dlouhý text.");
    if (image && !/^(systems\/pms\/assets\/|worlds\/|modules\/|https:\/\/)/.test(image)) throw new Error("Použijte cestu k obrazovému podkladu ve Foundry nebo HTTPS.");
    const visit=game.pms?.visits.state,caseId=sourceCase??this.caseId??"",matching=visit?.caseId===caseId;
    return Item.create({name:title,type:"clue",img:image||"icons/svg/book.svg",ownership:{default:2},system:{description:text,source:source??"Záznam výpravy",caseId,acquiredAt:acquiredAt??(matching?`${Math.floor(visit.clock/60)}:${String(visit.clock%60).padStart(2,'0')}`:""),medium:kind==="photo"?"photo":"paper",published:true},flags:{pms:{caseBundle:caseId,sourceVisit:sourceVisit??(matching?visit.id:"")}}});
  }
  async seedArchive() {
    if (!game.user.isGM) throw new Error("Ukázku připravuje vypravěč.");
    if (this.caseId) throw new Error("Ukázkové materiály patří pouze do technického prototypu.");
    const examples = [
      { title: "Prasklý řemen", text: "Prasklý sedlový řemen s neobvyklým lomem. Sám neprokazuje úmyslné poškození.", image: "systems/pms/assets/strap.png", kind: "photo" },
      { title: "Havraní zákrut", text: "Ostrý obrat cesty, místo pádu a možné stanoviště mimo přímý pohled.", image: "systems/pms/assets/curve.png", kind: "photo" },
      { title: "Výpověď svědkyně", text: "Kůň se náhle splašil.", image: "", kind: "paper" }
    ];
    for (const example of examples) if (!this.evidence.some(e => e.title === example.title)) await this.publishEvidence(example);
  }
}
