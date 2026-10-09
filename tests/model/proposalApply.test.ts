import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  addImage,
  addLayer,
  applyAccepted,
  applySpecialization,
  createMarking,
  deserialize,
  moveImage,
  moveLayer,
  moveMarking,
  previewProject,
  removeAnnotation,
  removeEntry,
  removeImage,
  removeLayer,
  removeMarking,
  removePlatformRepo,
  removeSpecialization,
  renameAnnotation,
  renameImage,
  renameLayer,
  renameMarking,
  replaceImage,
  serialize,
  setAnnotationInherit,
  setAnnotationParent,
  setFieldValue,
  setImageLocked,
  setImageMarkingColor,
  setImageSource,
  setLayerColor,
  setMarkingLocked,
  setMarkingParent,
  setMarkingRect,
  setMarkingSource,
  setPlatformRepo,
  specFiles,
  supersedeProposal,
  updateEntry,
  updateSpecialization,
  validateAccepted,
  validateProject,
  withdrawProposal,
  type Project,
  type Proposal,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { AT, LATER, changeOf, decided, propose } from './proposalFixtures';
import { cadastroProject, codeProject, idGen, loadExample } from './specFixtures';

const FIGMA = { system: 'figma', id: '1:2', url: 'https://figma.com/x' };

function apply(project: Project, p: Proposal, at = AT) {
  const result = applyAccepted(project, p, at);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

function acceptAll(p: Proposal, project: Project): Proposal {
  return decided(p, project, { level: 'proposal', id: null }, 'accepted');
}

/** Cada cenário: antes → depois pelas operações do modelo. */
const scenarios: [string, () => [Project, Project]][] = [
  [
    'marcação: nome, rect, pai, trava e origem',
    () => {
      const base = sampleProject();
      let after = renameMarking(base, 'M4', 'Farol');
      after = setMarkingRect(after, 'M4', { x: 10, y: 20, width: 100, height: 100 });
      after = setMarkingParent(after, 'M3', 'M1');
      after = setMarkingLocked(after, 'M1', true);
      after = setMarkingSource(after, 'M1', FIGMA);
      return [base, after];
    },
  ],
  [
    'marcação movida com as filhas',
    () => [sampleProject(), moveMarking(sampleProject(), 'M1', 10, -5)],
  ],
  [
    'marcações e anotações criadas (com vínculo)',
    () => {
      const base = sampleProject();
      let after = createMarking(base, {
        id: 'N1',
        imageId: 'I2',
        rect: { x: 200, y: 200, width: 500, height: 500 },
      });
      after = createMarking(after, {
        id: 'N2',
        imageId: 'I2',
        rect: { x: 300, y: 300, width: 100, height: 100 },
      });
      after = addAnnotation(after, { id: 'B1', markingId: 'N2', layerId: 'L1' });
      after = addAnnotation(after, { id: 'B2', markingId: 'N2', layerId: 'L2' });
      after = setAnnotationParent(after, 'B2', 'B1');
      return [base, after];
    },
  ],
  [
    'marcação removida em cascata',
    () => [sampleProject(), removeMarking(sampleProject(), 'M1')],
  ],
  [
    'imagem criada e alterada em cada campo',
    () => {
      const base = sampleProject();
      let after = addImage(base, {
        id: 'I3',
        file: 'images/n.png',
        width: 400,
        height: 300,
      });
      after = renameImage(after, 'I2', 'Frente');
      after = moveImage(after, 'I2', 5000, 5000);
      after = setImageMarkingColor(after, 'I2', '#FFEB3B');
      after = setImageLocked(after, 'I2', true);
      after = setImageSource(after, 'I2', FIGMA);
      return [base, after];
    },
  ],
  [
    'imagem trocada (marcações reescaladas)',
    () => [
      sampleProject(),
      replaceImage(sampleProject(), 'I2', {
        file: 'images/f2.jpg',
        width: 2000,
        height: 2000,
      }),
    ],
  ],
  ['imagem removida', () => [sampleProject(), removeImage(sampleProject(), 'I1')]],
  [
    'anotações: nome, herança, dona, pares e remoção com as vinculadas',
    () => {
      const base = setAnnotationParent(sampleProject(), 'A2', 'A1');
      let after = renameAnnotation(base, 'A3', 'Trinco');
      after = setAnnotationInherit(after, 'A3', true);
      after = setAnnotationParent(after, 'A2', null);
      after = addEntry(after, 'A2', { id: 'E7', key: 'lado', value: 'esquerdo' });
      after = updateEntry(after, 'A2', 'E3', { key: 'tipo', value: 'risco' });
      after = removeEntry(after, 'A2', 'E3');
      after = removeAnnotation(after, 'A4');
      return [base, after];
    },
  ],
  [
    'anotação tipada: valores, tabela e referência',
    () => {
      const base = cadastroProject();
      let after = setFieldValue(base, 'AB', 'estilo', 'secondary');
      after = setFieldValue(after, 'AIN', 'dado', { annotationId: 'AU', entryId: 'EA' });
      after = setFieldValue(after, 'AT', 'conteudo', null);
      return [base, after];
    },
  ],
  [
    'especialização removida convertendo as anotações (troca de tipo)',
    () => {
      const base = cadastroProject();
      return [
        base,
        removeSpecialization(base, 'modelo-dados', 'convert', { newId: idGen('X') }),
      ];
    },
  ],
  [
    'camadas: criação, nome, cor, posição e remoção',
    () => {
      const base = addLayer(sampleProject(), {
        id: 'L3',
        name: 'Rodas',
        color: '#2E7D32',
      });
      let after = addLayer(base, { id: 'L4', name: 'Faróis', color: '#E65100' });
      after = renameLayer(after, 'L1', 'Pintura');
      after = setLayerColor(after, 'L1', '#000000');
      after = moveLayer(after, 'L3', 0);
      after = moveLayer(after, 'L4', 1);
      after = removeLayer(after, 'L2');
      return [base, after];
    },
  ],
  [
    'especialização aplicada',
    () => [
      sampleProject(),
      applySpecialization(sampleProject(), loadExample('sdui'), { newId: idGen('LS') }),
    ],
  ],
  [
    'especialização atualizada',
    () => {
      const base = cadastroProject();
      const spec = loadExample('sdui');
      return [base, updateSpecialization(base, { ...spec, version: spec.version + 1 })];
    },
  ],
  [
    'especialização removida com as camadas e anotações',
    () => {
      const base = cadastroProject();
      return [base, removeSpecialization(base, 'modelo-dados', 'delete')];
    },
  ],
  [
    'repositórios por plataforma',
    () => {
      const base = codeProject();
      let after = setPlatformRepo(base, 'ios', { urlTemplate: 'https://x.dev/{path}' });
      after = setPlatformRepo(after, 'bff', { localPath: '..' });
      after = removePlatformRepo(after, 'android');
      return [base, after];
    },
  ],
];

describe('aplicar a proposta inteira reproduz o projeto proposto', () => {
  it.each(scenarios)('%s', (_name, make) => {
    const [base, after] = make();
    const p = acceptAll(propose(base, after), base);
    const result = apply(base, p);
    expect(validateProject(result.project)).toEqual([]);
    expect(result.project).toEqual(after);
    expect(result.applied).toHaveLength(p.changes.length);
    expect(result.proposal.status).toBe('applied');
  });
});

describe('importação inteira', () => {
  it('projeto vazio + proposta com tudo (especializações, imagens, marcações, anotações, repositório)', () => {
    const base = emptyProject();
    const after = codeProject();
    const p = propose(base, after, { title: 'Cadastro a partir das telas' });
    expect(p.changes.every((c) => c.kind === 'create')).toBe(true);
    const result = apply(base, acceptAll(p, base), LATER);
    expect(result.project).toEqual(after);
    expect(serialize(result.project)).toBe(serialize(after));
    const reopened = deserialize(
      serialize(result.project),
      undefined,
      specFiles(result.project),
    );
    expect(reopened.ok).toBe(true);
    expect(result.files).toEqual([
      { from: 'proposals/P1/images/cadastro.png', to: 'images/cadastro.png' },
    ]);
    expect(Object.values(result.proposal.applied).every((a) => a.at === LATER)).toBe(
      true,
    );
    expect(result.proposal.status).toBe('applied');
  });
});

describe('aplicar só as aceitas', () => {
  /** Duas imagens novas, cada uma com uma marcação e uma anotação. */
  function twoScreens(): [Project, Project] {
    const base = sampleProject();
    let after = addImage(base, {
      id: 'T1',
      file: 'images/t1.png',
      width: 500,
      height: 500,
    });
    after = addImage(after, { id: 'T2', file: 'images/t2.png', width: 500, height: 500 });
    after = createMarking(after, {
      id: 'X1',
      imageId: 'T1',
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    after = createMarking(after, {
      id: 'X2',
      imageId: 'T2',
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    after = addAnnotation(after, { id: 'Y1', markingId: 'X1', layerId: 'L1' });
    after = addAnnotation(after, { id: 'Y2', markingId: 'X2', layerId: 'L1' });
    after = renameMarking(after, 'M1', 'Porta dianteira');
    return [base, after];
  }

  it('aplicação parcial seguida de outra aplicação chega ao projeto proposto', () => {
    const [base, after] = twoScreens();
    let p = propose(base, after);
    p = decided(p, base, { level: 'image', id: 'T1' }, 'accepted');
    const first = apply(base, p, AT);
    expect(first.project.images.map((i) => i.id)).toEqual(['I1', 'I2', 'T1']);
    expect(first.applied.map((c) => c.entityId)).toEqual(['T1', 'X1', 'Y1']);
    expect(first.files).toEqual([
      { from: 'proposals/P1/images/t1.png', to: 'images/t1.png' },
    ]);
    expect(first.proposal.status).toBe('open');
    // O que está sem decisão continua pendente; uma nova rodada aplica o resto.
    p = decided(
      first.proposal,
      first.project,
      { level: 'proposal', id: null },
      'accepted',
    );
    expect(Object.keys(p.applied)).toHaveLength(3);
    const second = apply(first.project, p, LATER);
    expect(second.applied.map((c) => c.entityId)).toEqual(['T2', 'M1', 'X2', 'Y2']);
    expect(second.project).toEqual(after);
    expect(second.proposal.status).toBe('applied');
    expect(second.proposal.applied[changeOf(p, 'image', 'T1').id]).toEqual({ at: AT });
    expect(second.proposal.applied[changeOf(p, 'image', 'T2').id]).toEqual({ at: LATER });
  });

  it('rejeitadas ficam de fora e a proposta fecha quando tudo foi decidido', () => {
    const [base] = twoScreens();
    const [, after] = twoScreens();
    let p = propose(base, after);
    p = decided(p, base, { level: 'image', id: 'T2' }, 'rejected');
    p = decided(p, base, { level: 'image', id: 'T1' }, 'accepted');
    const partial = apply(base, p);
    expect(partial.proposal.status).toBe('open');
    p = decided(
      partial.proposal,
      partial.project,
      { level: 'image', id: 'I1' },
      'rejected',
    );
    const done = apply(partial.project, p);
    expect(done.applied).toEqual([]);
    expect(done.project).toBe(partial.project);
    expect(done.proposal.status).toBe('applied');
    expect(done.project.images.map((i) => i.id)).toEqual(['I1', 'I2', 'T1']);
  });

  it('conjunto inválido fica bloqueado e aponta as mudanças envolvidas', () => {
    const base = sampleProject();
    // Mover M2 leva M3 junto; aceitar só a posição da filha a deixa fora do pai.
    const p0 = propose(base, moveMarking(base, 'M2', 300, 0));
    const m2 = changeOf(p0, 'marking', 'M2', 'rect').id;
    const m3 = changeOf(p0, 'marking', 'M3', 'rect').id;
    const p = decided(p0, base, { level: 'change', id: m3 }, 'accepted');
    const validation = validateAccepted(base, p);
    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual([
      {
        code: 'rect-outside-parent',
        id: 'M3',
        otherId: 'M2',
        changeIds: [m3],
        related: [m2],
      },
    ]);
    const blocked = applyAccepted(base, p, AT);
    expect(blocked.ok).toBe(false);
    // As duas saídas: aceitar a que falta ou rejeitar a que causa o problema.
    expect(
      apply(base, decided(p, base, { level: 'change', id: m2 }, 'accepted')).project,
    ).toEqual(moveMarking(base, 'M2', 300, 0));
    expect(
      apply(base, decided(p, base, { level: 'change', id: m3 }, 'rejected')).project,
    ).toEqual(base);
  });

  it('conflito: aceitar sobrescreve o valor atual; rejeitar mantém', () => {
    const base = sampleProject();
    const p0 = propose(base, renameMarking(base, 'M4', 'Farol'));
    const edited = renameMarking(base, 'M4', 'Lanterna');
    const accepted = apply(edited, acceptAll(p0, base));
    expect(accepted.project.markings.find((m) => m.id === 'M4')?.name).toBe('Farol');
    const rejected = decided(p0, base, { level: 'proposal', id: null }, 'rejected');
    expect(apply(edited, rejected).project).toBe(edited);
  });

  it('alteração de item que sumiu bloqueia (entity-missing); remoção de item já removido não faz nada', () => {
    const base = sampleProject();
    const renamed = acceptAll(propose(base, renameMarking(base, 'M4', 'Farol')), base);
    const gone = removeImage(base, 'I2');
    const result = applyAccepted(gone, renamed, AT);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((i) => i.code)).toEqual(['entity-missing']);
    const removal = acceptAll(propose(base, removeMarking(base, 'M4')), base);
    expect(apply(gone, removal).project).toEqual(gone);
  });

  it('item trancado: aceitar a mudança de geometria é permitido e a trava continua', () => {
    const base = setMarkingLocked(sampleProject(), 'M4', true);
    const after = setMarkingLocked(
      setMarkingRect(setMarkingLocked(base, 'M4', false), 'M4', {
        x: 5,
        y: 5,
        width: 100,
        height: 100,
      }),
      'M4',
      true,
    );
    const result = apply(base, acceptAll(propose(base, after), base));
    const m4 = result.project.markings.find((m) => m.id === 'M4');
    expect(m4?.rect).toEqual({ x: 5, y: 5, width: 100, height: 100 });
    expect(m4?.locked).toBe(true);
  });

  it('especialização citada que não ficaria aplicada bloqueia (decisões editadas à mão)', () => {
    const base = sampleProject();
    const p0 = propose(
      base,
      applySpecialization(base, loadExample('sdui'), { newId: idGen('LS') }),
    );
    const decisions = Object.fromEntries(
      p0.changes
        .filter((c) => c.entity === 'layer')
        .map((c) => [c.id, { state: 'accepted' as const, at: AT }]),
    );
    const validation = validateAccepted(base, { ...p0, decisions });
    expect(validation.issues.map((i) => [i.code, i.id, i.otherId])).toEqual([
      ['missing-specialization', 'LS1', 'sdui'],
      ['missing-specialization', 'LS2', 'sdui'],
      ['missing-specialization', 'LS3', 'sdui'],
    ]);
  });

  it('substituída: as aceitas ainda são aplicadas; retirada ou aplicada não aplica mais nada', () => {
    const base = sampleProject();
    const after = renameMarking(
      renameMarking(base, 'M4', 'Farol'),
      'M1',
      'Porta dianteira',
    );
    let p = propose(base, after);
    p = decided(p, base, { level: 'image', id: 'I2' }, 'accepted');
    const superseded = apply(base, supersedeProposal(p));
    expect(superseded.applied.map((c) => c.entityId)).toEqual(['M4']);
    expect(superseded.proposal.status).toBe('superseded');
    const withdrawn = applyAccepted(base, withdrawProposal(p), AT);
    expect(withdrawn.ok).toBe(false);
    expect(!withdrawn.ok && withdrawn.issues[0]?.code).toBe('proposal-closed');
  });

  it('visão Proposto: o atual mais as não rejeitadas e não aplicadas', () => {
    const [base, after] = twoScreens();
    let p = propose(base, after);
    expect(previewProject(base, p)).toEqual({ project: after, problems: [] });
    p = decided(p, base, { level: 'image', id: 'T2' }, 'rejected');
    const preview = previewProject(base, p).project;
    expect(preview.images.map((i) => i.id)).toEqual(['I1', 'I2', 'T1']);
    expect(preview.markings.find((m) => m.id === 'M1')?.name).toBe('Porta dianteira');
  });
});
