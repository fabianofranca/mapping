import JSZip from 'jszip';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  addBackgroundContainer,
  addComponentMarking,
  addTableRow,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
  createProject,
  loadSpecComponents,
  parseSpec,
  serialize,
  setTableCell,
  specFiles,
  type ComponentCatalog,
  type Project,
  type Rect,
  type Spec,
} from '../../src/model';

// Projeto "Material 3 — componentes complexos": uma tela de reserva de hospedagem montada só com a
// biblioteca `libraries/material3-compose/`, com os componentes de mais propriedades e todas elas
// preenchidas (as imagens vêm da imagem de teste publicada). O zip sai daqui
// (`scripts/material3Complex.mjs`) e o teste `tests/examples/material3Complex.test.ts` confere
// que `examples/material3-complexos.zip` está em dia.

export const PACKAGE_DIR = 'libraries/material3-compose';
export const SPEC_FILE = 'material3-compose.spec.json';
export const SPEC_ID = 'material3-compose';
export const NOW = '2026-11-02T12:00:00.000Z';
/** Data fixa nas entradas do zip: o mesmo conteúdo gera sempre os mesmos bytes. */
const ENTRY_DATE = new Date('2026-11-02T00:00:00Z');
export const CONTAINER_ID = 'C1';
export const SIZE = { width: 800, height: 1280 } as const;

/** Imagem de teste publicada do próprio projeto (pede consentimento por origem). */
export const IMAGE_URL = 'https://fabianofranca.github.io/mapping/imagens-teste/foto.png';

type Value = string | number;

interface Item {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parent: string | null;
  readonly rect: Rect;
  readonly values: Readonly<Record<string, Value>>;
}

const r = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

