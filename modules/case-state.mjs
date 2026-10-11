import {validateInitialSnapshot} from './case-initial-world.mjs';
import {buildCaseGuide} from './case-guide.mjs';
import {createVisit} from './visit-state.mjs';
import {caseRewards} from './reward-catalog.mjs';
import {upgradeLegacyCase} from './tetove-compat.mjs';
import {validateLoopDefinition,definitionId} from './case-definition.mjs';
import {avatarCatalog} from './avatar-catalog.mjs';
import {validatePreparation} from './case-preparation.mjs';
import {correctTetovePublicText} from './tetove-public-text.mjs';
export function validateCase(data){
 if(data?.format!=='pms-case'||![1,2].includes(data.version))throw new Error('Neznámý formát případu.');
 data=data.version===1?upgradeLegacyCase(data):structuredClone(data);definitionId(data.id);
 for(const [key,max] of [['npcs',30],['clues',100],['events',150],['guide',180],['worldFields',64]])if(!Array.isArray(data[key])||data[key].length>max)throw new Error('Neplatný rozsah přípravy.');
 for(const key of ['npcs','clues','events'])if(new Set(data[key].map(x=>x.id)).size!==data[key].length)throw new Error('Duplicitní identifikátor přípravy.');
 const string=(v,max)=>{if(typeof v!=='string'||v.length>max)throw new Error('Neplatný text přípravy.');};
 string(data.title,160);string(data.intro,2000);
 validatePreparation(data.preparation);
 for(const n of data.npcs){definitionId(n.id);string(n.name,160);string(n.role,160);string(n.biography,2000);if(n.img!==undefined){string(n.img,2000);if(n.img.includes('..')||n.img.includes('\\')||(/^[a-z]+:/i.test(n.img)&&!/^https?:\/\//i.test(n.img)))throw new Error('Neplatná cesta portrétu NPC.');}}
 for(const c of data.clues){definitionId(c.id);string(c.name,160);string(c.description,15000);string(c.source,160);if(!['paper','object','testimony','photo'].includes(c.medium))throw new Error('Neplatné médium.');}
 if(data.guidePages!==undefined)buildCaseGuide(data);
 if(data.rewards!==undefined||data.rewardShard!==undefined)caseRewards(data);
 for(const p of data.guide){string(p.name,180);string(p.markdown,60000);}
 if(new Set(data.worldFields.map(f=>f.key)).size!==data.worldFields.length)throw new Error('Duplicitní podmínka.');
 for(const f of data.worldFields){definitionId(f.key);if(!Object.hasOwn(data.world,f.key))throw new Error('Neznámá podmínka.');string(f.label,160);if(f.choices){if(!Object.hasOwn(f.choices,data.world[f.key]))throw new Error('Neplatná poloha.');}else if(typeof data.world[f.key]!=='boolean')throw new Error('Neplatná podmínka.');}
 createVisit({id:'validation',title:data.title,start:data.start,end:data.end,events:data.events,world:data.world,caseId:data.id,avatars:[{id:'validation',ownerId:'validation',name:'Validace'}]});
 validateLoopDefinition(data);if(data.initialSnapshot)validateInitialSnapshot(data.initialSnapshot,data);data.avatarCatalog=avatarCatalog(data.avatarCatalog,data.id);
 if(data.sourceContentVersion!==undefined&&(!Number.isSafeInteger(data.sourceContentVersion)||data.sourceContentVersion<1))throw new Error('Neplatná zdrojová verze přípravy.');
 return structuredClone(correctTetovePublicText(data));
}

/** Replace documentation only; every gameplay field comes from the installed case. */
export function withUpdatedGuide(installed, raw){
 const update=validateCase(raw);
 if(!update.guidePages)throw new Error('Soubor neobsahuje nově členěnou příručku.');
 if(installed.id!==update.id)throw new Error('Příručka patří jinému případu.');
 return {...structuredClone(installed),guide:update.guide,guidePages:update.guidePages,
  ...(update.preparation!==undefined?{preparation:update.preparation}:{}),
  guideSourceVersions:update.sourceVersions??[]};
}
