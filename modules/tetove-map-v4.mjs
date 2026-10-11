// Frozen authored map v4; identifies old walls/assets and entry coordinates for the narrow geometry migration.
const room=(id,label,x,y,w,h,level='ground')=>({id,label,x,y,w,h,level});
const edge=(c,level='ground',door)=>({c,level,...(door?{door}: {})});
const opening=(key,at,state=1,extra={})=>({key,at,state,width:100,...extra});
const SCENE_PLAN_VERSION=4;
export const TETOVE_MAP_V4=[
 {id:'manor',name:'Tétové · sídlo',asset:'manor-garden.webp',width:3200,height:2400,grid:100,registrationTarget:{left:800,top:400,right:2800,bottom:1900},levels:[
  {key:'ground',id:'defaultLevel0000',name:'Přízemí · sídlo a služební dvůr',bottom:0,top:4,asset:'manor-garden.webp',registration:{left:355,top:176,right:1276,bottom:768,sourceWidth:1448,sourceHeight:1086},overlay:'manor-ground.png',overlayRegistration:{left:354,top:170,right:1282,bottom:834,sourceWidth:1448,sourceHeight:1086}},
  {key:'upper',id:'tetoveUpper00001',name:'Patro · rodina a kaple',bottom:4,top:8,asset:'manor-garden.webp',registration:{left:355,top:176,right:1276,bottom:768,sourceWidth:1448,sourceHeight:1086},overlay:'manor-upper.png',overlayRegistration:{left:205,top:160,right:1250,bottom:895,sourceWidth:1448,sourceHeight:1086}}
 ],rooms:[
  room('L01','Přijímací síň',800,400,800,600),room('dining','Jídelna',1600,400,600,600),room('kitchen','Kuchyně',2200,400,600,600),room('medicine','Sklad léčiv',2500,400,300,300),
  room('hall','Hlavní chodba',800,1000,2000,350),room('gallery','Galerie',800,1350,800,550),room('L04','Správcova kancelář',1600,1350,600,550),room('service','Služební zázemí',2200,1350,600,550),room('L03','Stáje',200,1100,500,800),room('passage','Kryté spojení',700,1300,100,300),
  room('library','Rodinná knihovna',800,400,800,600,'upper'),room('L02','Adélin salonek',1600,400,600,600,'upper'),room('stairHall','Služební schodiště',2200,400,200,600,'upper'),room('chapel','Rodinná kaple',2400,400,400,600,'upper'),room('upperHall','Patrová chodba',800,1000,2000,300,'upper'),room('family','Rodinné pokoje',800,1300,800,600,'upper'),room('bedroom','Ložnice',1600,1300,600,600,'upper'),room('upperGallery','Ochoz',2200,1300,600,600,'upper')
 ],edges:[
  edge([800,400,2800,400]),edge([2800,400,2800,1900],'ground',opening('serviceGate',1150,0)),edge([800,1900,2800,1900],'ground',opening('mainEntrance',1100)),edge([800,400,800,1900],'ground',opening('stablePassage',1450)),
  edge([800,1000,1600,1000],'ground',opening('L01-bottom',1200)),edge([1600,1000,2200,1000],'ground',opening('dining-bottom',1900)),edge([2200,1000,2800,1000],'ground',opening('kitchen-bottom',2600)),edge([1600,400,1600,1000]),edge([2200,400,2200,1000]),
  edge([800,1350,1600,1350],'ground',opening('gallery-top',1200)),edge([1600,1350,2200,1350],'ground',opening('L04-top',1900,0)),edge([2200,1350,2800,1350],'ground',opening('service-top',2600)),edge([1600,1350,1600,1900]),edge([2200,1350,2200,1900]),edge([2500,400,2500,700],'ground',opening('medicine-left',550,2)),edge([2500,700,2800,700]),
  edge([200,1100,700,1100]),edge([200,1100,200,1900],'ground',opening('stableExit',1500,1,{width:200})),edge([200,1900,700,1900],'ground',opening('stableSouthExit',550,1,{width:200})),edge([700,1100,700,1900],'ground',opening('stable-east',1450)),edge([700,1300,800,1300]),edge([700,1600,800,1600]),
  edge([800,400,2800,400],'upper'),edge([2800,400,2800,1900],'upper'),edge([800,1900,2800,1900],'upper'),edge([800,400,800,1900],'upper'),edge([1600,400,1600,1000],'upper'),edge([2200,400,2200,1000],'upper',opening('L02-right',800)),edge([2400,400,2400,1000],'upper',opening('chapel-left',600)),
  edge([800,1000,1600,1000],'upper',opening('library-bottom',1200)),edge([1600,1000,2200,1000],'upper',opening('L02-bottom',1900)),edge([2200,1000,2400,1000],'upper',opening('serviceStair-bottom',2300)),edge([2400,1000,2800,1000],'upper',opening('chapel-bottom',2600)),
  edge([800,1300,1600,1300],'upper',opening('family-top',1200)),edge([1600,1300,2200,1300],'upper',opening('bedroom-top',1900)),edge([2200,1300,2800,1300],'upper',opening('upperGallery-top',2600)),edge([1600,1300,1600,1900],'upper'),edge([2200,1300,2200,1900],'upper')
 ],stairs:[{key:'mainStairs',name:'Hlavní schodiště',x:800,y:1000,w:300,h:300,direction:'west'},{key:'serviceStairs',name:'Služební schodiště',x:2200,y:800,w:200,h:200}],tokens:[['oto',1100,600,false,'ground'],['adela',1800,600,false,'upper'],['korda',1800,1500,false,'ground'],['bela',550,1600,false,'ground'],['havel',2700,1100,false,'ground']],party:[1200,1100]
 },
 {id:'curve',name:'Tétové · Havraní zákrut',asset:'curve-art.webp',width:1600,height:1000,grid:50,levels:[{key:'ground',id:'defaultLevel0000',name:'Havraní zákrut',bottom:0,top:null,asset:'curve-art.webp'}],rooms:[],edges:[edge([600,600,950,740]),edge([950,740,1350,740])],tokens:[],party:[250,500]},
 {id:'guild',name:'Tétové · cech',asset:'guild-art.webp',width:3200,height:2400,grid:100,registrationTarget:{left:400,top:300,right:2800,bottom:2000},levels:[{key:'ground',id:'defaultLevel0000',name:'Přízemí · cech',bottom:0,top:null,asset:'guild-art.webp',registration:{left:177,top:111,right:1288,bottom:869,sourceWidth:1448,sourceHeight:1086,target:{left:400,top:300,right:2800,bottom:2000}}}],rooms:[room('meeting','Poradna',400,300,1200,700),room('L06','Veřejná cechovní síň',400,1000,1200,1000),room('L07','Archiv',1600,300,650,1200),room('L08','Soukromá komnata',2250,300,550,1200),room('serviceHall','Zásobovací chodba',1600,1500,1200,500)],edges:[
  edge([400,300,2800,300]),edge([2800,300,2800,2000]),edge([400,2000,1600,2000],'ground',opening('guildEntrance',1000)),edge([1600,2000,2800,2000],'ground',opening('guildServiceEntrance',2500)),edge([400,300,400,2000]),edge([400,1000,1600,1000],'ground',opening('meeting-bottom',1000,0)),edge([1600,300,1600,1500],'ground',opening('L07-left',1200,2)),edge([1600,1500,1600,2000],'ground',opening('hallService',1750)),edge([1600,1500,2250,1500],'ground',opening('archiveServiceOpen',2000,2)),edge([2250,1500,2800,1500]),edge([2250,300,2250,1500],'ground',opening('L08-left',975,2,{secret:true}))
 ],tokens:[['ida',800,1300,false,'ground'],['armand',2500,800,true,'ground'],['tereza',1100,1500,true,'ground'],['darek',800,600,true,'ground']],party:[1000,1700]}
];



for(const plan of TETOVE_MAP_V4)plan.version=SCENE_PLAN_VERSION;
