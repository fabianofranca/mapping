// Foco ao voltar à tela inicial depois do Catálogo da biblioteca (etapa #515, FN1; #497).
// O botão "Voltar" some junto com a tela e a tela inicial é uma instância nova, então o
// pedido atravessa a troca: `CatalogScreen` pede, a `Home` cumpre no commit em que monta.

let pending = false;

/** Chamada por quem fecha o Catálogo: a próxima tela inicial leva o foco. */
export function requestHomeFocus(): void {
  pending = true;
}

/** Alvo do foco: o controle que abriu a biblioteca; se não existir, o primeiro controle. */
export const HOME_LIBRARY_BUTTON = '[data-home-open-library]';

/** A tela inicial, já montada, cumpre o pedido (uma vez). Devolve se havia pedido. */
export function fulfillHomeFocus(root: ParentNode, firstControl: string): boolean {
  if (!pending) return false;
  pending = false;
  const target =
    root.querySelector<HTMLElement>(`${HOME_LIBRARY_BUTTON}:not([disabled])`) ??
    root.querySelector<HTMLElement>(firstControl);
  target?.focus();
  return true;
}
