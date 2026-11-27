// Details with field groups and conditional display (stage #2918, FG3; decisions 7 and 8): a type
// like the stage's Decorated Text, in `AnnotationEditor`. The groups are collapsible subheadings, a
// condition hides fields (never clears them), and the "<n> hidden fields · Show" line brings them back.
import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addContainer,
  addLayer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpec,
  setFieldValue,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { sectionKey } from '../../src/store/ui';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import {
  DetailsExtensionContext,
  type DetailsExtension,
} from '../../src/ui/DetailsExtension';
import { emptyProject } from '../model/fixtures';
import { layerOf } from '../model/specFixtures';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

const piece = (n: number) => [
  { key: `part${n}Text`, label: `Piece ${n} text`, type: 'string', group: `piece${n}` },
  {
    key: `part${n}Effect`,
    label: `Piece ${n} effect`,
    type: 'enum',
    options: ['none', 'link'],
    default: 'none',
    group: `piece${n}`,
  },
  ...(n === 1
    ? [
        {
          key: 'part1LinkSize',
          label: 'Piece 1 link size',
          type: 'number',
          group: 'piece1',
          visibleWhen: { part1Effect: 'link' },
        },
      ]
    : []),
];

const decoratedText = {
  format: 'mapping-spec',
  formatVersion: 26,
  id: 'deco',
  name: 'Deco',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#112233',
      annotationTypes: [
        {
          id: 'decorated',
          name: 'Decorated Text',
          fields: [
            { key: 'text', label: 'Text', type: 'string' },
            {
              key: 'variant',
              label: 'Variant',
              type: 'enum',
              options: ['plain', 'htmlTagged'],
              default: 'plain',
            },
            ...piece(1),
            ...piece(2),
          ],
          fieldGroups: [
            {
              id: 'piece1',
              name: 'Piece 1',
              description: 'The first piece',
              visibleWhen: { variant: 'htmlTagged' },
            },
            { id: 'piece2', name: 'Piece 2', visibleWhen: { variant: 'htmlTagged' } },
          ],
        },
      ],
    },
  ],
};

function project(
  values: Record<string, string> = {},
  raw: Record<string, string> = {},
): Project {
  const parsed = parseSpec(decoratedText);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  let p = emptyProject();
  p = addLayer(p, { id: 'LM', name: 'Model', color: '#757575' });
  p = applySpecialization(p, parsed.spec, { newId: () => 'LU' });
  p = addContainer(p, { id: 'I1', file: 'images/a.png', width: 500, height: 500 });
  const rect = { x: 10, y: 10, width: 100, height: 100 };
  p = createMarking(p, { id: 'M1', containerId: 'I1', rect, name: 'One' });
  p = createMarking(p, {
    id: 'M2',
    containerId: 'I1',
    rect: { ...rect, x: 200 },
    name: 'Two',
  });
  for (const [id, markingId] of [
    ['A1', 'M1'],
    ['A2', 'M2'],
  ] as const) {
    p = addTypedAnnotation(p, {
      id,
      markingId,
      layerId: layerOf(p, 'deco', 'ui'),
      type: { specId: 'deco', typeId: 'decorated' },
    });
  }
  for (const [key, value] of Object.entries(values)) {
    p = setFieldValue(p, 'A1', key, value);
  }
  // Stored values the model refuses to set (a value outside the options, as after a spec change).
  return {
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === 'A1' ? { ...a, values: { ...a.values, ...raw } } : a,
    ),
  };
}

interface SetupOptions {
  readonly extension?: Partial<DetailsExtension>;
  readonly annotationId?: string;
}

function setup(
  values: Record<string, string> = {},
  options: SetupOptions = {},
  raw: Record<string, string> = {},
) {
  const harness: Harness = createHarness(project(values, raw));
  const view = (p: Project, id: string) => (
    <AnnotationEditor
      project={p}
      annotation={annotationOf(p, id)}
      visibleLayerIds={new Set(p.layers.map((l) => l.id))}
      onGoToAnnotation={() => undefined}
      onShowLayer={() => undefined}
      readOnly={false}
    />
  );
  // The extension answers `null` for anything not given (a Proxy), like a review with no change.
  const extension = options.extension
    ? (new Proxy(options.extension, {
        get: (target, prop) =>
          prop in target ? target[prop as keyof typeof target] : () => null,
      }) as unknown as DetailsExtension)
    : null;
  const selected = signal(options.annotationId ?? 'A1');
  renderLive(harness, (p) =>
    extension ? (
      <DetailsExtensionContext.Provider value={extension}>
        {view(p, selected.value)}
      </DetailsExtensionContext.Provider>
    ) : (
      view(p, selected.value)
    ),
  );
  /** A new selection: another annotation in the editor. */
  const select = (id: string) => act(() => void (selected.value = id));
  return { harness, select, user: userEvent.setup() };
}

const hiddenLine = (count: number) => screen.queryByText(`${count} hidden fields`);

