const clone = value => structuredClone(value);
export function createCaseMemory(campaignId) {
  return {schemaVersion:1,campaignId,templates:{},realResults:{},returns:{},resets:{}};
}
export function validateCaseMemory(memory,campaignId) {
  if(memory?.schemaVersion!==1||memory.campaignId!==campaignId)throw new Error('Paměť případů nepatří této kampani nebo má nepodporovanou verzi.');
  return memory;
}
export function rememberRealResult(memory,visit,snapshot) {
  if(visit?.status!=='returned'||visit.mode!=='real'||!visit.caseId)throw new Error('Uložit lze pouze dokončený skutečný průchod.');
  const existing=memory.realResults[visit.caseId];
  if(existing){if(existing.visit.id!==visit.id)throw new Error('Skutečný výsledek tohoto případu již existuje.');return memory;}
  const next=clone(memory);
  next.realResults[visit.caseId]={visit:clone(visit),snapshot:clone(snapshot),report:null};
  next.returns[visit.id]={caseId:visit.caseId,mode:'real',clock:visit.clock,reason:visit.returnReason};
  return next;
}
export function discardReflection(visit) {
  if(visit?.status!=='returned'||visit.mode!=='reflection')throw new Error('Odraz ještě neskončil.');
  return {...clone(visit),world:{},events:[],eventLog:[],actions:[],history:[{at:visit.clock,message:'Odraz skončil. Jeho zásahy se neuchovávají.'}],reflectionDiscarded:true};
}
export function recordRealReport(memory,caseId,{summary,responsibility}) {
  const result=memory.realResults[caseId];if(!result)throw new Error('Skutečný průchod ještě není uzavřený.');
  for(const value of [summary,responsibility])if(typeof value!=='string'||value.length>3000)throw new Error('Zápis musí mít nejvýše 3000 znaků.');
  if(!summary.trim())throw new Error('Doplň stručný výsledek skutečného průchodu.');
  const next=clone(memory);next.realResults[caseId].report={summary:summary.trim(),responsibility:responsibility.trim()};return next;
}
