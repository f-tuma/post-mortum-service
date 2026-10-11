// Legacy pilot exports remain available to offline tools. Runtime takes plans from its case definition.
export {CASE_MAPS,SCENE_PLAN_VERSION} from './tetove-content.mjs';
/** The upper flight cannot exit on the lower floor; the lower flight has no entrance upstairs. */
export function stairEndGuards(plan){
 const result=[],half=plan.grid/2;
 for(const s of plan.stairs??[]){
  if(!s.guardFlightEnds)continue;
  for(const [level,flight,atStart]of [[s.levels[0],s.flights.at(-1),false],[s.levels[1],s.flights[0],true]]){
   const p=atStart?flight.start:flight.end,dx=Math.sign(flight.end[0]-flight.start[0]),dy=Math.sign(flight.end[1]-flight.start[1]),outward=atStart?-1:1;
   if((dx===0)===(dy===0))throw new Error(`${s.key}: konec schodiště musí mít přímou osu.`);
   const c=dx?[p[0]+dx*outward*half,p[1]-half,p[0]+dx*outward*half,p[1]+half]:[p[0]-half,p[1]+dy*outward*half,p[0]+half,p[1]+dy*outward*half];
   result.push({c,level,stairGuard:s.key,restrictions:{sight:0,light:0,sound:0}});
  }
 }
 return result;
}
/** Door at is an absolute x/y coordinate. Wall segments never cross their own door openings. */
export function planWalls(plan,levelIds=Object.fromEntries((plan.levels??[]).map(l=>[l.key,l.id]))){
 const walls=[];const push=(c,e,index,part,door)=>{if(c[0]===c[2]&&c[1]===c[3])return;walls.push({c,move:20,sight:20,light:20,sound:20,...e.restrictions,levels:levelIds[e.level]?[levelIds[e.level]]:[],...(door?{door:door.secret?2:1,ds:door.state}:{}),flags:{pms:{scenePlan:plan.id,caseWall:`${index}:${part}`,planVersion:plan.version??1,levelKey:e.level,...(e.stairGuard?{caseStairGuard:e.stairGuard}:{}),...(door?{caseDoor:door.key}: {})}}});};
 for(const [index,e] of (plan.edges??[]).entries()){if(!e.door){push(e.c,e,index,'solid');continue;}const [x1,y1,x2,y2]=e.c,d=e.door,vertical=x1===x2,a=d.at-d.width/2,b=d.at+d.width/2;
  push(vertical?[x1,y1,x1,a]:[x1,y1,a,y1],e,index,'before');push(vertical?[x1,a,x1,b]:[a,y1,b,y1],e,index,'door',d);push(vertical?[x1,b,x2,y2]:[b,y1,x2,y2],e,index,'after');
 }
 for(const guard of stairEndGuards(plan))push(guard.c,guard,`stair:${guard.stairGuard}`,guard.level);
 return walls;
}

/** Native Change Level Regions prompt the moving owner and update the token's level and elevation. */
export function planStairs(plan,levelIds=Object.fromEntries((plan.levels??[]).map(l=>[l.key,l.id]))){
 const elevation={bottom:Math.min(...plan.levels.map(l=>l.bottom)),top:plan.levels.some(l=>l.top===null)?null:Math.max(...plan.levels.map(l=>l.top)),topInclusive:false};
 return(plan.stairs??[]).map(s=>{const r=s.transition??s;return {name:s.name,color:'#b9a178',shapes:[{type:'rectangle',x:r.x,y:r.y,width:r.w,height:r.h,rotation:0,hole:false,anchorX:0,anchorY:0,gridBased:false}],levels:s.levels?s.levels.map(key=>levelIds[key]):Object.values(levelIds),elevation,visibility:0,ownership:{default:2},behaviors:[{name:'Přejít po schodech',type:'changeLevel',system:{movementActions:['walk']}}],flags:{pms:{scenePlan:plan.id,caseStairs:s.key,planVersion:plan.version??1}}};});
}

/** A native horizontal surface blocks sight/movement between floors, except in staircase shafts. */
export function planFloorSurfaces(plan,levelIds=Object.fromEntries((plan.levels??[]).map(l=>[l.key,l.id]))){
 return plan.levels.slice(1).map(l=>({name:`${l.name} · podlahový povrch`,color:'#7c928a',
  shapes:[...(plan.rooms??[]).filter(r=>r.level===l.key).map(r=>({type:'rectangle',x:r.x,y:r.y,width:r.w,height:r.h,rotation:0,hole:false,anchorX:0,anchorY:0,gridBased:false})),
   ...(plan.stairs??[]).filter(s=>s.levels?.includes(l.key)&&s.opening).map(s=>({type:'rectangle',x:s.opening.x,y:s.opening.y,width:s.opening.w,height:s.opening.h,rotation:0,hole:true,anchorX:0,anchorY:0,gridBased:false}))],
  levels:Object.values(levelIds),elevation:{bottom:l.bottom,top:l.bottom,topInclusive:false},visibility:0,ownership:{default:0},
  behaviors:[{name:'Pevná podlaha mimo schodiště',type:'defineSurface',system:{placement:'bottom',light:true,move:true,sight:true,sound:true,occlusion:true,exposure:false,culling:true}}],
  flags:{pms:{scenePlan:plan.id,caseSurface:l.key,planVersion:plan.version??1}}}));
}
