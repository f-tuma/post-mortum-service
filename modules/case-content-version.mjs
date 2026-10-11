const comparable=data=>{const {contentVersion,sourceContentVersion,...content}=data;const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,sort(value[k])])):value;return JSON.stringify(sort(content));};
/** Imported source revisions do not override the local monotonic loop version. */
export function versionImportedCase(input,installed,template){
 const data=structuredClone(input),reference=installed??template?.definition,highest=Math.max(installed?.contentVersion??0,template?.definition?.contentVersion??0);
 const changed=reference&&comparable(reference)!==comparable(data);
 const version=changed?Math.max(data.contentVersion,highest+1):Math.max(data.contentVersion,highest);
 if(version!==data.contentVersion)data.sourceContentVersion??=data.contentVersion;
 if(!Number.isSafeInteger(version))throw new Error('Případ dosáhl limitu verzí obsahu.');data.contentVersion=version;return data;
}
