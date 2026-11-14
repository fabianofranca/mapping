import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { citationUrl, type ThreadAnchor } from '../../src/model';
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

// The composer with the citation editor (Comments stage, CM5): `@` anchor, bridge,
// draft with chips.

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
  setIdentity('Marina Alves', 'marina@example.com');
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

describe('Composer › the @', () => {
  it('new thread: the "here" group is the one of the anchor item', () => {
    mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } });
    typeIn(screen.getByRole('textbox'), '@');
    const first = document.querySelector('.cite-picker-group');
    expect(first?.textContent).toBe(t('citation.group.here'));
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(screen.getAllByRole('option')[0]!.textContent).toContain('tipo');
  });

  it('reply: uses the thread anchor and does not offer the thread itself', async () => {
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
            text: 'Own thread',
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
    expect(screen.queryByRole('option', { name: /Own thread/ })).toBeNull();
  });
});

describe('Composer › draft and sending', () => {
  it('the stored draft comes back with the chips', async () => {
    const harness = createHarness(sampleProject());
    const url = citationUrl(
      harness.context.session.storage.folderName ?? 'project',
      harness.project(),
      [],
      { kind: 'marking', id: 'M2' },
    )!;
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    setDraft(harness.ui, replyDraftKey('r9'), `look [Maçaneta](${url}) here`);
    render(
      <EditorContext.Provider value={harness.context}>
        <Composer target={{ kind: 'reply', threadId: 'r9' }} />
      </EditorContext.Provider>,
    );
    const editor = screen.getByRole('textbox');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(chipsOf(editor).map((c) => c.textContent)).toEqual(['Maçaneta']);
  });

  it('sending saves the markdown with the citation and clears the field', async () => {
    const harness = mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } });
    const editor = screen.getByRole('textbox');
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    typeIn(editor, 'see @maç');
    keyDown(editor, 'Enter');
    keyDown(editor, 'Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(harness.context.session.threads.list.value).toHaveLength(1),
    );
    const text = harness.context.session.threads.list.value[0]!.messages[0]!.text;
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(text).toMatch(/^see \[Maçaneta\]\(mapping:\/\/[^)]+\)$/);
    await waitFor(() => expect(harness.ui.threadDrafts.value.size).toBe(0));
  });
});

describe('Composer › bridge', () => {
  it('registers itself when the field is shown', () => {
    mount({ kind: 'new', anchor: { kind: 'marking', id: 'M1' } });
    expect(composerOpen.value).toBe(true);
  });

  it('read-only copy or no identity: nothing registered', () => {
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

describe('Composer › focus', () => {
  it('repositioning the draft (new anchor) returns the focus to the composer', () => {
    const harness = createHarness(sampleProject());
    const view = (anchor: ThreadAnchor) => (
      <EditorContext.Provider value={harness.context}>
        <Composer target={{ kind: 'new', anchor }} autoFocus />
      </EditorContext.Provider>
    );
    const { rerender } = render(view({ kind: 'point', containerId: null, x: 1, y: 1 }));
    const field = screen.getByRole('textbox');
    expect(document.activeElement).toBe(field);
    (document.activeElement as HTMLElement).blur();
    rerender(view({ kind: 'point', containerId: null, x: 5, y: 5 }));
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });
});
