export function encodeRequest(command, { visitId, requestId }) {
  const zeros = { vitality: 0, agility: 0, intelligence: 0 };
  const encoded = JSON.stringify({ ...command, spend: { ...zeros, ...command.spend }, recovery: { ...zeros, ...command.recovery }, visitId, requestId });
  if (encoded.length > 20000) throw new Error("Požadavek je příliš dlouhý.");
  return encoded;
}
export function decodeRequest(stored) {
  // Compatibility with the first unreleased sandbox requests; new writes always use whole strings.
  try { return typeof stored === "string" ? (stored.length <= 20000 ? JSON.parse(stored) : null) : stored; } catch { return null; }
}
