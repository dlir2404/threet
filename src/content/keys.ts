import { actions } from './actions';
import { store } from './store';
import { log } from './log';

/**
 * Keyboard handling. Installed on window in the capture phase so it runs before Threads' own
 * handlers; while the overlay is visible every key is kept away from the page.
 */
export function installKeys(host: HTMLElement) {
  const isTyping = (e: KeyboardEvent) => {
    const t = e.composedPath()[0] as HTMLElement | undefined;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  const fromOverlay = (e: Event) => e.composedPath().includes(host);

  const onKey = (e: KeyboardEvent) => {
    const s = store.state;
    const mod = e.metaKey || e.ctrlKey;

    // Alt/Option+T toggles the overlay everywhere (e.code: Option+T types "†" on macOS).
    if (e.altKey && !mod && e.code === 'KeyT') {
      e.preventDefault();
      e.stopImmediatePropagation();
      actions.toggleVisible();
      return;
    }
    if (!s.visible || !s.settings.enabled) return;

    if (isTyping(e) && fromOverlay(e)) return; // our own inputs (doc title)
    if (__DEV__) log('key', e.key, e.code, e.repeat ? 'repeat' : '', e.isTrusted ? '' : 'synthetic');

    let handled = true;
    const k = e.key;
    if (k === 'Escape') {
      if (!actions.closeOverlays()) actions.toggleBoss();
    } else if (s.boss && !(k.startsWith('Arrow') || k === 'Tab' || k.startsWith('Page'))) {
      // In boss mode only navigation works, so a stray key never reveals anything.
      handled = false;
    } else if ((mod && k === '/') || k === 'F1') actions.toggleHelp();
    else if (s.help && (k === 'ArrowRight' || k === 'ArrowDown' || k === 'l' || k === 'j')) actions.guideStep(1);
    else if (s.help && (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'h' || k === 'k')) actions.guideStep(-1);
    else if (mod && e.shiftKey && (k === 'u' || k === 'U')) actions.toggleFormula();
    else if (mod && (k === 'c' || k === 'C') && !e.shiftKey) actions.copyCell();
    else if (mod && k === 'Home') actions.jump('top');
    else if (mod && k === 'End') actions.jump('bottom');
    else if (e.altKey && k === 'ArrowDown') actions.nextTab(1);
    else if (e.altKey && k === 'ArrowUp') actions.nextTab(-1);
    else if (e.altKey && k === 'ArrowLeft') actions.back();
    else if (mod && e.shiftKey && k === 'PageDown') actions.nextTab(1);
    else if (mod && e.shiftKey && k === 'PageUp') actions.nextTab(-1);
    else if (mod && (k === '=' || k === '+')) actions.zoomBy(0.1);
    else if (mod && k === '-') actions.zoomBy(-0.1);
    else if (mod) handled = false; // leave browser shortcuts alone (⌘L, ⌘T, ⌘R…)
    else if (s.lightbox && (k === 'ArrowRight' || k === 'l' || k === ' ' || k === 'ArrowDown' || k === 'j')) actions.stepMedia(1);
    else if (s.lightbox && (k === 'ArrowLeft' || k === 'h' || k === 'ArrowUp' || k === 'k')) actions.stepMedia(-1);
    else if (s.lightbox || s.help || s.updateOpen) handled = true;
    else if (k === 'ArrowDown' || k === 'j') actions.move(1, 0);
    else if (k === 'ArrowUp' || k === 'k') actions.move(-1, 0);
    else if (k === 'ArrowLeft' || k === 'h') actions.move(0, -1);
    else if (k === 'ArrowRight' || k === 'l') actions.move(0, 1);
    else if (k === 'Tab') actions.move(0, e.shiftKey ? -1 : 1);
    else if (k === 'PageDown') actions.move(10, 0);
    else if (k === 'PageUp') actions.move(-10, 0);
    else if (k === 'Home') actions.select({ r: store.state.sel[store.state.active]?.r ?? 1, c: 0 });
    else if (k === 'Enter' || k === 'o') actions.openCurrent();
    else if (k === 'F2' || k === ' ' || k === 'e') actions.toggleReader();
    else if (k === 'Backspace' || k === 'u') actions.back();
    else if (k === 'r') actions.refresh();
    else if (k === 'm' || k === 'End') actions.loadMore();
    else if (k === 'p') actions.togglePreviews();
    else if (k === '?') actions.toggleHelp();
    else if (k === '[') actions.nextTab(-1);
    else if (k === ']') actions.nextTab(1);
    else handled = false;

    if (handled) e.preventDefault();
    // Never let Threads see keystrokes while it is hidden behind the sheet.
    e.stopImmediatePropagation();
  };

  const swallow = (e: KeyboardEvent) => {
    if (!store.state.visible || !store.state.settings.enabled) return;
    if (isTyping(e) && fromOverlay(e)) return;
    e.stopImmediatePropagation();
  };

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', swallow, true);
  window.addEventListener('keypress', swallow, true);
  // Our own inputs: stop at the host so the page never sees them bubble.
  for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
}
