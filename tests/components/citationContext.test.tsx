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
  locale.value = 'en-US';
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
  it('returns the project in view, the folder name and the project lists', () => {
    const { harness, seen } = probe();
    const ctx = seen.current!;
    expect(ctx.project).toBe(harness.context.review.derived.shownProject.value);
    expect(ctx.projectName).toBe(harness.context.session.storage.folderName);
    expect(ctx.threads).toBe(harness.context.session.threads.list.value);
    expect(ctx.proposals).toEqual([]);
  });

  it('subjectOf is the thread subject (without markdown markup)', () => {
    const { seen } = probe();
    const thread = sampleThread({
      messages: [
        {
          id: 'x',
          author: { kind: 'human', name: 'M', email: 'm@x.com' },
          at: '2026-11-06T10:00:00.000Z',
          text: '**High** contrast',
          proposal: null,
        },
      ],
    });
    expect(seen.current!.subjectOf!(thread)).toBe('High contrast');
  });

  it('follows new threads without remounting', async () => {
    const { harness, seen } = probe();
    await harness.context.session.threads.create(sampleThread({ id: 'new1' }));
    await waitFor(() =>
      expect(seen.current!.threads.map((th) => th.id)).toEqual(['new1']),
    );
  });
});

describe('citationNameFallback', () => {
  it('is the translated neutral text (en-US and pt-BR)', () => {
    expect(citationNameFallback()).toBe(t('citation.unnamed'));
    expect(citationNameFallback()).toBe('(unnamed)');
    // pt-BR kept: the test checks that the fallback is translated
    locale.value = 'pt-BR';
    expect(citationNameFallback()).toBe('(sem nome)');
  });
});
