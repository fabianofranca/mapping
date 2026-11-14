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
  setMarkingFloating,
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
  type Change,
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
import {
  cadastroProject,
  codeProject,
  idGen,
  loadExample,
  loadLegacySdui,
} from './specFixtures';

const FIGMA = { system: 'figma', id: '1:2', url: 'https://figma.com/x' };

function apply(project: Project, p: Proposal, at = AT) {
  const result = applyAccepted(project, p, at);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

function acceptAll(p: Proposal, project: Project): Proposal {
  return decided(p, project, { level: 'proposal', id: null }, 'accepted');
}

/** Each scenario: before → after through the model operations. */
const scenarios: [string, () => [Project, Project]][] = [
  [
    'marking: name, rect, floating, lock and source',
    () => {
      const base = sampleProject();
      let after = renameMarking(base, 'M4', 'Lighthouse');
      after = setMarkingRect(after, 'M4', { x: 10, y: 20, width: 100, height: 100 });
      after = setMarkingFloating(after, 'M3', true);
      after = setMarkingLocked(after, 'M1', true);
      after = setMarkingSource(after, 'M1', FIGMA);
      return [base, after];
    },
  ],
  [
    'marking moved with its children',
    () => [sampleProject(), moveMarking(sampleProject(), 'M1', 10, -5)],
  ],
  [
    'markings and annotations created (with link)',
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
    'marking removed in cascade',
    () => [sampleProject(), removeMarking(sampleProject(), 'M1')],
  ],
  [
    'image created and changed in each field',
    () => {
      const base = sampleProject();
      let after = addContainer(base, {
        id: 'I3',
        file: 'images/n.png',
        width: 400,
        height: 300,
      });
      after = renameContainer(after, 'I2', 'Front');
      after = moveContainer(after, 'I2', 5000, 5000);
      after = setContainerMarkingColor(after, 'I2', '#FFEB3B');
      after = setImageLocked(after, 'I2', true);
      after = setImageSource(after, 'I2', FIGMA);
      return [base, after];
    },
  ],
  [
    'image swapped (markings rescaled)',
    () => [
      sampleProject(),
      replaceContainer(sampleProject(), 'I2', {
        file: 'images/f2.jpg',
        width: 2000,
        height: 2000,
      }),
    ],
  ],
  ['image removed', () => [sampleProject(), removeContainer(sampleProject(), 'I1')]],
  [
    'annotations: name, owner, pairs and removal with the linked ones',
    () => {
      const base = setAnnotationParent(sampleProject(), 'A2', 'A1');
      let after = renameAnnotation(base, 'A3', 'Latch');
      after = setAnnotationParent(after, 'A2', null);
      after = addEntry(after, 'A2', { id: 'E7', key: 'side', value: 'left' });
      after = updateEntry(after, 'A2', 'E3', { key: 'kind', value: 'risk' });
      after = removeEntry(after, 'A2', 'E3');
      after = removeAnnotation(after, 'A4');
      return [base, after];
    },
  ],
  [
    'typed annotation: values, table and reference',
    () => {
      const base = cadastroProject();
      // pt-BR kept: shared fixture field keys and spec id (specFixtures.ts, other phase)
      let after = setFieldValue(base, 'AB', 'estilo', 'secondary');
      after = setFieldValue(after, 'AIN', 'dado', { annotationId: 'AU', entryId: 'EA' });
      after = setFieldValue(after, 'AT', 'conteudo', null);
      return [base, after];
    },
  ],
  [
    'specialization removed converting the annotations (type change)',
    () => {
      const base = cadastroProject();
      return [
        base,
        removeSpecialization(base, 'modelo-dados', 'convert', { newId: idGen('X') }),
      ];
    },
  ],
  [
    'layers: creation, name, color, position and removal',
    () => {
      const base = addLayer(sampleProject(), {
        id: 'L3',
        name: 'Wheels',
        color: '#2E7D32',
      });
      let after = addLayer(base, { id: 'L4', name: 'Lights', color: '#E65100' });
      after = renameLayer(after, 'L1', 'Paint');
      after = setLayerColor(after, 'L1', '#000000');
      after = moveLayer(after, 'L3', 0);
      after = moveLayer(after, 'L4', 1);
      after = removeLayer(after, 'L2');
      return [base, after];
    },
  ],
  [
    'specialization applied',
    () => [
      sampleProject(),
      applySpecialization(sampleProject(), loadExample('sdui'), { newId: idGen('LS') }),
    ],
  ],
  [
    'specialization updated',
    () => {
      const base = cadastroProject();
      // Additive: the starting SDUI of `cadastroProject` with the next version.
      const spec = loadLegacySdui();
      return [base, updateSpecialization(base, { ...spec, version: spec.version + 1 })];
    },
  ],
  [
    'specialization removed with the layers and annotations',
    () => {
      const base = cadastroProject();
      return [base, removeSpecialization(base, 'modelo-dados', 'delete')];
    },
  ],
  [
    'repositories per platform',
    () => {
      const base = codeProject();
      let after = setPlatformRepo(base, 'ios', { localPath: '../ios' });
      after = setPlatformRepo(after, 'bff', { localPath: '..' });
      after = removePlatformRepo(after, 'android');
      return [base, after];
    },
  ],
];

describe('applying the whole proposal reproduces the proposed project', () => {
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

describe('whole import', () => {
  it('empty project + proposal with everything (specializations, images, markings, annotations, repository)', () => {
    const base = emptyProject();
    const after = codeProject();
    const p = propose(base, after, { title: 'Signup from the screens' });
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

describe('applying only the accepted ones', () => {
  /** Two new images, each with a marking and an annotation. */
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
    after = renameMarking(after, 'M1', 'Front door');
    return [base, after];
  }

  it('a partial application followed by another application reaches the proposed project', () => {
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
    // What has no decision stays pending; a new round applies the rest.
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

  it('rejected ones are left out and the proposal closes when everything has been decided', () => {
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

  it("accepting only the child's position does not block: the settle rebuilds the parent", () => {
    const base = sampleProject();
    // Moving M2 takes M3 along; accepting only the child's position takes it out of M2 (the parent comes from
    // the geometry, not from the proposal) and it becomes a child of M1, which still contains it.
    const p0 = propose(base, moveMarking(base, 'M2', 300, 0));
    const m2 = changeOf(p0, 'marking', 'M2', 'rect').id;
    const m3 = changeOf(p0, 'marking', 'M3', 'rect').id;
    const p = decided(p0, base, { level: 'change', id: m3 }, 'accepted');
    expect(validateAccepted(base, p).ok).toBe(true);
    const applied = apply(base, p);
    expect(applied.project.markings.find((m) => m.id === 'M3')?.parentId).toBe('M1');
    expect(
      apply(base, decided(p, base, { level: 'change', id: m2 }, 'accepted')).project,
    ).toEqual(moveMarking(base, 'M2', 300, 0));
    expect(
      apply(base, decided(p, base, { level: 'change', id: m3 }, 'rejected')).project,
    ).toEqual(base);
  });

  it("a container's accepted placement comes out with no floating-point tail", () => {
    const base = sampleProject();
    const p0 = propose(base, moveContainer(base, 'I2', 5000, 5000));
    const placement = changeOf(p0, 'image', 'I2', 'placement');
    const tailed: Proposal = {
      ...p0,
      changes: p0.changes.map((c) =>
        c.id === placement.id
          ? {
              ...c,
              to: { x: 5000.123456789123, y: 5000, scale: 1 } as unknown as Change['to'],
            }
          : c,
      ),
    };
    const p = decided(tailed, base, { level: 'change', id: placement.id }, 'accepted');
    const out = apply(base, p).project.containers.find((c) => c.id === 'I2')!;
    expect(out.placement.x).toBe(5000.123457);
  });

  it('an invalid set is blocked and points to the changes involved', () => {
    const base = sampleProject();
    const i1 = base.containers.find((c) => c.id === 'I1')!;
    const p0 = propose(base, moveContainer(base, 'I2', 5000, 5000));
    const placement = changeOf(p0, 'image', 'I2', 'placement');
    // A placement that puts I2 over I1 is not applied.
    const tampered: Proposal = {
      ...p0,
      changes: p0.changes.map((c) =>
        c.id === placement.id ? { ...c, to: i1.placement as unknown as Change['to'] } : c,
      ),
    };
    const p = decided(tampered, base, { level: 'change', id: placement.id }, 'accepted');
    const validation = validateAccepted(base, p);
    expect(validation.ok).toBe(false);
    expect(validation.issues.map((i) => i.code)).toEqual(['images-overlap']);
    expect(validation.issues[0]?.changeIds).toEqual([placement.id]);
    expect(applyAccepted(base, p, AT).ok).toBe(false);
    expect(
      apply(base, decided(p, base, { level: 'change', id: placement.id }, 'rejected'))
        .project,
    ).toEqual(base);
  });

  it('conflict: accepting overwrites the current value; rejecting keeps it', () => {
    const base = sampleProject();
    const p0 = propose(base, renameMarking(base, 'M4', 'Lighthouse'));
    const edited = renameMarking(base, 'M4', 'Lantern');
    const accepted = apply(edited, acceptAll(p0, base));
    expect(accepted.project.markings.find((m) => m.id === 'M4')?.name).toBe('Lighthouse');
    const rejected = decided(p0, base, { level: 'proposal', id: null }, 'rejected');
    expect(apply(edited, rejected).project).toBe(edited);
  });

  it('changing an item that disappeared blocks (entity-missing); removing an already removed item does nothing', () => {
    const base = sampleProject();
    const renamed = acceptAll(
      propose(base, renameMarking(base, 'M4', 'Lighthouse')),
      base,
    );
    const gone = removeContainer(base, 'I2');
    const result = applyAccepted(gone, renamed, AT);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((i) => i.code)).toEqual(['entity-missing']);
    const removal = acceptAll(propose(base, removeMarking(base, 'M4')), base);
    expect(apply(gone, removal).project).toEqual(gone);
  });

  it('locked item: accepting the geometry change is allowed and the lock stays', () => {
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

  it('a cited specialization that would not end up applied blocks (hand-edited decisions)', () => {
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

  it('replaced: the accepted ones are still applied; withdrawn or applied applies nothing more', () => {
    const base = sampleProject();
    const after = renameMarking(
      renameMarking(base, 'M4', 'Lighthouse'),
      'M1',
      'Front door',
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

  it('Proposed view: the current one plus the non-rejected and non-applied ones', () => {
    const [base, after] = twoScreens();
    let p = propose(base, after);
    expect(previewProject(base, p)).toEqual({ project: after, problems: [] });
    p = decided(p, base, { level: 'image', id: 'T2' }, 'rejected');
    const preview = previewProject(base, p).project;
    expect(preview.containers.map((i) => i.id)).toEqual(['I1', 'I2', 'T1']);
    expect(preview.markings.find((m) => m.id === 'M1')?.name).toBe('Front door');
  });
});

describe('old proposal with a change on the removed code field (stage 9)', () => {
  /** The Screen as it was before v9: with the removed field's value (`implementacao`). */
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

  /** The v8 project (with the value), the proposal made over it and the current project (migrated, v9). */
  function oldProposal() {
    const entry = { _id: 'C1', platform: 'android', path: 'a/Screen.kt' };
    const v8 = withLegacyValue(codeProject(), [entry]);
    let after = withLegacyValue(v8, [
      entry,
      { _id: 'C2', platform: 'ios', path: 'B.swift' },
    ]);
    // pt-BR kept: shared fixture field keys (codeProject in specFixtures.ts, other phase)
    after = setFieldValue(after, 'AS', 'rota', '/signup/new');
    const p = propose(v8, after);
    return { p, current: codeProject() };
  }

  it('the removed field\'s change shows up as a conflict and, when accepted, blocks as "does not fit"', () => {
    const { p, current } = oldProposal();
    const legacy = changeOf(p, 'annotation', 'AS', 'values.implementacao');
    const route = changeOf(p, 'annotation', 'AS', 'values.rota');
    // The review builds the tree and the status of each change with no error.
    expect(reviewTree(p, current).changeIdsOf({ level: 'proposal', id: null })).toEqual(
      expect.arrayContaining([legacy.id, route.id]),
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

  it("with the removed field's change rejected, the rest applies without bringing it back", () => {
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
    // pt-BR kept: shared fixture data (cadastroProject/codeProject in specFixtures.ts, other phase)
    expect(screen?.values).toEqual({ nome: 'Cadastro', rota: '/signup/new' });
    expect(result.proposal.status).toBe('applied');
    expect(validateProject(result.project)).toEqual([]);
  });

  it('the Proposed view leaves the change out (problems) and does not bring the value', () => {
    const { p, current } = oldProposal();
    const legacy = changeOf(p, 'annotation', 'AS', 'values.implementacao');
    const preview = previewProject(current, p);
    expect(preview.problems).toEqual([{ code: 'field-mismatch', changeId: legacy.id }]);
    const screen = preview.project.annotations.find((a) => a.id === 'AS');
    // pt-BR kept: shared fixture data (cadastroProject/codeProject in specFixtures.ts, other phase)
    expect(screen?.values).toEqual({ nome: 'Cadastro', rota: '/signup/new' });
  });

  it('a type that cannot be resolved (without the specialization copy) does not decide: applies', () => {
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

describe('library package in the proposal (phase B4)', () => {
  const PKG_SPEC = { ...loadExample('sdui'), formatVersion: 4 } as ReturnType<
    typeof loadExample
  >;

  function withPackage(p: Project, version: number): Project {
    const spec = { ...PKG_SPEC, version };
    return updateOrApply(p, spec);
  }

  /** Applies (or raises) the specialization with the file inside the `specs/sdui/` folder. */
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

  it('create: returns the folder, where the files wait and the specialization', () => {
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

  it("update: returns the new version's package", () => {
    const base = withPackage(sampleProject(), 1);
    const after = withPackage(base, 2);
    const p = acceptAll(propose(base, after), base);
    expect(changeOf(p, 'specialization', 'sdui').kind).toBe('update');
    const result = apply(base, p);
    expect(result.packages.map((x) => [x.specId, x.version, x.dir])).toEqual([
      ['sdui', 2, 'specs/sdui'],
    ]);
  });

  it('only the accepted ones, and only once: what was not applied now is not included', () => {
    const base = sampleProject();
    const p = propose(base, withPackage(base, 1));
    expect(apply(base, p).packages).toEqual([]);
    const accepted = acceptAll(p, base);
    const first = apply(base, accepted);
    expect(first.packages).toHaveLength(1);
    // Already applied: the rest of the proposal does not repeat the package.
    expect(apply(first.project, first.proposal).packages).toEqual([]);
  });

  it('a single-file specialization (specs/<id>.json) and removal bring no package', () => {
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

describe('migration that removes the field in the same proposal (remove-field and rename-field)', () => {
  /** The v1 specialization applied, with the annotation `B1` (Button) with the `label` field filled in. */
  function before(): Project {
    return libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'test', size: 3 } },
    ]);
  }

  /** The v2 without the `label` field (and `title` in its place, in the rename), with the given migration. */
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

  it('remove-field: the proposal brings the value going to null and accepting everything applies, without the key', () => {
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

  it('rename-field: accepting everything leaves the value in the new field, without the old key', () => {
    const { base, p } = proposeUpdate(RENAME, 'title');
    expect(changeOf(p, 'annotation', 'B1', 'values.label').to).toBeNull();
    const result = apply(base, acceptAll(p, base));
    expect(valuesOf(result.project, 'B1').title).toBe('test');
    expect(valuesOf(result.project, 'B1')).not.toHaveProperty('label');
    expect(getAnnotationIssues(result.project, 'B1')).toEqual([]);
  });

  it('only the accepted value (without the specialization): the key still belongs to the old type and goes to null', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const clear = changeOf(p, 'annotation', 'B1', 'values.label');
    const only = decided(p, base, { level: 'change', id: clear.id }, 'accepted');
    const result = apply(base, only);
    expect(valuesOf(result.project, 'B1').label).toBeNull();
    expect(result.proposal.status).toBe('open');
  });

  it('rejecting the value and accepting the specialization still applies (orphan value as a pending item)', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const clear = changeOf(p, 'annotation', 'B1', 'values.label');
    const decisions = decided(
      acceptAll(p, base),
      base,
      { level: 'change', id: clear.id },
      'rejected',
    );
    const result = apply(base, decisions);
    expect(valuesOf(result.project, 'B1').label).toBe('test');
    expect(getAnnotationIssues(result.project, 'B1')).toEqual([
      { code: 'unknown-field', key: 'label' },
    ]);
  });

  it('Proposed view: clearing the key outside the type is not a problem', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const preview = previewProject(base, p);
    expect(preview.problems).toEqual([]);
    expect(valuesOf(preview.project, 'B1')).not.toHaveProperty('label');
  });

  it('regression: a new value on a key outside the type is still field-mismatch', () => {
    const { base, p } = proposeUpdate(REMOVE);
    const clear = changeOf(p, 'annotation', 'B1', 'values.label');
    const stale: Proposal = {
      ...p,
      changes: p.changes.map((c) =>
        c.id === clear.id ? { ...c, from: 'test', to: 'new' } : c,
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
    expect(annotationOf(base, 'B1').values).toMatchObject({ label: 'test' });
  });
});
