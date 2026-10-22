// @vitest-environment node
// Fase 8.2 (P1): catraca do "projeto à vista". A interface lê o projeto que está na tela
// por `review.derived.shownProject` (na visão Proposto da revisão, o "como ficaria"; senão,
// o confirmado). Só os arquivos abaixo podem ler `store.committed`/`store.project` em
// `src/ui/**` e `src/app/**`, cada um com o porquê; um leitor novo quebra este teste, e um
// que deixa de ler obriga a encurtar a lista (`toEqual`, não `toContain`).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const PATTERN = /\bstore\.(committed|project)\b/;

/** Arquivos (ordenados) cujo texto lê `store.committed` ou `store.project`. */
export function readersOf(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(([, text]) => PATTERN.test(text))
    .map(([path]) => path)
    .sort();
}

/** `{ caminho relativo → texto }` de todo `.ts`/`.tsx` sob `dir`. */
function sources(dir: string, root = dir): Map<string, string> {
  const result = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      for (const [k, v] of sources(path, root)) result.set(k, v);
    } else if (/\.tsx?$/.test(name)) {
      result.set(relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8'));
    }
  }
  return result;
}

/**
 * Quem ainda lê o projeto confirmado (ou o com a prévia do gesto) diretamente, e por quê.
 * Tudo o que descreve "o que está na tela" (trilha, barra de status, Camadas, Lista,
 * Incompletas, minimapa, atalhos de seleção, cursor) lê `shownProject`.
 */
const ALLOWLIST = [
  // O editor existe se há projeto aberto, não "à vista".
  'src/app/Editor.tsx',
  // Diálogos de edição (apagar, renomear) agem sobre o projeto real; recusados na revisão.
  'src/app/EditorDialogs.tsx',
  // O nome do projeto na barra é o real; o nome proposto aparece na revisão como mudança.
  'src/app/EditorMainBar.tsx',
  // Fora do editor: sessão e recentes.
  'src/app/controller.ts',
  // Referências `mapping://` e recortes apontam para o projeto real.
  'src/app/itemClipboard.ts',
  // Pedidos de apagar imagem/marcação: projeto real, desabilitados na revisão.
  'src/app/useEditorDialogs.ts',
  // Entrada de imagens (arrastar, colar, escolher): projeto real.
  'src/app/useImageIntake.tsx',
  // Diagnóstico do projeto real.
  'src/ui/DiagnosticsView.tsx',
  // Novo container: lê as especializações aplicadas e a seleção do projeto real, para criar nele.
  'src/ui/ContainerDialog.tsx',
  // Detalhes na revisão (fase 9.5): o painel lê o projeto à vista; o atual é o outro lado
  // de um item que não existe na visão Proposto (removido) e a origem dos fantasmas
  // (anotações e pares que saem, desenhados no lugar onde estavam).
  'src/ui/review/ReviewPanel.tsx',
  // `CompareDialog`: a imagem "antes" é a do confirmado por definição.
  'src/ui/review/ReviewCanvasControls.tsx',
  // `useReviewNames`: precisa do atual e da prévia (nomes antes/depois).
  'src/ui/review/useReview.ts',
];

describe('projeto à vista: quem lê store.committed/store.project em src/ui e src/app', () => {
  it('a lista de leitores é exatamente a allowlist (um leitor novo justifica aqui ou lê shownProject)', () => {
    const files = new Map([
      ...sources(join(process.cwd(), 'src', 'ui'), process.cwd()),
      ...sources(join(process.cwd(), 'src', 'app'), process.cwd()),
    ]);
    expect(readersOf(files)).toEqual([...ALLOWLIST].sort());
  });

  it('a varredura pega o padrão antigo e deixa passar o certo', () => {
    const files = new Map([
      ['src/ui/Old.tsx', 'const crumbs = crumbsOf(store.committed.value, selection);'],
      ['src/app/Old.ts', 'const p = editor.store.project.peek();'],
      ['src/ui/New.tsx', 'const p = review.derived.shownProject.value;'],
      [
        'src/ui/Other.tsx',
        'const name = store.projectName.value; const s = storeFront.committed;',
      ],
    ]);
    expect(readersOf(files)).toEqual(['src/app/Old.ts', 'src/ui/Old.tsx']);
  });
});
