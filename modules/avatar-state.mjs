import { VITALS, SKILLS } from './visit-state.mjs';
import { avatarCatalog } from './avatar-catalog.mjs';
import {HUB_COMMANDS,applyHubBallot} from './hub-ballot.mjs';
const fail = message => { throw new Error(message); };
const id = value => typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : fail('Neplatný identifikátor.');
const integer = (value,min,max) => Number.isInteger(value) && value >= min && value <= max ? value : fail(`Hodnota musí být celé číslo ${min}–${max}.`);
const text = (value,max=160) => typeof value === 'string' && value.length <= max ? value.trim() : fail('Neplatný nebo příliš dlouhý text.');
const values = (input,keys,max) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k=>!Object.hasOwn(keys,k))) fail('Neplatné rozdělení bodů.');
  return Object.fromEntries(Object.keys(keys).map(k=>[k,integer(input[k]??0,0,max)]));
};
const zero = keys => Object.fromEntries(Object.keys(keys).map(k=>[k,0]));
const savedKey = (caseId,ownerId) => `${caseId}:${ownerId}`;
const editable = ['name','role','origin','motivation','biography','portrait','contactId','relationshipId','kitId','vitals','skills'];

export function avatarCost(build) {
  return Object.values(values(build.vitals,VITALS,10)).reduce((a,b)=>a+b,0)
    + Object.values(values(build.skills,SKILLS,2)).reduce((a,b)=>a+3*b,0);
}
export function draftBudget(draft) {
  const cost = avatarCost(draft), paidValueH = draft.paidValueH ?? 0;
  return {cost,paidValueH,topUp:Math.max(0,cost-paidValueH),unusedPaidValue:Math.max(0,paidValueH-cost)};
}
export function createAvatarCampaign({id:campaignId}) {
  return {schemaVersion:1,id:id(campaignId),revision:0,initialized:false,initializedOwnerIds:[],energy:0,preparation:null,savedAvatars:{},caseVisits:[],receipts:[],ledger:[]};
}
export function availablePreparationRoster(state) {
  const p=state?.preparation;
  if (!p || p.status !== 'preparing' || !p.ownerIds.every(ownerId=>p.drafts[ownerId]?.status==='confirmed')) fail('Nejdřív všichni potvrďte svého Avatara.');
  return p.ownerIds.map(ownerId=>{
    const d=p.drafts[ownerId];
    return {id:d.avatarId,actorId:d.actorId??null,ownerId,name:d.name,role:d.role,origin:d.origin,motivation:d.motivation,biography:d.biography,
      portrait:d.portrait,contactId:d.contactId,relationshipId:d.relationshipId,kitId:d.kitId,paidValueH:d.paidValueH,
      vitals:structuredClone(d.vitals),skills:structuredClone(d.skills),food:p.catalog.kits.find(k=>k.id===d.kitId).items.filter(i=>i.food).reduce((n,i)=>n+i.quantity,0),alive:true};
  });
}
function validateDraft(input,catalog,{complete=false}={}) {
  const portrait=text(input.portrait,500);
  if (!/^(?:systems\/pms\/assets\/|icons\/)[\w./-]+\.(?:svg|png|webp|jpe?g)$/.test(portrait) || portrait.includes('..')) fail('Vyberte připravený portrét.');
  const d=Object.fromEntries(['name','role','origin','motivation','biography'].map(k=>[k,text(input[k],k==='biography'?1000:160)]));
  if (complete && (!d.name || !d.role)) fail('Doplňte jméno a koncept Avatara.');
  const contactId=text(input.contactId,64),relationshipId=text(input.relationshipId,64),kitId=text(input.kitId,64);
  const contact=catalog.contacts.find(c=>c.id===contactId);
  if (contactId && !contact) fail('Kontakt není v nabídce případu.');
  if (relationshipId && !contact?.relationships.some(r=>r.id===relationshipId)) fail('Vazba není v nabídce kontaktu.');
  if (complete && catalog.contacts.length && (!contact || !relationshipId)) fail('Vyberte kontakt a připravenou vazbu.');
  if (kitId && !catalog.kits.some(k=>k.id===kitId)) fail('Balíček není v nabídce případu.');
  if (complete && !kitId) fail('Vyberte základní balíček výbavy.');
  return {...d,portrait,contactId,relationshipId,kitId,vitals:values(input.vitals,VITALS,10),skills:values(input.skills,SKILLS,2)};
}

