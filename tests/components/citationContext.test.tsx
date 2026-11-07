import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import {
  citationNameFallback,
  useCitationContext,
  type CitationUiContext,
} from '../../src/ui/comments/citationContext';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';
import { createHarness } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function probe(harness = createHarness(sampleProject())) {
  const seen: { current: CitationUiContext | null } = { current: null };
  function Probe() {
    seen.current = useCitationContext();
    return null;
  }
  render(
    <EditorContext.Provider value={harness.context}>
      <Probe />
    </EditorContext.Provider>,
  );
  return { harness, seen };
}

describe('useCitationContext', () => {
  it('devolve o projeto à vista, o nome da pasta e as listas do projeto', () => {
    const { harness, seen } = probe();
    const ctx = seen.current!;
    expect(ctx.project).toBe(harness.context.review.derived.shownProject.value);
    expect(ctx.projectName).toBe(harness.context.session.storage.folderName);
    expect(ctx.threads).toBe(harness.context.session.threads.list.value);
    expect(ctx.proposals).toEqual([]);
  });

  it('subjectOf é o assunto da conversa (sem marcação do markdown)', () => {
    const { seen } = probe();
    const thread = sampleThread({
      messages: [
        {
          id: 'x',
          author: { kind: 'human', name: 'M', email: 'm@x.com' },
          at: '2026-11-06T10:00:00.000Z',
          text: '**Alto** contraste',
          proposal: null,
        },
      ],
    });
    expect(seen.current!.subjectOf!(thread)).toBe('Alto contraste');
  });

  it('acompanha as conversas novas sem remontar', async () => {
    const { harness, seen } = probe();
    await harness.context.session.threads.create(sampleThread({ id: 'nova1' }));
    await waitFor(() =>
      expect(seen.current!.threads.map((th) => th.id)).toEqual(['nova1']),
    );
  });
});

describe('citationNameFallback', () => {
  it('é o texto neutro traduzido', () => {
    expect(citationNameFallback()).toBe(t('citation.unnamed'));
    locale.value = 'en-US';
    expect(citationNameFallback()).toBe('(unnamed)');
  });
});
