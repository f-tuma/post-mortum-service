import {clientCanWrite,electedPMSAuthority} from './gm-authority.mjs';
import {NPC_TOKEN_VERSION,NPC_TOKEN_SIZE,NPC_TOKEN_FRAME,BUNDLED_NPC_TOKENS,drawNpcToken,npcTokenFlag,npcTokenSource,automaticNpcToken,automaticSceneNpcToken} from './npc-token-art.mjs';

function loadImage(src){
  return new Promise((resolve,reject)=>{
    const image=new Image();image.crossOrigin='anonymous';
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Portrét nelze načíst. Použij obrázek uložený ve Foundry nebo zdroj povolující načtení obrázků.'));
    image.src=src;
  });
}
export async function renderNpcToken(portrait){
  const [image,frame]=await Promise.all([loadImage(portrait),loadImage(NPC_TOKEN_FRAME)]);
  const element=document.createElement('canvas');element.width=element.height=NPC_TOKEN_SIZE;
  drawNpcToken(element.getContext('2d'),image,frame);
  return new Promise((resolve,reject)=>{
    try{element.toBlob(blob=>blob?resolve(blob):reject(new Error('Obrázek tokenu se nepodařilo vytvořit.')),'image/png');}
    catch{reject(new Error('Zdroj portrétu nepovoluje vytvoření tokenu. Nahraj portrét do Foundry.'));}
  });
}

/** Persist via Foundry's FilePicker; world-owned art survives system upgrades. */
export function nativeNpcTokenStorage(){
  let directory;
  return async(actor,blob,assertAuthority)=>{
    const picker=foundry.applications.apps.FilePicker.implementation;
    const folder=`worlds/${game.world.id}/pms-npc-tokens`;
    assertAuthority();
    directory??=(async()=>{
      const parent=await picker.browse('data',`worlds/${game.world.id}`);
      if(!parent.dirs.includes(folder)){
        assertAuthority();
        try{await picker.createDirectory('data',folder);}
        catch(error){try{await picker.browse('data',folder);}catch{throw error;}}
      }
    })().catch(error=>{directory=undefined;throw error;});
    await directory;
    const bytes=await blob.arrayBuffer();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('').slice(0,20);
    assertAuthority();
    const result=await picker.upload('data',folder,new File([blob],`npc-${actor.id}-${digest}.png`,{type:'image/png'}),{},{notify:false});
    if(!result?.path)throw new Error('Foundry neuložilo obrázek tokenu.');
    return result.path;
  };
}

