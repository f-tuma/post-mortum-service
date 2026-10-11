export const CASE_JSON_MAX_BYTES=20*1024*1024;
export const CASE_JSON_PREVIEW_BYTES=2*1024*1024;
export const caseJSONBytes=json=>new TextEncoder().encode(json).byteLength;
export function assertCaseTransferSize(bytes){if(!Number.isInteger(bytes)||bytes<1||bytes>CASE_JSON_MAX_BYTES)throw new Error('Příprava musí být JSON do 20 MiB. Zmenši příručku nebo počet nativních dokumentů.');return bytes;}
export function caseJSONExport(data){const json=JSON.stringify(data,null,2),bytes=assertCaseTransferSize(caseJSONBytes(json));return {json,bytes,preview:bytes<=CASE_JSON_PREVIEW_BYTES};}
