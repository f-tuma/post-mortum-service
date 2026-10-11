import {planWalls} from './map-plans.mjs';

/** Centre-to-centre moves through every complete grid cell in an authored doorway. */
export function doorwayCrossings(plan,door){
 const [x1,y1,x2,y2]=door.c,g=plan.grid,vertical=x1===x2;
 const a=vertical?Math.min(y1,y2):Math.min(x1,x2),b=vertical?Math.max(y1,y2):Math.max(x1,x2),crossings=[];
 for(let p=Math.ceil(a/g)*g+g/2;p<b;p+=g){
  if(p-g/2<a||p+g/2>b)continue;
  crossings.push(vertical?{from:{x:x1-g/2,y:p},to:{x:x1+g/2,y:p}}:{from:{x:p,y:y1-g/2},to:{x:p,y:y1+g/2}});
 }
 return crossings;
}

export function segmentsIntersect(a,b){
 const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 const p=a.slice(0,2),q=a.slice(2),r=b.slice(0,2),s=b.slice(2);
 const on=(p,q,r)=>Math.min(p[0],q[0])<=r[0]&&r[0]<=Math.max(p[0],q[0])&&Math.min(p[1],q[1])<=r[1]&&r[1]<=Math.max(p[1],q[1]);
 const c=[cross(p,q,r),cross(p,q,s),cross(r,s,p),cross(r,s,q)];
 if(c[0]*c[1]<0&&c[2]*c[3]<0)return true;
 return c[0]===0&&on(p,q,r)||c[1]===0&&on(p,q,s)||c[2]===0&&on(r,s,p)||c[3]===0&&on(r,s,q);
}

/** Strict geometry for generated architectural plans; GM hand-drawn scenes stay unrestricted. */
export function assertGridArchitecture(plan){
 const g=plan.grid,on=n=>Number.isInteger(n/g),walls=planWalls(plan);
 for(const r of plan.rooms??[])if(![r.x,r.y,r.w,r.h].every(on))throw new Error(`${plan.id}/${r.id}: místnost není na gridu.`);
 for(const w of walls){
  if(!w.c.every(on))throw new Error(`${plan.id}/${w.flags.pms.caseDoor??'wall'}: hrana není na gridu.`);
  if(!w.door)continue;
  const paths=doorwayCrossings(plan,w);
  if(!paths.length)throw new Error(`${plan.id}/${w.flags.pms.caseDoor}: dveřmi neprojde celé políčko.`);
  for(const path of paths)if(walls.some(other=>!other.door&&other.flags.pms.levelKey===w.flags.pms.levelKey&&segmentsIntersect([path.from.x,path.from.y,path.to.x,path.to.y],other.c)))throw new Error(`${plan.id}/${w.flags.pms.caseDoor}: průchod blokuje další zeď.`);
 }
 for(const s of plan.stairs??[])if(![s.x,s.y,s.w,s.h].every(on))throw new Error(`${plan.id}/${s.key}: schodiště není na gridu.`);
 return walls.filter(w=>w.door).map(w=>({id:w.flags.pms.caseDoor,level:w.flags.pms.levelKey,c:[...w.c],crossings:doorwayCrossings(plan,w)}));
}
