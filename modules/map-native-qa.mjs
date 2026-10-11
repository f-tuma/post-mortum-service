import {CASE_MAPS} from './map-plans.mjs';
const flag=(d,k)=>d.getFlag?.('pms',k)??d.flags?.pms?.[k];
const exact=(token,p)=>token.x===p.x&&token.y===p.y&&token.level===p.level;
const ordinary={animate:false,showRuler:false,constrainOptions:{ignoreWalls:false,ignoreCost:false}};
const walk=(token,p)=>token.move({...p,action:'walk',snapped:true},ordinary);
const place=(token,p)=>token.move({...p,action:'displace'},{animate:false,showRuler:false,constrainOptions:{ignoreWalls:true,ignoreCost:true}});
// ChangeLevel replaces the initiating movement. Its promise can resolve before the separate level update.
async function changeLevel(token,level,move){
 let listener,viewListener,timer,viewTimer;
 const arrived=new Promise((resolve,reject)=>{
  listener=Hooks.on('updateToken',document=>{if(document.uuid===token.uuid&&document.level===level.id&&document.elevation===level.elevation.bottom)resolve();});
  timer=setTimeout(()=>reject(new Error(`Nativní přechod do ${level.name} nebyl potvrzen do dvou minut.`)),120000);
 });
 const viewed=new Promise((resolve,reject)=>{
  viewListener=Hooks.on('canvasReady',()=>{if(canvas.scene?.id===token.parent.id&&canvas.level?.id===level.id)resolve();});
  viewTimer=setTimeout(()=>reject(new Error(`Pohled na ${level.name} se nedokončil.`)),120000);
 });
 try{
  await move();if(token.level!==level.id||token.elevation!==level.elevation.bottom)await arrived;await viewed;
  // V14 emits canvasReady just before clearing loading, after asynchronous Region viewed events.
  const deadline=Date.now()+10000;
  while(canvas.loading){if(Date.now()>deadline)throw new Error('Načítání patra se nedokončilo.');await new Promise(resolve=>setTimeout(resolve,25));}
 }
 finally{clearTimeout(timer);clearTimeout(viewTimer);Hooks.off('updateToken',listener);Hooks.off('canvasReady',viewListener);}
}

