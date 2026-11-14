import { act, cleanup, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { citationUrl, type CitationTarget } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { CitationChip } from '../../src/ui/comments/CitationChip';
import { ThreadView } from '../../src/ui/comments/ThreadView';
import { Markdown } from '../../src/ui/markdown/Markdown';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, message, sampleThread } from '../model/threadFixtures';
import { createHarness, type Harness } from './harness';

// Live citation chip in messages (Comments stage, CM5, decisions 28 and 29).

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
  setIdentity('Marina Alves', 'marina@example.com');
});
afterEach(() => {
  cleanup();
  clearIdentity();
});

const urlOf = (h: Harness, target: CitationTarget): string => {
  const url = citationUrl(
    h.context.session.storage.folderName ?? 'project',
    h.project(),
    [],
    target,
  );
  if (url === null) throw new Error('target without URL');
  return url;
};

function renderChip(h: Harness, url: string, label = 'fallback') {
  return render(
    <EditorContext.Provider value={h.context}>
      <CitationChip url={url} label={label} />
    </EditorContext.Provider>,
  );
}

describe('CitationChip', () => {
  it('shows the live name of the target, with the accessible name "<name>, citation"', () => {
    const h = createHarness(sampleProject());
    renderChip(h, urlOf(h, { kind: 'marking', id: 'M1' }), 'old name');
    const chip = screen.getByRole('button', {
      // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
      name: t('citation.chipLabel', { name: 'Porta' }),
    });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(chip.textContent).toBe('Porta');
    expect(chip.classList.contains('citation-chip')).toBe(true);
    expect(chip.classList.contains('citation-chip-broken')).toBe(false);
    expect(chip.getAttribute('type')).toBe('button');
  });

  it('renaming the target changes the chip', () => {
    const h = createHarness(sampleProject());
    const view = renderChip(h, urlOf(h, { kind: 'marking', id: 'M1' }));
    act(() => {
      h.actions.renameMarking('M1', 'Rear door');
    });
    view.rerender(
      <EditorContext.Provider value={h.context}>
        <CitationChip url={urlOf(h, { kind: 'marking', id: 'M1' })} label="fallback" />
      </EditorContext.Provider>,
    );
    expect(screen.getByRole('button').textContent).toBe('Rear door');
  });

  it('an unnamed target shows the translated neutral text', () => {
    const h = createHarness(sampleProject());
    renderChip(h, urlOf(h, { kind: 'marking', id: 'M4' }), '');
    expect(screen.getByRole('button').textContent).toBe(t('citation.unnamed'));
  });

  it('deleted target: struck-through chip with the fallback label and the tip', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M3' });
    act(() => {
      h.actions.removeMarking('M3');
    });
    renderChip(h, url, 'Old lock');
    const chip = screen.getByRole('button');
    expect(chip.textContent).toBe('Old lock');
    expect(chip.classList.contains('citation-chip-broken')).toBe(true);
    expect(chip.getAttribute('title')).toBe(t('citation.missing'));
  });

  it('clicking goes to the target; the broken chip goes nowhere', async () => {
    const h = createHarness(sampleProject());
    renderChip(h, urlOf(h, { kind: 'marking', id: 'M2' }));
    await userEvent.click(screen.getByRole('button'));
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    cleanup();
    h.ui.selection.value = null;
    renderChip(h, 'mapping://project/m/zzzz', 'lost');
    await userEvent.click(screen.getByRole('button'));
    expect(h.ui.selection.value).toBeNull();
  });
});

describe('chip in messages', () => {
  function thread(h: Harness, text: string) {
    return sampleThread({
      id: 'v1',
      messages: [message('m0', '2026-09-01T10:00:00.000Z', HUMAN, text)],
    });
  }

  it('the citation [label](mapping://…) becomes a chip inside the message text', async () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'marking', id: 'M1' });
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView thread={thread(h, `see [old](${url}) now`)} />
      </EditorContext.Provider>,
    );
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    const chip = screen.getByRole('button', { name: 'Porta, citation' });
    // pt-BR kept: shared fixture data asserted by tests/model (sampleProject)
    expect(chip.closest('p')?.textContent).toContain('see Porta now');
    await userEvent.click(chip);
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('Catalog link (mapping://spec/type) stays as it was: text, no chip', () => {
    const h = createHarness(sampleProject());
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView thread={thread(h, 'see [the button](mapping://project/M1)')} />
      </EditorContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: /citation/ })).toBeNull();
    expect(screen.getByText(/the button/)).toBeTruthy();
  });

  it('an agent message also has a chip', () => {
    const h = createHarness(sampleProject());
    const url = urlOf(h, { kind: 'container', id: 'I1' });
    render(
      <EditorContext.Provider value={h.context}>
        <ThreadView
          thread={sampleThread({
            messages: [message('m0', '2026-09-01T10:00:00.000Z', AGENT, `[x](${url})`)],
          })}
        />
      </EditorContext.Provider>,
    );
    expect(screen.getByRole('button', { name: /citation/ }).textContent).toBe(
      'lateral.jpg',
    );
  });
});

describe('Markdown › renderMapping', () => {
  it('calls the renderer before onLink, only for links that are not from the library', async () => {
    const calls: string[][] = [];
    const clicked: string[] = [];
    render(
      <Markdown
        text="[x](mapping://p/m/ab) and [y](mapping://spec/type) and [z](mapping://type)"
        onLink={(href) => clicked.push(href)}
        renderMapping={(href, label) => {
          calls.push([href, label]);
          return <b>chip:{label}</b>;
        }}
      />,
    );
    expect(calls).toEqual([['mapping://p/m/ab', 'x']]);
    expect(screen.getByText('chip:x')).toBeTruthy();
    await userEvent.click(screen.getByText('y'));
    expect(clicked).toEqual(['mapping://spec/type']);
  });

  it('if the renderer returns null, the usual link applies', async () => {
    const clicked: string[] = [];
    render(
      <Markdown
        text="[x](mapping://p/m/ab)"
        onLink={(href) => clicked.push(href)}
        renderMapping={() => null}
      />,
    );
    await userEvent.click(screen.getByText('x'));
    expect(clicked).toEqual(['mapping://p/m/ab']);
  });
});
