// As linhas da lista de recentes da tela inicial, para levar o foco à linha que ficou no
// lugar da que saiu (etapa 7, G4). Saiu do `Home.tsx` sem mudança (devolução do portão da
// 8.4, para o arquivo não crescer além do `max-lines`).

/** Posição da linha `key` na lista de recentes (0 se não estiver nela). */
export function recentRowIndex(section: HTMLElement | null, key: string): number {
  const rows = [...(section?.querySelectorAll<HTMLElement>('tr[data-recent]') ?? [])];
  return Math.max(
    0,
    rows.findIndex((row) => row.dataset['recent'] === key),
  );
}

/**
 * Foco depois de uma linha sair da lista: o Abrir da linha que ficou na posição `index` (ou
 * da última, se a removida era a última); sem linhas, o título da lista.
 */
export function recentRowTarget(
  section: HTMLElement | null,
  index: number,
): HTMLElement | null {
  if (!section?.isConnected) return null;
  const rows = section.querySelectorAll<HTMLElement>('tr[data-recent]');
  const row = rows[Math.min(index, rows.length - 1)];
  return (
    row?.querySelector<HTMLElement>('[data-recent-open]') ??
    section.querySelector<HTMLElement>('h2')
  );
}
