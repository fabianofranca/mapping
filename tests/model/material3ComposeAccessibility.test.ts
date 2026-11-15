// Material 3 (Compose) library adopts accessibility (A4 of stage #1081, decisions 11 and 12): the closed list of
// roles and labels, the touch target (`expanded` where Compose expands it, `visual` where it does not), the label
// fields and parts that the icons need, the examples audited and the Fidelity that cites the Compose lines and the
// two roadmap issues. The test checks the closed list, not "every interactive type" (which would be circular).
import { describe, expect, it } from 'vitest';
import {
  accessibilityAudit,
  addContainer,
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  setFieldValue,
  setTableCell,
  typeAccessibility,
  type JsonValue,
  type Project,
  type SpecAnnotationType,
  type SpecExampleRow,
} from '../../src/model';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { INTERACTIVE_ROLES } from '../../src/model/spec';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';
import { files, spec, text, typeOf, types } from '../support/material3Library';

/** The two roadmap issues that this phase creates (decision 11; `impact: low`). */
const OVERLAP_ROADMAP = 1998;
const ROLE_BY_CASE_ROADMAP = 1999;

type Expected = { role: string; label?: string[]; required?: false };

/** Decision 11: role and label per type (`icon-toggle-button` is `checkbox`: `Role.Checkbox` in `IconButton.kt`). */
const ROLES: Record<string, Expected> = {
  button: { role: 'button', label: ['label'] },
  'extended-fab': { role: 'button', label: ['text'] },
  fab: { role: 'button', label: ['contentDescription'] },
  'icon-button': { role: 'button', label: ['contentDescription'] },
  'icon-toggle-button': { role: 'checkbox', label: ['contentDescription'] },
  chip: { role: 'button', label: ['label'] },
  checkbox: { role: 'checkbox', label: ['label'] },
  'radio-button': { role: 'radio', label: ['label'] },
  switch: { role: 'switch', label: ['label'] },
  slider: { role: 'slider' },
  'text-field': { role: 'textbox', label: ['label', 'placeholder'] },
  'secure-text-field': { role: 'textbox', label: ['label', 'placeholder'] },
  'search-bar': { role: 'searchbox', label: ['placeholder', 'query'] },
  'alert-dialog': { role: 'dialog', label: ['title', 'text'] },
  icon: { role: 'image', label: ['contentDescription'], required: false },
  image: { role: 'image', label: ['contentDescription'], required: false },
  'progress-indicator': { role: 'progressbar' },
  'navigation-bar': { role: 'navigation' },
  'short-navigation-bar': { role: 'navigation' },
  'navigation-rail': { role: 'navigation' },
  'navigation-drawer': { role: 'navigation' },
};

/** Types that the audit does not read by themselves (they have no `role`; their parts, if any, are still audited). */
const NO_ROLE = [
  ...['tabs', 'dropdown-menu', 'segmented-button', 'top-app-bar', 'bottom-app-bar'],
  ...['swipe-to-dismiss', 'bottom-sheet', 'snackbar', 'tooltip', 'badge', 'card'],
  ...['list-item', 'date-picker', 'time-picker', 'carousel', 'pull-to-refresh', 'text'],
  ...['divider', 'scaffold', 'surface', 'box', 'row', 'column', 'lazy-column'],
  ...['lazy-row', 'lazy-vertical-grid', 'flow-row', 'spacer', 'horizontal-pager'],
];

/** Interactive types whose Compose does not use `minimumInteractiveComponentSize` declare `visual` (decision 11). */
const VISUAL = ['text-field', 'secure-text-field', 'search-bar'];
const EXPANDED = [
  ...['button', 'extended-fab', 'fab', 'icon-button', 'icon-toggle-button', 'chip'],
  ...['checkbox', 'radio-button', 'switch', 'slider'],
];

type ExpectedPart = {
  id: string;
  when: string;
  role: string;
  label: string[];
  required?: false;
};

