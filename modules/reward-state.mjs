const fail=message=>{throw new Error(message);};
const id=value=>typeof value==='string'&&/^[\w-]{1,64}$/.test(value)?value:fail('Neplatný identifikátor odměny.');
const note=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000?value.trim():fail('Doplň krátké zdůvodnění (nejvýše 2000 znaků).');
export const rewardKey=(caseId,rewardId)=>`${caseId}:${rewardId}`;
export function createRewardBook(campaignId){return {schemaVersion:1,campaignId:id(campaignId),revision:0,awards:{},history:[],receipts:[]};}
export function shipmentBlocker(visit,caseId){
 if(!visit||visit.caseId!==caseId)return 'Nejdřív dokonči skutečnou návštěvu tohoto případu.';
 if(visit.mode!=='real')return 'Odraz nepřiváží skutečný úlomek.';
 if(visit.status!=='returned')return 'Přeměna je dostupná až po návratu MHD.';
 if(!visit.world?.fragmentIsolated)return 'Úlomek nebyl při návratu bezpečně uzavřen.';
 if(!visit.avatars?.some(a=>a.alive))return 'Při návratu nebyl žádný živý nosič schránky.';
 return '';
}
/** Energy, private award identity and receipt form one campaign-document transaction. */
export function applyRewardCommand(campaign,current,command,{user,catalog,visit,now}={}){
 if(!user?.isGM)fail('Odměny přiděluje pouze vypravěč.');
 if(!campaign?.initialized||campaign.schemaVersion!==1)fail('Nejdřív založ společnou zásobu v MHD.');
 if(current?.schemaVersion!==1||current.campaignId!==campaign.id)fail('Karta odměn nepatří této kampani.');
 const requestKey=`${id(user.id)}:${id(command.requestId)}`,previous=current.receipts.find(r=>r.key===requestKey);
 if(previous)return {campaign,book:current,receipt:previous,duplicate:true};
 if(command.expectedRevision!==current.revision)fail('Karta se mezitím změnila. Načti aktuální stav.');
 if(!catalog?.caseId)fail('Případ nemá připravené odměny.');
 const rewardId=id(command.rewardId),key=rewardKey(catalog.caseId,rewardId),reason=note(command.note);
 const book=structuredClone(current),next=structuredClone(campaign),old=book.awards[key];
 const at=now??new Date().toISOString();
 let amount=0,title=old?.title,kind=command.type;
 if(kind==='award'){
  const reward=catalog.rewards.find(r=>r.id===rewardId)??fail('Rozluštění není na kartě případu.');
  if(!visit||visit.caseId!==catalog.caseId)fail('Rozluštění potřebuje návštěvu tohoto případu.');
  if(old?.active)fail('Toto poznání už bylo odměněno.');
  amount=reward.amount;title=reward.title;
 }else if(kind==='convert'){
  if(!catalog.shard||catalog.shard.id!==rewardId)fail('Neznámý úlomek.');
  const blocker=shipmentBlocker(visit,catalog.caseId);if(blocker)fail(blocker);
  if(old?.active)fail('Tento úlomek už byl přeměněn.');
  if(command.delivered!==true||command.processed!==true)fail('Potvrď skutečný převoz a předání zařízení v hubu.');
  if(!visit.avatars.some(a=>a.id===command.carrierId&&a.alive))fail('Schránku musel při návratu nést živý člen výpravy.');
  amount=catalog.shard.amount;title=catalog.shard.title;
 }else if(kind==='revoke'){
  if(!old?.active)fail('Tato odměna není připsaná.');
  if(next.energy<old.amount)fail('Energie už byla utracena. Zaznamenej omyl; nejdřív oprav navazující nákupy nebo obnov odpovídající zálohu. Zásoba se nesmí dostat pod nulu.');
  amount=-old.amount;
 }else if(kind==='dispute'){
  if(!old?.active)fail('Tato odměna není připsaná.');
 }else fail('Neplatná změna odměny.');
 if(kind==='award'||kind==='convert')book.awards[key]={caseId:catalog.caseId,rewardId,title,amount,active:true,needsReview:false,visitId:visit.id,mode:visit.mode,minute:visit.clock,at,by:user.id,note:reason,...(kind==='convert'?{carrierId:command.carrierId}:{} )};
 else if(kind==='revoke')Object.assign(book.awards[key],{active:false,needsReview:false});
 else book.awards[key].needsReview=true;
 next.energy+=amount;next.revision++;book.revision++;
 if(amount)next.ledger.push({key:requestKey,kind:kind==='revoke'?'rewardCorrection':kind==='convert'?'shard':'knowledge',amount,balance:next.energy,at});
 book.history.push({key:requestKey,caseId:catalog.caseId,rewardId,title,kind,amount,balance:next.energy,note:reason,at,by:user.id,visitId:visit?.id??old?.visitId,mode:visit?.mode??old?.mode,minute:visit?.clock??old?.minute});
 const receipt={key:requestKey,ok:true,revision:book.revision,amount};book.receipts.push(receipt);
 return {campaign:next,book,receipt,duplicate:false};
}
