// MF4 (etapa #899): regressão da cena dos exemplos dos tipos que a fase toca. A cena de antes da fase
// (`tests/fixtures/material3-mf4-before.json`, gravada com a biblioteca v6) fica igual a ≤ 0,5 px por nó,
// menos onde a mudança é o propósito (EXCEPTIONS: sombra, cor herdada, vão, justificado, desabilitado e
// número sob a alça).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { drawIn, files } from '../support/material3Library';

const TOUCHED = [
  'surface',
  'scaffold',
  'text',
  'icon',
  'icon-button',
  'icon-toggle-button',
  'card',
  'button',
  'fab',
  'extended-fab',
  'chip',
  'bottom-sheet',
  'dropdown-menu',
  'list-item',
  'pull-to-refresh',
  'snackbar',
  'tooltip',
  'switch',
  'slider',
  'text-field',
  'secure-text-field',
  'time-picker',
  'tabs',
];

type Rec = [string, string, number, number, number, number];

/**
 * Onde a mudança da fase é o propósito (a lista abaixo é a das exceções do aceite): a cena dos outros
 * nós fica igual a ≤ 0,5 px. Sombra (duas por nível), cor herdada, desabilitado opaco, justificado e
 * `over` não mudam caixa nenhuma; só o vão arredondado e o número sob a alça mudam nós.
 */
const EXCEPTIONS = {
  // Vão arredondado: o contorno é um nó só (`contorno`, com `stroke.gap`); saem o `contorno (lados)` e
  // o `trecho final`, o `trecho inicial` vira o `recuo` (só espaço) e o rótulo da borda ganha nome próprio.
  'text-field': {
    rename: {
      'contorno (lados)': 'contorno',
      recuo: 'trecho inicial',
      'rótulo minimizado': 'rótulo',
    },
    drop: ['trecho final'],
  },
  'secure-text-field': {
    rename: {
      'contorno (lados)': 'contorno',
      recuo: 'trecho inicial',
      'rótulo minimizado': 'rótulo',
    },
    drop: ['trecho final'],
  },
  // Número sob a alça: o `valor selecionado` sai e a cópia dos números entra dentro da `alça`.
  'time-picker': { rename: {}, drop: ['valor selecionado'] },
  // MC5 (#1033): o rótulo sob o ícone passou da estimativa do Roboto 14/20 (texto a 12 do fundo) à linha de base do
  // Compose (`baselinePadding`): o nó vira `rótulo empilhado` e a caixa dele inclui as distâncias da linha de base
  // (29 de altura em vez de 20). Quem confere a posição é `material3Mc5GrupoB.test.ts`; o resto da cena fica igual.
  tabs: { rename: {}, drop: ['rótulo', 'rótulo empilhado', 'rótulo empilhado rolável'] },
  // MC5 (#1033): o tooltip rico passou da estimativa do Roboto 14/20 (13, 9, 4 e 16 de padding) às distâncias da
  // linha de base do Compose (`baselinePadding`): as caixas do título, do texto e da ação mudam de lugar e a altura
  // do cartão com título passa de 73 para 78 (`TooltipTest.kt` linha 260: o texto fica 24 abaixo do FIM da caixa do
  // título, e não da base). Quem confere as posições é `material3Mc5GrupoA.test.ts`; o `plain` fica igual.
  tooltip: {
    rename: {},
    drop: ['rich', 'título', 'corpo', 'texto', 'ação', 'botão da ação', 'rótulo da ação'],
  },
  // MC5 (#1033, grupo C): o rótulo e o quadro `conteúdo` do button, do extended-fab e do chip passaram a abraçar a
  // altura das linhas (`hug`, como o `Row` com `defaultMinSize` do Compose) em vez de ocupar a caixa inteira: a caixa
  // deles encolhe e o chip abraça a largura. O centro do rótulo de uma linha segue o mesmo (confere
  // `material3Mc5GrupoC.test.ts`); o resto da cena (contêiner, ícones, sombras) fica igual.
  button: { rename: {}, drop: ['conteúdo', 'rótulo'] },
  'extended-fab': { rename: {}, drop: ['conteúdo', 'texto'] },
  chip: { rename: {}, drop: ['conteúdo', 'rótulo'] },
  // MC6 (#1034): o texto do item do menu passou a ficar entre os ícones pelas âncoras `left` e `right` do quadro do item
  // (`none`), no lugar do quadro `texto (caixa)` com o `padding`: sai o quadro e o texto fica no mesmo lugar (a caixa
  // do menu é a mesma, a 200 de largura). A largura do menu pelo item mais largo confere `material3Mc6.test.ts`.
  'dropdown-menu': { rename: {}, drop: ['texto (caixa)'] },
  // L2 (#1078): nenhum nó passa da caixa do pai (aviso `conteúdo maior que a caixa`). A camada de estado do switch passou de
  // 40 a 32 (a altura do trilho, no quadro `chave`) e, no pressionado, a área da alça cresce de 24 a 28 para caber a alça de 28;
  // o resto da cena (trilho, curso, alça, ícones) fica igual.
  switch: { rename: {}, drop: ['estado', 'área da alça'] },
  // Card: o quadro `recorte` (cantos de cima da mídia pelo raio do Card, mesmo com a sombra alargando o recorte
  // reto da raiz) envolve o `corpo`, na mesma caixa dele; o resto da cena fica igual (confere
  // `material3CardMediaCorners.test.ts`).
  card: { rename: {}, drop: ['recorte'] },
} as Record<string, { rename: Record<string, string>; drop: string[] }>;

