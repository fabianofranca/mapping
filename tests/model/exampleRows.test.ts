// Exemplos com as linhas de um campo `table` (decisão 24 da #897, EX5): o Catálogo dá `_id`
// às linhas e desenha o exemplo com elas, a prova de desenho usa as linhas, e o exemplo sem o
// campo continua sem linhas (não herda o `preview`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, exampleDrawing, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { validateLibrary, type LibraryFile } from '../../src/model/library';

const FONT = { family: 'Roboto', size: 14, weight: 500, lineHeight: 20 };

const COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'tabs-lite',
  name: 'Abas',
  size: { width: 240, height: 48 },
  preview: { items: [{ label: 'Início' }, { label: 'Buscar' }, { label: 'Perfil' }] },
  template: {
    type: 'frame',
    name: 'abas',
    layout: { type: 'row', align: 'center' },
    children: [
      {
        type: 'repeat',
        name: 'abas',
        field: 'items',
        direction: 'row',
        template: {
          type: 'frame',
          name: 'aba',
          layout: { type: 'row' },
          children: [
            {
              type: 'text',
              name: 'rótulo',
              text: { $field: 'label' },
              font: FONT,
              color: '#000000',
            },
          ],
        },
      },
    ],
  },
};

function specJson(examples: unknown[]): Record<string, unknown> {
  return {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'lite',
    name: 'Lite',
    version: 1,
    fonts: [{ family: 'Roboto', file: 'fonts/Roboto-Medium.ttf', weight: 500 }],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#6750A4',
        annotationTypes: [
          {
            id: 'tabs-lite',
            name: 'Abas',
            component: 'components/tabs-lite.json',
            doc: 'docs/tabs-lite.md',
            examples,
            fields: [
              {
                key: 'items',
                type: 'table',
                columns: [{ key: 'label', type: 'string' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function pack(examples: unknown[], component: unknown = COMPONENT): LibraryFile[] {
  return [
    { path: 'lite.spec.json', text: JSON.stringify(specJson(examples)) },
    { path: 'components/tabs-lite.json', text: JSON.stringify(component) },
    { path: 'docs/tabs-lite.md', text: '# Abas\n\nFileira de abas.\n' },
    { path: 'fonts/Roboto-Medium.ttf', binary: true },
  ];
}

const WITH_ROWS = {
  name: 'Com destinos',
  values: { items: [{ label: 'Início' }, { label: 'Buscar' }] },
};
const WITHOUT_ROWS = { name: 'Sem o campo', values: {} };

/** Os textos desenhados, na ordem. */
function texts(node: unknown): string[] {
  if (typeof node !== 'object' || node === null) return [];
  const n = node as { type?: string; text?: string; children?: unknown[] };
  const own = n.type === 'text' && typeof n.text === 'string' ? [n.text] : [];
  return [...own, ...(n.children ?? []).flatMap(texts)];
}

describe('Catálogo: exemplo com as linhas de um campo table', () => {
  const catalog = buildCatalog(pack([WITH_ROWS, WITHOUT_ROWS]));
  const entry = findEntry(catalog, 'tabs-lite')!;

  it('o pacote é válido', () => {
    expect(catalog.report.errors).toEqual([]);
  });

  it('as linhas do exemplo ganham _id, como as do preview', () => {
    const rows = entry.examples[0]?.values?.items;
    expect(rows).toEqual([
      { _id: 'preview-1', label: 'Início' },
      { _id: 'preview-2', label: 'Buscar' },
    ]);
    expect(entry.previewValues?.items).toEqual([
      { _id: 'preview-1', label: 'Início' },
      { _id: 'preview-2', label: 'Buscar' },
      { _id: 'preview-3', label: 'Perfil' },
    ]);
  });

  it('o exemplo com linhas desenha as linhas', () => {
    const drawing = exampleDrawing(
      catalog,
      entry,
      entry.examples[0],
      approximateMeasurer,
    );
    expect(texts(drawing?.root)).toEqual(['Início', 'Buscar']);
  });

  it('o exemplo sem o campo table continua sem linhas (não herda o preview)', () => {
    expect(entry.examples[1]?.values).toEqual({});
    const drawing = exampleDrawing(
      catalog,
      entry,
      entry.examples[1],
      approximateMeasurer,
    );
    expect(texts(drawing?.root)).toEqual([]);
  });
});

describe('prova de desenho: o exemplo com linhas', () => {
  const NARROW = { ...COMPONENT, size: { width: 30, height: 48 } };
  const drawingWarnings = (examples: unknown[]) =>
    validateLibrary({ files: pack(examples, NARROW) }).warnings.filter((w) =>
      w.message.includes('o exemplo'),
    );

  it('desenha as linhas: elas não cabem na caixa estreita e o aviso cita o exemplo', () => {
    const warnings = drawingWarnings([WITH_ROWS]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      file: 'lite.spec.json',
      path: 'layers[0].annotationTypes[0].examples[0]',
    });
    expect(warnings[0]?.message).toContain('o exemplo "Com destinos"');
  });

  it('o exemplo sem o campo table não desenha linhas e não avisa', () => {
    expect(drawingWarnings([WITHOUT_ROWS])).toEqual([]);
  });

  it('um pacote com o exemplo de linhas válidas não tem erros', () => {
    expect(validateLibrary({ files: pack([WITH_ROWS]) }).errors).toEqual([]);
  });
});
