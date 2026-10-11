import {validateCase} from './case-state.mjs';
import {readCaseFile,restorePackageAssets} from './case-package.mjs';
import {assertSnapshotIdentities,assertNativeCaseSnapshot} from './case-snapshot.mjs';
import {nativeCaseAssetStorage,packageProgress} from './case-package-foundry.mjs';
import {assertCaseAvailable} from './case-lifecycle.mjs';
import {escape as esc} from './view-utils.mjs';
export function checkCaseUpdate(installed,incoming){
 if(!installed||incoming.id!==installed.id)throw new Error('ZIP patří jinému případu. Vyber balíček stejného případu.');
 const previous=installed.sourceContentVersion??installed.contentVersion;
 if(incoming.contentVersion<=previous)throw new Error(`ZIP obsahuje vydání ${incoming.contentVersion}. Aktualizace potřebuje novější vydání než ${previous}.`);
 if(!incoming.initialSnapshot)throw new Error('Aktualizační ZIP musí obsahovat výchozí scény a NPC.');
 return {previous,incoming:incoming.contentVersion,local:installed.contentVersion};
}
export async function updateCaseZip(cases,caseId,file){
 cases.gm();assertCaseAvailable(caseId);const progress=packageProgress('Ověřuji aktualizaci případu');let bundle;
 try{bundle=await readCaseFile(file,{validate:validateCase,onProgress:s=>progress.update(s)});}finally{progress.close();}
 if(!bundle.manifest)throw new Error('Pro aktualizaci vyber celý ZIP případu.');
 const installed=await cases.reloadDefinition(caseId),versions=checkCaseUpdate(installed,bundle.data),vault=game.journal.find(d=>d.getFlag('pms','kind')==='caseVault'&&d.getFlag('pms','caseId')===caseId),revision=vault.getFlag('pms','editorRevision')??0;
 if(cases.visits.state?.status==='active'||game.pms?.avatars.state?.preparation?.status==='preparing'||cases.launching)throw new Error('Celý případ aktualizuj mezi výpravami a mimo tvorbu Avatarů.');
 const editor=game.pms?.caseEditor;if(editor?.draft?.caseId===caseId&&editor.dirty)throw new Error('Nejdřív ulož nebo zavři rozepsaný návrh případu.');
 assertSnapshotIdentities(bundle.data.initialSnapshot,{actors:game.actors,scenes:game.scenes,items:game.items});assertNativeCaseSnapshot(bundle.data.initialSnapshot);
 const data=bundle.data,content=`<p><strong>${esc(installed.title)}</strong> · ${esc(caseId)}</p><p>Vydání v ZIPu: <strong>${versions.incoming}</strong> · dosud importované: <strong>${versions.previous}</strong>${versions.local!==versions.previous?` · místní verze: ${versions.local}`:''}</p><ul><li>${data.initialSnapshot.scenes.length} výchozích scén, jejich patra, dveře, světla a tokeny.</li><li>${data.npcs.length} NPC, dějové události, autorská příprava a přibalené soubory.</li></ul><p><strong>Autorský návrh a nynější scény/NPC tohoto případu budou nahrazeny.</strong> Další průchody začnou z aktualizovaného světa. Vlastní autorské změny si předem exportuj do ZIPu.</p><p>Skutečný výsledek, uložené sestavy Avatarů, vodítka, tabule, energie a přiznané odměny zůstanou zachované.</p>`;
 return cases.controls.promptForm('Aktualizovat případ ze ZIPu',content,{label:`Aktualizovat na vydání ${versions.incoming}`,position:{width:760},submit:async()=>{
  const upload=packageProgress('Aktualizuji případ');try{
   await cases.install(data,{expectedRevision:revision,prepare:async incoming=>{checkCaseUpdate(await cases.reloadDefinition(caseId),incoming);const relocated=await restorePackageAssets(bundle,incoming,{store:nativeCaseAssetStorage(()=>{cases.gm();assertCaseAvailable(caseId);}),guard:()=>{cases.gm();assertCaseAvailable(caseId);},onProgress:s=>upload.update(s)});return {...relocated,sourceContentVersion:incoming.contentVersion};}});
   if(editor?.draft?.caseId===caseId){editor.adoptDraft(await game.pms.editorService.load(caseId));if(editor.rendered)await editor.render({force:true});}
   game.pms?.catalog?.notify();
  }finally{upload.close();}
 }});
}
