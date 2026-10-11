// The key stays in the GM browser's client storage. Server-visible flags contain only authenticated ciphertext.
const importKey = hex => {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("Klíč výpravy je poškozený.");
  return crypto.subtle.importKey("raw", Uint8Array.from(hex.match(/../g), s => parseInt(s, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
};
export async function sealVisit(state, hex) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(hex), new TextEncoder().encode(JSON.stringify(state)));
  return { version: 1, iv: Array.from(iv), data: btoa(Array.from(new Uint8Array(cipher), n => String.fromCharCode(n)).join("")) };
}
export async function unsealVisit(sealed, hex) {
  if (sealed?.version !== 1) throw new Error("Nepodporovaný formát uložené výpravy.");
  const bytes = Uint8Array.from(atob(sealed.data), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(sealed.iv) }, await importKey(hex), bytes);
  return JSON.parse(new TextDecoder().decode(plain));
}
