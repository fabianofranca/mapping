import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addComponentMarking,
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  approximateMeasurer,
  createMarking,
  createProject,
  loadSpecComponents,
  parseSpecText,
  addTableRow,
  setContainerDensity,
  setTableCell,
  setFieldValue,
  type NewComponentArgs,
  type Project,
  type Rect,
} from '../../src/model';
import { NOW } from '../model/fixtures';

// The project of the `tests/fixtures/accessibility` library (a 1080 x 2400 px container at the density the test asks for)
// with the markings the test places: pure model, shared by the model tests and the MCP workspace (stage #1128, A3).

export const A11Y_FIXTURE = 'tests/fixtures/accessibility';
export const A11Y_SPEC_ID = 'accessibility';
export const A11Y_SCREEN = 'bbbbbbbb-0000-4000-8000-0000000000a1';
const LAYER = 'cccccccc-0000-4000-8000-0000000000a1';
export const A11Y_COMPONENTS = ['bar', 'button', 'icon-button', 'tabs'];

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface A11yOptions {
  /** Edits the library's specialization before it is applied (a platform with `code`, a type, ...). */
  readonly tweak?: (spec: Doc) => void;
  /** Pixels per component unit of the container (default 3, the Android phone of the roteiro). */
  readonly density?: number;
}

export type A11yPlacer = (
  id: string,
  typeId: string,
  extra?: Partial<NewComponentArgs>,
) => void;

/** Rows of the `items` table of a `tabs` annotation (row ids `r1`, `r2`, ...). */
export type A11yRowsPlacer = (
  id: string,
  rows: readonly Record<string, string>[],
) => void;

/** Places a typed annotation on a plain marking (a type without a component), values set one by one. */
export type A11yPlainPlacer = (
  id: string,
  typeId: string,
  rect: Rect,
  values?: Record<string, string>,
) => void;

export function a11ySpecText(options: A11yOptions): string {
  const text = readFileSync(join(A11Y_FIXTURE, 'accessibility.spec.json'), 'utf8');
  if (options.tweak === undefined) return text;
  const spec = JSON.parse(text) as Doc;
  options.tweak(spec);
  return JSON.stringify(spec);
}

export function a11yMcpLibrary(options: A11yOptions = {}) {
  const parsed = parseSpecText(a11ySpecText(options));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  const texts = new Map(
    A11Y_COMPONENTS.map((id) => [
      `specs/${A11Y_SPEC_ID}/components/${id}.json`,
      readFileSync(join(A11Y_FIXTURE, 'components', `${id}.json`), 'utf8'),
    ]),
  );
  const catalog = new Map([
    [
      A11Y_SPEC_ID,
      loadSpecComponents(
        parsed.spec,
        `specs/${A11Y_SPEC_ID}/accessibility.spec.json`,
        1,
        (path) => texts.get(path),
      ),
    ],
  ]);
  return { spec: parsed.spec, catalog };
}

/** The empty project with the library applied; `fill` adds the markings (ids `mk-<id>`, annotations `an-<id>`). */
export function a11yMcpProject(
  fill: (add: A11yPlacer, plain: A11yPlainPlacer, rows: A11yRowsPlacer) => void,
  options: A11yOptions = {},
): Project {
  const { spec, catalog } = a11yMcpLibrary(options);
  let p = createProject({
    name: 'Accessibility',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, {
    id: A11Y_SCREEN,
    file: 'images/screen.png',
    width: 1080,
    height: 2400,
  });
  p = setContainerDensity(p, A11Y_SCREEN, options.density ?? 3);
  p = applySpecialization(p, spec, { packageSpecName: 'accessibility.spec.json' });
  const add: A11yPlacer = (id, typeId, extra = {}) => {
    p = addComponentMarking(
      p,
      catalog,
      {
        markingId: `mk-${id}`,
        annotationId: `an-${id}`,
        containerId: A11Y_SCREEN,
        parentId: null,
        specId: A11Y_SPEC_ID,
        typeId,
        ...extra,
      },
      approximateMeasurer,
    );
  };
  const plain: A11yPlainPlacer = (id, typeId, rect, values = {}) => {
    p = createMarking(p, {
      id: `mk-${id}`,
      containerId: A11Y_SCREEN,
      rect,
      name: id,
    });
    const layer = p.layers.find((l) => l.spec?.specId === A11Y_SPEC_ID)!;
    p = addTypedAnnotation(p, {
      id: `an-${id}`,
      markingId: `mk-${id}`,
      layerId: layer.id,
      type: { specId: A11Y_SPEC_ID, typeId },
    });
    for (const [key, value] of Object.entries(values)) {
      p = setFieldValue(p, `an-${id}`, key, value);
    }
  };
  const rows: A11yRowsPlacer = (id, list) => {
    list.forEach((row, i) => {
      p = addTableRow(p, `an-${id}`, 'items', `r${i + 1}`);
      for (const [column, value] of Object.entries(row)) {
        p = setTableCell(p, `an-${id}`, 'items', `r${i + 1}`, column, value);
      }
    });
  };
  fill(add, plain, rows);
  return p;
}

/**
 * Gives the library an Android platform with the `code` of each type, and a `slider` type (an interactive role with
 * no `label`, no component): what `get_code_hints` needs to answer for it.
 */
export function withAndroid(spec: Doc): void {
  spec.platforms = [{ id: 'android', name: 'Android', language: 'kotlin' }];
  const layer = spec.layers[0];
  const types: Doc[] = layer.annotationTypes;
  const code = (symbol: string, params: Record<string, string>) => ({
    android: { symbol, params },
  });
  types.find((t) => t.id === 'button')!.code = code('ui.Button', { label: 'label' });
  types.find((t) => t.id === 'bar')!.code = {
    android: {
      symbol: 'ui.Bar',
      params: { title: 'title' },
      slots: { actions: 'actions' },
    },
  };
  types.find((t) => t.id === 'icon-button')!.code = code('ui.IconButton', {
    icon: 'icon',
  });
  types.find((t) => t.id === 'tabs')!.code = {
    android: { symbol: 'ui.Tabs', params: {} },
  };
  types.push({
    id: 'slider',
    name: 'Slider',
    accessibility: { role: 'slider' },
    fields: [{ key: 'value', type: 'string' }],
    code: code('ui.Slider', { value: 'value' }),
  });
}
