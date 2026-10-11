const room=(id,label,x,y,w,h,level='ground')=>({id,label,x,y,w,h,level});
const edge=(c,level='ground',door)=>({c,level,...(door?{door}: {})});
const opening=(key,at,state=1,extra={})=>({key,at,state,width:100,...extra});
const rail=(c,level)=>({...edge(c,level),restrictions:{sight:0,light:0,sound:0}});
const stairs=(key,name,x,y,w,h,path,landing,flights,transition)=>({key,name,x,y,w,h,layout:'u',guardFlightEnds:true,levels:['ground','upper'],path,landings:[landing],flights,transition,opening:{x,y,w,h},return:true});
export const SCENE_PLAN_VERSION=5;
export const CASE_MAPS=[
 {id:'manor',name:'Tétové · sídlo',artVersion:7,asset:'manor-ground-floor-v7.png',garden:'manor-garden-v7.png',width:3200,height:2400,grid:100,levels:[
  {key:'ground',id:'defaultLevel0000',name:'Přízemí · sídlo a služební dvůr',bottom:0,top:4,asset:'',overlay:'manor-ground-floor-v7.png',overlayRect:{x:800,y:400,w:2000,h:1500}},
  {key:'upper',id:'tetoveUpper00001',name:'Patro · rodina a kaple',bottom:4,top:8,asset:'',overlay:'manor-upper-floor-v7.png',overlayRect:{x:800,y:400,w:2000,h:1500},visibleLevels:['ground']}
 ],supplementalTiles:[
  {key:'stableGround',name:'Stáj · přízemí',asset:'stable-floor-v7.png',rect:{x:200,y:1100,w:600,h:800},levels:['ground'],elevation:0},
  {key:'stableRoof',name:'Stáj · střecha',asset:'stable-roof-v7.png',rect:{x:200,y:1100,w:600,h:800},levels:['upper'],elevation:4},
  {key:'groundArchitecture',name:'Přízemí · stavební grafika',asset:'architecture-manor-ground-v7.png',rect:{x:0,y:0,w:3200,h:2400},levels:['ground'],elevation:0,sort:-500},
  {key:'upperArchitecture',name:'Patro · stavební grafika',asset:'architecture-manor-upper-v7.png',rect:{x:0,y:0,w:3200,h:2400},levels:['upper'],elevation:4,sort:-500}
 ],rooms:[
  room('L01','Přijímací síň',800,400,800,600),room('dining','Jídelna',1600,400,600,600),room('kitchen','Kuchyně',2200,400,600,600),room('medicine','Sklad léčiv',2500,400,300,300),
  room('hall','Hlavní chodba',800,1000,2000,300),room('gallery','Galerie',800,1300,800,600),room('L04','Správcova kancelář',1600,1300,600,600),room('service','Služební zázemí',2200,1300,600,600),room('L03','Stáje',200,1100,500,800),room('passage','Kryté spojení',700,1300,100,300),
  room('library','Rodinná knihovna',800,400,800,600,'upper'),room('L02','Adélin salonek',1600,400,600,600,'upper'),room('stairHall','Služební schodiště',2200,400,300,600,'upper'),room('chapel','Rodinná kaple',2500,400,300,600,'upper'),room('upperHall','Patrová chodba',800,1000,2000,300,'upper'),room('family','Rodinné pokoje',800,1300,800,600,'upper'),room('bedroom','Ložnice',1600,1300,600,600,'upper'),room('upperGallery','Ochoz',2200,1300,600,600,'upper')
 ],edges:[
  edge([800,400,2800,400]),edge([2800,400,2800,1900],'ground',opening('serviceGate',1150,0)),edge([800,1900,2800,1900],'ground',opening('mainEntrance',1150)),edge([800,400,800,1900],'ground',opening('stablePassage',1450)),
  edge([800,1000,1600,1000],'ground',opening('L01-bottom',1450)),edge([1600,1000,2200,1000],'ground',opening('dining-bottom',1950)),edge([2200,1000,2800,1000],'ground',opening('kitchen-bottom',2650)),edge([1600,400,1600,1000]),edge([2200,400,2200,1000]),
  edge([800,1300,1600,1300],'ground',opening('gallery-top',1450)),edge([1600,1300,2200,1300],'ground',opening('L04-top',1950,0)),edge([2200,1300,2800,1300],'ground',opening('service-top',2650)),edge([1600,1300,1600,1900]),edge([2200,1300,2200,1900]),edge([2500,700,2800,700],'ground',opening('medicine-left',2650,2)),edge([2500,400,2500,700]),
  edge([200,1100,700,1100]),edge([200,1100,200,1900],'ground',opening('stableExit',1500,1,{width:200})),edge([200,1900,700,1900],'ground',opening('stableSouthExit',600,1,{width:200})),edge([700,1100,700,1900],'ground',opening('stable-east',1450)),edge([700,1300,800,1300]),edge([700,1600,800,1600]),
  edge([800,400,2800,400],'upper'),edge([2800,400,2800,1900],'upper'),edge([800,1900,2800,1900],'upper'),edge([800,400,800,1900],'upper'),edge([1600,400,1600,1000],'upper'),edge([2200,400,2200,1000],'upper',opening('L02-right',950)),edge([2500,400,2500,1000],'upper',opening('chapel-left',950)),
  edge([800,1000,1600,1000],'upper',opening('library-bottom',1450)),edge([1600,1000,2200,1000],'upper',opening('L02-bottom',1950)),edge([2200,1000,2500,1000],'upper',opening('serviceStair-bottom',2350)),edge([2500,1000,2800,1000],'upper',opening('chapel-bottom',2650)),
  edge([800,1300,1600,1300],'upper',opening('family-top',1450)),edge([1600,1300,2200,1300],'upper',opening('bedroom-top',1950)),edge([2200,1300,2800,1300],'upper',opening('upperGallery-top',2650)),edge([1600,1300,1600,1900],'upper'),edge([2200,1300,2200,1900],'upper'),
  ...['ground','upper'].flatMap(level=>[
   rail([900,1100,1300,1100],level),rail([900,1200,1300,1200],level),rail([900,1100,900,1200],level),rail([1300,1100,1300,1200],level),
   rail([2300,500,2300,900],level),rail([2400,500,2400,900],level),rail([2300,500,2400,500],level),rail([2300,900,2400,900],level)])
 ],stairs:[
  stairs('mainStairs','Hlavní schodiště',800,1000,500,300,[[1250,1250],[850,1250],[850,1050],[1250,1050]],{x:800,y:1000,w:100,h:300},[
   {start:[1250,1250],end:[850,1250],rise:2,risers:12,tread:.3},{start:[850,1050],end:[1250,1050],rise:2,risers:12,tread:.3}],{x:1200,y:1000,w:100,h:100}),
  stairs('serviceStairs','Služební schodiště',2200,400,300,500,[[2250,850],[2250,450],[2450,450],[2450,850]],{x:2200,y:400,w:300,h:100},[
   {start:[2250,850],end:[2250,450],rise:2,risers:12,tread:.3},{start:[2450,450],end:[2450,850],rise:2,risers:12,tread:.3}],{x:2400,y:800,w:100,h:100})
 ],tokens:[['oto',1100,600,false,'ground'],['adela',1800,600,false,'upper'],['korda',1800,1500,false,'ground'],['bela',500,1600,false,'ground'],['havel',2700,1100,false,'ground']],party:[1400,1100]
 },
 {id:'curve',name:'Tétové · Havraní zákrut',asset:'curve-art.webp',width:1600,height:1000,grid:50,levels:[{key:'ground',id:'defaultLevel0000',name:'Havraní zákrut',bottom:0,top:null,asset:'curve-art.webp'}],rooms:[],edges:[edge([600,600,950,740]),edge([950,740,1350,740])],tokens:[],party:[250,500]},
 {id:'guild',name:'Tétové · cech',artVersion:7,asset:'guild-floor-v7.png',width:3200,height:2400,grid:100,levels:[{key:'ground',id:'defaultLevel0000',name:'Přízemí · cech',bottom:0,top:null,asset:'guild-yard-v7.png',overlay:'guild-floor-v7.png',overlayRect:{x:400,y:250,w:2400,h:1800}}],supplementalTiles:[
  {key:'guildArchive',name:'Archiv · knihovny a stůl',asset:'guild-archive-v7.png',rect:{x:1720,y:400,w:540,h:810},levels:['ground'],elevation:0,sort:-800},
  {key:'privateStudy',name:'Soukromá komnata · pracovna',asset:'guild-archive-v7.png',rect:{x:2470,y:430,w:300,h:450},levels:['ground'],elevation:0,sort:-800},
  {key:'groundArchitecture',name:'Cech · stavební grafika',asset:'architecture-guild-ground-v7.png',rect:{x:0,y:0,w:3200,h:2400},levels:['ground'],elevation:0,sort:-500}
 ],rooms:[room('meeting','Poradna',400,300,1200,700),room('L06','Veřejná cechovní síň',400,1000,1200,1000),room('L07','Archiv',1600,300,700,1200),room('L08','Soukromá komnata',2300,300,500,1200),room('serviceHall','Zásobovací chodba',1600,1500,1200,500)],edges:[
  edge([400,300,2800,300]),edge([2800,300,2800,2000]),edge([400,2000,1600,2000],'ground',opening('guildEntrance',1050)),edge([1600,2000,2800,2000],'ground',opening('guildServiceEntrance',2550)),edge([400,300,400,2000]),edge([400,1000,1600,1000],'ground',opening('meeting-bottom',1050,0)),edge([1600,300,1600,1500],'ground',opening('L07-left',1250,2)),edge([1600,1500,1600,2000],'ground',opening('hallService',1750)),edge([1600,1500,2300,1500],'ground',opening('archiveServiceOpen',2050,2)),edge([2300,1500,2800,1500]),edge([2300,300,2300,1500],'ground',opening('L08-left',950,2,{secret:true}))
 ],tokens:[['ida',800,1300,false,'ground'],['armand',2500,800,true,'ground'],['tereza',1100,1500,true,'ground'],['darek',800,600,true,'ground']],party:[1000,1700]}
];