export class NpcTokenService {
  constructor({actors,scenes,canWrite,render=renderNpcToken,store=nativeNpcTokenStorage(),onError=(error,actor)=>{console.error('PMS · NPC token',error);globalThis.ui?.notifications.warn(`${actor.name}: ${error.message}`);}}={}){
    this.actors=actors??(()=>game.actors);this.scenes=scenes??(()=>game.scenes);
    this.canWrite=canWrite??(()=>Boolean(game.user.isGM&&clientCanWrite()&&electedPMSAuthority([...game.users],[...game.journal])?.id===game.user.id));
    this.render=render;this.store=store;this.onError=onError;this.jobs=new Map();
  }
  get isAuthority(){return this.canWrite();}
  assertAuthority(){if(!this.isAuthority)throw new Error('Tokeny NPC spravuje hlavní připojený vypravěč.');}
  isCurrent(actor){
    if(!actor.isToken)return this.actors().get(actor.id)===actor;
    const token=actor.token;
    return Boolean(token&&token.parent?.tokens?.get(token.id)===token&&token.actor===actor);
  }
  sync(actor,options={}){
    const key=actor.uuid??(actor.isToken?`${actor.token.parent.id}.${actor.token.id}`:actor.id);
    const job=(this.jobs.get(key)??Promise.resolve()).catch(()=>{}).then(()=>this.syncActor(actor,options));
    this.jobs.set(key,job);
    const finished=()=>{if(this.jobs.get(key)===job)this.jobs.delete(key);};job.then(finished,finished);
    return job;
  }
  async syncActor(actor,{force=false,previousPortrait}={}){
    if(!this.isAuthority||actor.type!=='npc'||!actor.img||!this.isCurrent(actor))return {skipped:true};
    if(!force&&!automaticNpcToken(actor,previousPortrait))return {skipped:true};
    const portrait=actor.img,saved=npcTokenFlag(actor);
    const previous={img:portrait,flags:{pms:{npcToken:{...saved,portrait:saved?.portrait??previousPortrait}}},id:actor.id,type:actor.type};
    let src=!force&&saved?.portrait===portrait&&saved.version===NPC_TOKEN_VERSION?saved.src:null;
    if(!force)src ||= BUNDLED_NPC_TOKENS[portrait];
    if(!src){
      const blob=await this.render(portrait);this.assertAuthority();
      if(!this.isCurrent(actor)||!force&&!automaticNpcToken(actor,previousPortrait??portrait))return {skipped:true};
      if(actor.img!==portrait)return this.syncActor(actor,{force,previousPortrait:previousPortrait??portrait});
      src=await this.store(actor,blob,()=>this.assertAuthority());
    }
    this.assertAuthority();
    if(!this.isCurrent(actor))return {skipped:true};
    // A portrait or manually selected prototype may have changed during rendering.
    if(actor.img!==portrait)return this.syncActor(actor,{force,previousPortrait:previousPortrait??portrait});
    if(!force&&!automaticNpcToken(actor,previousPortrait))return {skipped:true};
    const metadata={enabled:true,portrait,src,version:NPC_TOKEN_VERSION};
    // An unlinked token owns its appearance. Never rewrite its base NPC or siblings.
    if(actor.isToken){
      const changed=npcTokenSource(actor)!==src;
      const token=actor.token;
      const stored=token.getFlag?.('pms','npcToken')??token.flags?.pms?.npcToken;
      if(changed||JSON.stringify(stored)!==JSON.stringify(metadata)){
        await token.update({'texture.src':src,'flags.pms.npcToken':metadata},{pmsNpcTokenSync:true});
      }
      return {src,prototype:false,tokens:Number(changed)};
    }
    const prototype=actor.prototypeToken.texture.src!==src;
    if(prototype||JSON.stringify(npcTokenFlag(actor))!==JSON.stringify(metadata)){
      await actor.update({'prototypeToken.texture.src':src,'flags.pms.npcToken':metadata},{pmsNpcTokenSync:true});
    }
    let tokens=0;
    for(const scene of this.scenes()){
      const updates=[...scene.tokens].filter(token=>automaticSceneNpcToken(token,previous)&&token.texture.src!==src)
        .map(token=>({_id:token.id,'texture.src':src}));
      if(!updates.length)continue;
      this.assertAuthority();
      if(actor.img!==portrait)return this.syncActor(actor,{force,previousPortrait:portrait});
      await scene.updateEmbeddedDocuments('Token',updates,{pmsNpcTokenSync:true});tokens+=updates.length;
    }
    return {src,prototype,tokens};
  }
  async syncAll(caseId){
    const results=[];
    const visit=async actor=>{if(actor.type==='npc'&&(!caseId||actor.getFlag('pms','caseBundle')===caseId)){
      try{results.push(await this.sync(actor));}
      catch(error){this.onError(error,actor);results.push({actorId:actor.id,error:error.message});}
    }};
    for(const actor of this.actors())await visit(actor);
    // Updating a base Actor can recreate its synthetic Actors; read them afterwards.
    for(const scene of this.scenes())for(const token of scene.tokens)if(token.actor?.isToken)await visit(token.actor);
    return results;
  }
}

export function registerNpcTokenHooks(){
  const schedule=(actor,options={})=>{
    const service=game.pms?.npcTokens;if(!actor||actor.type!=='npc'||!service?.isAuthority)return;
    service.sync(actor,{previousPortrait:options.pmsPreviousNpcPortrait}).catch(error=>{console.error('PMS · NPC token',error);ui.notifications.warn(`${actor.name}: ${error.message}`);});
  };
  const fromToken=token=>schedule(token.actor??game.actors.get(token.actorId));
  Hooks.on('createActor',schedule);
  Hooks.on('preUpdateActor',(actor,change,options={})=>{
    if(actor.type==='npc'&&Object.hasOwn(change,'img'))options.pmsPreviousNpcPortrait=actor.img;
  });
  Hooks.on('updateActor',(actor,change,options={})=>{
    if(options.pmsNpcTokenSync)return;
    if(Object.hasOwn(change,'img')||change.prototypeToken?.texture||Object.hasOwn(change,'prototypeToken.texture.src')||change.flags?.pms?.npcToken)schedule(actor,options);
  });
  Hooks.on('createToken',fromToken);
  Hooks.on('updateToken',(token,change,options={})=>{
    if(!options.pmsNpcTokenSync&&(change.texture||Object.hasOwn(change,'texture.src')))fromToken(token);
  });
  Hooks.on('createScene',scene=>{for(const token of scene.tokens)fromToken(token);});
  Hooks.on('pmsAuthorityChanged',()=>{const service=game.pms?.npcTokens;if(service?.isAuthority)service.syncAll().catch(error=>ui.notifications.warn(error.message));});
}
