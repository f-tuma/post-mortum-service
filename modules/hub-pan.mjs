/** Time-based easing: the same short response at 30, 60 or 120 FPS. */
export function smoothHubPan(current,target,elapsedMS){
 const distance=target-current;
 if(Math.abs(distance)<.05)return target;
 return current+distance*(1-Math.exp(-Math.max(0,Math.min(64,elapsedMS))/55));
}

/** Ease native right-drag requests, while retaining native rendering and pan hooks. */
export class HubPanEasing {
 constructor({canvas,constrain,enabled}){Object.assign(this,{canvas,constrain,enabled});this.tick=()=>this.advance();}
 mount(){
  this.original=this.canvas.pan;const self=this;
  this.wrapper=function(position={}){
   if(!self.dragging||!self.enabled()){self.stop();return self.original.call(this,position);}
   self.target=self.constrain({x:this.stage.pivot.x,y:this.stage.pivot.y,scale:this.stage.scale.x,...position});
   if(!self.running){self.running=true;this.app.ticker.add(self.tick);}
  };
  this.canvas.pan=this.wrapper;
 }
 advance(){
  if(!this.target)return this.stop();
  const current=this.canvas.stage.pivot.x,target=this.target;
  const x=this.enabled()?smoothHubPan(current,target.x,this.canvas.app.ticker.deltaMS):target.x;
  this.original.call(this.canvas,{...target,x});
  if(x===target.x)this.stop();
 }
 stop(){if(this.running)this.canvas.app.ticker.remove(this.tick);this.running=false;this.target=null;}
 destroy(){this.stop();this.dragging=false;if(this.canvas.pan===this.wrapper)this.canvas.pan=this.original;}
}
