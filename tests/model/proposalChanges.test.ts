import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  addContainer,
  addLayer,
  applySpecialization,
  computeChanges,
  createMarking,
  moveContainer,
  moveLayer,
  moveMarking,
  parseProposalText,
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
  serializeProposal,
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
  updateEntry,
  updateSpecialization,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, propose } from './proposalFixtures';
import { cadastroProject, codeProject, idGen, loadExample } from './specFixtures';

const FIGMA = { system: 'figma', id: '1:2', url: null };

describe('change computation: markings', () => {
  it('an identical project produces no change', () => {
    expect(computeChanges(sampleProject(), sampleProject())).toEqual([]);
  });

  it('creation: one change with the whole entity and the final id', () => {
    const base = sampleProject();
    const after = createMarking(base, {
      id: 'M9',
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 100, height: 100 },
      name: 'New',
    });
    expect(propose(base, after).changes).toEqual([
      {
        id: 'c1',
        kind: 'create',
        entity: 'marking',
        entityId: 'M9',
        imageId: 'I2',
        markingId: 'M9',
        field: null,
        from: null,
        to: {
          id: 'M9',
          containerId: 'I2',
          parentId: null,
          floating: false,
          name: 'New',
          rect: { x: 200, y: 200, width: 100, height: 100 },
          needsReview: false,
          locked: false,
          source: null,
        },
      },
    ]);
  });

  it('removal: one change per entity that the model cascade removes', () => {
    const base = sampleProject();
    const p = propose(base, removeMarking(base, 'M2'));
    expect(p.changes.map((c) => [c.kind, c.entity, c.entityId])).toEqual([
      ['remove', 'marking', 'M2'],
      ['remove', 'marking', 'M3'],
      ['remove', 'annotation', 'A3'],
    ]);
    expect(changeOf(p, 'marking', 'M2').from).toMatchObject({ id: 'M2', parentId: 'M1' });
    expect(changeOf(p, 'annotation', 'A3')).toMatchObject({
      imageId: 'I1',
      markingId: 'M2',
      to: null,
    });
  });

  it('update: one change per field (name, rect, lock and source; the parent is not compared)', () => {
    const base = sampleProject();
    let after = renameMarking(base, 'M4', 'Headlight');
    after = setMarkingRect(after, 'M4', { x: 10, y: 20, width: 100, height: 100 });
    after = setMarkingLocked(after, 'M1', true);
    after = setMarkingSource(after, 'M1', FIGMA);
    const p = propose(base, after);
    expect(changeOf(p, 'marking', 'M4', 'name')).toMatchObject({
      kind: 'update',
      from: null,
      to: 'Headlight',
    });
    expect(changeOf(p, 'marking', 'M4', 'rect')).toMatchObject({
      from: { x: 0, y: 0, width: 100, height: 100 },
      to: { x: 10, y: 20, width: 100, height: 100 },
    });
    expect(changeOf(p, 'marking', 'M1', 'locked')).toMatchObject({
      from: false,
      to: true,
    });
    expect(changeOf(p, 'marking', 'M1', 'source')).toMatchObject({
      from: null,
      to: FIGMA,
    });
    expect(p.changes).toHaveLength(4);
    expect(p.changes.map((c) => c.field)).not.toContain('parentId');
  });

  it('the derived parent changes without becoming a change (parentId is not compared)', () => {
    const base = sampleProject();
    // M3 leaves M2 by geometry: only the rect appears, the parent (M2 → M1) is recomputed.
    const after = moveMarking(base, 'M3', 0, 200);
    expect(after.markings.find((m) => m.id === 'M3')?.parentId).not.toBe('M2');
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entityId, c.field])).toEqual([['M3', 'rect']]);
  });

  it('floating: the space changes (container → canvas) and becomes a composite `space`', () => {
    const base = sampleProject();
    const after = setMarkingFloating(base, 'M4', true);
    const p = propose(base, after);
    const moved = after.markings.find((m) => m.id === 'M4');
    expect(p.changes.map((c) => [c.entityId, c.field])).toEqual([
      ['M4', 'space'],
      ['M4', 'floating'],
    ]);
    const space = changeOf(p, 'marking', 'M4', 'space');
    expect(space).toMatchObject({
      kind: 'update',
      imageId: null,
      markingId: 'M4',
      from: { containerId: 'I2', rect: { x: 0, y: 0, width: 100, height: 100 } },
      to: { containerId: null, rect: moved?.rect },
    });
    expect(changeOf(p, 'marking', 'M4', 'floating')).toMatchObject({
      from: false,
      to: true,
    });
    // No separate rect: the rect goes inside the composite.
    expect(p.changes.some((c) => c.field === 'rect')).toBe(false);
  });

  it('canvas marking: creation without a container has a null imageId and a markingId', () => {
    const base = sampleProject();
    const after = createMarking(base, {
      id: 'C1',
      containerId: null,
      rect: { x: -50, y: -50, width: 100, height: 100 },
      name: 'Note',
    });
    const [change] = propose(base, after).changes;
    expect(change).toMatchObject({
      kind: 'create',
      entity: 'marking',
      imageId: null,
      markingId: 'C1',
      to: { containerId: null, floating: false },
    });
  });

  it('moving the marking takes its children: one rect change in each', () => {
    const base = sampleProject();
    const p = propose(base, moveMarking(base, 'M1', 10, -5));
    expect(p.changes.map((c) => [c.entityId, c.field])).toEqual([
      ['M1', 'rect'],
      ['M2', 'rect'],
      ['M3', 'rect'],
    ]);
  });
});