// Only the approved player-facing offer belongs here; never import the GM case bundle.
const base = [
  {id:'clothes', name:'Běžné oblečení do města'}, {id:'bag', name:'Cestovní brašna'},
  {id:'water', name:'Láhev vody'}, {id:'food', name:'Porce jídla', food:true},
  {id:'notebook', name:'Zápisník s uhlem'}
];
const kit = (id,name,description,items) => ({id,name,description,items:[...base,...items.map(([id,name,quantity=1])=>({id,name,quantity}))]});
export const TETOVE_AVATAR_CATALOG = {
  id:'tetove', caseId:'tetove', title:'Zkáza rodu Tétů', setting:'Fantasy · město a šlechtické sídlo',
  description:'Jednodenní vyšetřování neštěstí rodu Tétů. Připravte člověka, který do tohoto světa patří.',
  contacts:[
    {id:'bela',name:'Běla Rousová',description:'Stájová Tétů vás zná z dřívější péče o koně nebo cest. Přímá řeč jí bývá milejší než titul.',relationships:[{id:'horses',name:'Dřívější péče o koně'},{id:'travel',name:'Známí z cest'}]},
    {id:'havel',name:'Havel Lánský',description:'S kapitánem jste kdysi hlídali stejnou cestu nebo prošli společným výcvikem. Bere vás vážně, pokud mluvíte konkrétně.',relationships:[{id:'watch',name:'Společná hlídka na cestě'},{id:'training',name:'Společný výcvik'}]},
    {id:'ida',name:'Ida Svitová',description:'Archivářka zná vaši někdejší práci se záznamy či zakázkami. Oceňuje pečlivost a nemá ráda zbytečně zničené listiny.',relationships:[{id:'records',name:'Dřívější práce se záznamy'},{id:'contracts',name:'Známí z vyřizování zakázek'}]},
    {id:'tereza',name:'Tereza Vrána',description:'Potkali jste se při starší výpravě nebo v cechu. Tereza ráda mluví o práci, pokud z ní nemá být jen ponížení. Dnes ji čekají v cechu až odpoledne.',relationships:[{id:'expedition',name:'Společná starší výprava'},{id:'guild',name:'Známí z cechu'}]}
  ],
  kits:[
    kit('exploration','Průzkum','Jištění, světlo a označení nálezů.',[['rope','10 metrů lana'],['lantern','Zakrytelná lucerna se zapalováním'],['chalk','Kus křídy']]),
    kit('tools','Nástroje','Běžné mechanismy, spoje a vhodné zámky.',[['tools','Malá sada běžného ručního nářadí'],['lockpicks','Sada paklíčů'],['cord','Klubko pevné šňůry']]),
    kit('treatment','Ošetření','Běžné ošetření ran a příprava obkladu.',[['bandages','Sada obvazů pro běžné ošetření',2],['cloth','Čisté plátno'],['scissors','Malé nůžky']]),
    kit('protection','Ochrana','Krytí ústupu, průchodu a práce s ostrými věcmi.',[['staff','Pevná cestovní hůl'],['shield','Malý štít'],['gloves','Pevné rukavice']])
  ]
};
for (const contact of TETOVE_AVATAR_CATALOG.contacts) for (const relation of contact.relationships) relation.label=relation.name;
for (const kit of TETOVE_AVATAR_CATALOG.kits) for (const item of kit.items) { item.quantity??=1;item.description??=''; }

for(const plan of CASE_MAPS)plan.version=SCENE_PLAN_VERSION;
