import { cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPage,
  moveRootsToPage,
  setFieldValue,
  setTableCell,
  type SpecRefColumn,
  typeOfAnnotation,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { BacklinkList } from '../../src/ui/FieldEditors';
import { RefCell } from '../../src/ui/RefCell';
import { ReferencedByRow } from '../../src/ui/ReferencedBy';
import { TypedField } from '../../src/ui/TypedFields';
import { R1 } from '../model/refColumnFixtures';
import { world } from '../model/refAnnotationFixtures';
import { annotationOf, createHarness, renderLive, type Harness } from './harness';

// Following a ref or a backlink to an annotation of another page opens the preview (stage #883,
// PG3, decision 13); to one on the open page it behaves as before.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

/** AL points to AM (row R1) and to AM as a whole (`item`); `moved`: both live on page PG2. */
function linked(moved: boolean): Project {
  let p = world();
  p = setFieldValue(p, 'AL', 'item', { annotationId: 'AM' });
  p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
  if (!moved) return p;
  p = createPage(p, { id: 'PG2', name: 'Second' });
  return moveRootsToPage(p, ['I1'], 'PG2');
}

function expectPreviewed(h: Harness, annotationId: string) {
  expect(h.ui.refPreview.value?.annotationId).toBe(annotationId);
  expect(h.context.session.page.openId()).toBe('PG1');
  expect(h.ui.selection.value).toBeNull();
}

function refColumn(p: Project): SpecRefColumn {
  const annotation = annotationOf(p, 'AL');
  const table = typeOfAnnotation(p, annotation)?.type.fields.find(
    (f) => f.key === 'alvos',
  );
  const column =
    table?.type === 'table' ? table.columns.find((c) => c.key === 'alvo') : null;
  if (column?.type !== 'ref') throw new Error('ref column not found');
  return column;
}

describe('RefCell', () => {
  function cell(moved: boolean, onGo = vi.fn()) {
    const h = createHarness(linked(moved));
    renderLive(h, (p) => (
      <RefCell
        project={p}
        annotation={annotationOf(p, 'AL')}
        tableKey="alvos"
        rowId="L1"
        column={refColumn(p)}
        value={{ annotationId: 'AM', key: 'campos', rowId: 'R1' }}
        label="Alvo"
        readOnly={false}
        onSet={() => ({ ok: true }) as never}
        onGoToAnnotation={onGo}
      />
    ));
    return { h, onGo, user: userEvent.setup() };
  }

  it('Ctrl+click to another page opens the preview, keeps page and selection', async () => {
    const { h, onGo, user } = cell(true);
    await user.keyboard('{Control>}');
    await user.click(screen.getAllByRole('button', { name: /Alvo/ })[0]!);
    expectPreviewed(h, 'AM');
    expect(onGo).not.toHaveBeenCalled();
  });

  it('Ctrl+click on the same page calls the fallback and opens no preview', async () => {
    const { h, onGo, user } = cell(false);
    await user.keyboard('{Control>}');
    await user.click(screen.getAllByRole('button', { name: /Alvo/ })[0]!);
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(h.ui.refPreview.value).toBeNull();
  });
});

describe('TypedField ref', () => {
  function field(moved: boolean) {
    const h = createHarness(linked(moved));
    const onGo = vi.fn();
    renderLive(h, (p) => {
      const annotation = annotationOf(p, 'AL');
      const f = typeOfAnnotation(p, annotation)!.type.fields.find(
        (x) => x.key === 'item',
      )!;
      return (
        <TypedField
          field={f}
          project={p}
          annotation={annotation}
          readOnly={false}
          onGoToAnnotation={onGo}
        />
      );
    });
    return { h, onGo, user: userEvent.setup() };
  }

  it('"Go to target" on another page opens the preview', async () => {
    const { h, onGo, user } = field(true);
    await user.click(screen.getByRole('button', { name: 'Go to target' }));
    expectPreviewed(h, 'AM');
    expect(onGo).not.toHaveBeenCalled();
  });

  it('"Go to target" on the same page calls the fallback', async () => {
    const { h, onGo, user } = field(false);
    await user.click(screen.getByRole('button', { name: 'Go to target' }));
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(h.ui.refPreview.value).toBeNull();
  });

  it('picker "pick and go" to another page opens the preview', async () => {
    const h = createHarness(linked(true));
    const onGo = vi.fn();
    renderLive(h, (p) => {
      const annotation = annotationOf(p, 'AL');
      const f = typeOfAnnotation(p, annotation)!.type.fields.find(
        (x) => x.key === 'item',
      )!;
      return (
        <TypedField
          field={f}
          project={p}
          annotation={annotation}
          readOnly={false}
          onGoToAnnotation={onGo}
        />
      );
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /: item/i }));
    await screen.findByRole('dialog');
    // Ctrl+Enter picks the active option and goes to it.
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(h.ui.refPreview.value).not.toBeNull();
    expect(h.context.session.page.openId()).toBe('PG1');
    expect(h.ui.selection.value).toBeNull();
    expect(onGo).not.toHaveBeenCalled();
  });
});

describe('backlinks', () => {
  function backlinks(moved: boolean) {
    const h = createHarness(linked(moved));
    const onGo = vi.fn();
    return { h, onGo, user: userEvent.setup() };
  }

  it('Referenced by row: a source on another page opens the preview', async () => {
    const { h, onGo, user } = backlinks(true);
    renderLive(h, (p) => (
      <ReferencedByRow
        project={p}
        annotation={annotationOf(p, 'AM')}
        onGoToAnnotation={onGo}
      />
    ));
    await user.click(screen.getAllByRole('button')[0]!);
    expectPreviewed(h, 'AL');
    expect(onGo).not.toHaveBeenCalled();
  });

  it('Referenced by row: a source on the open page calls the fallback', async () => {
    const { h, onGo, user } = backlinks(false);
    renderLive(h, (p) => (
      <ReferencedByRow
        project={p}
        annotation={annotationOf(p, 'AM')}
        onGoToAnnotation={onGo}
      />
    ));
    await user.click(screen.getAllByRole('button')[0]!);
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(h.ui.refPreview.value).toBeNull();
  });

  it('BacklinkList: a source on another page opens the preview', async () => {
    const { h, onGo, user } = backlinks(true);
    renderLive(h, (p) => (
      <BacklinkList
        project={p}
        backlinks={[
          {
            source: annotationOf(p, 'AL'),
            ref: { annotationId: 'AM', key: 'campos', rowId: 'R1' },
          } as never,
        ]}
        onGoToAnnotation={onGo}
      />
    ));
    await user.click(screen.getByRole('button'));
    expectPreviewed(h, 'AL');
    expect(onGo).not.toHaveBeenCalled();
  });

  it('works without an EditorContext: only the fallback runs', async () => {
    const onGo = vi.fn();
    const p = linked(true);
    render(
      <BacklinkList
        project={p}
        backlinks={[
          {
            source: annotationOf(p, 'AL'),
            ref: { annotationId: 'AM', key: 'campos', rowId: 'R1' },
          } as never,
        ]}
        onGoToAnnotation={onGo}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});
