// Proposal review and v14 (stage #559, PD4, decision 22): the link role shows up by name
// ("Clique", shared fixture data of tests/model/roleFixtures), and the documents repository has
// its own sentence and value.
import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { setDocRepo, removeDocRepo } from '../../src/model';
import { locale } from '../../src/store/settings';
import {
  changeSummary,
  changeTitle,
  valueParts,
  type ReviewNames,
} from '../../src/ui/review/changeText';
import { setAnnotationRole } from '../../src/model';
import { changeOf, propose } from '../model/proposalFixtures';
import {
  addChild,
  forceRole,
  roleProject,
  withDocRepo,
  withRoles,
} from '../model/roleFixtures';

beforeEach(() => {
  locale.value = 'en-US';
});

describe('parentRole change', () => {
  const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');

  function namesOf(after: typeof base, preview: typeof base | null = after): ReviewNames {
    const proposal = propose(base, after);
    return { current: base, preview, proposal };
  }

  it('the summary shows the name of both roles', () => {
    const after = setAnnotationRole(base, 'E1', 'hold');
    const names = namesOf(after);
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeSummary(names, c)).toBe('Clique → Pressionar');
  });

  it('without the "how it would look" preview, resolves by the current project', () => {
    const after = setAnnotationRole(base, 'E1', 'hold');
    const names = namesOf(after, null);
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeSummary(names, c)).toBe('Clique → Pressionar');
  });

  it('clearing the role shows "(empty)" in place of null', () => {
    const names = namesOf(setAnnotationRole(base, 'E1', null));
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeSummary(names, c)).toBe(`Clique → ${t('review.value.empty')}`);
  });

  it('a role id that the owner does not offer comes out raw', () => {
    const names = namesOf(forceRole(base, 'E1', 'zzz'));
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(valueParts(names, c, 'zzz', 'click')).toEqual([{ text: 'zzz' }]);
  });

  it('the title uses the field label and the annotation name', () => {
    const names = namesOf(setAnnotationRole(base, 'E1', 'hold'));
    const c = changeOf(names.proposal, 'annotation', 'E1', 'parentRole');
    expect(changeTitle(names, c)).toBe(`${t('review.field.role')} · onClick`);
  });
});

describe('docRepo entity', () => {
  const base = roleProject(withDocRepo);
  const withPath = setDocRepo(base, 'design-docs', { localPath: '../docs' });

  it('create: title and value', () => {
    const proposal = propose(base, withPath);
    const names: ReviewNames = { current: base, preview: withPath, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(c.kind).toBe('create');
    expect(changeTitle(names, c)).toBe('Documents repository design-docs created');
    expect(changeSummary(names, c)).toBe('../docs');
  });

  it('update: from → to', () => {
    const after = setDocRepo(withPath, 'design-docs', { localPath: '../new' });
    const proposal = propose(withPath, after);
    const names: ReviewNames = { current: withPath, preview: after, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(c.kind).toBe('update');
    expect(changeTitle(names, c)).toBe('Documents repository design-docs updated');
    expect(changeSummary(names, c)).toBe('../docs → ../new');
  });

  it('remove: title and value', () => {
    const after = removeDocRepo(withPath, 'design-docs');
    const proposal = propose(withPath, after);
    const names: ReviewNames = { current: withPath, preview: after, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(c.kind).toBe('remove');
    expect(changeTitle(names, c)).toBe('Documents repository design-docs removed');
    expect(changeSummary(names, c)).toBe('../docs');
  });

  it('title in English', () => {
    locale.value = 'en-US';
    const proposal = propose(base, withPath);
    const names: ReviewNames = { current: base, preview: withPath, proposal };
    const c = changeOf(proposal, 'docRepo', 'design-docs');
    expect(changeTitle(names, c)).toBe('Documents repository design-docs created');
  });
});
