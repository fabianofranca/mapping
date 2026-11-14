import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  applyAccepted,
  changeImageFile,
  changeStatus,
  createMarking,
  parseProposal,
  parseProposalText,
  previewProject,
  replaceContainer,
  serializeProposal,
  setBackgroundContainer,
  setImageLocked,
  validateProject,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Container in the proposal (schema v10): creation carries the whole entity with `file: null`
// (nothing to move from `proposals/<id>/`); `update` gains `background` and `size`, only on the
// blank screen; on a photo the size still comes from the file replacement (`file` field).

const bgContainer = (p: Project) =>
  addBackgroundContainer(p, {
    id: 'B1',
    name: 'Login',
    width: 390,
    height: 844,
    background: '#FFFFFF',
  });

function accept(base: Project, p: Proposal): Proposal {
  return decided(p, base, { level: 'proposal', id: null }, 'accepted');
}

describe('proposal: container', () => {
  it('creation: the whole entity with a null file, no file to move', () => {
    const base = sampleProject();
    const after = createMarking(bgContainer(base), {
      id: 'MB',
      containerId: 'B1',
      rect: { x: 10, y: 10, width: 100, height: 100 },
    });
    const p = propose(base, after);
    const create = changeOf(p, 'image', 'B1');
    expect(create).toMatchObject({
      kind: 'create',
      to: {
        id: 'B1',
        name: 'Login',
        file: null,
        background: '#FFFFFF',
        width: 390,
        height: 844,
      },
    });
    expect(changeImageFile(create)).toBeNull();

    const decidedProposal = accept(base, p);
    const result = applyAccepted(base, decidedProposal, AT);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.files).toEqual([]);
    expect(result.project).toEqual(after);
    expect(validateProject(result.project)).toEqual([]);

    // The format comes back the same through the proposal text.
    const again = parseProposalText(serializeProposal(p));
    expect(again.ok).toBe(true);
  });

  it('update: color and size become `background` and `size`, and apply', () => {
    const base = bgContainer(sampleProject());
    const after = setBackgroundContainer(base, 'B1', {
      background: '#101010',
      width: 400,
      height: 900,
    });
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entity, c.field])).toEqual([
      ['image', 'background'],
      ['image', 'size'],
    ]);
    expect(changeOf(p, 'image', 'B1', 'background')).toMatchObject({
      from: '#FFFFFF',
      to: '#101010',
    });
    expect(changeOf(p, 'image', 'B1', 'size')).toMatchObject({
      from: { width: 390, height: 844 },
      to: { width: 400, height: 900 },
    });
    // No file change: nothing to move.
    expect(p.changes.every((c) => changeImageFile(c) === null)).toBe(true);

    const result = applyAccepted(base, accept(base, p), AT);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.project).toEqual(after);
    expect(result.files).toEqual([]);
    expect(previewProject(base, p).project).toEqual(after);
  });

  it('color only: one `background` and no `size`', () => {
    const base = bgContainer(sampleProject());
    const p = propose(
      base,
      setBackgroundContainer(base, 'B1', { background: '#000000' }),
    );
    expect(p.changes.map((c) => c.field)).toEqual(['background']);
  });

  it('a size that leaves a marking outside does not block: settling takes it to the canvas', () => {
    const base = createMarking(bgContainer(sampleProject()), {
      id: 'MB',
      containerId: 'B1',
      rect: { x: 100, y: 600, width: 200, height: 200 },
    });
    const p = propose(base, setBackgroundContainer(base, 'B1', { height: 900 }));
    const shrink: Proposal = {
      ...p,
      changes: p.changes.map((c) =>
        c.field === 'size' ? { ...c, to: { width: 390, height: 700 } } : c,
      ),
    };
    const result = applyAccepted(base, accept(base, shrink), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const marking = result.project.markings.find((m) => m.id === 'MB');
    expect(marking?.containerId).toBeNull();
    expect(validateProject(result.project)).toEqual([]);
  });

  it('locked image: the size warns about the lock; the color does not', () => {
    const open = bgContainer(sampleProject());
    const base = setImageLocked(open, 'B1', true);
    const after = setImageLocked(
      setBackgroundContainer(open, 'B1', { background: '#000000', width: 400 }),
      'B1',
      true,
    );
    const p = propose(base, after);
    expect(changeStatus(p, changeOf(p, 'image', 'B1', 'size'), base).locked).toBe(true);
    expect(changeStatus(p, changeOf(p, 'image', 'B1', 'background'), base).locked).toBe(
      false,
    );
  });

  it('`size` and `background` on a photo are refused on apply; the photo's file replacement stays the same', () => {
    const base = sampleProject();
    const swapped = replaceContainer(base, 'I2', {
      file: 'images/f2.jpg',
      width: 2000,
      height: 2000,
    });
    const p = propose(base, swapped);
    expect(p.changes.map((c) => c.field).filter((f) => f === 'size')).toEqual([]);
    expect(changeOf(p, 'image', 'I2', 'file')).toMatchObject({
      to: { file: 'images/f2.jpg', width: 2000, height: 2000 },
    });
    expect(changeImageFile(changeOf(p, 'image', 'I2', 'file'))).toBe('images/f2.jpg');

    const forged: Proposal = {
      ...p,
      changes: [
        {
          ...changeOf(p, 'image', 'I2', 'file'),
          field: 'size',
          to: { width: 5, height: 5 },
        },
      ],
    };
    expect(previewProject(base, forged).problems).not.toEqual([]);
    expect(previewProject(base, forged).project).toEqual(base);
  });

  it('file replacement through the proposal: a marking that grew to the minimum gets needsReview, as through the app', () => {
    // I2 (1000×1000) with M4 (100×100) and an already minimal 40×40 marking without a component.
    const start = createMarking(sampleProject(), {
      id: 'M5',
      containerId: 'I2',
      rect: { x: 400, y: 400, width: 200, height: 200 },
    });
    const next = { file: 'images/f2.jpg', width: 500, height: 500 };
    const minSizeOf = (id: string) => (id === 'M4' ? { width: 80, height: 80 } : null);
    const after = replaceContainer(start, 'I2', next, { minSizeOf });
    const byId = (p: Project, id: string) => p.markings.find((m) => m.id === id)!;
    // Through the app: M4 (50×50 rescaled) grew to the minimum; M5 was only rescaled.
    expect(byId(after, 'M4').needsReview).toBe(true);
    expect(byId(after, 'M5').needsReview).toBe(false);

    const p = propose(start, after);
    const result = applyAccepted(start, accept(start, p), AT);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(byId(result.project, 'M4').needsReview).toBe(true);
    expect(byId(result.project, 'M5').needsReview).toBe(false);
    expect(result.project).toEqual(after);
    expect(byId(previewProject(start, p).project, 'M4').needsReview).toBe(true);
  });

  it('the format validates the new fields', () => {
    const base = bgContainer(sampleProject());
    const p = propose(
      base,
      setBackgroundContainer(base, 'B1', { background: '#000000', width: 400 }),
    );
    const json = JSON.parse(serializeProposal(p)) as {
      changes: { field: string; to: unknown }[];
    };
    expect(parseProposal(json).ok).toBe(true);

    const withTo = (field: string, to: unknown) => {
      const copy = structuredClone(json);
      const change = copy.changes.find((c) => c.field === field);
      if (!change) throw new Error(field);
      change.to = to;
      return parseProposal(copy);
    };
    expect(withTo('background', 'black').ok).toBe(false);
    expect(withTo('background', null).ok).toBe(false);
    expect(withTo('size', { width: 0, height: 10 }).ok).toBe(false);
    expect(withTo('size', { width: 10 }).ok).toBe(false);
    expect(withTo('size', { width: 10, height: 10 }).ok).toBe(true);
  });
});
