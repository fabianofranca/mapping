import { describe, expect, it } from 'vitest';
import {
  addBlankImage,
  applyAccepted,
  changeImageFile,
  changeStatus,
  createMarking,
  parseProposal,
  parseProposalText,
  previewProject,
  replaceImage,
  serializeProposal,
  setBlankImage,
  setImageLocked,
  validateProject,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

// Tela em branco na proposta (schema v10): a criação leva a entidade inteira com `file: null`
// (nada para mover de `proposals/<id>/`); `update` ganha `background` e `size`, só na tela em
// branco; na foto o tamanho continua vindo da troca de arquivo (campo `file`).

const blank = (p: Project) =>
  addBlankImage(p, {
    id: 'B1',
    name: 'Login',
    width: 390,
    height: 844,
    background: '#FFFFFF',
  });

function accept(base: Project, p: Proposal): Proposal {
  return decided(p, base, { level: 'proposal', id: null }, 'accepted');
}

describe('proposta: tela em branco', () => {
  it('criação: a entidade inteira com file nulo, sem arquivo para mover', () => {
    const base = sampleProject();
    const after = createMarking(blank(base), {
      id: 'MB',
      imageId: 'B1',
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

    // O formato volta igual pelo texto da proposta.
    const again = parseProposalText(serializeProposal(p));
    expect(again.ok).toBe(true);
  });

  it('alteração: cor e tamanho viram `background` e `size`, e aplicam', () => {
    const base = blank(sampleProject());
    const after = setBlankImage(base, 'B1', {
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
    // Sem mudança de arquivo: nada a mover.
    expect(p.changes.every((c) => changeImageFile(c) === null)).toBe(true);

    const result = applyAccepted(base, accept(base, p), AT);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.project).toEqual(after);
    expect(result.files).toEqual([]);
    expect(previewProject(base, p).project).toEqual(after);
  });

  it('só a cor: um `background` e nenhum `size`', () => {
    const base = blank(sampleProject());
    const p = propose(base, setBlankImage(base, 'B1', { background: '#000000' }));
    expect(p.changes.map((c) => c.field)).toEqual(['background']);
  });

  it('o tamanho que deixa marcação de fora não é aplicado (rect-out-of-image)', () => {
    const base = createMarking(blank(sampleProject()), {
      id: 'MB',
      imageId: 'B1',
      rect: { x: 100, y: 600, width: 200, height: 200 },
    });
    const p = propose(base, setBlankImage(base, 'B1', { height: 900 }));
    const shrink: Proposal = {
      ...p,
      changes: p.changes.map((c) =>
        c.field === 'size' ? { ...c, to: { width: 390, height: 700 } } : c,
      ),
    };
    const result = applyAccepted(base, accept(base, shrink), AT);
    expect(result.ok).toBe(false);
  });

  it('imagem trancada: o tamanho avisa trava; a cor não', () => {
    const open = blank(sampleProject());
    const base = setImageLocked(open, 'B1', true);
    const after = setImageLocked(
      setBlankImage(open, 'B1', { background: '#000000', width: 400 }),
      'B1',
      true,
    );
    const p = propose(base, after);
    expect(changeStatus(p, changeOf(p, 'image', 'B1', 'size'), base).locked).toBe(true);
    expect(changeStatus(p, changeOf(p, 'image', 'B1', 'background'), base).locked).toBe(
      false,
    );
  });

  it('`size` e `background` na foto são recusados na aplicação; a troca de arquivo da foto segue igual', () => {
    const base = sampleProject();
    const swapped = replaceImage(base, 'I2', {
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

  it('o formato valida os campos novos', () => {
    const base = blank(sampleProject());
    const p = propose(
      base,
      setBlankImage(base, 'B1', { background: '#000000', width: 400 }),
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
    expect(withTo('background', 'preto').ok).toBe(false);
    expect(withTo('background', null).ok).toBe(false);
    expect(withTo('size', { width: 0, height: 10 }).ok).toBe(false);
    expect(withTo('size', { width: 10 }).ok).toBe(false);
    expect(withTo('size', { width: 10, height: 10 }).ok).toBe(true);
  });
});
