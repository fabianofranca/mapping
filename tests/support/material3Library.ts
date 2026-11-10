// Auxiliares dos testes da biblioteca Material 3 (Compose): lê a pasta, carrega a especialização e desenha um componente.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isFontPath } from '../../src/model/components/library';
import { parseSpecText } from '../../src/model/spec';
import type { Spec, SpecAnnotationType } from '../../src/model/spec';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import type { Paint, SceneNode, TextNode } from '../../src/model/components/scene';

export const ROOT = join(__dirname, '../../libraries/material3-compose');
export const SPEC_FILE = 'material3-compose.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

export const files: { path: string; text?: string; binary?: true }[] = listDisk(ROOT)
  .sort()
  .map((path) =>
    isFontPath(path)
      ? { path, binary: true as const }
      : { path, text: readFileSync(join(ROOT, path), 'utf8') },
  );
export const text = (path: string): string =>
  files.find((f) => f.path === path)?.text ?? '';

function loadSpec(): Spec {
  const parsed = parseSpecText(text(SPEC_FILE));
  if (!parsed.ok) throw new Error('especialização inválida');
  return parsed.spec;
}
export const spec = loadSpec();
export const types: SpecAnnotationType[] = spec.layers.flatMap((l) => l.annotationTypes);
export const typeOf = (id: string): SpecAnnotationType => {
  const t = types.find((x) => x.id === id);
  if (t === undefined) throw new Error(`tipo ${id} ausente`);
  return t;
};

