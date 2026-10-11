import {CASE_MAPS,SCENE_PLAN_VERSION,TETOVE_AVATAR_CATALOG} from './tetove-content.mjs';
const key=c=>JSON.stringify(c);
function legacyWallKeys(id){
 const definitions=id==='manor'?[
  [100,150,400,350,{bottom:200}],[600,150,400,350,{bottom:120,right:260}],[1100,150,300,350,{bottom:130}],
  [100,650,300,250,{top:150}],[550,650,350,250,{top:175}],[1100,650,300,250,{top:150}],[1250,750,150,150,{left:75}]
 ]:id==='guild'?[[100,500,450,350,{right:210,bottom:200}],[100,150,400,250,{bottom:200}],[650,250,450,400,{left:260,bottom:220,right:210}],[1150,250,250,400,{left:210}]]:[];
 const keys=new Set();
 for(const [x,y,w,h,doors] of definitions){const sides={top:[x,y,x+w,y],right:[x+w,y,x+w,y+h],bottom:[x,y+h,x+w,y+h],left:[x,y,x,y+h]};for(const [side,c] of Object.entries(sides)){if(doors[side]===undefined){keys.add(key(c));continue;}const vertical=c[0]===c[2],a=doors[side]-40,b=doors[side]+40,point=o=>vertical?[c[0],c[1]+o]:[c[0]+o,c[1]];const pa=point(a),pb=point(b);keys.add(key([c[0],c[1],...pa]));keys.add(key([...pa,...pb]));keys.add(key([...pb,c[2],c[3]]));}}
 if(id==='manor')for(const c of [[50,100,1450,100],[50,100,50,950],[50,950,1450,950],[1450,100,1450,560],[1450,640,1450,950],[1450,560,1450,640]])keys.add(key(c));
 if(id==='curve')for(const c of [[600,600,950,740],[950,740,1350,740]])keys.add(key(c));
 return keys;
}

export function upgradeLegacyCase(raw){
 if(raw.id!=='tetove'||raw.version!==1)throw new Error('Starý import nemá definici izolované smyčky.');
 const data=structuredClone(raw);
 const scenePlans=structuredClone(CASE_MAPS).map(p=>({...p,version:SCENE_PLAN_VERSION,legacyWalls:[...legacyWallKeys(p.id)].map(c=>JSON.parse(c)),...(p.id==='manor'?{legacyTokenLayout:{npcId:'adela',npcMaxX:1600,npcMaxY:400,avatarMaxX:800}}:{})}));
 const groups=[['Adéla a ochrana',/^(adela|guardAtGate|gateSecured|routeProtected|attackInterrupted|fragmentIsolated)/],['Korda a sídlo',/^(korda|letter|saddle)/],['Rozkazy a Havel',/^(falseRoster|rosterCancelled|havel)/]];
 const stateGroups=groups.map(([title,pattern])=>({title,keys:data.worldFields.filter(f=>pattern.test(f.key)).map(f=>f.key)}));
 const used=new Set(stateGroups.flatMap(g=>g.keys));stateGroups.push({title:'Cech, porada a Darek',keys:data.worldFields.filter(f=>!used.has(f.key)).map(f=>f.key)});
 return {...data,version:2,contentVersion:1,scenePlans,entry:{sceneId:'manor',levelKey:'ground',x:1400,y:1100,spacing:100},avatarCatalog:structuredClone(TETOVE_AVATAR_CATALOG),briefing:{name:'Pověření barona a přehled úmrtí',source:'Oto z Tét · L01'},stateGroups,resultFields:['adelaAlive'],rewardShard:data.rewardShard??{id:'fragment',title:'Úlomek zkázy rodu Tétů',amount:20}};
}
