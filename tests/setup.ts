import { afterEach, beforeEach } from 'vitest';
import { restoreModalFocus, simulateModalFocus } from './components/modalFocus';

// jsdom não carrega o CSS do app: injeta os tokens para o que lê variáveis do tema
// (por exemplo `readCanvasTokens`), como o `virtual:tokens.css` faz no navegador.
import { renderTokensCss } from '../src/theme/tokens';

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = renderTokensCss();
  document.head.append(style);
}

// jsdom não implementa a rolagem: os painéis chamam `scrollIntoView` ao focar um item.
if (typeof Element !== 'undefined' && !('scrollIntoView' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value() {},
    writable: true,
    configurable: true,
  });
}

// Etapa 8 (8.3), F8: o jsdom não tem a inércia do modal (com um `<dialog>` modal aberto, o
// Chrome não deixa focar nada fora dele). Todo teste com DOM roda com o simulador, um
// comportamento só: um teste de foco que passasse só no jsdom permissivo falharia aqui.
if (typeof document !== 'undefined') {
  beforeEach(simulateModalFocus);
  afterEach(restoreModalFocus);
}
