// Único lugar que cria imagem a partir de uma URL fora de `src/storage/` (PLAN.md, etapa
// "Imagens remotas", decisão 14; regra `imageCreationSyntaxRules` em eslint.config.js): nenhum
// código monta URL de imagem por fora da política de URL e do consentimento. A RI3 acrescenta
// aqui as imagens remotas (`crossOrigin`, `referrerPolicy`, limites, cache).

const DATA_URL = /^data:/i;

export interface EmbeddedImageHandlers {
  onLoad(element: HTMLImageElement): void;
  onError?(): void;
}

/**
 * Carrega uma imagem embutida (`data:`). Devolve `null` para qualquer outro esquema
 * (defesa a mais: o renderizador já cai no reservado antes de chamar).
 */
export function loadEmbeddedImage(
  src: string,
  handlers: EmbeddedImageHandlers,
): HTMLImageElement | null {
  if (!DATA_URL.test(src)) return null;
  const element = new Image();
  element.onload = () => handlers.onLoad(element);
  if (handlers.onError) element.onerror = () => handlers.onError?.();
  element.src = src;
  return element;
}
