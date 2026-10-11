/** Observable facts and attributed testimony; interpretation belongs in the GM guide. */
export const TETOVE_CLUE_NAMES={
 D01:'Prasklý řemen Viktorova sedla',D02:'Stopy v Havraním zákrutu',D03:'Terezina výpověď',
 D04:'Modrá lahvička a původní zásilka',D05:'Adélin domácí záznam',D06:'Kovový spoj z loveckého posedu',
 D07:'Terezina potvrzení č. 208 a 231',D08:'Veřejná evidence zakázek',D09:'Interní registr nákladových středisek',
 D10:'Schvalovací listy a prováděcí poznámky',D11:'Adélina vzpomínka',D12:'Křídové značky u stájových vrat',
 D13:'Vilémův dopis o dědictví',D14:'Výpovědi o přípravě Viktorova koně',D15:'Roztržený pokyn k večerní službě',
 D16:'Havelův změněný rozpis služby',D17:'Potvrzení soukromého předání č. 242',D18:'Výpovědi o Armandovi',
 D19:'Dveře za archivem a servisní plán',D20:'Krystal ve dřevěné skříňce'
};
export const TETOVE_PUBLIC_REGISTER=`**Pravidlo přezkumu zakázky**

„Adresát zásilky nebo jeho pověřený zástupce může předložit číslo zakázky a potvrzení souvislosti se zásilkou a žádat třicetiminutový dozorovaný přezkum jejích podkladů. Stejné právo k zakázce má vykonavatel a jeho pověřený zástupce. Přezkum zahrnuje schválení a prováděcí přílohy příslušného dokladu.“

**Pravidlo bezpečnostního vstupu**

„Zapečetěný nouzový klíč ke vnitřní soukromé místnosti uchovává archivář. Dozorovaný bezpečnostní vstup je možný při konkrétně podloženém závažném bezpečnostním podezření spojeném s cechovní zakázkou nebo při doloženém zneužití zakázky k násilí. Předloží se podklady ke schválení a k ohrožení či dopadu na postižené lidi. Vstup a důvod porušení pečeti se zaznamenají.“

**Výpis zakázek**

| Zakázka | Přijetí | Přihlášený zadavatel | Veřejný popis | Místo | Stav |
| --- | --- | --- | --- | --- | --- |
| 187 | před 42 dny | Lesní správa | Příprava demontáže starého loveckého stanoviště | Revír rodu Tétů | Přípravné práce vyplaceny; dokončení neobjednáno |
| 193 | před 35 dny | Provozní správa cechu | Dovoz obilí a trvanlivých potravin do cechovní jídelny | Cech | Předáno, potvrzeno |
| 201 | před 18 dny | Správa budovy | Oprava okapu a odvodu dešťové vody | Cech | Dokončeno |
| 208 | před 12 dny | Obstarání léčiva | Doručení uzavřené léčivé zásilky | Sídlo Tétů | Převzetí potvrzeno |
| 214 | před 8 dny | Provozní správa cechu | Vyčištění provozní studny | Cech | Dokončeno |
| 219 | před 4 dny | Správa archivu | Převázání poničených svazků evidence | Cech | Dokončeno |
| 226 | před 2 dny | Správa kaple | Doručení svící pro rozloučení | Kaple sídla Tétů | Převzetí potvrzeno |
| 231 | včera | Hlídka cest | Kontrola průjezdu neoznačeného kurýra | Havraní zákrut | Práce provedena; doplatek čeká na uzavření |`;

const LEGACY_NAMES=[
 'Přerušený řemen Viktorova sedla','Stopy zvukové léčky v Havraním zákrutu','Terezina práce, kterou si nechce přiznat',
 'Lahvička, která nevoní jako Lenčin lék','Adélin domácí záznam a vzpomínka na Lenku','Radovanův kovový spoj z loveckého posedu',
 'Dvě Terezina potvrzení a obyčejná značka R-17','Veřejná evidence zakázek, která skrývá skutečné plátce','Interní registr nákladových středisek',
 'Podpisy a prováděcí poznámky, které získají význam propojením','Adélin vlastní vzpomínka na odmítnutí','Běliny ochranné značky',
 'Vilémův skutečný spor o dědictví','Korda ve stáji a znalost rodinných návyků','Roztržený pokyn k večerní službě',
 'Havelův rozpis, který odvolává správnou stráž','Darekova zásilka číslo 242','Armandova proměna očima lidí z cechu',
 'Dveře za archivem a místnost, kterou cech nepoužívá','Talisman, jeho schránka a nevyslovené nároky'
];
const LEGACY_TESTIMONY='Tereza po rozhovoru popsala svůj úkol: podle určeného času vyvolat rachot u Havraního zákrutu a zastavit údajného kurýra. Viděla pád jezdce a utekla. Jeho totožnost tehdy neznala.';
export const TETOVE_PUBLIC_TESTIMONY=LEGACY_TESTIMONY.replace('Jeho totožnost tehdy neznala.','Tereza tvrdí, že tehdy neznala jeho totožnost.');
// Fingerprints identify exact shipped stock prose, not permission or authenticity.
// This avoids carrying the accidentally published GM commentary in the new runtime.
function stockText(value,length,first,second){
 if(typeof value!=='string'||value.length!==length)return false;
 const hash=seed=>{for(const c of value)seed=Math.imul(seed^c.codePointAt(0),0x01000193)>>>0;return seed;};
 return hash(0x811c9dc5)===first&&hash(0x9e3779b9)===second;
}
export function correctTetoveClue(clue){
 const oldName=LEGACY_NAMES[Number(clue.id?.slice(1))-1];
 const name=clue.name===oldName?TETOVE_CLUE_NAMES[clue.id]??clue.name:clue.name;
 let description=clue.description;
 if(clue.id==='D03'&&description===LEGACY_TESTIMONY)description=TETOVE_PUBLIC_TESTIMONY;
 if(clue.id==='D08'&&stockText(description,3053,0x96573781,0x64d0f38d))description=TETOVE_PUBLIC_REGISTER;
 return name===clue.name&&description===clue.description?clue:{...clue,name,description};
}
export function correctTetovePublicText(data){
 if(data?.id!=='tetove')return data;
 const clues=data.clues.map(correctTetoveClue);
 return clues.every((c,i)=>c===data.clues[i])?data:{...data,clues};
}
/** Only matching stock text changes; acquired evidence, custom edits and play state survive. */
export async function migrateTetoveClues(documents,isAuthority){
 for(const doc of documents){
  if(!isAuthority())return;
  if(doc.type!=='clue'||doc.getFlag('pms','caseBundle')!=='tetove')continue;
  const original={id:doc.getFlag('pms','caseClue'),name:doc.name,description:doc.system.description};
  const corrected=correctTetoveClue(original),update={};
  if(corrected.name!==original.name)update.name=corrected.name;
  if(corrected.description!==original.description)update['system.description']=corrected.description;
  if(Object.keys(update).length)await doc.update(update);
 }
}
export function correctTetoveGuideQuote(page,markdownToHTML){
 if(page.flags?.pms?.clueId!=='D08')return page.text.content;
 return page.text.content.replace(/(<blockquote class="pms-guide-player-text">)([^]*?)(<\/blockquote>)/,(all,start,content,end)=>
  stockText(content,5007,0x2396d9f2,0xaf5bf3d6)?start+markdownToHTML(TETOVE_PUBLIC_REGISTER)+end+'<h2 id="pms-register-gm-detail">Pravidla přezkumu a podrobnosti pro vypravěče</h2>'+content:all);
}