export function findText(node: SceneNode): TextNode | undefined {
  if (node.type === 'text' && node.visible) return node;
  if ('children' in node) {
    for (const child of node.children) {
      const found = findText(child);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export const solid = (paints: readonly Paint[]): string | undefined => {
  const first = paints[0];
  return first?.type === 'solid' ? first.color : undefined;
};

export function drawIn(
  catalog: ReturnType<typeof buildCatalog>,
  entry: NonNullable<ReturnType<typeof findEntry>>,
  values: Parameters<typeof instantiate>[1],
  mode: 'light' | 'dark',
) {
  const library = catalog.library;
  if (library === null || entry.component === null) throw new Error('sem biblioteca');
  const box = { x: 0, y: 0, ...entry.component.size };
  return instantiate(entry.component, { ...defaultValues(entry.type), ...values }, box, {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  });
}

/** Componentes já migrados para o formato 4 (M1: 4; M2: +19; M3: +9; M4: +9; M5: +9 = 50). Cresce a cada fase. */
export const MIGRATED = [
  'text',
  'icon',
  'divider',
  'surface',
  'scaffold',
  'box',
  'row',
  'column',
  'lazy-column',
  'lazy-row',
  'lazy-vertical-grid',
  'flow-row',
  'spacer',
  'horizontal-pager',
  'button',
  'fab',
  'extended-fab',
  'icon-button',
  'icon-toggle-button',
  'chip',
  'badge',
  'card',
  'image',
  'checkbox',
  'radio-button',
  'switch',
  'slider',
  'text-field',
  'secure-text-field',
  'search-bar',
  'segmented-button',
  'progress-indicator',
  'top-app-bar',
  'bottom-app-bar',
  'navigation-bar',
  'short-navigation-bar',
  'navigation-rail',
  'navigation-drawer',
  'tabs',
  'list-item',
  'dropdown-menu',
  'alert-dialog',
  'bottom-sheet',
  'snackbar',
  'tooltip',
  'date-picker',
  'time-picker',
  'carousel',
  'pull-to-refresh',
  'swipe-to-dismiss',
];

type Raw = {
  key?: string;
  name?: string;
  description?: string;
  values?: Record<string, unknown>;
};

/** Descrições de campo que a etapa Material 3 com estados (#869, ME1) corrigiu em relação à v1 (decisão 10). */
/**
 * Campos de arranjo que perderam o `default` (e o valor de prévia) para o padrão e o `Top`/`Start`
 * explícito se distinguirem com `reverseLayout` (CL1, FX5): a descrição ganha a frase do padrão.
 */
export const V1_NO_DEFAULT: Record<string, string> = {
  'lazy-column': 'verticalArrangement',
  'lazy-row': 'horizontalArrangement',
};

const V1_DESCRIPTION_FIXES: Record<string, Record<string, string>> = {
  slider: {
    steps:
      'Número de pontos intermediários entre as pontas (Slider.steps). Vazio ou 0 = contínuo. O desenho mostra as marcas de 1 a 9; de 10 em diante desenha como 9.',
  },
  tabs: {
    style:
      'primary (indicador de 3 no tamanho do rótulo), secondary (indicador de 3 na largura da aba) ou a versão rolável de cada um (abas com a largura do conteúdo, no mínimo 90, e recuo inicial de 52).',
  },
  snackbar: {
    actionOnNewLine:
      'true põe a ação abaixo da mensagem, para textos longos (com uma linha de texto a altura do retângulo passa de 48 para 92; os 68 são a linha única de duas linhas).',
  },
};

/** Exemplos que a ME2 (#913) acrescentou para mostrar limites conhecidos, por tipo. */
export const LIMIT_EXAMPLES: Record<string, string> = {
  button: 'Rótulo longo',
  'time-picker': '24 horas, campos',
  'date-picker': 'Intervalo até o fim do mês',
};

/** Tamanhos que a ME2 (#913) subiu aos do Compose (decisão 9); os demais ficam os da v1. */
export const COMPOSE_SIZES: Record<string, { width: number; height: number }> = {
  'top-app-bar': { width: 412, height: 152 },
  'date-picker': { width: 360, height: 512 },
  'time-picker': { width: 328, height: 528 },
  'alert-dialog': { width: 312, height: 248 },
  slider: { width: 328, height: 48 },
};

/** Colunas de tabela que a etapa acrescentou a um tipo (a ME4 deu `selected` aos itens do `dropdown-menu`). */
const ADDED_COLUMNS: Record<string, Record<string, string[]>> = {
  'dropdown-menu': { items: ['selected'] },
};
function withoutAddedColumns(id: string, field: Raw): Raw {
  const drop = field.key === undefined ? undefined : ADDED_COLUMNS[id]?.[field.key];
  const columns = (field as { columns?: Raw[] }).columns;
  if (drop === undefined || columns === undefined) return field;
  return {
    ...field,
    columns: columns.filter((c) => !drop.includes(c.key as string)),
  } as Raw;
}

/**
 * Compara os campos e os exemplos de um tipo com os da v1, sem o que a etapa Material 3 com estados acrescentou
 * (o campo `interaction` e os exemplos que o usam, e os exemplos dos limites da ME2) e com as descrições corrigidas de `V1_DESCRIPTION_FIXES`.
 */
export function v1WithEstados(
  id: string,
  nowType: unknown,
  beforeType: unknown,
): { actual: unknown; expected: unknown } {
  const now = nowType as { fields: Raw[]; examples?: Raw[] };
  const before = beforeType as { fields: Raw[]; examples?: Raw[] };
  const fixes = V1_DESCRIPTION_FIXES[id] ?? {};
  const noDefault = V1_NO_DEFAULT[id];
  const expectedFields = before.fields.map((f) => {
    if (f.key !== undefined && f.key === noDefault) {
      const { default: _dropped, ...rest } = f as Raw & { default?: unknown };
      void _dropped;
      const nowField = now.fields.find((n) => n.key === f.key);
      return { ...rest, description: nowField?.description };
    }
    return f.key !== undefined && fixes[f.key] !== undefined
      ? { ...f, description: fixes[f.key] }
      : f;
  });
  const isState = (e: Raw): boolean => e.values?.interaction !== undefined;
  return {
    actual: {
      fields: now.fields
        .filter((f) => f.key !== 'interaction')
        .map((f) => withoutAddedColumns(id, f)),
      examples: (now.examples ?? []).filter(
        (e) => !isState(e) && e.name !== LIMIT_EXAMPLES[id],
      ),
    },
    expected: { fields: expectedFields, examples: before.examples ?? [] },
  };
}
