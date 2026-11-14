import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setViewMode } from '../../src/store/ui';
import { EditorContext } from '../../src/ui/EditorContext';
import { StatusBar } from '../../src/ui/StatusBar';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

describe('status bar: view mode', () => {
  it('says the mode is view-only while on, and disappears on exit', () => {
    const h = createHarness(sampleProject());
    renderLive(h, () => (
      <EditorContext.Provider value={h.context}>
        <StatusBar />
      </EditorContext.Provider>
    ));
    expect(screen.queryByText(t('status.viewMode'))).toBeNull();
    act(() => setViewMode(h.ui, true));
    expect(screen.getByText(t('status.viewMode'))).toBeTruthy();
    act(() => setViewMode(h.ui, false));
    expect(screen.queryByText(t('status.viewMode'))).toBeNull();
  });
});
