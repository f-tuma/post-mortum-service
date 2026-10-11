import {validateInitialSnapshot} from './case-initial-world.mjs';
export {validateInitialSnapshot} from './case-initial-world.mjs';
import {validateCase} from './case-state.mjs';
import {definitionId} from './case-definition.mjs';
import {caseRewards} from './reward-catalog.mjs';
import {TETOVE_EVENT_START,TETOVE_EVENT_FIELDS} from './tetove-initial-state.mjs';
const clone=value=>structuredClone(value);
export const EDITOR_SECTIONS=[['overview','book-open','Případ'],['world','layer-group','Výchozí svět'],['npcs','users','Postavy'],['clues','magnifying-glass','Vodítka'],['events','timeline','Události'],['state','sliders','Stav světa'],['rewards','gem','Rozluštění'],['avatars','address-card','Avataři'],['guide','feather-pointed','Příručka'],['check','list-check','Kontrola a vydání']];
export function editorDraft(data,snapshot=null){const definition=clone(data);delete definition.initialSnapshot;definition.rewards=caseRewards(data).rewards;
 if(data.id==='tetove'){definition.world={...TETOVE_EVENT_START,...definition.world};for(const field of TETOVE_EVENT_FIELDS)if(!definition.worldFields.some(f=>f.key===field.key))definition.worldFields.push(clone(field));}
 return {schemaVersion:1,caseId:data.id,revision:0,publishedVersion:data.contentVersion,definition,snapshot:clone(snapshot??data.initialSnapshot??null)};}
export function validateEditorDraft(draft){if(draft?.schemaVersion!==1||draft.caseId!==draft.definition?.id||!Number.isInteger(draft.revision)||draft.revision<0)throw new Error('Neplatný návrh případu.');definitionId(draft.caseId);return clone(draft);}
export function editorDiagnostics(draft){const errors=[],warnings=[];const data=draft.definition;
 try{validateCase(data);}catch(e){errors.push(e.message);}
 for(const event of data.events??[])for(const values of [event.condition??{},event.changes??{}])for(const [key,value] of Object.entries(values)){
  if(!Object.hasOwn(data.world??{},key))errors.push(`${event.title}: stav ${key} nemá výchozí hodnotu.`);
  const field=data.worldFields?.find(f=>f.key===key);if(field?.choices&&!Object.hasOwn(field.choices,value))errors.push(`${event.title}: neznámá volba stavu ${field.label}.`);
  if(field&&!field.choices&&typeof value!=='boolean')errors.push(`${event.title}: ${field.label} musí být Ano/Ne.`);
 }
 for(const contact of data.avatarCatalog?.contacts??[])if(!data.npcs?.some(n=>n.id===contact.id))errors.push(`Kontakt ${contact.name} nemá připravené NPC.`);
 if(draft.snapshot)try{validateInitialSnapshot(draft.snapshot,data);}catch(e){errors.push(e.message);}else errors.push('Ulož výchozí svět před vydáním.');
 if(!(data.guidePages?.length||data.guide?.length))warnings.push('Příručka zatím nemá stránky.');
 if(!(data.events?.length))warnings.push('Případ zatím nemá časované události.');
 return {errors:[...new Set(errors)],warnings};
}
export function publishEditorDraft(draft,currentVersion){validateEditorDraft(draft);if(currentVersion!==draft.publishedVersion)throw new Error('Vydaná příprava se mezitím změnila. Načti ji znovu.');const report=editorDiagnostics(draft);if(report.errors.length)throw new Error(report.errors.join('\n'));
 const data=validateCase(draft.definition);data.contentVersion=currentVersion+1;data.draftOnly=false;data.initialSnapshot=validateInitialSnapshot(draft.snapshot,data);return data;}
export function assertEditorWrite({isGM,isAuthority,active,preparing},publish=false){if(!isGM||!isAuthority)throw new Error('Editor spravuje hlavní připojený vypravěč.');if(publish&&(active||preparing))throw new Error('Návrh můžeš uložit. Vydání a výchozí svět počkají na návrat a uzavření přípravy Avatarů.');}
export function replaceEditorRecord(draft,key,record,oldId=null){const next=clone(draft);if(!['npcs','clues','events','rewards','worldFields','guidePages'].includes(key))throw new Error('Neznámá část případu.');const idKey=key==='worldFields'?'key':key==='guidePages'?'_id':'id';definitionId(record[idKey]);
 const list=next.definition[key]??=[];if(record[idKey]!==oldId&&list.some(x=>x[idKey]===record[idKey]))throw new Error('Identifikátor již existuje.');const i=list.findIndex(x=>x[idKey]===oldId);if(i<0)list.push(clone(record));else list[i]=clone(record);return next;}
export function removeEditorRecord(draft,key,id){const next=clone(draft),d=next.definition;
 if(key==='events'&&d.events.some(e=>e.dependencies?.some(dep=>dep.id===id)))throw new Error('Nejdřív odpoj navazující události.');
 if(key==='worldFields'&&d.events.some(e=>Object.hasOwn(e.condition??{},id)||Object.hasOwn(e.changes??{},id)))throw new Error('Stav používají události. Nejdřív uprav jejich podmínky a změny.');
 const idKey=key==='worldFields'?'key':key==='guidePages'?'_id':'id';if(!['npcs','clues','events','rewards','worldFields','guidePages'].includes(key))throw new Error('Neznámá část případu.');
 if(key==='npcs'&&(d.avatarCatalog.contacts.some(c=>c.id===id)||d.scenePlans.some(p=>p.tokens?.some(t=>t[0]===id))))throw new Error('Postavu stále používá kontakt nebo scéna.');
 d[key]=(d[key]??[]).filter(x=>x[idKey]!==id);if(key==='worldFields'){delete d.world[id];d.resultFields=d.resultFields.filter(k=>k!==id);for(const g of d.stateGroups??[])g.keys=g.keys.filter(k=>k!==id);}return next;}
