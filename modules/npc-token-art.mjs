/** Shared geometry for browser-generated and bundled NPC tokens. */
export const NPC_TOKEN_VERSION=2;
export const NPC_TOKEN_SIZE=512;
export const NPC_TOKEN_RADIUS=216;
export const NPC_TOKEN_FRAME='systems/pms/assets/npc-token-frame.svg';
const npcIds=['oto','adela','armand','korda','bela','havel','ida','tereza','darek'];
export const BUNDLED_NPC_TOKENS=Object.freeze(Object.fromEntries(npcIds.map(id=>[
  `systems/pms/assets/npcs/${id}-v1.png`,`systems/pms/assets/npcs/${id}-token-v${NPC_TOKEN_VERSION}.png`
])));

export function npcPortraitCrop(width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('Portrét nemá platné rozměry.');
  // A little over the upper two fifths leaves room for hair and chin inside the
  // circular frame. Square/head portraits retain their original full crop.
  const tall=height>width*1.2;
  const size=Math.max(1,Math.floor(Math.min(width,tall?height*5/12:height)));
  return {x:Math.floor((width-size)/2),y:tall?0:Math.floor((height-size)/2),width:size,height:size};
}

export function npcTokenFrameSVG(){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><filter id="shadow" x="-15%" y="-15%" width="130%" height="135%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#080f19" flood-opacity=".65"/></filter></defs>
  <circle cx="256" cy="256" r="229" fill="none" stroke="#17222e" stroke-width="26" filter="url(#shadow)"/>
  <circle cx="256" cy="256" r="237" fill="none" stroke="#bba67b" stroke-width="2"/>
  <circle cx="256" cy="256" r="225" fill="none" stroke="#576675" stroke-width="1"/>
  <circle cx="256" cy="256" r="216" fill="none" stroke="#9eb6a6" stroke-width="2"/>
  <g fill="#202d38" stroke="#c7b58a" stroke-width="2">
    <path d="M256 18l7 9-7 9-7-9z"/><path d="M256 476l7 9-7 9-7-9z"/>
    <path d="M18 256l9-7 9 7-9 7z"/><path d="M476 256l9-7 9 7-9 7z"/>
  </g></svg>`;
}

/** Browser rendering shares its crop and frame geometry with the bundled art. */
export function drawNpcToken(context,portrait,frame){
  const size=NPC_TOKEN_SIZE,center=size/2,crop=npcPortraitCrop(portrait.naturalWidth??portrait.width,portrait.naturalHeight??portrait.height);
  context.clearRect(0,0,size,size);
  context.save();context.beginPath();context.arc(center,center,NPC_TOKEN_RADIUS,0,Math.PI*2);context.clip();
  context.fillStyle='#17222e';context.fillRect(0,0,size,size);
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(portrait,crop.x,crop.y,crop.width,crop.height,center-NPC_TOKEN_RADIUS,center-NPC_TOKEN_RADIUS,NPC_TOKEN_RADIUS*2,NPC_TOKEN_RADIUS*2);
  context.restore();context.drawImage(frame,0,0,size,size);
}

const placeholder=src=>!src||['icons/svg/mystery-man.svg','systems/pms/assets/avatar.svg'].includes(src);
export const npcTokenFlag=actor=>(actor.isToken?(actor.token?.getFlag?.('pms','npcToken')??actor.token?.flags?.pms?.npcToken):null)??actor.getFlag?.('pms','npcToken')??actor.flags?.pms?.npcToken;
export const npcTokenSource=actor=>actor.isToken?actor.token?.texture?.src:actor.prototypeToken?.texture?.src;
export function automaticNpcToken(actor,previousPortrait){
  if(actor?.type!=='npc'||npcTokenFlag(actor)?.enabled===false)return false;
  const src=npcTokenSource(actor),saved=npcTokenFlag(actor);
  return placeholder(src)||src===actor.img||src===saved?.src||src===saved?.portrait||Boolean(previousPortrait&&src===previousPortrait);
}
export function automaticSceneNpcToken(token,actor){
  if(token.actor?.isToken&&token.actor.img!==actor.img)return false;
  if((token.getFlag?.('pms','npcToken')??token.flags?.pms?.npcToken)?.enabled===false)return false;
  const src=token.texture?.src,saved=npcTokenFlag(actor);
  return token.actorId===(actor.id??actor._id)&&(placeholder(src)||src===actor.img||src===saved?.src||src===saved?.portrait);
}
