import {caseEntry} from './case-definition.mjs';
const clone=value=>structuredClone(value);
/** A reset template can own native reality documents, never campaign actors or archive finds. */
export function validateInitialSnapshot(snapshot,data){
 if(!snapshot||snapshot.caseId!==data.id||!Array.isArray(snapshot.actors)||!Array.isArray(snapshot.scenes)||snapshot.items!==undefined&&!Array.isArray(snapshot.items))throw new Error('Chybí výchozí svět případu.');
 if(snapshot.actors.length>30||snapshot.scenes.length<1||snapshot.scenes.length>30||(snapshot.items??[]).length>100)throw new Error('Výchozí svět je příliš velký.');
 const ids=new Set(),npcIds=new Set(),sceneIds=new Set();
 for(const [type,docs] of [['Actor',snapshot.actors],['Scene',snapshot.scenes],['Item',snapshot.items??[]]])for(const doc of docs){
  if(!/^[a-zA-Z0-9]{16}$/.test(doc._id)||ids.has(`${type}.${doc._id}`)||doc.flags?.pms?.caseBundle!==data.id)throw new Error('Konfliktní identita dokumentu výchozího světa.');ids.add(`${type}.${doc._id}`);
  if(type==='Actor'){if(doc.type!=='npc')throw new Error('Avatar nepatří do výchozího světa.');if(npcIds.has(doc.flags.pms.caseNpc))throw new Error('NPC je ve výchozím světě přiřazené dvakrát.');npcIds.add(doc.flags.pms.caseNpc);}
  if(type==='Scene'){if(doc.flags.pms.hubVista)throw new Error('Hub nepatří do případu.');if(sceneIds.has(doc.flags.pms.caseScene))throw new Error('Scéna je ve výchozím světě přiřazená dvakrát.');sceneIds.add(doc.flags.pms.caseScene);if(!Array.isArray(doc.levels)||!doc.levels.length)throw new Error('Scéně chybí nativní podlaží.');
   const levels=new Set(doc.levels.map(l=>l._id));for(const token of doc.tokens??[])if(token.flags?.pms?.visitParty||!snapshot.actors.some(a=>a._id===token.actorId)||!levels.has(token.level))throw new Error('Token odkazuje mimo výchozí svět.');
  }
  if(type==='Item'&&(!doc.flags.pms.caseTemplateItem||doc.flags.pms.sourceVisit||doc.system?.published))throw new Error('Archivní nález nesmí být obnovovaným předmětem.');
 }
 if(data.npcs.some(n=>!npcIds.has(n.id))||npcIds.size!==data.npcs.length||data.scenePlans.some(p=>!sceneIds.has(p.id))||sceneIds.size!==data.scenePlans.length)throw new Error('Výchozí svět neodpovídá přiřazeným scénám a NPC.');
 const entry=caseEntry(data),scene=snapshot.scenes.find(s=>s.flags.pms.caseScene===entry.plan.id),level=scene.levels.find(l=>(l.flags?.pms?.levelKey??l._id)===entry.level.key);
 if(!level||scene.width!==entry.plan.width||scene.height!==entry.plan.height||scene.grid.size!==entry.plan.grid)throw new Error('Vstup nebo rozměry nesouhlasí s uloženou scénou. Ulož znovu výchozí svět.');
 return clone(snapshot);
}
