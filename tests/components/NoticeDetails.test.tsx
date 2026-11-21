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

describe('Details — no specialization notices (stage #2085)', () => {
  const NOTICE_UI = '.notice-block, .notice-line, .notice-badge, .notice-label-icon';

  it.each(['AA', 'AG', 'AP'])('the annotation %s shows no notice at all', (id) => {
    setup(id);
    expect(document.querySelector(NOTICE_UI)).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('the header has no type badge', () => {
    setup('AA');
    const header = document.querySelector('.annotation-header') as HTMLElement;
    expect(within(header).queryByRole('img', { name: /^Notice / })).toBeNull();
  });

  it('the fields stay: the label has no icon and the control is still there', () => {
    setup('AA');
    const label = screen.getByText('legacyStyle', { selector: 'label' });
    expect(
      label.closest('.props-label-cell')?.querySelector('.notice-label-icon') ?? null,
    ).toBeNull();
    expect(screen.getByLabelText('legacyStyle')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'events' })).toBeTruthy();
  });

  it('read-only mode and the empty field show no notice either', () => {
    setup('AA', true);
    expect(document.querySelector(NOTICE_UI)).toBeNull();
    cleanup();
    setup('AA', false, true);
    expect(document.querySelector(NOTICE_UI)).toBeNull();
  });

  it('the removed type does not get the Incomplete badge', () => {
    setup('AG');
    expect(screen.queryByText('Incomplete')).toBeNull();
    expect(document.querySelector('.issue-badge')).toBeNull();
  });
});