describe('change computation: images', () => {
  it('creation, update of each field and removal', () => {
    const base = sampleProject();
    let after = addContainer(base, {
      id: 'I3',
      file: 'images/new.png',
      width: 400,
      height: 300,
    });
    after = renameContainer(after, 'I2', 'Front');
    after = moveContainer(after, 'I2', 5000, 5000);
    after = setContainerMarkingColor(after, 'I2', '#FFEB3B');
    after = setImageLocked(after, 'I2', true);
    after = setImageSource(after, 'I2', FIGMA);
    const p = propose(base, after);
    expect(changeOf(p, 'image', 'I3')).toMatchObject({
      kind: 'create',
      imageId: 'I3',
      markingId: null,
      to: { id: 'I3', file: 'images/new.png', width: 400, height: 300, source: null },
    });
    expect(
      p.changes.filter((c) => c.entityId === 'I2').map((c) => [c.field, c.to]),
    ).toEqual([
      ['name', 'Front'],
      ['placement', { x: 5000, y: 5000, scale: 1 }],
      ['markingColor', '#FFEB3B'],
      ['locked', true],
      ['source', FIGMA],
    ]);

    const removed = propose(base, removeContainer(base, 'I2'));
    expect(removed.changes.map((c) => [c.kind, c.entity, c.entityId])).toEqual([
      ['remove', 'image', 'I2'],
      ['remove', 'marking', 'M4'],
      ['remove', 'annotation', 'A4'],
    ]);
  });

  it('file replacement: `file` with the dimensions; the rescaled markings change rect', () => {
    const base = sampleProject();
    const after = replaceContainer(base, 'I2', {
      file: 'images/front-2.jpg',
      width: 2000,
      height: 2000,
    });
    const p = propose(base, after);
    expect(changeOf(p, 'image', 'I2', 'file')).toMatchObject({
      from: { file: 'images/frente.jpg', width: 1000, height: 1000 },
      to: { file: 'images/front-2.jpg', width: 2000, height: 2000 },
    });
    expect(changeOf(p, 'image', 'I2', 'placement').to).toMatchObject({ scale: 0.5 });
    expect(changeOf(p, 'marking', 'M4', 'rect').to).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
  });
});

