import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createArrow,
  createMarking,
  createPage,
  moveRootsToPage,
  renameMarking,
  renamePage,
  validateProject,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { propose, changeOf } from '../model/proposalFixtures';
import { pagesProject, rectOf } from './pageHarness';
import { openHarness } from './proposalHarness';

// The review across pages (stage #883, PG4, decision 16): the review keeps the Completa locked
// and the page selector free; a proposal with changes on two pages is reviewed switching pages and
// applies as a whole; accepting only part of a group that changes page is an invalid set.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => localStorage.clear());

/** Renames M1 (PG1) and M5 (PG2), and creates the page PG4 with a new root on it. */
function twoPageEdit(): { base: Project; after: Project } {
  const base = pagesProject();
  let after = renameMarking(base, 'M1', 'On page 1');
  after = renameMarking(after, 'M5', 'On page 2');
  after = renamePage(after, 'PG3', 'Spare');
  return { base, after };
}

describe('review on pages: perspective locked, page selector free', () => {
  it('opening the review leaves the Completa locked and the page selector free', async () => {
    const { base, after } = twoPageEdit();
    const h = await openHarness({ project: base, proposals: [propose(base, after)] });
    const { session, review } = h;
    expect(session.perspective.open('V')).toBe(true);
    expect(review.open('P1').ok).toBe(true);
    expect(session.perspective.id.value).toBeNull();
    expect(session.perspective.locked.value).toBe(true);
    expect(session.perspective.open('W')).toBe(false);
    expect(session.page.open('PG2')).toBe(true);
    expect(session.page.id.value).toBe('PG2');
    expect(session.page.open('PG3')).toBe(true);
    expect(session.perspective.locked.value).toBe(true);
    expect(session.perspective.id.value).toBeNull();
    review.close();
    expect(session.perspective.locked.value).toBe(false);
  });
});

describe('review on pages: the shown project follows the open page', () => {
  it('the proposal with changes on two pages is reviewed switching pages, then applies', async () => {
    const { base, after } = twoPageEdit();
    const h = await openHarness({ project: base, proposals: [propose(base, after)] });
    const { session, review } = h;
    expect(review.open('P1').ok).toBe(true);
    const names = (id: string) =>
      review.derived.shownProject.value?.markings.find((m) => m.id === id)?.name;
    expect(session.page.open('PG1')).toBe(true);
    expect(names('M1')).toBe('On page 1');
    expect(names('M5')).toBeUndefined();
    expect(session.page.open('PG2')).toBe(true);
    expect(names('M5')).toBe('On page 2');
    expect(names('M1')).toBeUndefined();
    // The uncut project keeps both pages for the review's lookups.
    expect(review.derived.shownAcrossPages.value?.markings.map((m) => m.id)).toEqual(
      expect.arrayContaining(['M1', 'M5']),
    );

    const decision = await review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(decision?.ok).toBe(true);
    expect(review.derived.canApply.value).toBe(true);
    const result = await review.apply();
    expect(result).toMatchObject({ ok: true });
    const project = session.store.project.value;
    if (!project) throw new Error('no project');
    expect(project.markings.find((m) => m.id === 'M1')?.name).toBe('On page 1');
    expect(project.markings.find((m) => m.id === 'M5')?.name).toBe('On page 2');
    expect(project.pages.find((g) => g.id === 'PG3')?.name).toBe('Spare');
    expect(validateProject(project)).toEqual([]);
  });

  it('the changes of the page entity are in the Project group, with counts', async () => {
    const { base, after } = twoPageEdit();
    const proposal = propose(base, after);
    const h = await openHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    const rename = changeOf(proposal, 'page', 'PG3', 'name');
    const tree = h.review.derived.tree.value;
    expect(tree?.changeIdsOf({ level: 'project', id: null })).toContain(rename.id);
    expect(h.review.derived.levels.value.get('project:')).toMatchObject({
      total: 1,
      undecided: 1,
    });
    // A page change never sits in the entity index of the Details panel.
    expect(h.review.derived.fieldIndex.value.entities.has('PG3')).toBe(false);
    await h.review.decide({ level: 'change', id: rename.id }, 'accepted');
    expect(h.review.derived.levels.value.get('project:')).toMatchObject({ accepted: 1 });
  });
});

describe('review on pages: accepting part of a group that changes page', () => {
  /** Canvas markings A and B on PG1 joined by an arrow; the proposal moves both to PG2. */
  function groupScenario() {
    let base = createPage(pagesProject(), { id: 'PG4', name: 'Page 4' });
    base = createMarking(base, {
      id: 'A',
      containerId: null,
      rect: rectOf(6000, 100, 300, 300),
    });
    base = createMarking(base, {
      id: 'B',
      containerId: null,
      rect: rectOf(6500, 100, 300, 300),
    });
    base = createArrow(base, { id: 'AR', from: 'A', to: 'B' });
    const proposal = propose(base, moveRootsToPage(base, ['A', 'B'], 'PG4'));
    return {
      base,
      proposal,
      a: changeOf(proposal, 'marking', 'A', 'page'),
      b: changeOf(proposal, 'marking', 'B', 'page'),
    };
  }

  it('is an invalid set with both exits and does not apply', async () => {
    const { base, proposal, a, b } = groupScenario();
    const h = await openHarness({ project: base, proposals: [proposal] });
    const { review, session } = h;
    expect(review.open('P1').ok).toBe(true);
    await review.decide({ level: 'change', id: a.id }, 'accepted');
    expect(review.derived.canApply.value).toBe(false);
    const issue = review.derived.validation.value?.issues.find(
      (i) => i.code === 'arrow-cross-page',
    );
    expect(issue?.changeIds).toEqual([a.id]);
    expect(issue?.related).toEqual([b.id]);
    expect(review.derived.invalid.value.changeIds.has(a.id)).toBe(true);
    const result = await review.apply();
    expect(result?.ok).not.toBe(true);
    expect(session.store.project.value?.markings.find((m) => m.id === 'A')?.pageId).toBe(
      'PG1',
    );
    // Exit 2: accept the rest of the group.
    await review.decideMany([{ level: 'change', id: b.id }], 'accepted');
    expect(review.derived.canApply.value).toBe(true);
    expect(await review.apply()).toMatchObject({ ok: true });
  });
});
