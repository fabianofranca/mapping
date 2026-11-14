import { afterEach, beforeEach } from 'vitest';
import { restoreModalFocus, simulateModalFocus } from './components/modalFocus';

// jsdom does not load the app's CSS: inject the tokens for whatever reads theme variables
// (for example `readCanvasTokens`), as `virtual:tokens.css` does in the browser.
import { renderTokensCss } from '../src/theme/tokens';

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = renderTokensCss();
  document.head.append(style);
}

// jsdom does not implement scrolling: the panels call `scrollIntoView` when focusing an item.
if (typeof Element !== 'undefined' && !('scrollIntoView' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value() {},
    writable: true,
    configurable: true,
  });
}

// Stage 8 (8.3), F8: jsdom has no modal inertness (with a modal `<dialog>` open, Chrome
// does not let anything outside it take focus). Every DOM test runs with the simulator, a
// single behavior: a focus test that passed only in permissive jsdom would fail here.
if (typeof document !== 'undefined') {
  beforeEach(simulateModalFocus);
  afterEach(restoreModalFocus);
}
