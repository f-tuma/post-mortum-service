// Only explicitly selected player-facing fields can enter the shared preparation.
export {TETOVE_AVATAR_CATALOG} from './tetove-content.mjs';
const identifier=value=>{if(typeof value!=='string'||!/^[\w-]{1,64}$/.test(value)||(value==='prototype'||Object.hasOwn(Object.prototype,value)))throw new Error('Neplatný identifikátor nabídky.');return value;};
const text=(value,max=2000)=>{if(typeof value!=='string'||value.length>max)throw new Error('Neplatný text nabídky Avatarů.');return value;};
const list=(values,max,min=1)=>{if(!Array.isArray(values)||values.length<min||values.length>max)throw new Error('Neplatný rozsah nabídky Avatarů.');const ids=new Set();for(const v of values){identifier(v.id);if(ids.has(v.id))throw new Error('Duplicitní volba nabídky.');ids.add(v.id);}return values;};
export function avatarCatalog(data,caseId=data?.caseId){
 if(!data||identifier(data.caseId)!==identifier(caseId))throw new Error('Nabídka Avatarů patří jinému případu.');
 return {id:identifier(data.id??caseId),caseId,title:text(data.title,160),setting:text(data.setting??'',300),description:text(data.description??''),
  contacts:list(data.contacts,50,0).map(c=>({id:c.id,name:text(c.name,160),description:text(c.description??''),relationships:list(c.relationships,20).map(r=>({id:r.id,name:text(r.name??r.label,160),label:text(r.label??r.name,160)}))})),
  kits:list(data.kits,30).map(k=>{const items=list(k.items,100).map(i=>{const quantity=i.quantity??1;if(!Number.isInteger(quantity)||quantity<1||quantity>100)throw new Error('Neplatné počáteční množství.');return {id:i.id,name:text(i.name,160),description:text(i.description??''),quantity,food:Boolean(i.food)};});
   if(items.filter(i=>i.food).reduce((sum,i)=>sum+i.quantity,0)>100)throw new Error('Balíček může obsahovat celkem nejvýše 100 porcí jídla.');
   return {id:k.id,name:text(k.name,160),description:text(k.description??''),items};})};
}