/**
 * L2 (#1078): exemplos cujos valores mudaram para caber na caixa do `size` (o texto, que passa da caixa de 32 de altura) ou que
 * saíram porque o `size` não os comporta (o tooltip `rich`, que mede de 28 a mais de 100 de altura em 24).
 */
const L2_EXAMPLES: Record<string, string[]> = {
  text: ['Título de tela', 'Parágrafo', 'Parágrafo justificado'],
  tooltip: ['Rich com título', 'Rich com ação'],
};

/** Número sob a alça: a `alça` ganha a cópia dos números (`números sob a alça`) no lugar do `valor selecionado`. */
const SKIP_CHILDREN = { 'time-picker': ['alça'] } as Record<string, string[]>;

function flatten(
  node: SceneNode,
  ox: number,
  oy: number,
  out: Rec[],
  skip: readonly string[],
): void {
  const x = ox + node.transform[4];
  const y = oy + node.transform[5];
  if (node.visible) out.push([node.type, node.name, x, y, node.width, node.height]);
  if ('children' in node && !skip.includes(node.name))
    for (const c of node.children) flatten(c, x, y, out, skip);
}

function normalize(id: string, recs: Rec[]): Rec[] {
  const ex = EXCEPTIONS[id];
  if (ex === undefined) return recs;
  return recs
    .filter((r) => !ex.drop.includes(r[1]))
    .map((r): Rec => [r[0], ex.rename[r[1]] ?? r[1], r[2], r[3], r[4], r[5]]);
}

function sceneOf(
  catalog: ReturnType<typeof buildCatalog>,
  id: string,
): Record<string, Rec[]> {
  const entry = findEntry(catalog, id);
  const result: Record<string, Rec[]> = {};
  for (const mode of ['light', 'dark'] as const) {
    const cases: [string, Record<string, unknown>][] = [
      ['preview', entry?.previewValues ?? {}],
      ...(entry?.examples ?? [])
        .filter((e) => e.mode === 'values')
        .map((e): [string, Record<string, unknown>] => [e.name, e.values ?? {}]),
    ];
    for (const [name, values] of cases) {
      const recs: Rec[] = [];
      flatten(
        drawIn(catalog, entry!, values as never, mode).root,
        0,
        0,
        recs,
        SKIP_CHILDREN[id] ?? [],
      );
      result[`${id}|${mode}|${name}`] = normalize(id, recs);
    }
  }
  return result;
}

const FIXTURE = join(__dirname, '../fixtures/material3-mf4-before.json');
const TOLERANCE = 0.5;

/** Diferenças entre a cena de antes e a de agora: nó a mais ou a menos, ou caixa fora da tolerância. */
function diffScene(before: Rec[], now: Rec[]): string[] {
  const out: string[] = [];
  if (before.length !== now.length) out.push(`nós: ${before.length} → ${now.length}`);
  const byName = new Map<string, Rec[]>();
  for (const r of now) byName.set(r[1], [...(byName.get(r[1]) ?? []), r]);
  const used = new Map<string, number>();
  for (const b of before) {
    const list = byName.get(b[1]) ?? [];
    const at = used.get(b[1]) ?? 0;
    used.set(b[1], at + 1);
    const n = list[at];
    if (n === undefined) {
      out.push(`sumiu: ${b[1]}`);
      continue;
    }
    for (let k = 2; k < 6; k++)
      if (Math.abs((b[k] as number) - (n[k] as number)) > TOLERANCE)
        out.push(`${b[1]}: ${b.slice(2).join(',')} → ${n.slice(2).join(',')}`);
  }
  return out;
}

describe('MF4: regressão da cena dos tipos tocados', () => {
  const catalog = buildCatalog(files);
  const before = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Rec[]>;
  it.each(TOUCHED)(
    '%s: a cena dos exemplos fica igual a ≤ 0,5 px por nó, fora as exceções',
    (id) => {
      const now = sceneOf(catalog, id);
      const keys = Object.keys(before).filter(
        (k) => k.startsWith(`${id}|`) && !L2_EXAMPLES[id]?.includes(k.split('|')[2]!),
      );
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(now[key], key).toBeDefined();
        expect(diffScene(normalize(id, before[key]!), now[key]!), key).toEqual([]);
      }
    },
  );
});
