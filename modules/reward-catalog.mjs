const clean=value=>String(value??'').replace(/\*\*/g,'').trim();
/** Read the authored GM table, including cases imported before structured rewards existed. */
export function caseRewards(data){
 if(!data?.id)throw new Error('Nejdřív importuj přípravu případu.');
 const rows=data.rewards??(data.guide??[]).flatMap(p=>String(p.markdown??'').split('\n').filter(line=>/^\| R\d/.test(line)).map(line=>{
  const cells=line.split('|').slice(1,-1).map(clean),match=cells[1]?.match(/^(.+?)\.\s+([^]*)$/);
  return {id:cells[0],title:match?.[1]??cells[1],criteria:match?.[2]??'',insufficient:cells[2],amount:Number(cells[4])};
 }));
 if(!Array.isArray(rows)||(!rows.length&&data.rewards===undefined)||rows.length>100)throw new Error('Příprava neobsahuje kartu rozluštění.');
 const rewards=rows.map(r=>{
  if(!/^[\w-]{1,64}$/.test(r.id)||!Number.isInteger(r.amount)||r.amount<1||r.amount>10000)throw new Error('Neplatná odměna případu.');
  for(const [key,max] of [['title',180],['criteria',6000],['insufficient',3000]])if(typeof r[key]!=='string'||r[key].length>max)throw new Error('Neplatný popis rozluštění.');
  return {id:r.id,title:r.title,criteria:r.criteria,insufficient:r.insufficient,amount:r.amount};
 });
 if(new Set(rewards.map(r=>r.id)).size!==rewards.length)throw new Error('Duplicitní rozluštění.');
 const shard=data.rewardShard??null;
 if(shard&&(!/^[\w-]{1,64}$/.test(shard.id)||!Number.isInteger(shard.amount)||shard.amount<1||shard.amount>10000||typeof shard.title!=='string'))throw new Error('Neplatná přeměna úlomku.');
 if(shard&&rewards.some(reward=>reward.id===shard.id))throw new Error('Rozluštění a přeměna úlomku musí mít různé identifikátory.');
 return {caseId:data.id,title:data.title,rewards,shard};
}
