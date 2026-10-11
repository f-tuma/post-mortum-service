/** A single presence state for mouse hover and keyboard focus. */
export class HubPresence {
 constructor(onChange){this.onChange=onChange;this.pointer=false;this.focus=false;this.active=false;}
 set(kind,value){this[kind]=value;const active=this.pointer||this.focus;if(active!==this.active){this.active=active;this.onChange(active);}}
 clear(){this.pointer=false;this.focus=false;if(this.active){this.active=false;this.onChange(false);}}
}
export function hubMotionPolicy({enabled=true,reduced=false,visible=true,editing=false,covered=false,active=true}={}){
 return active&&!editing&&!covered&&visible&&enabled&&!reduced;
}
/** Camera displacement in scene pixels, never cursor movement. */
export const HUB_BACKGROUND_DEPTH=.035;
export function hubLayerOffset(depth,pan={x:0,y:0}){
 const x=Math.max(-500,Math.min(500,Number(pan.x)||0));
 const d=Math.max(0,Math.min(1,Number(depth)||0));
 return {x:-x*d||0,y:0};
}
/** Cover the viewport; narrower screens explore the panorama by horizontal pan. */
export function hubCamera(width,height,screenWidth,screenHeight){
 return {x:width/2,y:height/2,scale:Math.max(screenWidth/width,screenHeight/height)};
}

/** Cinematic framing has finite artwork: stop before an outer cut edge is exposed. */
export function hubConstrainView(position,width,height,screenWidth,screenHeight){
 const base=hubCamera(width,height,screenWidth,screenHeight),clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const scale=base.scale;
 // Reserve the exterior's small opposing parallax shift inside the image edges.
 const span=Math.max(0,(width-screenWidth/scale)/2)/(1+HUB_BACKGROUND_DEPTH);
 return {x:clamp(Number(position.x)||base.x,base.x-span,base.x+span),y:base.y,scale};
}

/**
 * Animate the existing native PrimarySpriteMeshes. They stay in Foundry's lighting
 * pipeline; no DOM image overlay, replacement light shader or document writes.
 */
export class HubParallax {
 constructor({canvas,document,window,enabled=()=>true,editing=()=>false,covered=()=>false,onFrame=()=>{}}){
  Object.assign(this,{canvas,document,window,enabled,editing,covered,onFrame});this.offsets=new Map();this.change=()=>this.sync();
 }
 mount(){
  this.destroy();const c=this.canvas;if(!c.primary)return;
  this.layers=[];
  if(c.primary.background&&!c.primary.background.destroyed){const mesh=c.primary.background;this.layers.push({key:'exterior',mesh,depth:HUB_BACKGROUND_DEPTH,x:mesh.position.x,y:mesh.position.y});}
  for(const tile of c.scene.tiles){const config=tile.getFlag('pms','hubLayer'),mesh=tile.object?.mesh;if(!config||tile.hidden||!mesh||mesh.destroyed)continue;this.layers.push({key:config.key,mesh,depth:config.depth,x:tile.shape.x,y:tile.shape.y});}
  this.media=this.window.matchMedia('(prefers-reduced-motion: reduce)');this.media.addEventListener('change',this.change);this.document.addEventListener('visibilitychange',this.change);
  this.observer=new this.window.MutationObserver(this.change);this.observer.observe(this.document.body,{attributes:true,attributeFilter:['class'],childList:true});this.sync();
 }
 sync(){if(!this.media)return;this.running=hubMotionPolicy({active:this.canvas.ready,enabled:this.enabled(),reduced:this.media.matches,visible:!this.document.hidden,editing:this.editing(),covered:this.covered()});this.pan();}
 pan(){
  const c=this.canvas,delta=this.running?{x:c.stage.pivot.x-c.dimensions.sceneX-c.scene.width/2,y:0}:{x:0,y:0};
  for(const layer of this.layers??[]){if(layer.mesh.destroyed)continue;const offset=hubLayerOffset(layer.depth,delta);this.offsets.set(layer.key,offset);layer.mesh.position.set(layer.x+offset.x,layer.y+offset.y);}
  this.onFrame();
 }
 offset(key){return this.offsets.get(key)??{x:0,y:0};}
 destroy(){
  this.running=false;for(const layer of this.layers??[])if(!layer.mesh.destroyed)layer.mesh.position.set(layer.x,layer.y);
  this.layers=[];this.offsets.clear();this.observer?.disconnect();this.observer=null;this.media?.removeEventListener('change',this.change);this.media=null;this.document.removeEventListener('visibilitychange',this.change);
 }
}
