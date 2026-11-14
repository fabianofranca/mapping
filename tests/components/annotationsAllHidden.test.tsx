import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { AnnotationsPanel } from '../../src/ui/AnnotationsPanel';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

afterEach(cleanup);

describe('Annotations: all layers hidden', () => {
  it('Show all moves focus to a control of its own section, not to the body', () => {
    const h = createHarness(sampleProject());
    const project = h.project();
    const marking = project.markings[0]!;
    const tree = (layers: typeof project.layers) => (
      <EditorContext.Provider value={h.context}>
        <AnnotationsPanel
          project={project}
          marking={marking}
          layers={layers}
          readOnly={false}
          onShowLayer={() => undefined}
          onGoToAnnotation={() => undefined}
          focusAnnotation={null}
          onFocusDone={() => undefined}
        />
      </EditorContext.Provider>
    );
    const view = render(tree([]));
    const button = screen.getByRole('button', { name: t('layer.showAll') });
    button.focus();
    expect(document.activeElement).toBe(button);
    act(() => void fireEvent.click(button));
    // The layers show up again and the button leaves the DOM.
    view.rerender(tree(project.layers));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.closest('.annotations')).not.toBeNull();
  });
});
