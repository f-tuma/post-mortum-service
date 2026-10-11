// Live Foundry windows replace their content after shared state changes. Keep
// the user's place by semantic identity, never by an index in the new tree.
const stableAttribute = name => name === 'id' || name === 'name' || name === 'type' || name === 'role' ||
  name.startsWith('data-') && !['data-bound','data-search','data-revision','data-status','data-keyboard-focus','data-active-tab','data-active-npc-tab'].includes(name);
const describe = element => ({tag:element.tagName.toLowerCase(),attributes:[...element.attributes]
  .filter(a=>stableAttribute(a.name)).map(a=>[a.name,a.value])});
const matches = (element,descriptor) => element?.tagName?.toLowerCase() === descriptor.tag &&
  descriptor.attributes.every(([key,value])=>element.getAttribute(key) === value);

export function captureFocus(root) {
  const document = root?.ownerDocument, active = document?.activeElement;
  if (!root || !active || !root.contains(active)) return null;
  const path=[];
  for(let el=active;el&&el!==root;el=el.parentElement){
    const descriptor=describe(el);
    if(el===active||descriptor.attributes.length)path.push(descriptor);
  }
  const selection=typeof active.selectionStart==='number'?{
    start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection
  }:null;
  return {previous:active,path,selection};
}

export function restoreFocus(root,snapshot,{fallback=root}={}) {
  if(!root || !snapshot)return false;
  const active=root.ownerDocument.activeElement;
  if(active===snapshot.previous && active.isConnected)return true;
  // A dialog or another live window may have gained focus while rendering.
  // Only repair focus lost to body/the application root; never take it back.
  if(active && active!==root.ownerDocument.body && active!==root)return false;
  let target=root;
  if(snapshot.path.length){
    const [leaf,...ancestors]=snapshot.path;
    const candidates=[...root.querySelectorAll(leaf.tag)].filter(element=>{
      if(!matches(element,leaf))return false;
      let parent=element.parentElement;
      for(const descriptor of ancestors){
        while(parent&&parent!==root&&!matches(parent,descriptor))parent=parent.parentElement;
        if(!parent||parent===root)return false;
        parent=parent.parentElement;
      }
      return true;
    });
    target=candidates.length===1?candidates[0]:fallback;
  }
  if(!target || target.disabled || target.closest('[inert]') || !target.getClientRects().length)target=fallback;
  if(!target || target.disabled || target.closest('[inert]') || !target.getClientRects().length)return false;
  target.focus({preventScroll:true});
  if(target!==fallback && snapshot.selection && typeof target.setSelectionRange==='function'){
    try{target.setSelectionRange(snapshot.selection.start,snapshot.selection.end,snapshot.selection.direction);}catch{}
  }
  return root.ownerDocument.activeElement===target;
}