/** The entire debit, saved starting build and durable receipt are a single document write. */
export function applyAvatarCommand(current,command,user,{eligibleOwnerIds=[],catalog:offeredCatalog,offeredCaseIds=[]}={}) {
  if (current?.schemaVersion!==1) fail('Nepodporovaná verze kampaně.');
  id(command?.requestId);id(user?.id);
  const key=`${user.id}:${command.requestId}`;
  const old=current.receipts.find(r=>r.key===key);
  if(old)return {state:current,receipt:old,duplicate:true};
  const state=structuredClone(current);
  let receipt, receiptData={};
  try {
    const gm=()=>{if(!user.isGM)fail('Tuto změnu provádí vypravěč.');};
    const owners=input=>{
      if(!Array.isArray(input)||!input.length||input.length>20||new Set(input).size!==input.length)fail('Vyberte hráče výpravy.');
      return input.map(value=>{id(value);if(!eligibleOwnerIds.includes(value))fail('Účastníkem musí být hráč této hry.');return value;});
    };
    const prep=()=>{
      const p=state.preparation;
      if(!p||p.id!==command.preparationId||p.status!=='preparing')fail('Tato příprava už není otevřená.');
      return p;
    };
    const ownDraft=()=>{
      const p=prep(),ownerId=command.ownerId??user.id;
      if(ownerId!==user.id&&!user.isGM)fail('Nemůžete měnit cizího Avatara.');
      const d=p.drafts[ownerId];
      if(!d)fail('Nejste účastníkem této přípravy.');
      if(command.expectedRevision!==d.revision)fail('Avatar se mezitím změnil. Načtěte aktuální sestavu.');
      return {p,d,ownerId};
    };
    if(HUB_COMMANDS.includes(command.type))applyHubBallot(state,command,user,{eligibleOwnerIds,offeredCaseIds});
    else switch(command.type) {
      case 'initializePool': {
        gm();if(state.initialized)fail('Počáteční energie už byla připsaná.');
        state.initializedOwnerIds=owners(command.ownerIds);state.energy=10*state.initializedOwnerIds.length;state.initialized=true;
        state.ledger.push({key,kind:'initial',amount:state.energy,balance:state.energy,ownerIds:state.initializedOwnerIds});break;
      }
      case 'openPreparation': {
        gm();if(!state.initialized)fail('Nejdřív založte společnou zásobu energie.');
        if(state.preparation?.status==='preparing'&&Object.values(state.preparation.drafts).some(d=>d.status==='confirmed'))fail('Potvrzenou přípravu nejdřív dokončete odjezdem.');
        const ownerIds=owners(command.ownerIds),mode=command.mode;
        if(!['real','reflection'].includes(mode))fail('Neplatný druh návštěvy.');
        const catalog=avatarCatalog(offeredCatalog,command.caseId),preparationId=id(command.preparationId);
        state.caseLabels??={};state.caseLabels[catalog.caseId]=catalog.title;
        // A real passage belongs to the case, not to the chosen players. Even a different
        // roster must not replace the preserved reality or its paid Avatar identities.
        // Saved builds also protect campaigns created before the visit history was added.
        if(mode==='real'&&((state.caseVisits??[]).some(v=>v.caseId===catalog.caseId&&v.mode==='real')
          ||Object.values(state.savedAvatars).some(a=>a.caseId===catalog.caseId)))fail('Skutečný průchod tohoto případu už byl připraven. Vraťte se do odrazu paměti Chaosu.');
        const drafts=Object.fromEntries(ownerIds.map(ownerId=>{
          const saved=state.savedAvatars[savedKey(catalog.caseId,ownerId)];
          if(mode==='reflection'&&!saved)fail('Pro odraz musí mít každý hráč uloženého Avatara tohoto případu.');
          const build=mode==='reflection'?structuredClone(saved.build):{name:'',role:'',origin:'',motivation:'',biography:'',portrait:'systems/pms/assets/avatar.svg',contactId:'',relationshipId:'',kitId:'',vitals:zero(VITALS),skills:zero(SKILLS)};
          const d={...build,ownerId,avatarId:mode==='reflection'?saved.avatarId:id(command.avatarIds?.[ownerId]),actorId:mode==='reflection'?saved.actorId:null,
            revision:0,status:'editing',paidValueH:mode==='reflection'?saved.paidValueH:0};
          Object.assign(d,draftBudget(d));return [ownerId,d];
        }));
        if(new Set(Object.values(drafts).map(d=>d.avatarId)).size!==ownerIds.length)fail('Identita Avatara se nesmí opakovat.');
        state.preparation={id:preparationId,caseId:catalog.caseId,mode,ownerIds,catalog,drafts,status:'preparing',visitId:null};break;
      }
      case 'draft': {
        const {p,d}=ownDraft();if(d.status!=='editing')fail('Potvrzený Avatar je připravený k odjezdu.');
        if(!command.draft||typeof command.draft!=='object'||Array.isArray(command.draft)||Object.keys(command.draft).some(k=>!editable.includes(k)))fail('Návrh obsahuje nepovolené pole.');
        const build=validateDraft({...d,...command.draft},p.catalog);
        if(p.mode==='reflection'&&['name','role','origin','motivation','biography','portrait','contactId','relationshipId'].some(k=>build[k]!==d[k]))fail('V odrazu zůstává postava a její kontakt stejný.');
        Object.assign(d,build,draftBudget({...d,...build}));d.revision++;break;
      }
      case 'confirm': {
        if(Object.keys(command).some(k=>!['requestId','type','preparationId','expectedRevision','ownerId'].includes(k)))fail('Potvrzení obsahuje nepovolené pole.');
        const {p,d,ownerId}=ownDraft();if(d.status!=='editing')fail('Avatar už je potvrzený.');
        const build=validateDraft(d,p.catalog,{complete:true}),budget=draftBudget({...d,...build});
        if(budget.topUp>state.energy)fail('Ve společné zásobě není dost energie. Upravte sestavu.');
        // Remember what this confirmation changed, so it can be withdrawn exactly before departure.
        const previous=state.savedAvatars[savedKey(p.caseId,ownerId)];
        d.confirmation={charged:budget.topUp,paidBefore:budget.paidValueH,saved:previous?structuredClone(previous):null};
        state.energy-=budget.topUp;Object.assign(d,build,budget,{paidValueH:Math.max(budget.paidValueH,budget.cost),status:'confirmed'});d.revision++;
        state.savedAvatars[savedKey(p.caseId,ownerId)]={avatarId:d.avatarId,actorId:d.actorId,ownerId,caseId:p.caseId,paidValueH:d.paidValueH,build,materializedPreparationId:null};
        state.ledger.push({key,kind:'avatar',amount:-budget.topUp,balance:state.energy,ownerId,avatarId:d.avatarId,preparationId:p.id,paidValueH:d.paidValueH});
        receiptData={avatarId:d.avatarId,ownerId,charged:budget.topUp,paidValueH:d.paidValueH};break;
      }
      case 'unconfirm': {
        if(Object.keys(command).some(k=>!['requestId','type','preparationId','expectedRevision','ownerId'].includes(k)))fail('Zrušení obsahuje nepovolené pole.');
        const {p,d,ownerId}=ownDraft();if(d.status!=='confirmed')fail('Avatar ještě není potvrzený.');
        const key2=savedKey(p.caseId,ownerId);
        if(p.materializing||state.savedAvatars[key2]?.materializedPreparationId===p.id||!d.confirmation)fail('Odjezd už začal, sestavu nelze vrátit do úprav.');
        const {charged,paidBefore,saved}=d.confirmation;
        state.energy+=charged;
        if(saved)state.savedAvatars[key2]=saved;else delete state.savedAvatars[key2];
        Object.assign(d,{paidValueH:paidBefore,status:'editing'});delete d.confirmation;Object.assign(d,draftBudget(d));d.revision++;
        state.ledger.push({key,kind:'refund',amount:charged,balance:state.energy,ownerId,avatarId:d.avatarId,preparationId:p.id});
        receiptData={avatarId:d.avatarId,ownerId,refunded:charged};break;
      }
      case 'cancelPreparation': {
        gm();if(Object.keys(command).some(k=>!['requestId','type','preparationId'].includes(k)))fail('Zrušení obsahuje nepovolené pole.');
        const p=prep();
        if(p.materializing||p.ownerIds.some(ownerId=>state.savedAvatars[savedKey(p.caseId,ownerId)]?.materializedPreparationId===p.id||p.mode==='real'&&p.drafts[ownerId]?.actorId))fail('Odjezd už začal. Dokonči jeho obnovu; přípravu už nelze zrušit.');
        let refunded=0;
        for(const ownerId of p.ownerIds){const d=p.drafts[ownerId];if(d.status!=='confirmed')continue;
          if(!d.confirmation)fail('Potvrzená sestava nemá záznam platby. Přípravu nelze bezpečně zrušit.');
          const {charged,saved}=d.confirmation;integer(charged,0,10000);refunded+=charged;
          const savedId=savedKey(p.caseId,ownerId);if(saved)state.savedAvatars[savedId]=structuredClone(saved);else delete state.savedAvatars[savedId];
        }
        state.energy+=refunded;p.status='canceled';
        state.ledger.push({key,kind:'preparationRefund',amount:refunded,balance:state.energy,preparationId:p.id,ownerIds:[...p.ownerIds]});
        receiptData={refunded};break;
      }
      case 'beginMaterialization': {
        gm();const p=prep();availablePreparationRoster(state);p.materializing=true;break;
      }
      case 'attachActor': {
        gm();const p=prep(),d=p.drafts[command.ownerId];if(!d||d.status!=='confirmed'||d.avatarId!==command.avatarId)fail('Avatar není potvrzený.');
        const actorId=id(command.actorId);if(d.actorId&&d.actorId!==actorId)fail('Avatar již má jiného Actora.');
        d.actorId=actorId;state.savedAvatars[savedKey(p.caseId,d.ownerId)].actorId=actorId;break;
      }
      case 'materialized': {
        gm();const p=prep(),d=p.drafts[command.ownerId];if(!d?.actorId||d.status!=='confirmed')fail('Avatar není připravený.');
        state.savedAvatars[savedKey(p.caseId,d.ownerId)].materializedPreparationId=p.id;break;
      }
      case 'markLaunched': {
        gm();const p=prep();availablePreparationRoster(state);
        if(!p.ownerIds.every(ownerId=>state.savedAvatars[savedKey(p.caseId,ownerId)]?.materializedPreparationId===p.id))fail('Nejdřív připravte všechny Actory.');
        p.status='launched';p.visitId=id(command.visitId);
        state.caseVisits??=[];
        state.caseVisits.push({caseId:p.caseId,mode:p.mode,visitId:p.visitId,preparationId:p.id,ownerIds:[...p.ownerIds]});break;
      }
      default:fail('Tento příkaz není povolený.');
    }
    state.revision++;receipt={key,ok:true,revision:state.revision,...receiptData};
  }catch(error){Object.assign(state,structuredClone(current));receipt={key,ok:false,message:error.message,revision:current.revision};}
  state.receipts.push(receipt);return {state,receipt,duplicate:false};
}
