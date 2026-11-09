// Entradas da release do MCP (etapa #920, decisão 6): os arquivos cuja mudança muda o que vai
// no `mapping-mcp.js` e nos arquivos do workspace publicados com ele. O job `epic` do `ci.yml`
// usa a lista para exigir versão nova do MCP. Um teste (`tests/tooling/releaseInputs.test.ts`)
// roda o esbuild com `metafile` e falha se algo empacotado ficar fora da lista.
// Só Node, sem dependências. Termina em `/` = pasta inteira; sem `/` no fim = arquivo.
import { WORKSPACE_SOURCES } from './workspaceAssets.mjs';

export const RELEASE_INPUTS = [
  // Servidor (inclui o build, as fontes TTF e a lista dos wasm).
  'mcp/',
  // Modelo puro, o único trecho de `src/` que o bundle importa.
  'src/model/',
  // Documentação embutida por `?raw` (recursos do servidor e guia do agente).
  'docs/AGENT-GUIDE.md',
  'docs/COMMENT-FORMAT.md',
  'docs/COMPONENT-FORMAT.md',
  'docs/FORMAT.md',
  'docs/SPEC-FORMAT.md',
  // Biblioteca de notas embutida.
  'libraries/notas/',
  // Fontes dos arquivos do workspace: a lista é a de `workspaceAssets.mjs`, sem cópia aqui.
  ...WORKSPACE_SOURCES,
];

/** O arquivo (caminho relativo à raiz, com `/`) é entrada da release? */
export function isReleaseInput(path) {
  return RELEASE_INPUTS.some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : path === entry,
  );
}

/** Dos caminhos dados, os que são entrada da release, na mesma ordem. */
export function releaseInputsIn(paths) {
  return paths.filter(isReleaseInput);
}