const ITEMS: readonly Item[] = [
  {
    id: 'M_SCAFFOLD',
    type: 'scaffold',
    name: 'Tela',
    parent: null,
    rect: r(0, 0, 800, 1280),
    values: {
      containerColor: 'background',
      floatingActionButtonPosition: 'End',
      width: 'fill',
      height: 'fill',
    },
  },
  {
    id: 'M_TOPBAR',
    type: 'top-app-bar',
    name: 'Barra do topo',
    parent: 'M_SCAFFOLD',
    rect: r(0, 0, 800, 64),
    values: {
      title: 'Reservar estadia',
      style: 'center',
      navigationIcon: 'ArrowBack',
      actionIcon1: 'Favorite',
      actionIcon2: 'MoreVert',
    },
  },
  {
    id: 'M_FLOW',
    type: 'flow-row',
    name: 'Comodidades',
    parent: 'M_SCAFFOLD',
    rect: r(16, 76, 768, 48),
    values: {
      horizontalArrangement: 'Start',
      verticalArrangement: 'Top',
      itemVerticalAlignment: 'CenterVertically',
      maxItemsInEachRow: 4,
      maxLines: 1,
      spacing: 8,
      verticalSpacing: 8,
      padding: 4,
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_CHIP_WIFI',
    type: 'chip',
    name: 'Wi-Fi',
    parent: 'M_FLOW',
    rect: r(24, 84, 100, 32),
    values: {
      label: 'Wi-Fi',
      style: 'filter',
      selected: 'true',
      enabled: 'true',
      leadingIcon: 'Check',
      trailingIcon: 'Close',
    },
  },
  {
    id: 'M_CHIP_POOL',
    type: 'chip',
    name: 'Piscina',
    parent: 'M_FLOW',
    rect: r(132, 84, 100, 32),
    values: {
      label: 'Piscina',
      style: 'filter-elevated',
      selected: 'true',
      enabled: 'true',
      leadingIcon: 'Check',
      trailingIcon: 'Close',
    },
  },
  {
    id: 'M_CHIP_PET',
    type: 'chip',
    name: 'Pet friendly',
    parent: 'M_FLOW',
    rect: r(240, 84, 120, 32),
    values: {
      label: 'Pet friendly',
      style: 'suggestion',
      selected: 'false',
      enabled: 'true',
      leadingIcon: 'Favorite',
      trailingIcon: 'Add',
    },
  },
  {
    id: 'M_CHIP_PARK',
    type: 'chip',
    name: 'Estacionamento',
    parent: 'M_FLOW',
    rect: r(368, 84, 150, 32),
    values: {
      label: 'Estacionamento',
      style: 'assist',
      selected: 'false',
      enabled: 'false',
      leadingIcon: 'Home',
      trailingIcon: 'Settings',
    },
  },
  {
    id: 'M_ROW',
    type: 'row',
    name: 'Conteúdo em duas colunas',
    parent: 'M_SCAFFOLD',
    rect: r(0, 132, 800, 1140),
    values: {
      horizontalArrangement: 'Start',
      verticalAlignment: 'Top',
      spacing: 16,
      background: 'none',
      padding: 16,
      scroll: 'false',
      width: 'fill',
      height: 'fill',
      weight: 1,
    },
  },
  {
    id: 'M_COL_L',
    type: 'column',
    name: 'Coluna do hotel',
    parent: 'M_ROW',
    rect: r(16, 148, 376, 1100),
    values: {
      verticalArrangement: 'Top',
      horizontalAlignment: 'Start',
      spacing: 16,
      background: 'none',
      padding: 0,
      scroll: 'false',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_SEARCH',
    type: 'search-bar',
    name: 'Busca',
    parent: 'M_COL_L',
    rect: r(16, 148, 376, 56),
    values: {
      query: 'Florianópolis',
      placeholder: 'Buscar destino',
      leadingIcon: 'Search',
      trailingIcon: 'Close',
      expanded: 'false',
      style: 'docked',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_CAROUSEL',
    type: 'carousel',
    name: 'Praias',
    parent: 'M_COL_L',
    rect: r(16, 220, 376, 205),
    values: {
      style: 'multi-browse',
      preferredItemWidth: 120,
      itemWidth: 96,
      itemSpacing: 8,
      width: 'fill',
      height: 'fixed',
      weight: 1,
    },
  },
  {
    id: 'M_CARD',
    type: 'card',
    name: 'Pousada',
    parent: 'M_COL_L',
    rect: r(16, 441, 376, 160),
    values: {
      title: 'Pousada Mar Azul',
      subtitle: 'Campeche · 4,8 ★',
      media: IMAGE_URL,
      supportingText:
        'A 200 m da praia, com café da manhã incluso e varanda com vista para o mar.',
      style: 'elevated',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_LISTITEM',
    type: 'list-item',
    name: 'Cancelamento',
    parent: 'M_COL_L',
    rect: r(16, 617, 376, 88),
    values: {
      overlineContent: 'Política',
      headlineContent: 'Cancelamento grátis',
      supportingContent: 'Até 48 h antes do check-in',
      leadingImage: IMAGE_URL,
      leadingIcon: 'EventAvailable',
      trailingContent: 'Grátis',
      trailingIcon: 'KeyboardArrowRight',
    },
  },
  {
    id: 'M_SWIPE',
    type: 'swipe-to-dismiss',
    name: 'Cupom',
    parent: 'M_COL_L',
    rect: r(16, 705, 376, 72),
    values: {
      title: 'Cupom VERAO26 aplicado',
      supportingText: '10% de desconto na diária',
      direction: 'EndToStart',
      enableDismissFromStartToEnd: 'false',
      enableDismissFromEndToStart: 'true',
      icon: 'Delete',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_COL_R',
    type: 'column',
    name: 'Coluna da reserva',
    parent: 'M_ROW',
    rect: r(408, 148, 376, 1100),
    values: {
      verticalArrangement: 'Top',
      horizontalAlignment: 'Start',
      spacing: 16,
      background: 'none',
      padding: 0,
      scroll: 'false',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_DATES',
    type: 'date-picker',
    name: 'Datas',
    parent: 'M_COL_R',
    rect: r(408, 148, 360, 469),
    values: {
      title: 'Datas da estadia',
      headline: '18 – 23 de dez.',
      displayedMonth: 'Dezembro de 2026',
      selection: 'range',
      selectedDay: 18,
      rangeStartDay: 18,
      rangeEndDay: 23,
      showModeToggle: 'true',
    },
  },
  {
    id: 'M_SLIDER',
    type: 'slider',
    name: 'Faixa de preço',
    parent: 'M_COL_R',
    rect: r(408, 633, 376, 44),
    values: {
      type: 'range',
      value: '0.5',
      valueStart: '0.2',
      valueEnd: '0.7',
      steps: 9,
      enabled: 'true',
      width: 'fill',
      weight: 1,
    },
  },
  {
    id: 'M_NAME',
    type: 'text-field',
    name: 'Nome',
    parent: 'M_COL_R',
    rect: r(408, 693, 376, 76),
    values: {
      label: 'Nome completo',
      value: 'Ana Souza',
      placeholder: 'Como está no documento',
      supportingText: 'Igual ao documento de identidade',
      style: 'outlined',
      enabled: 'true',
      isError: 'false',
      singleLine: 'true',
      maxLines: 1,
      leadingIcon: 'Person',
      trailingIcon: 'Check',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_EMAIL',
    type: 'text-field',
    name: 'E-mail',
    parent: 'M_COL_R',
    rect: r(408, 785, 376, 76),
    values: {
      label: 'E-mail',
      value: 'ana@exemplo',
      placeholder: 'nome@dominio.com',
      supportingText: 'Informe um e-mail válido',
      style: 'filled',
      enabled: 'true',
      isError: 'true',
      singleLine: 'true',
      maxLines: 1,
      leadingIcon: 'Email',
      trailingIcon: 'Error',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_PASSWORD',
    type: 'secure-text-field',
    name: 'Senha',
    parent: 'M_COL_R',
    rect: r(408, 877, 376, 76),
    values: {
      label: 'Senha',
      hasText: 'true',
      placeholder: 'Crie uma senha',
      supportingText: 'Mínimo de 8 caracteres',
      style: 'outlined',
      enabled: 'true',
      isError: 'false',
      leadingIcon: 'Lock',
      trailingIcon: 'Visibility',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
  {
    id: 'M_CONFIRM',
    type: 'button',
    name: 'Confirmar',
    parent: 'M_COL_R',
    rect: r(408, 969, 376, 40),
    values: {
      label: 'Confirmar reserva',
      style: 'filled',
      enabled: 'true',
      icon: 'Check',
      width: 'fill',
      height: 'wrap',
      weight: 1,
    },
  },
];

/** Linhas da tabela `items` do carrossel (`image` com a imagem de teste e uma query por item). */
export const CAROUSEL_LABELS = ['Campeche', 'Lagoa', 'Centro', 'Norte'] as const;

/** Todos os arquivos do pacote da biblioteca (caminho relativo → bytes), ordenados. */
export function packageFiles(): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(relative(PACKAGE_DIR, full).split('\\').join('/'), readFileSync(full));
    }
  };
  walk(PACKAGE_DIR);
  return out;
}

export function loadSpec(): Spec {
  const parsed = parseSpec(
    JSON.parse(readFileSync(join(PACKAGE_DIR, SPEC_FILE), 'utf8')),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Tipos de componente usados na tela, na ordem de criação. */
export const USED_TYPES: readonly string[] = [...new Set(ITEMS.map((i) => i.type))];

/** Marcações da tela: id, tipo, nome e valores esperados. */
export function items(): readonly Item[] {
  return ITEMS;
}

export function annotationIdOf(markingId: string): string {
  return `A${markingId.slice(1)}`;
}

/** O projeto: um container sem arquivo 800 × 1280 com a tela montada e arrumada. */
export function project(): Project {
  const spec = loadSpec();
  const packageFilesMap = packageFiles();
  let n = 0;
  let p = createProject({
    name: 'Material 3 — componentes complexos',
    now: NOW,
    firstLayer: { id: 'L1', name: 'Notas', color: '#1e88e5' },
  });
  p = applySpecialization(p, spec, {
    newId: () => `LS${++n}`,
    packageSpecName: SPEC_FILE,
  });
  p = addBackgroundContainer(p, {
    id: CONTAINER_ID,
    name: 'Reservar estadia',
    ...SIZE,
    background: '#FEF7FF',
  });
  const catalog: ComponentCatalog = new Map([
    [
      spec.id,
      loadSpecComponents(spec, `specs/${spec.id}/${SPEC_FILE}`, spec.version, (path) =>
        packageFilesMap.get(path.replace(`specs/${spec.id}/`, ''))?.toString('utf8'),
      ),
    ],
  ]);
  for (const item of ITEMS) {
    const annotationId = annotationIdOf(item.id);
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: item.id,
        annotationId,
        containerId: CONTAINER_ID,
        parentId: item.parent,
        specId: SPEC_ID,
        typeId: item.type,
        name: item.name,
        rect: item.rect,
        values: item.values,
      },
      approximateMeasurer,
    );
    if (item.type === 'carousel') {
      CAROUSEL_LABELS.forEach((label, i) => {
        const rowId = `${item.id}-i${i + 1}`;
        p = addTableRow(p, annotationId, 'items', rowId);
        p = setTableCell(p, annotationId, 'items', rowId, 'label', label);
        p = setTableCell(
          p,
          annotationId,
          'items',
          rowId,
          'image',
          `${IMAGE_URL}?${label.toLowerCase()}`,
        );
      });
    }
  }
  // O slot do scaffold é livre (`none`): o flow-row e o row (com as colunas) é que se arrumam.
  p = arrangeMarking(p, catalog, 'M_FLOW', approximateMeasurer).project;
  return arrangeMarking(p, catalog, 'M_ROW', approximateMeasurer).project;
}

/** Os arquivos do zip: `mapping.json`, `specs/` com o pacote da biblioteca (sem imagens). */
export function files(): Map<string, string | Buffer> {
  const out = new Map<string, string | Buffer>();
  const p = project();
  out.set('mapping.json', serialize(p));
  for (const [path, text] of specFiles(p)) out.set(path, text);
  for (const [path, bytes] of packageFiles()) {
    const target = `specs/${SPEC_ID}/${path}`;
    if (!out.has(target)) out.set(target, bytes);
  }
  return out;
}

/** Os bytes de `examples/material3-complexos.zip` (determinísticos). */
export async function complexZip(): Promise<Buffer> {
  const all = files();
  const zip = new JSZip();
  for (const path of [...all.keys()].sort()) {
    zip.file(path, all.get(path) ?? '', { createFolders: false, date: ENTRY_DATE });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}
