import {escape as esc,time} from './view-utils.mjs';
const page=(name,sort,content)=>({name,type:'text',sort,content});
const text=value=>esc(value??'').replaceAll('\n','<br>');
export function realResultPages(result,data,book){
  const visit=result.visit,world=visit.world;
  const live=visit.avatars.filter(a=>a.alive);
  const processed=book?.awards?.[`${data.id}:${data.rewardShard?.id??'fragment'}`];
  const shard=processed?.active?'Převezen a přeměněn na energii':world.fragmentIsolated?(live.length?'Izolován; převoz ověř v kartě odměn':'Izolován a ponechán v realitě; žádný živý nosič'):'Bez dokončené izolace';
  const fields=new Map((data.worldFields??[]).map(f=>[f.key,f]));
  const facts=(data.resultFields??[]).map(key=>{const f=fields.get(key),value=world[key];return `<li>${esc(f?.label??key)}: ${esc(f?.choices?.[value]??(typeof value==='boolean'?(value?'Ano':'Ne'):String(value??'—')))}</li>`;}).join('');
  const changes=Object.entries(world).filter(([key,value])=>value!==data.world[key]).map(([key,value])=>{
    const f=fields.get(key);return `<li><strong>${esc(f?.label??key)}:</strong> ${esc(f?.choices?.[value]??(typeof value==='boolean'?(value?'Ano':'Ne'):String(value)))}</li>`;
  }).join('');
  return [
    page('Skutečný konec',1000,`<p>První skutečná výprava · návrat ${time(visit.clock)} · ${visit.returnReason==='death'?'smrt posledního Avatara':'konec časového okna'}</p><h2>Následky</h2><p>${result.report?text(result.report.summary):'Stručné uzavření můžeš doplnit tlačítkem Zapsat skutečný konec v hlavičce.'}</p><h2>Výprava a svět</h2><ul>${facts}${visit.avatars.map(a=>`<li>${esc(a.name)} · ${a.alive?'živý Avatar':'duše'}</li>`).join('')}</ul>${data.rewardShard||Object.hasOwn(world,'fragmentIsolated')||processed?`<h2>Úlomek</h2><p>${esc(shard)}</p>`:''}<p>Odrazy tento výsledek nepřepisují. Nová poznání se dál odměňují samostatně.</p>`),
    page('Aktéři a zásahy',2000,`<h2>Odpovědnost a osudy NPC</h2><p>${result.report?.responsibility?text(result.report.responsibility):'Vypravěč zatím nedoplnil příběhové uzavření.'}</p><h2>Změny při návratu</h2>${changes?`<ul>${changes}</ul>`:'<p>Bez zaznamenaných změn výchozích podmínek.</p>'}<p>Uložený stav obsahuje skutečně dokončené zásahy. Nedokončené činnosti MHD zpětně nedokončilo.</p>`)
  ];
}
