import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  addContainer,
  addLayer,
  applyAccepted,
  applySpecialization,
  changeStatus,
  createMarking,
  deserialize,
  getAnnotationIssues,
  moveContainer,
  moveLayer,
  moveMarking,
  previewProject,
  removeAnnotation,
  removeEntry,
  removeContainer,
  removeLayer,
  removeMarking,
  removePlatformRepo,
  removeSpecialization,
  renameAnnotation,
  renameContainer,
  renameLayer,
  renameMarking,
  replaceContainer,
  reviewTree,
  serialize,
  setAnnotationParent,
  setFieldValue,
  setImageLocked,
  setContainerMarkingColor,
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
  type SpecMigrationStep,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { AT, LATER, changeOf, decided, propose } from './proposalFixtures';
import {
  annotationOf,
  badgeType,
  buttonType,
  chipType,
  libProject,
  libSpec,
  valuesOf,
} from './libraryMigrationFixtures';
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
        containerId: 'I2',
        rect: { x: 200, y: 200, width: 500, height: 500 },
      });
      after = createMarking(after, {
        id: 'N2',
        containerId: 'I2',
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
      let after = addContainer(base, {
        id: 'I3',
        file: 'images/n.png',
        width: 400,
        height: 300,
      });
      after = renameContainer(after, 'I2', 'Frente');
      after = moveContainer(after, 'I2', 5000, 5000);
      after = setContainerMarkingColor(after, 'I2', '#FFEB3B');
      after = setImageLocked(after, 'I2', true);
      after = setImageSource(after, 'I2', FIGMA);
      return [base, after];
    },
  ],
  [
    'imagem trocada (marcações reescaladas)',
    () => [
      sampleProject(),
      replaceContainer(sampleProject(), 'I2', {
        file: 'images/f2.jpg',
        width: 2000,
        height: 2000,
      }),
    ],
  ],
  ['imagem removida', () => [sampleProject(), removeContainer(sampleProject(), 'I1')]],
  [
    'anotações: nome, dona, pares e remoção com as vinculadas',
    () => {
      const base = setAnnotationParent(sampleProject(), 'A2', 'A1');
      let after = renameAnnotation(base, 'A3', 'Trinco');
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
      let after = setPlatformRepo(base, 'ios', { localPath: '../ios' });
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
    let after = addContainer(base, {
      id: 'T1',
      file: 'images/t1.png',
      width: 500,
      height: 500,
    });
    after = addContainer(after, {
      id: 'T2',
      file: 'images/t2.png',
      width: 500,
      height: 500,
    });
    after = createMarking(after, {
      id: 'X1',
      containerId: 'T1',
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    after = createMarking(after, {
      id: 'X2',
      containerId: 'T2',
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
    expect(first.project.containers.map((i) => i.id)).toEqual(['I1', 'I2', 'T1']);
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
    expect(done.project.containers.map((i) => i.id)).toEqual(['I1', 'I2', 'T1']);
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
    const gone = removeContainer(base, 'I2');
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
    expect(preview.containers.map((i) => i.id)).toEqual(['I1', 'I2', 'T1']);
    expect(preview.markings.find((m) => m.id === 'M1')?.name).toBe('Porta dianteira');
  });
});

describe('proposta antiga com mudança no campo de código removido (etapa 9)', () => {
  /** O Screen como era antes da v9: com o valor do campo removido (`implementacao`). */
  function withLegacyValue(p: Project, value: unknown[]): Project {
    return {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AS'
          ? {
              ...a,
              values: { ...(a.values ?? {}), implementacao: value as never },
            }
          : a,
      ),
    };
  }

  /** O projeto v8 (com o valor), a proposta feita sobre ele e o projeto atual (migrado, v9). */
  function oldProposal() {
    const entry = { _id: 'C1', platform: 'android', path: 'a/Tela.kt' };
    const v8 = withLegacyValue(codeProject(), [entry]);
    let after = withLegacyValue(v8, [
      entry,
      { _id: 'C2', platform: 'ios', path: 'B.swift' },
    ]);
    after = setFieldValue(after, 'AS', 'rota', '/cadastro/novo');
    const p = propose(v8, after);
    return { p, current: codeProject() };
  }

  it('a mudança do campo removido aparece em conflito e, aceita, bloqueia como "não cabe"', () => {
    const { p, current } = oldProposal();
    const legacy = changeOf(p, 'annotation', 'AS', 'values.implementacao');
    const rota = changeOf(p, 'annotation', 'AS', 'values.rota');
    // A revisão monta a árvore e a situação de cada mudança sem erro.
    expect(reviewTree(p, current).changeIdsOf({ level: 'proposal', id: null })).toEqual(
      expect.arrayContaining([legacy.id, rota.id]),
    );
    expect(changeStatus(p, legacy, current)).toMatchObject({
      conflict: true,
      current: null,
    });
    const accepted = acceptAll(p, current);
    const validation = validateAccepted(current, accepted);
    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual([
      { code: 'field-mismatch', id: 'AS', changeIds: [legacy.id], related: [] },
    ]);
    expect(applyAccepted(current, accepted, AT).ok).toBe(false);
  });

  it('rejeitada a mudança do campo removido, o resto aplica sem trazê-lo de volta', () => {
    const { p, current } = oldProposal();
    const legacy = changeOf(p, 'annotation', 'AS', 'values.implementacao');
    const decisions = decided(
      acceptAll(p, current),
      current,
      { level: 'change', id: legacy.id },
      'rejected',
    );
    const result = apply(current, decisions);
    const screen = result.project.annotations.find((a) => a.id === 'AS');
    expect(screen?.values).toEqual({ nome: 'Cadastro', rota: '/cadastro/novo' });
    expect(result.proposal.status).toBe('applied');
    expect(validateProject(result.project)).toEqual([]);
  });

  it('a visão Proposto deixa a mudança de fora (problems) e não traz o valor', () => {
    const { p, current } = oldProposal();
    const legacy = changeOf(p, 'annotation', 'AS', 'values.implementacao');
    const preview = previewProject(current, p);
    expect(preview.problems).toEqual([{ code: 'field-mismatch', changeId: legacy.id }]);
    const screen = preview.project.annotations.find((a) => a.id === 'AS');
    expect(screen?.values).toEqual({ nome: 'Cadastro', rota: '/cadastro/novo' });
  });

  it('tipo que não dá para resolver (sem a cópia da especialização) não decide: aplica', () => {
    const { p, current } = oldProposal();
    const missing: Project = {
      ...current,
      specializations: current.specializations.map((s) =>
        s.id === 'sdui' ? { ...s, spec: null } : s,
      ),
    };
    expect(previewProject(missing, p).problems).toEqual([]);
  });
});

describe('pacote de biblioteca na proposta (fase B4)', () => {
  const PKG_SPEC = { ...loadExample('sdui'), formatVersion: 4 } as ReturnType<
    typeof loadExample
  >;

  function withPackage(p: Project, version: number): Project {
    const spec = { ...PKG_SPEC, version };
    return updateOrApply(p, spec);
  }

  /** Aplica (ou sobe) a especialização com o arquivo dentro da pasta `specs/sdui/`. */
  function updateOrApply(p: Project, spec: typeof PKG_SPEC): Project {
    const existing = p.specializations.some((s) => s.id === spec.id);
    return existing
      ? {
          ...p,
          specializations: p.specializations.map((s) =>
            s.id === spec.id ? { ...s, version: spec.version, spec } : s,
          ),
        }
      : applySpecialization(p, spec, {
          newId: idGen('LP'),
          packageSpecName: 'sdui.spec.json',
        });
  }

  it('criar: devolve a pasta, onde os arquivos esperam e a especialização', () => {
    const base = sampleProject();
    const after = withPackage(base, 1);
    const result = apply(base, acceptAll(propose(base, after), base));
    expect(result.packages).toEqual([
      {
        specId: 'sdui',
        version: 1,
        dir: 'specs/sdui',
        from: 'proposals/P1/specs/sdui',
        file: 'specs/sdui/sdui.spec.json',
        spec: { ...PKG_SPEC, version: 1 },
      },
    ]);
  });

  it('atualizar: devolve o pacote da versão nova', () => {
    const base = withPackage(sampleProject(), 1);
    const after = withPackage(base, 2);
    const p = acceptAll(propose(base, after), base);
    expect(changeOf(p, 'specialization', 'sdui').kind).toBe('update');
    const result = apply(base, p);
    expect(result.packages.map((x) => [x.specId, x.version, x.dir])).toEqual([
      ['sdui', 2, 'specs/sdui'],
    ]);
  });

  it('só as aceitas, e uma só vez: o que não foi aplicado agora não entra', () => {
    const base = sampleProject();
    const p = propose(base, withPackage(base, 1));
    expect(apply(base, p).packages).toEqual([]);
    const accepted = acceptAll(p, base);
    const first = apply(base, accepted);
    expect(first.packages).toHaveLength(1);
    // Já aplicada: o resto da proposta não repete o pacote.
    expect(apply(first.project, first.proposal).packages).toEqual([]);
  });

  it('especialização de arquivo único (specs/<id>.json) e remoção não trazem pacote', () => {
    const base = sampleProject();
    const single = applySpecialization(base, loadExample('sdui'), {
      newId: idGen('LS'),
    });
    expect(apply(base, acceptAll(propose(base, single), base)).packages).toEqual([]);
    const removed = removeSpecialization(withPackage(base, 1), 'sdui', 'convert');
    const p = acceptAll(propose(withPackage(base, 1), removed), withPackage(base, 1));
    expect(apply(withPackage(base, 1), p).packages).toEqual([]);
  });
});

describe('migração que tira o campo na mesma proposta (remove-field e rename-field)', () => {
  /** A especialização v1 aplicada, com a anotação `B1` (Button) com o campo `label` preenchido. */
  function before(): Project {
    return libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'teste', size: 3 } },
    ]);
  }

  /** A v2 sem o campo `label` (e `title` no lugar, no rename), com a migração dada. */
  function nextSpec(step: SpecMigrationStep, renamed?: string) {
    const fields = buttonType().fields.filter((f) => f.key !== 'label');
    if (renamed) fields.unshift({ key: renamed, type: 'string', tags: ['x'] });
    return libSpec(
      2,
      { c: [buttonType({ fields }), badgeType()], e: [chipType()] },
      {
        migrations: [{ from: 1, to: 2, steps: [step] }],
      },
    );
  }

  function proposeUpdate(step: SpecMigrationStep, renamed?: string) {
    const base = before();
    const after = updateSpecialization(base, nextSpec(step, renamed));
    return { base, after, p: propose(base, after) };
  }

  const REMOVE: SpecMigrationStep = {
    op: 'remove-field',
    type: 'button',
    field: 'label',
  };
  const RENAME: SpecMigrationStep = {
    op: 'rename-field',
    type: 'button',
    from: 'label',
    to: 'title',
  };

  it('remove-field: a proposta traz o valor indo a null e aceitar tudo aplica, sem a chave', () => {
    const { base, after, p } = proposeUpdate(REMOVE);
    const clear = changeOf(p, 'annotation', 'B1', 'values.label');
    expect(clear.to).toBeNull();
    changeOf(p, 'specialization', 'lib');
    const accepted = acceptAll(p, base);
    const validation = validateAccepted(base, accepted);
    expect(validation.issues).toEqual([]);
    expect(validation.ok).toBe(true);
    const result = apply(base, accepted);
    expect(valuesOf(result.project, 'B1')).not.toHaveProperty('label');
    expect(valuesOf(result.project, 'B1').size).toBe(3);
    expect(getAnnotationIssues(result.project, 'B1')).toEqual([]);
    expect(validateProject(result.project)).toEqual([]);
    expect(result.project.specializations[0]?.version).toBe(2);
    expect(valuesOf(after, 'B1')).not.toHaveProperty('label');
  });

  it('rename-field: aceitar tudo deixa o valor no campo novo, sem a chave antiga', () => {
    const { base, p } = proposeUpdate(RENAME, 'title');
    expect(changeOf(p, 'annotation', 'B1', 'values.label').to).toBeNull();
    const result = apply(base, acceptAll(p, base));
    expect(valuesOf(result.project, 'B1').title).toBe('teste');
    expect(valuesOf(result.project, 'B1')).not.toHaveProperty('label');
    expect(getAnnotationIssues(result.project, 'B1')).toEqual([]);
  });

  it('só o valor aceito (sem a especialização): a chave ainda é do tipo antigo e vai a null', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const clear = changeOf(p, 'annotation', 'B1', 'values.label');
    const only = decided(p, base, { level: 'change', id: clear.id }, 'accepted');
    const result = apply(base, only);
    expect(valuesOf(result.project, 'B1').label).toBeNull();
    expect(result.proposal.status).toBe('open');
  });

  it('rejeitar o valor e aceitar a especialização continua aplicando (valor órfão como pendência)', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const clear = changeOf(p, 'annotation', 'B1', 'values.label');
    const decisions = decided(
      acceptAll(p, base),
      base,
      { level: 'change', id: clear.id },
      'rejected',
    );
    const result = apply(base, decisions);
    expect(valuesOf(result.project, 'B1').label).toBe('teste');
    expect(getAnnotationIssues(result.project, 'B1')).toEqual([
      { code: 'unknown-field', key: 'label' },
    ]);
  });

  it('visão Proposto: limpar a chave fora do tipo não vira problema', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const preview = previewProject(base, p);
    expect(preview.problems).toEqual([]);
    expect(valuesOf(preview.project, 'B1')).not.toHaveProperty('label');
  });

  it('regressão: valor novo numa chave fora do tipo continua field-mismatch', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const clear = changeOf(p, 'annotation', 'B1', 'values.label');
    const stale: Proposal = {
      ...p,
      changes: p.changes.map((c) =>
        c.id === clear.id ? { ...c, from: 'teste', to: 'novo' } : c,
      ),
    };
    const accepted = acceptAll(stale, base);
    const validation = validateAccepted(base, accepted);
    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual([
      expect.objectContaining({
        code: 'field-mismatch',
        id: 'B1',
        changeIds: [clear.id],
      }),
    ]);
    expect(annotationOf(base, 'B1').values).toMatchObject({ label: 'teste' });
  });
});
