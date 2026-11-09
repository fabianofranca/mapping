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

type Raw = { key?: string; description?: string; values?: Record<string, unknown> };

/** Descrições de campo que a etapa Material 3 com estados (#869, ME1) corrigiu em relação à v1 (decisão 10). */
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

/**
 * Os campos e os exemplos de um tipo iguais aos da v1, mais o que a etapa Material 3 com estados acrescentou:
 * o campo `interaction` e os exemplos com `interaction` (cada fase que dá o campo a um tipo), e as descrições
 * corrigidas de `V1_DESCRIPTION_FIXES`. Devolve o que se espera de `fields` e `examples` agora.
 */
export function v1WithEstados(
  id: string,
  nowType: unknown,
  beforeType: unknown,
): { fields: unknown; examples: unknown } {
  const now = nowType as { fields: Raw[]; examples?: Raw[] };
  const before = beforeType as { fields: Raw[]; examples?: Raw[] };
  const fixes = V1_DESCRIPTION_FIXES[id] ?? {};
  const base = before.fields.map((f) =>
    f.key !== undefined && fixes[f.key] !== undefined
      ? { ...f, description: fixes[f.key] }
      : f,
  );
  const hasInteraction = now.fields.some((f) => f.key === 'interaction');
  const field = now.fields.find((f) => f.key === 'interaction');
  const insertAt = now.fields.findIndex((f) => f.key === 'interaction');
  const fields = hasInteraction
    ? [...base.slice(0, insertAt), field, ...base.slice(insertAt)]
    : base;
  const stateExamples = (now.examples ?? []).filter(
    (e) => e.values?.interaction !== undefined,
  );
  return { fields, examples: [...(before.examples ?? []), ...stateExamples] };
}