const field = (key: string, role: string, required?: false): ExpectedPart => ({
  id: key,
  when: key,
  role,
  label: [`${key}Description`],
  ...(required === undefined ? {} : { required }),
});
const row = (id: string, table: string, role: string, columns: string[]): ExpectedPart => ({
  id,
  when: table,
  role,
  label: columns.map((c) => `${table}.${c}`),
});
const NAVIGATION_ITEM = row('item', 'items', 'tab', ['label', 'iconDescription']);

/** Decision 11: the parts by field and by table row. */
const PARTS: Record<string, ExpectedPart[]> = {
  'top-app-bar': ['navigationIcon', 'actionIcon1', 'actionIcon2'].map((k) =>
    field(k, 'button'),
  ),
  'bottom-app-bar': [
    ...['actionIcon1', 'actionIcon2', 'actionIcon3', 'actionIcon4'],
    'floatingActionButton',
  ].map((k) => field(k, 'button')),
  'text-field': [field('leadingIcon', 'image', false), field('trailingIcon', 'button')],
  'secure-text-field': [
    field('leadingIcon', 'image', false),
    field('trailingIcon', 'button'),
  ],
  'search-bar': [field('leadingIcon', 'image', false), field('trailingIcon', 'button')],
  chip: [field('leadingIcon', 'image', false), field('trailingIcon', 'image', false)],
  switch: [field('thumbIcon', 'image', false)],
  'swipe-to-dismiss': [field('icon', 'image', false)],
  'alert-dialog': [
    {
      id: 'icon',
      when: 'icon',
      role: 'image',
      label: ['contentDescription'],
      required: false,
    },
  ],
  'navigation-bar': [NAVIGATION_ITEM],
  'short-navigation-bar': [NAVIGATION_ITEM],
  'navigation-rail': [NAVIGATION_ITEM],
  'navigation-drawer': [NAVIGATION_ITEM],
  tabs: [{ ...NAVIGATION_ITEM, id: 'tab' }],
  'dropdown-menu': [row('item', 'items', 'menuitem', ['text'])],
  'segmented-button': [
    row('option', 'options', 'radio', ['label', 'iconDescription']),
  ],
};

/** The new optional `string` fields (`<field>Description`) and the new columns (`iconDescription`). */
const NEW_FIELDS: Record<string, string[]> = {
  'top-app-bar': ['navigationIcon', 'actionIcon1', 'actionIcon2'],
  'bottom-app-bar': [
    ...['actionIcon1', 'actionIcon2', 'actionIcon3', 'actionIcon4'],
    'floatingActionButton',
  ],
  'text-field': ['leadingIcon', 'trailingIcon'],
  'secure-text-field': ['leadingIcon', 'trailingIcon'],
  'search-bar': ['leadingIcon', 'trailingIcon'],
  chip: ['leadingIcon', 'trailingIcon'],
  switch: ['thumbIcon'],
  'swipe-to-dismiss': ['icon'],
};
const NEW_COLUMNS: Record<string, string> = {
  'navigation-bar': 'items',
  'short-navigation-bar': 'items',
  'navigation-rail': 'items',
  'navigation-drawer': 'items',
  tabs: 'items',
  'segmented-button': 'options',
};

const accessibilityOf = (id: string) => typeAccessibility(spec, typeOf(id));

