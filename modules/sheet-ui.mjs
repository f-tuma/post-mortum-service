export const rollDescription = (diceCount,difficulty) => `${diceCount} ${diceCount===1?'kostka':diceCount>=2&&diceCount<=4?'kostky':'kostek'} (d6) · obtížnost ${difficulty}`;
export const successTarget = required => `Cíl: ${required} ${required===1?'úspěch':required>=2&&required<=4?'úspěchy':'úspěchů'}`;

export function firstSheetPosition(position,viewportWidth,viewportHeight){
  const width=Math.min(Number(position.width)||580,Math.max(1,viewportWidth-32));
  const height=Math.min(Number(position.height)||650,Math.max(1,viewportHeight-72));
  return {width,height,left:Math.max(16,Math.min(Number(position.left)||(viewportWidth-width)/2,viewportWidth-width-16)),top:Math.max(16,Math.min(Number(position.top)||24,viewportHeight-height-48))};
}

export function caseDisplayName(caseId,visit,caseData,labels={}){
  if(!caseId)return 'Bez přiřazeného případu';
  if(visit?.caseId===caseId&&visit.title)return visit.title;
  if(caseData?.id===caseId&&caseData.title)return caseData.title;
  return Object.hasOwn(labels,caseId)?labels[caseId]:'Případ mimo tuto výpravu';
}

export function clueArchiveStatus(item,caseId,players=[]){
  if(item.parent)return {available:false,label:'Předmět v inventáři Avatara',action:'Zveřejnit kopii nálezu',hint:'V archivu vznikne společná kopie. Předmět zůstane v inventáři.'};
  const publicAccess=(item.ownership?.default??0)>=2&&players.every(player=>item.testUserPermission(player,'OBSERVER'));
  const belongs=!caseId||(item.system.caseId||item.getFlag('pms','caseBundle'))===caseId;
  const available=Boolean(item.system.published&&publicAccess);
  return {available,label:available?(belongs?'Ve společném archivu':'Ve společném archivu · jiný případ'):'Dosud mimo společný archiv',action:'Zveřejnit nález',hint:available?'Hráči mohou tento nález přetáhnout z archivu na tabuli.':'Zveřejnění zpřístupní nález skupině a zachová jeho původ.'};
}

export function sharedClueOwnership(ownership,players){
  const shared={...ownership,default:2};
  for(const player of players)shared[player.id]=Math.max(2,ownership[player.id]??2);
  return shared;
}

/** "Nela · svědkyně" shows as the name „Nela“ with the role underneath, never the role twice. */
export function characterHeading(name,role=''){
  const [first,...rest]=String(name??'').split('·').map(part=>part.trim());
  const suffix=rest.join(' · ');
  if(!suffix)return {name:first,role:role.trim()};
  return {name:first,role:role.trim()||suffix};
}
