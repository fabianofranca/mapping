import { cleanup, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { Breadcrumbs } from '../../src/ui/Breadcrumbs';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

// Text that is cut with an ellipsis in the narrow window carries the whole text in `title`
// (report of the guided round of the Parent marking stage, finding 1).

afterEach(cleanup);

describe('truncated text with a hint', () => {
  it('the layer without an annotation shows the whole sentence in a note, not in a truncated summary', () => {
    const harness = createHarness(sampleProject());
    renderLive(harness, (p) => {
      const m = p.markings.find((x) => x.id === 'M2');
      const image = p.containers.find((i) => i.id === m?.containerId);
      if (!m || !image) return null;
      return (
        <MarkingPanel
          project={p}
          marking={m}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    // M2 only has an annotation on L1: L2 shows the empty-layer note (CL1, 1.4), below the header
    // and outside `.layer-group-summary`, which is cut with an ellipsis.
    const note = screen.getByText(t('annotation.emptySection'));
    expect(note.classList.contains('layer-group-empty')).toBe(true);
    expect(note.closest('.layer-group-summary')).toBeNull();
  });

  it('each level of the path has the whole name in title', () => {
    const harness = createHarness(sampleProject());
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    renderLive(harness, () => <Breadcrumbs onSelect={() => undefined} />);
    const names = document.querySelectorAll('.crumb-name');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.getAttribute('title')).toBe(name.textContent);
  });
});
