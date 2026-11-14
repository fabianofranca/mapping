// The whole annotation as the target of `ref` (stage #679, CF3): the field and cell selector, the value,
// the "Referenced by" row and the deletion of the target. The model (CF1) already resolves and validates.
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTableRow,
  removeAnnotation,
  setFieldValue,
  typeOfAnnotation,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { ListView } from '../../src/ui/ListView';
import { EditorContext } from '../../src/ui/EditorContext';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { TypedField } from '../../src/ui/TypedFields';
import { world } from '../model/refAnnotationFixtures';
import { annotationOf, createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

/** A field of the AL list (the `ref` `item`, `mix`… or the `itens` table). */
function setupField(key: string, project: Project = world()) {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  renderLive(harness, (p) => {
    const annotation = annotationOf(p, 'AL');
    const field = typeOfAnnotation(p, annotation)?.type.fields.find((f) => f.key === key);
    if (!field) throw new Error(`field ${key} does not exist`);
    return (
      <TypedField
        field={field}
        project={p}
        annotation={annotation}
        readOnly={false}
        onGoToAnnotation={onGoToAnnotation}
      />
    );
  });
  return { harness, onGoToAnnotation, user: userEvent.setup() };
}

function setupEditor(id: string, project: Project) {
  const harness = createHarness(project);
  const onGoToAnnotation = vi.fn();
  renderLive(harness, (p) =>
    p.annotations.some((a) => a.id === id) ? (
      <AnnotationEditor
        project={p}
        annotation={annotationOf(p, id)}
        visibleLayerIds={new Set(p.layers.map((l) => l.id))}
        onGoToAnnotation={onGoToAnnotation}
        onShowLayer={vi.fn()}
        readOnly={false}
      />
    ) : null,
  );
  return { harness, onGoToAnnotation, user: userEvent.setup() };
}

const options = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('option')
    .map((o) => o.textContent ?? '');

describe('ref selector with accepts.annotations', () => {
  it('field: lists the accepted annotations with the label and the type, without itself and without non-accepted types', async () => {
    const { user } = setupField('item');
    await user.click(screen.getByRole('button', { name: /^Choose: Item/i }));
    const dialog = await screen.findByRole('dialog');
    const texts = options(dialog);
    expect(texts).toHaveLength(3);
    // pt-BR kept: shared fixture data asserted by tests/model (names and types of refAnnotationFixtures)
    expect(texts[0]).toMatch(/^Cliente.*Modelo$/);
    expect(texts[1]).toMatch(/^Modelo.*Modelo$/);
    expect(texts[2]).toMatch(/^Avulso.*Avulso$/);
    // No target is "free", the list itself (AL) and the model of another specialization (AX) are not included.
    expect(texts.join('|')).not.toMatch(/free|Lista|Alheio/);
    expect(within(dialog).getByText('accepts: Modelo and Avulso')).toBeTruthy();
  });

  it('choosing saves { annotationId } in one undo entry', async () => {
    const { harness, user } = setupField('item');
    await user.click(screen.getByRole('button', { name: /^Choose: Item/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('option', { name: /Avulso/ }));
    expect(annotationOf(harness.project(), 'AL').values?.item).toEqual({
      annotationId: 'AV',
    });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The value shows the target's label.
    expect(
      screen.getByRole('button', { name: /^Avulso .*: item/i }).textContent,
    ).toContain('Avulso');
    expect(harness.store.undo()).toBe(true);
    expect(annotationOf(harness.project(), 'AL').values?.item).toBeUndefined();
  });

  it("the type filter shows only the type's targets; the tabs are All and one per type", async () => {
    const { user } = setupField('item');
    await user.click(screen.getByRole('button', { name: /^Choose: Item/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All', 'Modelo', 'Avulso']);
    await user.click(within(dialog).getByRole('tab', { name: 'Avulso' }));
    expect(options(dialog)).toHaveLength(1);
    expect(options(dialog)[0]).toMatch(/^Avulso/);
    await user.click(within(dialog).getByRole('tab', { name: 'Modelo' }));
    expect(options(dialog)).toHaveLength(2);
  });

  it('with tags and annotations, the tag filter does not catch the annotation and the type one does', async () => {
    const { user } = setupField('mix');
    await user.click(screen.getByRole('button', { name: /^Choose: Mix/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All', 'data-field', 'Modelo']);
    await user.click(within(dialog).getByRole('tab', { name: 'data-field' }));
    expect(options(dialog).join('|')).not.toMatch(/^Cliente(?!\.)|\|Modelo/);
    expect(options(dialog)).toHaveLength(2);
    await user.click(within(dialog).getByRole('tab', { name: 'Modelo' }));
    expect(options(dialog)).toHaveLength(2);
    expect(options(dialog).join('|')).not.toContain('Cliente.');
  });

  it('table cell: the same selector, and choosing saves { annotationId } in the cell', async () => {
    const { harness, user } = setupField(
      'itens',
      addTableRow(world(), 'AL', 'itens', 'L1'),
    );
    await user.click(screen.getByRole('button', { name: /^Choose: Alvo/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('picker-compact');
    expect(options(dialog)).toHaveLength(3);
    await user.click(within(dialog).getByRole('option', { name: /Avulso/ }));
    const rows = annotationOf(harness.project(), 'AL').values?.itens as Record<
      string,
      unknown
    >[];
    expect(rows[0]?.alvo).toEqual({ annotationId: 'AV' });
  });

  it('deleted target: the value shows "(broken reference)" and the pending mark', () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'item', { annotationId: 'AV' });
    p = removeAnnotation(p, 'AV');
    setupEditor('AL', p);
    const button = screen.getByRole('button', { name: /^Broken reference: item/i });
    expect(button.textContent).toContain('(broken reference)');
    expect(button.className).toContain('is-broken');
  });
});

describe('"Referenced by" row', () => {
  const pointing = () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'item', { annotationId: 'AM' });
    return setFieldValue(p, 'AL2', 'item', { annotationId: 'AM' });
  };

  it('appears on the target with each origin (type · label) and the marking, in a button that selects it', async () => {
    const { onGoToAnnotation, user } = setupEditor('AM', pointing());
    const heading = screen.getByText('Referenced by');
    const row = heading.closest('.annotation-referenced') as HTMLElement;
    expect(row).toBeTruthy();
    const buttons = within(row).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toContain('Lista');
    expect(buttons[0]?.getAttribute('aria-label') ?? buttons[0]?.title).toMatch(/Lista/);
    await user.click(buttons[1]!);
    expect(onGoToAnnotation).toHaveBeenCalledWith(expect.objectContaining({ id: 'AL2' }));
  });

  it('the group has an accessible name', () => {
    setupEditor('AM', pointing());
    expect(screen.getByRole('group', { name: 'Referenced by' })).toBeTruthy();
  });

  it('does not appear without a reference to the whole annotation', () => {
    setupEditor('AM', world());
    expect(screen.queryByText('Referenced by')).toBeNull();
  });

  it('does not appear for a field or row reference (those stay where they are)', () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'mix', { annotationId: 'AM', key: 'campos', rowId: 'R1' });
    setupEditor('AM', p);
    expect(screen.queryByText('Referenced by')).toBeNull();
  });

  it('the origin that points twice appears only once', () => {
    let p = pointing();
    p = setFieldValue(p, 'AL', 'mix', { annotationId: 'AM' });
    setupEditor('AM', p);
    const row = screen.getByText('Referenced by').closest('.annotation-referenced');
    expect(within(row as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });
});

describe('Lista', () => {
  it('the content column shows the label of the whole-annotation target', () => {
    const harness = createHarness(
      setFieldValue(world(), 'AL', 'item', { annotationId: 'AM' }),
    );
    render(
      <EditorContext.Provider value={harness.context}>
        <ListView onSelect={vi.fn()} />
      </EditorContext.Provider>,
    );
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('Lista'));
    expect(row?.textContent).toContain('Cliente');
    expect(row?.textContent).not.toContain('annotationId');
  });
});