describe('Material 3 (Compose): accessibility of the library (A4, decision 11)', () => {
  it('is formatVersion 18, version 17, with the root touch target 48 x 48 expanded', () => {
    expect(spec.formatVersion).toBe(18);
    expect(spec.version).toBe(17);
    expect(spec.accessibility).toEqual({
      touchTarget: { width: 48, height: 48, mode: 'expanded' },
    });
  });

  it('adds no migration step: only the `to` of the existing ones follows the version', () => {
    expect(spec.migrations?.map((m) => [m.from, m.to])).toEqual([
      [1, 17],
      [2, 17],
      [3, 17],
      [4, 17],
      [5, 17],
    ]);
    for (const migration of spec.migrations ?? [])
      expect(migration.steps.every((s) => s.op === 'fill-field')).toBe(true);
  });

  it.each(Object.entries(ROLES))('%s: exact role and label', (id, expected) => {
    const a = accessibilityOf(id);
    expect(a?.role, id).toBe(expected.role);
    if (expected.label === undefined) {
      expect(a?.label, `${id}: no label`).toBeUndefined();
    } else {
      expect(a?.label?.fields, id).toEqual(expected.label);
      expect(a?.label?.required, `${id}: required`).toBe(
        expected.required ?? (INTERACTIVE_ROLES as readonly string[]).includes(expected.role),
      );
    }
  });

  it('the types outside the list have no role', () => {
    for (const id of NO_ROLE) {
      expect(typeOf(id).accessibility?.role, id).toBeUndefined();
      expect(typeOf(id).accessibility?.label, id).toBeUndefined();
      expect(typeOf(id).accessibility?.touchTarget, id).toBeUndefined();
    }
    const listed = new Set([...Object.keys(ROLES), ...NO_ROLE]);
    expect(types.map((t) => t.id).filter((id) => !listed.has(id))).toEqual([]);
    expect(listed.size).toBe(types.length);
  });

  it('the touch target: expanded 48 x 48 where Compose expands it, visual 48 x 48 where it does not', () => {
    for (const id of EXPANDED) {
      expect(typeOf(id).accessibility?.touchTarget, `${id}: inherits the root`).toBe(
        undefined,
      );
      expect(accessibilityOf(id)?.touchTarget, id).toEqual({
        width: 48,
        height: 48,
        mode: 'expanded',
      });
    }
    for (const id of VISUAL) {
      expect(accessibilityOf(id)?.touchTarget, id).toEqual({
        width: 48,
        height: 48,
        mode: 'visual',
      });
    }
    // No listed type opts out of the touch audit with `false`.
    for (const type of types) expect(type.accessibility?.touchTarget).not.toBe(false);
  });

  it.each(Object.entries(PARTS))('%s: the exact parts', (id, expected) => {
    const parts = accessibilityOf(id)?.parts ?? [];
    expect(
      parts.map((p) => ({
        id: p.id,
        when: p.when,
        role: p.role,
        label: p.label?.fields,
        ...(p.label?.required === false ? { required: false as const } : {}),
      })),
      id,
    ).toEqual(expected);
    for (const part of parts) expect(part.name.length, `${id}/${part.id}: name`).toBeGreaterThan(0);
  });

  it('only the listed types have parts', () => {
    const withParts = types
      .filter((t) => (t.accessibility?.parts?.length ?? 0) > 0)
      .map((t) => t.id)
      .sort();
    expect(withParts).toEqual(Object.keys(PARTS).sort());
  });
});

