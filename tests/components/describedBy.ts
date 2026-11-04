/**
 * Descrição acessível de um elemento: o texto dos elementos de `aria-describedby`
 * (inclusive os fora da tela). Sem dependência de jest-dom.
 */
export function descriptionOf(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids
    .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}
