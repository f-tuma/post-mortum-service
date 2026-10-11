/** Ignore only the persisted revision when comparing the working draft. */
export function sameEditorContent(a,b){if(!a||!b)return a===b;const {revision:revisionA,...left}=a,{revision:revisionB,...right}=b;return JSON.stringify(left)===JSON.stringify(right);}
export const editorFormStamp=formData=>JSON.stringify([...formData.entries()].map(([key,value])=>[key,String(value)]));
export function entryLevelOptions(plans,sceneId,preferred){const levels=plans.find(p=>p.id===sceneId)?.levels??[];return {levels,selected:levels.some(l=>l.key===preferred)?preferred:levels[0]?.key??''};}
