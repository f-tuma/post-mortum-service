export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const icon = name => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
export const time = n => `${Math.floor(n / 60) % 24}`.padStart(2, '0') + ':' + `${n % 60}`.padStart(2, '0');
/** A span of minutes in words, e.g. „1 h 05 min“. */
export const span = minutes => { const m = Math.max(0, Math.round(minutes)), h = Math.floor(m / 60); return h ? `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')} min` : ''}` : `${m} min`; };
