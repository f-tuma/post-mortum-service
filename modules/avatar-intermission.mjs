// A purchase is not a departure. Keep the intermission until the linked visit
// has finished placing the party, assigning characters and preparing its scene.
export function avatarIntermission(campaign, visit, user) {
  const p = campaign?.preparation;
  const departed = p?.status === 'launched' && visit?.id === p.visitId && (visit?.launchReady === true || visit?.status === 'returned');
  const pending = !!p && (p.status === 'preparing' || (p.status === 'launched' && !departed));
  const engaged = pending && (user.isGM || p.ownerIds.includes(user.id));
  return {pending, engaged, locked: engaged && !user.isGM};
}

// Native Foundry windows remain mounted underneath the intermission. Restore
// their original inert state and focus on release instead of closing the table.
export class IntermissionFocus {
  constructor(onEscape) { this.onEscape = onEscape; this.previous = new Map(); }
  enable(root) {
    if (this.root === root) return this.focus();
    this.disable();
    this.root = root;
    this.previousFocus = document.activeElement;
    game.keyboard?.releaseKeys();
    this.isolate();
    this.observer = new MutationObserver(() => this.isolate());
    this.observer.observe(document.body, {childList: true});
    this.key = event => {
      // Stop at the document, after native input/button handling and before
      // Foundry's window-level hotkeys. Text editing and browser shortcuts work.
      event.stopImmediatePropagation();
      if (event.type !== 'keydown') return;
      if (event.key === 'Escape') { event.preventDefault(); this.onEscape(); }
      if (event.key === 'Tab') {
        const targets = this.targets(), first = targets[0], last = targets.at(-1);
        if (!targets.length || !root.contains(document.activeElement) ||
            (event.shiftKey && document.activeElement === first) ||
            (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
          if (!targets.length) root.focus();
        }
      }
    };
    this.focusIn = event => { if (!root.contains(event.target)) this.focus(); };
    document.addEventListener('keydown', this.key);
    document.addEventListener('keyup', this.key);
    document.addEventListener('focusin', this.focusIn);
    document.body.classList.add('pms-mhd-intermission');
    this.focus();
  }
  isolate() {
    for (const sibling of document.body.children) {
      if (sibling === this.root || sibling.contains(this.root)) continue;
      if (!this.previous.has(sibling)) this.previous.set(sibling, sibling.inert);
      sibling.inert = true;
    }
  }
  targets() {
    return [...this.root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.closest('[inert]') && el.getClientRects().length);
  }
  focus() {
    if (this.root && !this.root.contains(document.activeElement)) (this.targets()[0] ?? this.root).focus();
  }
  disable() {
    if (!this.root) return;
    this.observer?.disconnect();
    document.removeEventListener('keydown', this.key);
    document.removeEventListener('keyup', this.key);
    document.removeEventListener('focusin', this.focusIn);
    for (const [el, inert] of this.previous) el.inert = inert;
    this.previous.clear();
    document.body.classList.remove('pms-mhd-intermission');
    this.root = null;
    if (this.previousFocus?.isConnected && !this.previousFocus.closest('[inert]')) this.previousFocus.focus();
  }
}
