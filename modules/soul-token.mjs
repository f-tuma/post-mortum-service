export const SOUL_TOKEN_ASSET='systems/pms/assets/soul-token.svg';
export const SOUL_TOKEN_ALPHA=.8;

/** Change only appearance. Native walls, positions, levels and player ownership
 * remain in charge of movement and vision. Each native Token keeps its own art. */
function appearancePatch(appearance,saved,avatar,{prefix='',flag='soulToken'}={}){
  if(avatar.alive){
    if(!saved)return null;
    const patch={[`flags.pms.${flag}`]:new foundry.data.operators.ForcedDeletion()};
    // Materialization already restores the prototype; preserve a later manual
    // appearance edit rather than replacing it with an older saved portrait.
    if(appearance.texture?.src===SOUL_TOKEN_ASSET){
      patch[`${prefix}texture.src`]=saved.src;
      patch[`${prefix}name`]=saved.name;
      patch[`${prefix}alpha`]=saved.alpha;
    }
    return patch;
  }
  const restore=saved??{src:appearance.texture?.src??'',name:appearance.name??avatar.name,alpha:appearance.alpha??1};
  const patch={};
  if(appearance.texture?.src!==SOUL_TOKEN_ASSET)patch[`${prefix}texture.src`]=SOUL_TOKEN_ASSET;
  if(appearance.name!==`Duše · ${avatar.name}`)patch[`${prefix}name`]=`Duše · ${avatar.name}`;
  if(appearance.alpha!==SOUL_TOKEN_ALPHA)patch[`${prefix}alpha`]=SOUL_TOKEN_ALPHA;
  if(!saved)patch[`flags.pms.${flag}`]=restore;
  return Object.keys(patch).length?patch:null;
}

export async function syncSoulTokens(visit,{actors,scenes}){
  for(const avatar of visit.avatars){
    const actor=actors.get(avatar.actorId);if(!actor||actor.type!=='avatar')continue;
    const prototype=appearancePatch(actor.prototypeToken,actor.getFlag('pms','soulPrototype'),avatar,{prefix:'prototypeToken.',flag:'soulPrototype'});
    if(prototype)await actor.update(prototype);
    for(const scene of scenes){
      const updates=[];
      for(const token of scene.tokens){
        if(token.actorId!==actor.id)continue;
        const patch=appearancePatch(token,token.getFlag('pms','soulToken'),avatar);
        if(patch)updates.push({_id:token.id,...patch});
      }
      if(updates.length)await scene.updateEmbeddedDocuments('Token',updates);
    }
  }
}

/** Native Foundry door clicks update Wall.ds. Block only a player's soul;
 * selecting a living party member or GM scene editing remains available. */
export function soulControlsDoor({user,visit,controlled=[],characterId}={}){
  if(!user||user.isGM||visit?.status!=='active')return false;
  const own=visit.avatars.filter(a=>a.ownerId===user.id);
  const selected=controlled.map(t=>t.document?.actorId??t.actorId).filter(Boolean);
  const acting=selected.length?own.filter(a=>selected.includes(a.actorId)):own.filter(a=>a.actorId===characterId);
  return acting.length>0&&acting.every(a=>a.alive===false);
}

export function registerSoulTokenHooks(){
  Hooks.on('preUpdateWall',(wall,change,_options,userId)=>{
    if(!Object.hasOwn(change,'ds')||change.ds===wall.ds||userId!==game.user.id)return;
    if(!soulControlsDoor({user:game.user,visit:game.pms?.visits.state,controlled:canvas.tokens?.controlled??[],characterId:game.user.character?.id}))return;
    ui.notifications.warn('Duše nemůže otevřít ani zavřít dveře. Počkej na živého člena služby.');
    return false;
  });
}