describe('Material 3 (Compose): the label fields and columns are new, optional and complete', () => {
  const find = (type: SpecAnnotationType, key: string) =>
    type.fields.find((f) => f.key === key);

  it.each(Object.entries(NEW_FIELDS))('%s: <field>Description exist and are optional strings', (id, keys) => {
    const type = typeOf(id);
    for (const key of keys) {
      const f = find(type, `${key}Description`);
      expect(f, `${id}.${key}Description`).toBeDefined();
      expect(f?.type).toBe('string');
      expect(f?.required ?? false).toBe(false);
      expect(f?.default, 'no default: empty is a pending item').toBeUndefined();
      expect(find(type, key), `${id}.${key}: the icon field`).toBeDefined();
    }
  });

  it.each(Object.entries(NEW_COLUMNS))('%s: the table has the optional iconDescription column', (id, table) => {
    const f = find(typeOf(id), table);
    expect(f?.type).toBe('table');
    if (f?.type !== 'table') return;
    const column = f.columns.find((c) => c.key === 'iconDescription');
    expect(column?.type).toBe('string');
    expect(column?.required ?? false).toBe(false);
  });

  it('every label field of a part exists, in the type or in the part table', () => {
    for (const type of types) {
      for (const part of type.accessibility?.parts ?? []) {
        for (const ref of part.label?.fields ?? []) {
          const [head, column] = ref.split('.');
          const f = find(type, head ?? '');
          expect(f, `${type.id}/${part.id}: ${ref}`).toBeDefined();
          if (column !== undefined && f?.type === 'table')
            expect(
              f.columns.some((c) => c.key === column),
              `${type.id}/${part.id}: ${ref}`,
            ).toBe(true);
        }
      }
    }
  });

  it('the notes of the code say where the new description goes (the Icon contentDescription)', () => {
    for (const id of Object.keys(NEW_FIELDS)) {
      const notes = typeOf(id).code?.compose?.notes ?? '';
      expect(notes, id).toMatch(/contentDescription/);
      expect(notes, `${id}: names a new field`).toMatch(/Description/);
    }
    const fab = typeOf('extended-fab').code?.compose?.notes ?? '';
    expect(fab, 'extended-fab: the collapsed one has no text').toMatch(
      /collapsed[^.]*contentDescription/i,
    );
  });
});

// --- The examples: built into a project to audit them ---

const catalog = buildCatalog(files);
const MATERIAL_ID = spec.id;

function rowsOf(value: JsonValue | SpecExampleRow[] | undefined): SpecExampleRow[] {
  return Array.isArray(value) ? (value as SpecExampleRow[]) : [];
}

/** A project with one marking per example, the size of the component's drawing, in a 1x container. */
function exampleProject(): { project: Project; ids: Map<string, string> } {
  let p = applySpecialization(emptyProject(), spec, { newId: idGen('SL') });
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 4000, height: 4000 });
  const ids = new Map<string, string>();
  let n = 0;
  for (const type of types) {
    const entry = findEntry(catalog, type.id);
    const size = entry?.component?.size ?? { width: 100, height: 100 };
    for (const example of type.examples ?? []) {
      n += 1;
      const id = `A${n}`;
      p = createMarking(p, {
        id: `M${n}`,
        containerId: 'I1',
        rect: { x: 0, y: 0, width: size.width, height: size.height },
        name: id,
      });
      p = addTypedAnnotation(p, {
        id,
        markingId: `M${n}`,
        layerId: layerOf(p, MATERIAL_ID, layerIdOf(type.id)),
        type: { specId: MATERIAL_ID, typeId: type.id },
      });
      for (const [key, value] of Object.entries(example.values ?? {})) {
        if (Array.isArray(value)) {
          rowsOf(value).forEach((r, i) => {
            p = addTableRow(p, id, key, `R${i + 1}`);
            for (const [column, cell] of Object.entries(r))
              p = setTableCell(p, id, key, `R${i + 1}`, column, cell as JsonValue);
          });
        } else if (value !== null) {
          p = setFieldValue(p, id, key, value);
        }
      }
      ids.set(id, `${type.id} / ${example.name}`);
    }
  }
  return { project: p, ids };
}

const layerIdOf = (typeId: string): string =>
  spec.layers.find((l) => l.annotationTypes.some((t) => t.id === typeId))?.id ?? '';

/** The example that the roteiro (R9 and the accessibility script) uses on purpose without labels. */
const UNLABELED = 'top-app-bar / Actions without a label';
const LABELED = 'top-app-bar / Labeled actions';

