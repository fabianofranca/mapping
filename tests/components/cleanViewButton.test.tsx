import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { CleanViewButton, ModeButtons } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

describe('Ver limpo: botão', () => {
  it('liga e desliga o Ver limpo, com aria-pressed, e desabilita Desenhar enquanto ligado', () => {
    const h = createHarness(sampleProject());
    renderLive(h, () => (
      <EditorContext.Provider value={h.context}>
        <CleanViewButton />
        <ModeButtons />
      </EditorContext.Provider>
    ));
    const button = screen.getByRole('button', { name: t('view.cleanView') });
    const draw = screen.getByRole('button', { name: t('editor.modeDraw') });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(draw.hasAttribute('disabled')).toBe(false);

    fireEvent.click(button);
    expect(h.ui.cleanView.value).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(draw.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(h.ui.cleanView.value).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
