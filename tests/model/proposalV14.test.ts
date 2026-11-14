// Proposals and v14 (stage #559, PD2, decision 16): `parentRole` is an annotation field and
// `docRepo` is an entity; the proposal format stays 4.
import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_FORMAT_VERSION,
  applyAccepted,
  parseProposalText,
  serializeProposal,
  setAnnotationParent,
  setAnnotationRole,
  setDocRepo,
  removeDocRepo,
  type Project,
  type Proposal,
} from '../../src/model';
import { AT, LATER, changeOf, decided, propose } from './proposalFixtures';
import { addChild, roleProject, withDocRepo, withRoles } from './roleFixtures';

function acceptAll(p: Proposal, project: Project): Proposal {
  return decided(p, project, { level: 'proposal', id: null }, 'accepted');
}

function apply(project: Project, p: Proposal): Project {
  const result = applyAccepted(project, acceptAll(p, project), LATER);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.project;
}

describe('the proposal format stays 4', () => {
  it('PROPOSAL_FORMAT_VERSION and the written proposal', () => {
    expect(PROPOSAL_FORMAT_VERSION).toBe(4);
    const base = roleProject(withRoles);
    const p = propose(base, addChild(base, 'E1', 'A1', 'click'));
    expect(JSON.parse(serializeProposal(p)).formatVersion).toBe(4);
  });
});

describe('parentRole: compared, decided and applied', () => {
  it('changing the role generates a field change and applies', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const after = setAnnotationRole(base, 'E1', 'hold');
    const p = propose(base, after);
    const change = changeOf(p, 'annotation', 'E1', 'parentRole');
    expect(change.kind).toBe('update');
    expect([change.from, change.to]).toEqual(['click', 'hold']);
    expect(apply(base, p).annotations.find((a) => a.id === 'E1')?.parentRole).toBe(
      'hold',
    );
  });

  it('clearing the role (null) is also a change', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const p = propose(base, setAnnotationRole(base, 'E1', null));
    expect(changeOf(p, 'annotation', 'E1', 'parentRole').to).toBeNull();
    expect(apply(base, p).annotations.find((a) => a.id === 'E1')?.parentRole).toBeNull();
  });

  it('changing the owner without changing the role generates no role change; clearing, it generates both', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const moved = setAnnotationParent(base, 'E1', 'A2');
    expect(propose(base, moved).changes.some((c) => c.field === 'parentRole')).toBe(
      false,
    );
    const free = setAnnotationParent(base, 'E1', null);
    const p = propose(base, free);
    expect(changeOf(p, 'annotation', 'E1', 'parentAnnotationId').to).toBeNull();
    expect(changeOf(p, 'annotation', 'E1', 'parentRole').to).toBeNull();
    expect(apply(base, p).annotations.find((a) => a.id === 'E1')).toMatchObject({
      parentAnnotationId: null,
      parentRole: null,
    });
  });

  it('creating the annotation already linked carries the role inside the creation value', () => {
    const base = roleProject(withRoles);
    const after = addChild(base, 'E1', 'A1', 'hold');
    const p = propose(base, after);
    expect(changeOf(p, 'annotation', 'E1', null)).toMatchObject({
      kind: 'create',
      to: { parentRole: 'hold' },
    });
    expect(apply(base, p).annotations.find((a) => a.id === 'E1')?.parentRole).toBe(
      'hold',
    );
  });

  it('the proposal read from disk comes back the same, and a creation without parentRole (old agent) counts as having no role', () => {
    const base = roleProject(withRoles);
    const p = propose(base, addChild(base, 'E1', 'A1', 'hold'));
    const parsed = parseProposalText(serializeProposal(p));
    expect(parsed.ok).toBe(true);

    const legacy = JSON.parse(serializeProposal(p)) as {
      changes: { entity: string; to: Record<string, unknown> | null }[];
    };
    for (const c of legacy.changes) {
      if (c.entity === 'annotation' && c.to) delete c.to.parentRole;
    }
    const read = parseProposalText(JSON.stringify(legacy));
    if (!read.ok) throw new Error(read.errors.join('\n'));
    const applied = apply(base, read.proposal);
    expect(applied.annotations.find((a) => a.id === 'E1')?.parentRole).toBeNull();
  });

  it('an empty parentRole in the field is refused on read', () => {
    const base = addChild(roleProject(withRoles), 'E1', 'A1', 'click');
    const p = propose(base, setAnnotationRole(base, 'E1', 'hold'));
    const raw = JSON.parse(serializeProposal(p)) as {
      changes: { field: string; to: unknown }[];
    };
    for (const c of raw.changes) if (c.field === 'parentRole') c.to = '';
    expect(parseProposalText(JSON.stringify(raw)).ok).toBe(false);
  });
});

describe('docRepo: proposal entity', () => {
  it('creates, updates and removes', () => {
    const base = roleProject(withDocRepo);
    const created = setDocRepo(base, 'design-docs', { localPath: '../a' });
    const pc = propose(base, created);
    expect(changeOf(pc, 'docRepo', 'design-docs')).toMatchObject({
      kind: 'create',
      field: null,
      from: null,
      to: { localPath: '../a' },
    });
    expect(apply(base, pc).docRepos).toEqual({ 'design-docs': { localPath: '../a' } });

    const changed = setDocRepo(created, 'design-docs', { localPath: '../b' });
    const pu = propose(created, changed);
    expect(changeOf(pu, 'docRepo', 'design-docs')).toMatchObject({
      kind: 'update',
      from: { localPath: '../a' },
      to: { localPath: '../b' },
    });
    expect(apply(created, pu).docRepos).toEqual({ 'design-docs': { localPath: '../b' } });

    const pr = propose(created, removeDocRepo(created, 'design-docs'));
    expect(changeOf(pr, 'docRepo', 'design-docs').kind).toBe('remove');
    expect(apply(created, pr).docRepos).toEqual({});
  });

  it('the change is project-level and the written proposal is read back', () => {
    const base = roleProject(withDocRepo);
    const p = propose(base, setDocRepo(base, 'design-docs', { localPath: '../a' }), {
      createdAt: AT,
    });
    const change = changeOf(p, 'docRepo', 'design-docs');
    expect(change.imageId).toBeNull();
    expect(change.markingId).toBeNull();
    expect(parseProposalText(serializeProposal(p)).ok).toBe(true);
  });

  it('an invalid repository id is refused on read', () => {
    const base = roleProject(withDocRepo);
    const p = propose(base, setDocRepo(base, 'design-docs', { localPath: '../a' }));
    const raw = JSON.parse(serializeProposal(p)) as { changes: { entityId: string }[] };
    raw.changes[0]!.entityId = 'Design Docs';
    expect(parseProposalText(JSON.stringify(raw)).ok).toBe(false);
  });
});
