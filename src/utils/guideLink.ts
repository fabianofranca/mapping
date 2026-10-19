/**
 * Endereço do guia interativo (`public/guia/index.html`, publicado em `guia/` ao lado do
 * `index.html`). Relativo à página: vale na raiz do site, em `/preview/` e no `vite dev`.
 * Aberto como arquivo (`file:`), o `index.html` costuma estar sozinho, sem a pasta `guia/` (é o
 * artefato avulso do deploy): sem endereço, a interface não oferece um link quebrado.
 */
export const GUIDE_PATH = 'guia/index.html';

export function guideUrl(
  protocol: string = globalThis.location?.protocol ?? '',
): string | null {
  return protocol === 'file:' ? null : GUIDE_PATH;
}
