import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ViewModeButton, ModeButtons } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

describe('Modo visualização: botão', () => {
  it('liga e desliga o modo visualização, com aria-pressed, e desabilita Desenhar enquanto ligado', () => {
    const h = createHarness(sampleProject());
    renderLive(h, () => (
      <EditorContext.Provider value={h.context}>
        <ViewModeButton />
        <ModeButtons />
      </EditorContext.Provider>
    ));
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    const draw = screen.getByRole('button', { name: t('editor.modeDraw') });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(draw.hasAttribute('disabled')).toBe(false);

    fireEvent.click(button);
    expect(h.ui.viewMode.value).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(draw.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(h.ui.viewMode.value).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