describe('change computation: annotations', () => {
  it('creation, name, owner and removal with the linked ones', () => {
    const base = sampleProject();
    let after = addAnnotation(base, {
      id: 'A9',
      markingId: 'M4',
      layerId: 'L1',
      entries: [{ id: 'E9', key: 'color', value: 'blue' }],
    });
    after = renameAnnotation(after, 'A3', 'Latch');
    after = setAnnotationParent(after, 'A2', 'A1');
    const p = propose(base, after);
    expect(changeOf(p, 'annotation', 'A9')).toMatchObject({
      kind: 'create',
      imageId: 'I2',
      markingId: 'M4',
      to: { id: 'A9', entries: [{ id: 'E9', key: 'color', value: 'blue' }] },
    });
    expect(changeOf(p, 'annotation', 'A3', 'name').to).toBe('Latch');
    expect(changeOf(p, 'annotation', 'A2', 'parentAnnotationId')).toMatchObject({
      from: null,
      to: 'A1',
      markingId: 'M1',
    });

    const removed = propose(after, removeAnnotation(after, 'A1'));
    expect(removed.changes.map((c) => [c.kind, c.entityId])).toEqual([
      ['remove', 'A1'],
      ['remove', 'A2'],
    ]);
  });

  it('pairs: one change per pair (created, updated, removed), by id', () => {
    const base = sampleProject();
    let after = addEntry(base, 'A1', { id: 'E7', key: 'side', value: 'left' });
    after = updateEntry(after, 'A1', 'E1', { key: 'tipo', value: 'scratch' });
    after = removeEntry(after, 'A1', 'E2');
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.field, c.from, c.to])).toEqual([
      [
        'entries.E1',
        { key: 'tipo', value: 'amassado' },
        { key: 'tipo', value: 'scratch' },
      ],
      ['entries.E7', null, { key: 'side', value: 'left' }],
      // pt-BR kept: shared fixture data (sampleProject entries) asserted by other tests
      ['entries.E2', { key: 'gravidade', value: 'média' }, null],
    ]);
  });

  it('typed annotation: one change per key of values', () => {
    const base = cadastroProject();
    let after = setFieldValue(base, 'AB', 'estilo', 'secondary');
    after = setFieldValue(after, 'AB', 'texto', 'Enviar');
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.entityId, c.field, c.from, c.to])).toEqual([
      ['AB', 'values.texto', 'Cadastrar', 'Enviar'],
      ['AB', 'values.estilo', 'primary', 'secondary'],
    ]);
    expect(p.changes[0]).toMatchObject({ imageId: 'I1', markingId: 'MC' });
  });

  it('type change (annotation converted to free): one `type` change with values and entries', () => {
    const base = cadastroProject();
    const after = removeSpecialization(base, 'modelo-dados', 'convert', {
      newId: idGen('X'),
    });
    const p = propose(base, after);
    const change = changeOf(p, 'annotation', 'AC', 'type');
    expect(change.from).toMatchObject({
      type: { specId: 'modelo-dados', typeId: 'classe' },
      entries: [],
    });
    expect(change.to).toMatchObject({ type: null, values: null });
    expect(
      p.changes.some((c) => c.entityId === 'AC' && c.field?.startsWith('values.')),
    ).toBe(false);
    expect(changeOf(p, 'specialization', 'modelo-dados').kind).toBe('remove');
  });
});

