import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { citationUrl } from '../../src/model';
import { composerOpen } from '../../src/store/composerBridge';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { replyDraftKey, setDraft } from '../../src/store/threadUi';
import { EditorContext } from '../../src/ui/EditorContext';
import { Composer, type ComposerTarget } from '../../src/ui/comments/Composer';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';
import { chipsOf, keyDown, typeIn } from './composerHelpers';
import { createHarness } from './harness';

// O compositor com o editor de citações (etapa Comentários, CM5): âncora do `@`, ponte,
// rascunho com chips.

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => {
  cleanup();
  clearIdentity();
});

function mount(target: ComposerTarget, readOnly = false) {
  const harness = createHarness(sampleProject(), readOnly);
  render(
    <EditorContext.Provider value={harness.context}>
      <Composer target={target} />
    </EditorContext.Provider>,
  );
  return harness;
}

describe('Composer › o @', () => {
  it('conversa nova: o grupo "aqui" é o do item da âncora', () => {
    mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } });
    typeIn(screen.getByRole('textbox'), '@');
    const first = document.querySelector('.cite-picker-group');
    expect(first?.textContent).toBe(t('citation.group.here'));
    expect(screen.getAllByRole('option')[0]!.textContent).toContain('tipo');
  });

  it('resposta: usa a âncora da conversa e não oferece a própria conversa', async () => {
    const harness = createHarness(sampleProject());
    await harness.context.session.threads.create(
      sampleThread({
        id: 'r1',
        anchor: { kind: 'marking', id: 'M1' },
        messages: [
          {
            id: 'r1m',
            author: { kind: 'human', name: 'M', email: 'm@x.com' },
            at: '2026-09-01T10:00:00.000Z',
            text: 'Conversa própria',
            proposal: null,
          },
        ],
      }),
    );
    render(
      <EditorContext.Provider value={harness.context}>
        <Composer target={{ kind: 'reply', threadId: 'r1' }} />
      </EditorContext.Provider>,
    );
    typeIn(screen.getByRole('textbox'), '@');
    expect(document.querySelector('.cite-picker-group')?.textContent).toBe(
      t('citation.group.here'),
    );
    expect(screen.queryByRole('option', { name: /Conversa própria/ })).toBeNull();
  });
});

describe('Composer › rascunho e envio', () => {
  it('o rascunho guardado volta com os chips', async () => {
    const harness = createHarness(sampleProject());
    const url = citationUrl(
      harness.context.session.storage.folderName ?? 'projeto',
      harness.project(),
      [],
      { kind: 'marking', id: 'M2' },
    )!;
    setDraft(harness.ui, replyDraftKey('r9'), `olha [Maçaneta](${url}) aqui`);
    render(
      <EditorContext.Provider value={harness.context}>
        <Composer target={{ kind: 'reply', threadId: 'r9' }} />
      </EditorContext.Provider>,
    );
    const editor = screen.getByRole('textbox');
    expect(chipsOf(editor).map((c) => c.textContent)).toEqual(['Maçaneta']);
  });

  it('enviar grava o markdown com a citação e limpa o campo', async () => {
    const harness = mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } });
    const editor = screen.getByRole('textbox');
    typeIn(editor, 'veja @maç');
    keyDown(editor, 'Enter');
    keyDown(editor, 'Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    const text = harness.context.session.threads.list.value[0]!.messages[0]!.text;
    expect(text).toMatch(/^veja \[Maçaneta\]\(mapping:\/\/[^)]+\)$/);
    await waitFor(() => expect(harness.ui.threadDrafts.value.size).toBe(0));
  });
});

describe('Composer › ponte', () => {
  it('registra-se quando o campo está à mostra', () => {
    mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } });
    expect(composerOpen.value).toBe(true);
  });

  it('cópia somente leitura ou sem identidade: nada registrado', () => {
    mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } }, true);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(composerOpen.value).toBe(false);
    cleanup();
    clearIdentity();
    mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(composerOpen.value).toBe(false);
  });
});
