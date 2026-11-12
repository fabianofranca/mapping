import {
  addContainer,
  applySpecialization,
  loadSpecComponents,
  parseSpec,
  type ComponentCatalog,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Biblioteca pequena de componentes que se ajustam ao conteúdo (MC3, decisões 14 a 16 da #898):
// um botão de rótulo longo (altura `hug`), o mesmo com teto na raiz, um de largura e altura `hug`,
// um de altura por expressão, um sem eixo ajustável e uma linha com `align: stretch` e outra com slot
// `none`. Escrita no próprio teste, como a de `componentFixtures.ts`.

export const FIT_SPEC_FILE = 'specs/fit/fit.spec.json';
export const FIT_SPEC_ID = 'fit';

type Json = Record<string, unknown>;

/** Rótulo que, no botão de 120 de largura (104 de texto), passa de uma linha no `approximateMeasurer`. */
export const LONG_LABEL = 'Um rótulo bastante longo que quebra em várias linhas';

function labelText(): Json {
  return {
    type: 'text',
    name: 'rótulo',
    text: { $field: 'label', default: '' },
    width: 'fill',
    height: 'hug',
    font: { size: 14, lineHeight: 20 },
  };
}

function button(id: string, size: Json, sizing: Json | undefined, root: Json = {}): Json {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size,
    minSize: { width: 48, height: 40 },
    ...(sizing === undefined ? {} : { sizing }),
    template: {
      type: 'frame',
      layout: { type: 'column', padding: 8 },
      fill: '#EEEEEE',
      children: [labelText()],
      ...root,
    },
  };
}

/** Slot `none` com `align` (vertical) e `justify` (horizontal): cada filha sozinha na caixa do slot. */
function overlaid(id: string, align: string, justify: string): Json {
  const base = row(id, 'start', 'none');
  const template = base.template as { children: Json[] };
  const slot = template.children[0] as Json;
  return {
    ...base,
    template: {
      ...template,
      children: [{ ...slot, layout: { type: 'none', align, justify } }],
    },
  };
}

function row(id: string, align: string, layoutType = 'row', sizing?: Json): Json {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 400, height: 100 },
    ...(sizing === undefined ? {} : { sizing }),
    template: {
      type: 'frame',
      layout: { type: 'none' },
      fill: '#DDDDDD',
      children: [
        {
          type: 'slot',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout:
            layoutType === 'none'
              ? { type: 'none' }
              : { type: layoutType, gap: 8, padding: 0, align, justify: 'start' },
        },
      ],
    },
  };
}

export const FIT_COMPONENTS: Record<string, Json> = {
  // A altura acompanha o rótulo; a largura fica (sem `sizing` nela).
  'fit-button': button('fit-button', { width: 120, height: 40 }, { height: 'hug' }),
  // O mesmo com o teto da raiz em 60 de altura.
  'fit-capped': button(
    'fit-capped',
    { width: 120, height: 40 },
    { height: 'hug' },
    { maxHeight: 60 },
  ),
  // Os dois eixos acompanham o conteúdo.
  'fit-hug': button(
    'fit-hug',
    { width: 120, height: 40 },
    { width: 'hug', height: 'hug' },
  ),
  // L4: a largura sem quebra (`max-content`) e pela palavra mais larga (`min-content`).
  'fit-max': button(
    'fit-max',
    { width: 120, height: 40 },
    { width: 'max-content', height: 'hug' },
  ),
  'fit-min': button(
    'fit-min',
    { width: 120, height: 40 },
    { width: 'min-content', height: 'hug' },
  ),
  // A altura vem de um campo: 80 com `tall`, 30 sem ele (e nunca abaixo do mínimo).
  'fit-px': button(
    'fit-px',
    { width: 120, height: 40 },
    {
      height: { $if: { $field: 'tall' }, then: 80, else: 30 },
    },
  ),
  // `fill` num eixo e nada no outro: nenhum eixo acompanha o conteúdo.
  'fit-fill': button('fit-fill', { width: 120, height: 40 }, { width: 'fill' }),
  // Sem `sizing`: nada a ajustar.
  'fit-plain': button('fit-plain', { width: 120, height: 40 }, undefined),
  // Linha que estica as filhas na altura, e linha que não estica.
  'fit-row-stretch': row('fit-row-stretch', 'stretch'),
  'fit-row-start': row('fit-row-start', 'start'),
  // Slot sem layout e altura `hug`: com filhas não se arruma nem se ajusta.
  'fit-row-none': row('fit-row-none', 'start', 'none', { height: 'hug' }),
  // Slot `none` alinhado (v4): `justify` estica na largura, `align` na altura.
  'fit-none-justify': overlaid('fit-none-justify', 'start', 'stretch'),
  'fit-none-align': overlaid('fit-none-align', 'stretch', 'start'),
};

const FIELDS = [
  { key: 'label', type: 'string', default: 'Ok' },
  { key: 'tall', type: 'string' },
];

export const FIT_SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: FIT_SPEC_ID,
  name: 'Ajuste',
  version: 1,
  layers: [
    {
      id: 'componentes',
      name: 'Componentes',
      color: '#6750A4',
      annotationTypes: Object.keys(FIT_COMPONENTS).map((id) => ({
        id,
        name: id,
        component: `components/${id}.json`,
        fields: FIELDS,
      })),
    },
  ],
};

export function fitSpec(): Spec {
  const parsed = parseSpec(FIT_SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

export function fitCatalog(): ComponentCatalog {
  const texts = new Map(
    Object.entries(FIT_COMPONENTS).map(([id, c]) => [
      `specs/fit/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(fitSpec(), FIT_SPEC_FILE, 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[FIT_SPEC_ID, loaded]]);
}

/** Projeto com a especialização `fit` e a imagem `I1` (1000 × 800). */
export function fitProject(): Project {
  let p = emptyProject();
  p = applySpecialization(p, fitSpec(), {
    newId: (() => {
      let n = 0;
      return () => `FS${++n}`;
    })(),
    packageSpecName: 'fit.spec.json',
  });
  return addContainer(p, { id: 'I1', file: 'images/tela.png', width: 1000, height: 800 });
}
