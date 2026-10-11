import {escape,icon} from './view-utils.mjs';

export const ARCHIVE_TABS=[
  {id:'all',label:'Všechny nálezy',icon:'folder-open'},
  {id:'paper',label:'Listiny',icon:'file-lines'},
  {id:'testimony',label:'Svědectví',icon:'comments'},
  {id:'object',label:'Předměty',icon:'key'},
  {id:'photo',label:'Obrazy',icon:'image'}
];
export const plain=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export const searchable=value=>plain(value).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('cs');
export const archiveMedium=e=>e.medium??(e.kind==='photo'?'photo':'paper');

export function archiveResults(evidence,{search='',archiveType='all',archiveCase='all',archiveSort='newest'}={}){
  const query=searchable(search),scoped=evidence.filter(e=>archiveCase==='all'||e.sourceCase===archiveCase);
  const counts=Object.fromEntries(ARCHIVE_TABS.map(tab=>[tab.id,scoped.filter(e=>tab.id==='all'||archiveMedium(e)===tab.id).length]));
  const entries=scoped.filter(e=>(archiveType==='all'||archiveMedium(e)===archiveType)&&(!query||searchable([e.title,e.text,e.sourceVisit,e.sourceCaseLabel].join(' ')).includes(query)));
  const order=new Map(evidence.map((e,i)=>[e.id,i]));
  entries.sort(archiveSort==='name'?(a,b)=>a.title.localeCompare(b.title,'cs'):(a,b)=>(b.createdAt??order.get(b.id))-(a.createdAt??order.get(a.id)));
  return {entries,counts,total:evidence.length};
}

export function archiveEntriesMarkup(entries){
  return entries.map(e=>{
    const medium=archiveMedium(e),type=ARCHIVE_TABS.find(t=>t.id===medium)??ARCHIVE_TABS[1];
    return `<article class="pms-archive-entry" data-medium="${escape(medium)}" draggable="true" data-evidence-id="${escape(e.id)}" tabindex="0" aria-label="Přetáhnout na tabuli: ${escape(e.title)}"><span class="pms-file-icon medium-${escape(medium)}" title="${escape(type.label)}">${icon(type.icon)}</span><div class="pms-file-content"><small class="pms-file-type">${escape(type.label)}${e.sourceVisit?` · ${escape(e.sourceVisit)}`:''}${e.acquiredAt?`<time>${escape(e.acquiredAt)}</time>`:''}</small><button class="pms-source-title" data-action="source" data-evidence-id="${escape(e.id)}">${escape(e.title)}</button><p class="pms-file-excerpt">${escape(plain(e.text).slice(0,160))}</p></div><button class="pms-pin-source" data-action="pin" data-evidence-id="${escape(e.id)}" title="Připnout doprostřed tabule" aria-label="Připnout na tabuli: ${escape(e.title)}">${icon('thumbtack')}</button></article>`;
  }).join('');
}

export function archiveMarkup(service,view){
  const evidence=service.evidence,{entries,counts,total}=archiveResults(evidence,view);
  const cases=[...new Map(evidence.filter(e=>e.sourceCase).map(e=>[e.sourceCase,e.sourceCaseLabel||'Další případ'])).entries()];
  return `<aside id="pms-archive-panel" class="pms-archive" aria-label="Archiv nálezů" aria-hidden="${view.archiveHidden}" ${view.archiveHidden?'inert':''}>
    <header class="pms-archive-heading"><div><small class="pms-archive-kicker">Kartotéka Popohřební služby</small><h2>Archiv nálezů</h2><p>Klikni na název pro detail, záznam přetáhni na tabuli.</p></div><button data-action="toggleArchive" class="pms-archive-close" aria-label="Zavřít archiv">${icon('xmark')}</button></header>
    <label class="pms-search">${icon('magnifying-glass')}<input type="search" placeholder="Prohledat názvy i obsah…" aria-label="Prohledat archiv" value="${escape(view.search)}"></label>
    <nav class="pms-archive-tabs" role="tablist" aria-label="Druhy nálezů">${ARCHIVE_TABS.map(t=>`<button id="pms-archive-tab-${t.id}" role="tab" aria-controls="pms-archive-results" aria-selected="${view.archiveType===t.id}" tabindex="${view.archiveType===t.id?0:-1}" data-action="archiveTab" data-archive-type="${t.id}" title="${t.label}">${icon(t.icon)}<span>${t.id==='all'?'Vše':t.label}</span><small data-archive-count="${t.id}">${counts[t.id]}</small></button>`).join('')}</nav>
    <div class="pms-archive-filters"><label>Případ<select data-archive-filter="archiveCase" aria-label="Filtrovat podle případu"><option value="all">${service.caseId?escape(service.state.title):'Všechny případy'}</option>${(service.caseId?[]:cases).map(([id,title])=>`<option value="${escape(id)}" ${view.archiveCase===id?'selected':''}>${escape(title)}</option>`).join('')}</select></label><label>Řazení<select data-archive-filter="archiveSort" aria-label="Řazení nálezů"><option value="newest" ${view.archiveSort==='newest'?'selected':''}>Poslední získané</option><option value="name" ${view.archiveSort==='name'?'selected':''}>Podle názvu</option></select></label></div>
    <div class="pms-archive-index"><span data-archive-summary role="status">${entries.length} z ${total} nálezů</span><button data-action="archiveReset">Zrušit filtry</button></div>
    <section id="pms-archive-results" class="pms-archive-results" role="tabpanel" aria-labelledby="pms-archive-tab-${view.archiveType}" tabindex="0"><div class="pms-archive-list">${archiveEntriesMarkup(entries)}</div><div class="pms-archive-empty" ${entries.length?'hidden':''}>${icon(total?'folder-closed':'box-archive')}<h3>${total?'Žádná stopa neodpovídá filtrům.':'Kartotéka čeká na první nález.'}</h3><p>${total?'Zkus jiné hledání nebo zruš filtry.':'Získané nálezy sem založí vypravěč.'}</p></div></section>
    <footer><p>${icon('lock-open')} Pouze nálezy zveřejněné pro skupinu.</p>${game.user.isGM?`<div class="pms-gm-controls">${service.caseId===service.activeCaseId&&service.caseId===game.pms.cases.data?.id?`<button data-action="caseClue">${icon('magnifying-glass')} Vodítka případu</button>`:''}<button data-action="publish">${icon('plus')} Vlastní nález</button>${service.caseId?'':'<button data-action="sample">Ukázkové materiály</button>'}</div>`:''}</footer>
  </aside>`;
}
