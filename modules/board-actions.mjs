import {escape,icon} from './view-utils.mjs';

/** Only the current player's actionable public offers, even on an archived board. */
export function pendingBoardActions(visit,user){
 if(!visit||visit.status!=='active'||!user?.id||user.isGM)return [];
 const avatars=new Map((visit.avatars??[]).filter(a=>a.ownerId===user.id&&a.alive!==false).map(a=>[a.id,a]));
 return (visit.actions??[]).filter(a=>avatars.has(a.avatarId)&&['offered','awaitingRoll'].includes(a.status))
  .map(a=>({actionId:a.id,avatarId:a.avatarId,actorId:avatars.get(a.avatarId).actorId,title:a.title,status:a.status}));
}

export function boardActionsMarkup(actions){
 if(!actions?.length)return '';
 const label=actions.length===1?'Akce čeká':actions.length<=4?`${actions.length} akce čekají`:`${actions.length} akcí čeká`;
 return `<button type="button" data-action="playerActions" class="pms-pending-action" aria-label="${escape(label)} · otevřít deník postavy" title="${escape(actions.map(a=>a.title).join(' · '))}">${icon('dice')}<span>${escape(label)}</span><b>${actions.length}</b></button>`;
}
