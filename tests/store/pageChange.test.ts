import { describe, expect, it, vi } from 'vitest';
import { moveMarking, projectIndex } from '../../src/model';
import { pageOfChange } from '../../src/store/pageChange';
import { sampleProject } from '../model/fixtures';
import { pagesProject } from './pageHarness';

vi.mock('../../src/model', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/model')>();
  return { ...original, projectIndex: vi.fn(original.projectIndex) };
});

// Where an undo/redo happened (stage #883, PG2): a project with a single page has nowhere else to
// tell about, so the comparison does not even build the indexes.

describe('pageOfChange', () => {
  it('a project with a single page: nothing to tell, without building any index', () => {
    const from = sampleProject();
    const to = moveMarking(from, 'M1', 1, 1);
    vi.mocked(projectIndex).mockClear();
    expect(pageOfChange(from, to, from.pages[0]?.id ?? '')).toBeNull();
    expect(projectIndex).not.toHaveBeenCalled();
  });

  it('with two pages it still reports a change that is wholly on the other page', () => {
    const from = pagesProject();
    const to = moveMarking(from, 'K', 10, 10);
    expect(pageOfChange(from, to, 'PG1')).toBe('Page 2');
    expect(pageOfChange(from, to, 'PG2')).toBeNull();
  });
});
