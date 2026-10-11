/** Public next-session choice. This never changes a Visit, Avatar build or energy. */
export const HUB_COMMANDS=['hubOpenBallot','hubVote','hubConfirmBallot','hubCancelBallot'];
const fail=m=>{throw new Error(m);};
const id=v=>typeof v==='string'&&/^[\w-]{1,64}$/.test(v)&&!Object.hasOwn(Object.prototype,v)?v:fail('Neplatný identifikátor hlasování.');
export const introductionComplete=campaign=>(campaign?.caseVisits??[]).some(v=>v.caseId==='tetove'&&v.mode==='real'&&v.status==='returned');
export function ballotCounts(ballot){return Object.fromEntries((ballot?.caseIds??[]).map(caseId=>[caseId,Object.values(ballot.votes??{}).filter(v=>v===caseId).length]));}
export function applyHubBallot(state,command,user,{eligibleOwnerIds=[],offeredCaseIds=[]}={}){
 const gm=()=>{if(!user.isGM)fail('Hlasování připravuje vypravěč.');};
 const ballot=()=>{const b=state.hubBallot;if(!b||b.id!==command.ballotId||b.status!=='open')fail('Toto hlasování už není otevřené.');return b;};
 const keys={hubOpenBallot:['ballotId','ownerIds','caseIds'],hubVote:['ballotId','caseId'],hubConfirmBallot:['ballotId','caseId'],hubCancelBallot:['ballotId']};
 if(Object.keys(command).some(k=>!['type','requestId',...(keys[command.type]??[])].includes(k)))fail('Požadavek obsahuje nepovolené pole.');
 if(command.type==='hubOpenBallot'){
  gm();if(!introductionComplete(state))fail('Nejdřív dokončete úvodní skutečný případ Zkáza rodu Tétů.');
  if(state.hubBallot?.status==='open')fail('Nejdřív uzavři stávající hlasování.');
  const owners=command.ownerIds,cases=command.caseIds;
  if(!Array.isArray(owners)||!owners.length||owners.length>20||new Set(owners).size!==owners.length||owners.some(v=>!eligibleOwnerIds.includes(id(v))))fail('Vyber platné účastníky hlasování.');
  if(!Array.isArray(cases)||!cases.length||cases.length>30||new Set(cases).size!==cases.length||cases.some(v=>!offeredCaseIds.includes(id(v))))fail('Vyber dostupná nová pověření.');
  state.hubBallot={id:id(command.ballotId),status:'open',ownerIds:[...owners],caseIds:[...cases],votes:{},selectedCaseId:null};return;
 }
 const b=ballot();
 if(command.type==='hubVote'){
  if(user.isGM||!b.ownerIds.includes(user.id)||!eligibleOwnerIds.includes(user.id))fail('Nejsi účastníkem hlasování.');
  if(command.caseId===null){delete b.votes[user.id];return;}
  const caseId=id(command.caseId);if(!b.caseIds.includes(caseId)||!offeredCaseIds.includes(caseId))fail('Tento případ není v hlasování.');
  b.votes[user.id]=caseId;return;
 }
 gm();
 if(command.type==='hubCancelBallot'){b.status='canceled';return;}
 if(command.type!=='hubConfirmBallot')fail('Neznámý příkaz hlasování.');
 const caseId=id(command.caseId),counts=ballotCounts(b),highest=Math.max(0,...Object.values(counts));
 if(!highest||counts[caseId]!==highest||!offeredCaseIds.includes(caseId))fail('Potvrď některý případ s nejvyšším počtem hlasů.');
 if(b.ownerIds.some(ownerId=>!Object.hasOwn(b.votes,ownerId)))fail('Ještě nehlasovali všichni účastníci.');
 b.status='confirmed';b.selectedCaseId=caseId;
}
