const localLinks='a[data-action="goToHeading"],a[data-npc-guide],a[data-link],a.content-link[data-uuid]:not(.broken)';
const bound=new WeakSet();

/** Keep native document/page actions out of Foundry's global a[href] browser handler.
 * Repair old imported guide markup only in the rendered sheet, leaving its source intact.
 */
export function bindFoundryNavigation(root){
 for(const link of root.querySelectorAll(localLinks)){
  for(const attribute of ['href','target','rel'])link.removeAttribute(attribute);
  if(link.matches('a.content-link[data-uuid]:not(.broken)'))link.dataset.link='';
  link.setAttribute('role','button');link.tabIndex=0;
 }
 if(bound.has(root))return;bound.add(root);
 root.addEventListener('keydown',event=>{
  if(!['Enter',' '].includes(event.key))return;
  const link=event.target.closest?.(localLinks);
  if(!link||!root.contains(link))return;
  event.preventDefault();event.stopPropagation();
  if(!event.repeat&&link.getAttribute('aria-disabled')!=='true'&&!link.closest('[inert]'))link.click();
 });
}