/** Explicit QA-only rehearsal on disposable native copies. Prompts are answered through the Foundry UI. */
export async function runNativeMapQA(){
 if(game.world.id!=='pms-loop-qa'||!game.user.isGM)throw new Error('Tento test smí běžet jen v izolovaném QA světě.');
 const originals=game.scenes.filter(s=>flag(s,'caseBundle')==='tetove'&&['manor','guild'].includes(flag(s,'caseScene')));
 const originalScene=canvas.scene,originalLevel=canvas.level?.id,originalPosition={...canvas.scene?._viewPosition};
 const invariant=()=>JSON.stringify({visit:game.pms.cases.visits.state,energy:game.pms.avatars.state.energy,worldTime:game.time.worldTime,scenes:originals.map(s=>s.toObject())});
 const before=invariant(),temporary=[];let actor;
 const report={foundry:game.version,role:game.user.role,doors:0,doorwayCells:0,openDirections:0,blockedChecks:0,stairGuards:[],stairs:[],surfaces:[],playerOwnership:false};
 try{
  const anna=game.users.find(u=>u.name==='QA Anna');
  actor=await Actor.create({name:'QA · průchodnost map',type:'npc',img:'systems/pms/assets/avatar.svg',ownership:{default:0,...(anna?{[anna.id]:3}:{})},flags:{pms:{qaGeometryProbe:true}}});
  for(const original of originals){
   const plan=CASE_MAPS.find(p=>p.id===flag(original,'caseScene')),data=original.toObject();
   delete data._id;data.name=`QA · průchodnost · ${plan.id}`;data.active=false;data.navigation=false;data.folder=null;data.tokens=[];data.flags={pms:{qaGeometryProbe:true}};
   // Disable only the copied stair prompts while testing door cells; the copied floor surface remains active.
   for(const r of data.regions)for(const b of r.behaviors)if(b.type==='changeLevel')b.disabled=true;
   const scene=await Scene.create(data,{keepId:true});temporary.push(scene);
   const [probe]=await scene.createEmbeddedDocuments('Token',[{name:'QA · běžná chůze',actorId:actor.id,actorLink:true,x:plan.party[0],y:plan.party[1],width:1,height:1,elevation:0,level:scene.firstLevel.id,texture:{src:'systems/pms/assets/avatar.svg'},sight:{enabled:true,range:100},flags:{pms:{qaGeometryProbe:true}}}]);
   report.playerOwnership ||= Boolean(anna&&probe.testUserPermission(anna,'OWNER'));
   const doors=scene.walls.filter(w=>w.door);
   await scene.updateEmbeddedDocuments('Wall',doors.map(w=>({_id:w.id,ds:1})));
   report.doors+=doors.length;
   for(const level of scene.levels){
    await scene.view({level:level.id});
    for(const door of doors.filter(w=>w.levels.has(level.id))){
     const [x1,y1,x2,y2]=door.c,vertical=x1===x2;
     for(let lane=(vertical?y1:x1)+plan.grid/2;lane<(vertical?y2:x2);lane+=plan.grid){
      const a={x:vertical?x1-plan.grid:lane-plan.grid/2,y:vertical?lane-plan.grid/2:y1-plan.grid,level:level.id,elevation:level.elevation.bottom};
      const b={...a,...(vertical?{x:x1}:{y:y1})};
      await place(probe,a);await walk(probe,b);if(!exact(probe,b))throw new Error(`Neprůchozí otevřený práh ${plan.id}/${flag(door,'caseDoor')}.`);
      await walk(probe,a);if(!exact(probe,a))throw new Error(`Neprůchozí návrat přes práh ${plan.id}/${flag(door,'caseDoor')}.`);
      report.doorwayCells++;report.openDirections+=2;
     }
    }
   }
   // A normal and a secret door must actually stop constrained movement when closed/locked.
   for(const door of [doors.find(w=>w.door===1),doors.find(w=>w.door===2)].filter(Boolean)){
    const level=scene.levels.get([...door.levels][0]);await scene.view({level:level.id});
    const [x1,y1,x2,y2]=door.c,vertical=x1===x2,along=(vertical?y1:x1)+plan.grid/2;
    const a={x:vertical?x1-plan.grid:along-plan.grid/2,y:vertical?along-plan.grid/2:y1-plan.grid,level:level.id,elevation:level.elevation.bottom};
    const b={...a,...(vertical?{x:x1}:{y:y1})};
    for(const state of [0,2]){await door.update({ds:state});await place(probe,a);await walk(probe,b);if(exact(probe,b))throw new Error(`Zavřené dveře ${flag(door,'caseDoor')} nezastavily pohyb.`);report.blockedChecks++;}
    await door.update({ds:1});
   }
   if(plan.stairs?.length){
    // The same apparent flight end is a valid exit only on its own floor.
    // Keep copied Change Level prompts disabled until these constrained movement checks finish.
    for(const guard of scene.walls.filter(w=>flag(w,'caseStairGuard'))){
     const level=scene.levels.get([...guard.levels][0]),s=plan.stairs.find(s=>s.key===flag(guard,'caseStairGuard'));
     await scene.view({level:level.id});
     const [x1,y1,x2,y2]=guard.c,vertical=x1===x2;
     const a={x:vertical?x1-plan.grid:(x1+x2)/2-plan.grid/2,y:vertical?(y1+y2)/2-plan.grid/2:y1-plan.grid,level:level.id,elevation:level.elevation.bottom};
     const b={...a,...(vertical?{x:x1}:{y:y1})};
     for(const [start,end]of [[a,b],[b,a]]){await place(probe,start);await walk(probe,end);if(exact(probe,end))throw new Error(`${s.name}: nesprávný konec ramene je průchozí v ${level.name}.`);}
     const horizontal=s.flights[0].start[1]===s.flights[0].end[1],p=flag(level,'levelKey')==='ground'?s.path[0]:s.path.at(-1);
     const inside={x:p[0]-plan.grid/2,y:p[1]-plan.grid/2,level:level.id,elevation:level.elevation.bottom},outside={...inside,...(horizontal?{x:p[0]+plan.grid/2}:{y:p[1]+plan.grid/2})};
     for(const [start,end]of [[inside,outside],[outside,inside]]){await place(probe,start);await walk(probe,end);if(!exact(probe,end))throw new Error(`${s.name}: správný nástup je zablokovaný v ${level.name}.`);}
     report.stairGuards.push({id:s.key,level:flag(level,'levelKey'),blockedDirections:2,clearEntryDirections:2});
    }
    for(const r of scene.regions)if(flag(r,'caseStairs'))await r.updateEmbeddedDocuments('RegionBehavior',r.behaviors.map(b=>({_id:b.id,disabled:false})));
    const ground=scene.levels.find(l=>flag(l,'levelKey')==='ground'),upper=scene.levels.find(l=>flag(l,'levelKey')==='upper');
    for(const [x,y,label,blocked]of [[1800,600,'podlaha',true],[1000,1150,'hlavní šachta',false],[2350,600,'služební šachta',false]]){
     const actual=scene.testSurfaceCollision({x,y,elevation:1},{x,y,elevation:5},{type:'sight',level:ground.id});
     if(actual!==blocked)throw new Error(`Nesprávný povrch: ${label}.`);report.surfaces.push({name:label,blocked:actual});
    }
    for(const s of plan.stairs){
     await scene.view({level:ground.id});
     const point=([x,y],level)=>({x:x-plan.grid/2,y:y-plan.grid/2,level:level.id,elevation:level.elevation.bottom});
     await place(probe,point(s.path[0],ground));
     ui.notifications.info(`QA: ${s.name} nahoru — potvrď nativní přechod do patra.`);
     await changeLevel(probe,upper,()=>probe.move(s.path.slice(1).map(p=>({...point(p,ground),action:'walk',snapped:true})),ordinary));
     if(probe.level!==upper.id||probe.elevation!==upper.elevation.bottom)throw new Error(`${s.name}: přechod nahoru se nedokončil.`);
     const horizontal=s.flights[0].start[1]===s.flights[0].end[1],last=s.path.at(-1),exit={...point(last,upper),...(horizontal?{x:last[0]+plan.grid/2}:{y:last[1]+plan.grid/2})};
     await scene.view({level:upper.id});await walk(probe,exit);if(!exact(probe,exit))throw new Error(`${s.name}: horní výstup není průchozí.`);
     ui.notifications.info(`QA: ${s.name} dolů — potvrď nativní přechod do přízemí.`);
     await changeLevel(probe,ground,()=>walk(probe,point(last,upper)));
     if(probe.level!==ground.id||probe.elevation!==ground.elevation.bottom)throw new Error(`${s.name}: přechod dolů se nedokončil.`);
     await scene.view({level:ground.id});
     for(const p of s.path.slice(0,-1).reverse())await walk(probe,point(p,ground));
     const bottom=point(s.path[0],ground);if(!exact(probe,bottom))throw new Error(`${s.name}: spodní návrat není průchozí.`);
     report.stairs.push({id:s.key,up:true,down:true,lowerExit:true,upperExit:true});
    }
   }
  }
 }finally{
  if(originalScene)await originalScene.view({level:originalLevel});
  if(Number.isFinite(originalPosition.x)&&Number.isFinite(originalPosition.y))canvas.pan(originalPosition);
  for(const scene of temporary)await scene.delete();
  if(actor)await actor.delete();
 }
 report.originalWorldPreserved=before===invariant();if(!report.originalWorldPreserved)throw new Error('Test změnil původní svět.');
 return report;
}