describe('change computation: Project group', () => {
  it('layers: creation, name, color, removal and position only for those that change relative order', () => {
    const base = addLayer(sampleProject(), {
      id: 'L3',
      name: 'Wheels',
      color: '#2E7D32',
    });
    let after = addLayer(base, { id: 'L4', name: 'Headlights', color: '#E65100' });
    after = renameLayer(after, 'L1', 'Paint');
    after = setLayerColor(after, 'L1', '#000000');
    after = moveLayer(after, 'L3', 0);
    const p = propose(base, after);
    expect(changeOf(p, 'layer', 'L4')).toMatchObject({ kind: 'create', imageId: null });
    expect(changeOf(p, 'layer', 'L1', 'name').to).toBe('Paint');
    expect(changeOf(p, 'layer', 'L1', 'color').to).toBe('#000000');
    // Only L3 changed relative order (L1 and L2 keep the same order between them).
    expect(p.changes.filter((c) => c.field === 'position')).toMatchObject([
      { entityId: 'L3', from: 2, to: 0 },
    ]);

    const removed = propose(base, removeLayer(base, 'L2'));
    expect(removed.changes.map((c) => [c.kind, c.entity, c.entityId])).toEqual([
      ['remove', 'layer', 'L2'],
      ['remove', 'annotation', 'A2'],
      ['remove', 'annotation', 'A4'],
    ]);
  });

  it('specialization: apply, update and remove; one change each (layers apart)', () => {
    const base = sampleProject();
    const spec = loadExample('sdui');
    const applied = applySpecialization(base, spec, { newId: idGen('LS') });
    const p = propose(base, applied);
    expect(changeOf(p, 'specialization', 'sdui')).toMatchObject({
      kind: 'create',
      field: null,
      to: { id: 'sdui', version: spec.version, file: 'specs/sdui.json' },
    });
    expect(p.changes.filter((c) => c.entity === 'layer').map((c) => c.entityId)).toEqual([
      'LS1',
      'LS2',
      'LS3',
    ]);

    const newer = { ...spec, version: spec.version + 1 };
    const updated = propose(applied, updateSpecialization(applied, newer));
    expect(updated.changes).toHaveLength(1);
    expect(updated.changes[0]).toMatchObject({
      kind: 'update',
      entity: 'specialization',
      field: null,
      from: { version: spec.version },
      to: { version: spec.version + 1 },
    });

    const removed = propose(applied, removeSpecialization(applied, 'sdui', 'delete'));
    expect(removed.changes.map((c) => [c.kind, c.entity])).toEqual([
      ['remove', 'specialization'],
      ['remove', 'layer'],
      ['remove', 'layer'],
      ['remove', 'layer'],
    ]);
  });

  it('repository per platform: create, update and remove, one change each', () => {
    const base = codeProject();
    const repo = { localPath: '../ios' };
    const created = propose(base, setPlatformRepo(base, 'ios', repo));
    expect(created.changes).toEqual([
      expect.objectContaining({
        kind: 'create',
        entity: 'platformRepo',
        entityId: 'ios',
        to: repo,
      }),
    ]);
    const changed = propose(base, setPlatformRepo(base, 'android', { localPath: '..' }));
    expect(changed.changes[0]).toMatchObject({
      kind: 'update',
      field: null,
      to: { localPath: '..' },
    });
    const removed = propose(base, removePlatformRepo(base, 'android'));
    expect(removed.changes[0]).toMatchObject({ kind: 'remove', entityId: 'android' });
  });
});

describe('proposal', () => {
  function bigChange(base: Project): Project {
    let after = addLayer(base, { id: 'L3', name: 'Wheels', color: '#2E7D32' });
    after = renameContainer(after, 'I2', 'Front');
    after = renameMarking(after, 'M3', 'Key');
    after = renameMarking(after, 'M1', 'Front door');
    after = renameAnnotation(after, 'A1', 'Scratch');
    return after;
  }

  it('order and ids: Project, images, markings and annotations, each in project order', () => {
    const base = sampleProject();
    const p = propose(base, bigChange(base));
    expect(p.changes.map((c) => [c.id, c.entity, c.entityId])).toEqual([
      ['c1', 'layer', 'L3'],
      ['c2', 'image', 'I2'],
      ['c3', 'marking', 'M1'],
      ['c4', 'marking', 'M3'],
      ['c5', 'annotation', 'A1'],
    ]);
  });

  it('starts open, with the base revision and the metadata; text and reading are identical', () => {
    const base = { ...sampleProject(), revision: 41 };
    const p = propose(base, bigChange(base), {
      title: '  Checkout from Figma ',
      description: 'Screens of the Checkout page.',
      origin: 'Figma: Store v3 › Checkout',
      author: 'Claude Code',
      operations: [{ op: 'update_marking', marking: 'M3', name: 'Key' }],
    });
    expect(p).toMatchObject({
      format: 'mapping-proposal',
      formatVersion: 4,
      id: 'P1',
      title: 'Checkout from Figma',
      createdAt: AT,
      baseRevision: 41,
      supersedes: null,
      status: 'open',
      revision: 0,
      decisions: {},
      notes: [],
      applied: {},
    });
    const text = serializeProposal(p);
    expect(text.endsWith('}\n')).toBe(true);
    const parsed = parseProposalText(text);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    expect(parsed.proposal).toEqual(p);
    expect(serializeProposal(parsed.proposal)).toBe(text);
  });
});