describe('field groups in Details', () => {
  it('with variant plain, only the ungrouped fields and the hidden-fields line show', () => {
    setup();
    expect(screen.getByLabelText('Text')).toBeTruthy();
    expect(screen.getByText('Variant')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show or hide/ })).toBeNull();
    expect(screen.queryByLabelText('Piece 1 text')).toBeNull();
    expect(hiddenLine(5)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
  });

  it('with htmlTagged, the two subheadings show in place with their fields', () => {
    setup({ variant: 'htmlTagged' });
    expect(screen.getByRole('button', { name: 'Show or hide Piece 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show or hide Piece 2' })).toBeTruthy();
    expect(screen.getByLabelText('Piece 1 text')).toBeTruthy();
    expect(screen.getByLabelText('Piece 2 text')).toBeTruthy();
    // part1LinkSize only with part1Effect link.
    expect(screen.queryByLabelText('Piece 1 link size')).toBeNull();
    expect(screen.getByText('1 hidden field')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About Piece 1' })).toBeTruthy();
  });

  it('shows part1LinkSize once part1Effect is link', () => {
    setup({ variant: 'htmlTagged', part1Effect: 'link' });
    expect(screen.getByLabelText('Piece 1 link size')).toBeTruthy();
    expect(screen.queryByText(/hidden field/)).toBeNull();
  });

  it('singular text for one hidden field', () => {
    setup({ variant: 'htmlTagged' });
    expect(screen.getByText('1 hidden field')).toBeTruthy();
  });

  it('collapsing a group hides its fields, keeps it on reselect and applies to the other annotation', async () => {
    const { harness, select, user } = setup({ variant: 'htmlTagged' });
    await user.click(screen.getByRole('button', { name: 'Show or hide Piece 1' }));
    const toggle = screen.getByRole('button', { name: 'Show or hide Piece 1' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Piece 1 text')).toBeNull();
    expect(screen.getByLabelText('Piece 2 text')).toBeTruthy();
    // The focus stays on the toggle.
    expect(document.activeElement).toBe(toggle);
    expect(
      harness.ui.collapsed.value.has(
        sectionKey({ kind: 'fieldGroup', id: 'deco/decorated/piece1' }),
      ),
    ).toBe(true);
    // No undo entry.
    expect(harness.store.canUndo.value).toBe(false);

    // Another annotation of the same type is also collapsed in that group.
    act(() => {
      harness.actions.setFieldValue('A2', 'variant', 'htmlTagged');
    });
    select('A2');
    expect(
      screen
        .getByRole('button', { name: 'Show or hide Piece 1' })
        .getAttribute('aria-expanded'),
    ).toBe('false');

    // Reselecting the first marking keeps it collapsed.
    select('A1');
    expect(
      screen
        .getByRole('button', { name: 'Show or hide Piece 1' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    // Expanding again shows the fields.
    await user.click(screen.getByRole('button', { name: 'Show or hide Piece 1' }));
    expect(screen.getByLabelText('Piece 1 text')).toBeTruthy();
  });

  it('Enter and Space toggle the subheading from the keyboard', async () => {
    const { user } = setup({ variant: 'htmlTagged' });
    const toggle = screen.getByRole('button', { name: 'Show or hide Piece 2' });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(toggle);
  });

  it('Show lists every hidden field and resets on a new selection', async () => {
    const { harness, select, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByLabelText('Piece 1 text')).toBeTruthy();
    expect(screen.getByLabelText('Piece 2 effect')).toBeTruthy();
    expect(hiddenLine(5)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
    expect(harness.store.canUndo.value).toBe(false);

    select('A2');
    expect(screen.queryByLabelText('Piece 1 text')).toBeNull();
    expect(hiddenLine(5)).toBeTruthy();
  });

  it('a hidden field with a pending item of its own shows without Show', () => {
    // A value outside the options is a pending item on the field `part1Effect`.
    setup({}, {}, { part1Effect: 'weird' });
    expect(screen.getAllByLabelText(/Piece 1 effect/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Piece 1 text')).toBeNull();
  });

  it('in the review, a hidden field changed by the proposal shows with its mark', () => {
    setup(
      {},
      {
        extension: {
          mark: (_entity: string, field: string) =>
            field === 'values.part2Text' ? <span data-testid="mark">changed</span> : null,
        },
      },
    );
    expect(screen.getByTestId('mark')).toBeTruthy();
    expect(screen.getByLabelText('Piece 2 text')).toBeTruthy();
    expect(screen.queryByLabelText('Piece 1 text')).toBeNull();
  });

  it('editing variant back to plain keeps the hidden values in the annotation', async () => {
    const { harness, user } = setup({ variant: 'htmlTagged', part1Text: 'kept' });
    expect(screen.getByLabelText('Piece 1 text')).toHaveProperty('value', 'kept');
    const variant = within(screen.getByRole('group', { name: 'Variant' }));
    await user.click(variant.getByRole('button', { name: 'plain' }));
    expect(screen.queryByLabelText('Piece 1 text')).toBeNull();
    expect(annotationOf(harness.project(), 'A1').values?.part1Text).toBe('kept');
  });
});
