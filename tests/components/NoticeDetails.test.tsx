import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFieldValue, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { annotationOf, createHarness, renderLive } from './harness';
import { noticeProject } from './noticeFixtures';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function setup(annotationId: string, readOnly = false, emptyLegacy = false) {
  const base = noticeProject();
  const harness = createHarness(
    emptyLegacy ? setFieldValue(base, 'AA', 'legacyStyle', '') : base,
  );
  if (readOnly) harness.store.load(harness.project(), { readOnly: true });
  renderLive(harness, (p: Project) => (
    <AnnotationEditor
      project={p}
      annotation={annotationOf(p, annotationId)}
      visibleLayerIds={new Set(p.layers.map((l) => l.id))}
      onGoToAnnotation={vi.fn()}
      onShowLayer={vi.fn()}
      readOnly={harness.store.readOnly.value}
    />
  ));
}

describe('Details — specialization notices', () => {
  it('the type notice stays on top, with since and ref (ref in mono)', () => {
    setup('AA');
    const block = document.querySelector('.notice-block.notice-pending');
    if (!block) throw new Error('no type block');
    expect(block.textContent).toContain('Pending');
    // pt-BR kept: shared fixture data asserted by tests/model, tests/components (message of noticeFixtures)
    expect(block.textContent).toContain('O contrato aceita avatarVariant');
    expect(block.textContent).toContain('2026-11-04');
    expect(block.querySelector('.notice-ref')?.textContent).toBe('cross/sdui/alert.md');
    // The block comes before the fields.
    const grid = document.querySelector('.props');
    expect(
      block.compareDocumentPosition(grid as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('the header carries the type badge (highest severity)', () => {
    setup('AA');
    const header = document.querySelector('.annotation-header') as HTMLElement;
    expect(
      within(header).getByRole('img', { name: /^Notice Deprecated: Use variant\./ }),
    ).toBeTruthy();
  });

  it('the field notice stays below the control and the label gets the kind icon', () => {
    setup('AA');
    const line = document.querySelector('.notice-line.notice-deprecated');
    if (!line) throw new Error('no field line');
    expect(line.textContent).toContain('Use variant.');
    const value = line.closest('.props-value') as HTMLElement;
    expect(value.querySelector('input, textarea')).not.toBeNull();
    const label = screen.getByText('legacyStyle', { selector: 'label' });
    expect(
      label.closest('.props-label-cell')?.querySelector('.notice-label-icon'),
    ).not.toBeNull();
    // Field without a notice: the label cell does not get an icon either.
    const plain = screen.getByText('variant', { selector: 'label' });
    expect(
      plain.closest('.props-label-cell')?.querySelector('.notice-label-icon') ?? null,
    ).toBeNull();
  });

  it('the empty field with a notice still shows the line and the icon (decision 2 of #513)', () => {
    // The count and the Notices window only count the field with a value; the Details inform earlier.
    setup('AA', false, true);
    const input = screen.getByLabelText('legacyStyle') as HTMLInputElement;
    expect(input.value).toBe('');
    const line = document.querySelector('.notice-line.notice-deprecated');
    if (!line) throw new Error('no empty field line');
    expect(line.textContent).toContain('Use variant.');
    const label = screen.getByText('legacyStyle', { selector: 'label' });
    expect(
      label.closest('.props-label-cell')?.querySelector('.notice-label-icon'),
    ).not.toBeNull();
  });

  it('the column notice stays below the table and cites the column', () => {
    setup('AA');
    const line = document.querySelector('.notice-line.notice-diverges');
    if (!line) throw new Error('no column line');
    expect(line.textContent).toContain('handler');
    // pt-BR kept: shared fixture data asserted by tests/model, tests/components (message of noticeFixtures)
    expect(line.textContent).toContain('Nome diferente no contrato.');
    const table = screen.getByRole('table', { name: 'events' });
    expect(
      table.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('the notices also appear in read-only mode', () => {
    setup('AA', true);
    expect(document.querySelector('.notice-block.notice-pending')).not.toBeNull();
    expect(document.querySelector('.notice-line.notice-deprecated')).not.toBeNull();
    expect(document.querySelector('.notice-line.notice-diverges')).not.toBeNull();
  });

  it('the removed type shows the block and the annotation does not get the Incomplete badge', () => {
    setup('AG');
    expect(document.querySelector('.notice-block.notice-removed')).not.toBeNull();
    expect(screen.queryByText('Incomplete')).toBeNull();
    expect(document.querySelector('.issue-badge')).toBeNull();
  });

  it('the type without a notice shows nothing', () => {
    setup('AP');
    expect(
      document.querySelector('.notice-block, .notice-line, .notice-badge'),
    ).toBeNull();
  });
});
