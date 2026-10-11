/** The visit's food counter is authoritative during play. Keep the native kit
 * supplies readable without deleting zero stacks or inventing new equipment. */
export function foodInventoryUpdates(items,food){
  if(!Number.isInteger(food)||food<0||food>100)throw new Error('Neplatný počet porcí jídla.');
  const stocks=[...items].filter(i=>i.type==='supply'&&i.getFlag('pms','food')===true)
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(!stocks.length)return [];
  const total=stocks.reduce((sum,i)=>sum+i.system.quantity,0),updates=[];
  if(food>total)return [{_id:stocks[0].id,'system.quantity':stocks[0].system.quantity+food-total}];
  let remaining=total-food;
  for(const item of stocks){
    const used=Math.min(remaining,item.system.quantity);if(!used)continue;
    updates.push({_id:item.id,'system.quantity':item.system.quantity-used});remaining-=used;
  }
  return updates;
}