describe('Material 3 (Compose): the examples are audited', () => {
  const { project, ids } = exampleProject();
  const audit = accessibilityAudit(project);

  it('no example gets touch-target-small (the types the Compose expands are skipped; the visual ones are big enough)', () => {
    const small = [...audit.entries()]
      .filter(([, a]) => a.findings.length > 0)
      .map(([id]) => ids.get(id));
    expect(small).toEqual([]);
    expect(ids.size).toBeGreaterThan(200);
  });

  it('every example has its labels, except the one made on purpose without them', () => {
    const missing = [...audit.entries()]
      .filter(([, a]) => a.issues.length > 0)
      .map(([id]) => ids.get(id));
    expect(missing).toEqual([UNLABELED]);
  });

  it('the example without labels gives the pending item on the right parts', () => {
    const id = [...ids.entries()].find(([, name]) => name === UNLABELED)?.[0] ?? '';
    const issues = audit.get(id)?.issues ?? [];
    expect(issues.map((i) => [i.code, i.key, i.part?.id])).toEqual([
      ['accessible-label-missing', 'navigationIconDescription', 'navigationIcon'],
      ['accessible-label-missing', 'actionIcon1Description', 'actionIcon1'],
      ['accessible-label-missing', 'actionIcon2Description', 'actionIcon2'],
    ]);
  });

  it('the labeled example of the top app bar has the three actions named and no pending item', () => {
    const id = [...ids.entries()].find(([, name]) => name === LABELED)?.[0] ?? '';
    expect(id).not.toBe('');
    expect(audit.get(id)).toBeUndefined();
    const values = typeOf('top-app-bar').examples?.find(
      (e) => `top-app-bar / ${e.name}` === LABELED,
    )?.values;
    for (const key of ['navigationIcon', 'actionIcon1', 'actionIcon2'])
      expect(values?.[`${key}Description`], key).toBeTruthy();
  });
});

describe('Material 3 (Compose): the Fidelity cites the Compose and the roadmap issues', () => {
  const doc = (id: string): string => text(`docs/${id}.md`);
  const fidelity = (id: string): string => {
    const md = doc(id);
    const at = md.search(/^## Fidelity/m);
    return at < 0 ? '' : md.slice(at);
  };

  it('the types touched have a Fidelity that says the unit is the dp', () => {
    const touched = [
      ...Object.keys(ROLES).filter((id) => ROLES[id]?.role !== 'navigation'),
      ...Object.keys(PARTS),
    ];
    for (const id of new Set(touched)) {
      const f = fidelity(id);
      expect(f, id).not.toBe('');
      expect(f, `${id}: accessibility paragraph`).toMatch(/accessibility/i);
    }
  });

  it.each(EXPANDED)('%s: the Fidelity cites the minimumInteractiveComponentSize line and the overlap roadmap', (id) => {
    const f = fidelity(id);
    expect(f, id).toMatch(/touchTarget/);
    expect(f, id).toMatch(/expanded/);
    expect(f, `${id}: cites a Kotlin line`).toMatch(/\.kt`? \(lines? \d+/);
    expect(f, `${id}: overlap not audited`).toMatch(/overlap/i);
    expect(f, `${id}: roadmap`).toContain(`#${OVERLAP_ROADMAP}`);
  });

  it.each(['chip', 'segmented-button'])('%s: the Fidelity records the role of the base case and cites the role-by-case roadmap', (id) => {
    const f = fidelity(id);
    expect(f, id).toMatch(/Role\.\w+/);
    expect(f, id).toContain(`#${ROLE_BY_CASE_ROADMAP}`);
  });

  it('the docs that registered the minimum as text no longer say it is not a field of the type', () => {
    for (const id of [
      ...['checkbox', 'radio-button', 'icon-button', 'slider', 'snackbar'],
      ...['alert-dialog', 'short-navigation-bar'],
    ]) {
      expect(doc(id), id).not.toMatch(/not (a )?fields? of the type/i);
      expect(doc(id), id).not.toMatch(/are not fields of the type/i);
    }
    for (const id of ['checkbox', 'radio-button', 'icon-button', 'slider'])
      expect(fidelity(id), id).toMatch(/expanded/);
  });

  it('the visual ones say Compose does not expand them (the text field, the secure one and the search bar)', () => {
    for (const id of VISUAL) {
      expect(fidelity(id), id).toMatch(/visual/);
    }
  });
});
