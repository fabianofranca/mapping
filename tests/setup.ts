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
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value() {} });
}
