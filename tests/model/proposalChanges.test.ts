import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  addImage,
  addLayer,
  applySpecialization,
  computeChanges,
  createMarking,
  moveImage,
  moveLayer,
  moveMarking,
  parseProposalText,
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
  serializeProposal,
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
  updateEntry,
  updateSpecialization,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, propose } from './proposalFixtures';
import { cadastroProject, codeProject, idGen, loadExample } from './specFixtures';

const FIGMA = { system: 'figma', id: '1:2', url: null };

describe('cálculo das mudanças: marcações', () => {
  it('projeto igual não gera mudança', () => {
    expect(computeChanges(sampleProject(), sampleProject())).toEqual([]);
  });

  it('criação: uma mudança com a entidade inteira e o id definitivo', () => {
    const base = sampleProject();
    const after = createMarking(base, {
      id: 'M9',
      imageId: 'I2',
      rect: { x: 200, y: 200, width: 100, height: 100 },
      name: 'Novo',
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
          imageId: 'I2',
          parentId: null,
          name: 'Novo',
          rect: { x: 200, y: 200, width: 100, height: 100 },
          needsReview: false,
          locked: false,
          source: null,
        },
      },
    ]);
  });

  it('remoção: uma mudança por entidade que a cascata do modelo remove', () => {
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

  it('alteração: uma mudança por campo (nome, rect, pai, trava e origem)', () => {
    const base = sampleProject();
    let after = renameMarking(base, 'M4', 'Farol');
    after = setMarkingRect(after, 'M4', { x: 10, y: 20, width: 100, height: 100 });
    after = setMarkingParent(after, 'M3', 'M1');
    after = setMarkingLocked(after, 'M1', true);
    after = setMarkingSource(after, 'M1', FIGMA);
    const p = propose(base, after);
    expect(changeOf(p, 'marking', 'M4', 'name')).toMatchObject({
      kind: 'update',
      from: null,
      to: 'Farol',
    });
    expect(changeOf(p, 'marking', 'M4', 'rect')).toMatchObject({
      from: { x: 0, y: 0, width: 100, height: 100 },
      to: { x: 10, y: 20, width: 100, height: 100 },
    });
    expect(changeOf(p, 'marking', 'M3', 'parentId')).toMatchObject({
      from: 'M2',
      to: 'M1',
    });
    expect(changeOf(p, 'marking', 'M1', 'locked')).toMatchObject({
      from: false,
      to: true,
    });
    expect(changeOf(p, 'marking', 'M1', 'source')).toMatchObject({
      from: null,
      to: FIGMA,
    });
    expect(p.changes).toHaveLength(5);
  });

  it('mover a marcação leva as filhas: uma mudança de rect em cada', () => {
    const base = sampleProject();
    const p = propose(base, moveMarking(base, 'M1', 10, -5));
    expect(p.changes.map((c) => [c.entityId, c.field])).toEqual([
      ['M1', 'rect'],
      ['M2', 'rect'],
      ['M3', 'rect'],
    ]);
  });
});

describe('cálculo das mudanças: imagens', () => {
  it('criação, alteração de cada campo e remoção', () => {
    const base = sampleProject();
    let after = addImage(base, {
      id: 'I3',
      file: 'images/nova.png',
      width: 400,
      height: 300,
    });
    after = renameImage(after, 'I2', 'Frente');
    after = moveImage(after, 'I2', 5000, 5000);
    after = setImageMarkingColor(after, 'I2', '#FFEB3B');
    after = setImageLocked(after, 'I2', true);
    after = setImageSource(after, 'I2', FIGMA);
    const p = propose(base, after);
    expect(changeOf(p, 'image', 'I3')).toMatchObject({
      kind: 'create',
      imageId: 'I3',
      markingId: null,
      to: { id: 'I3', file: 'images/nova.png', width: 400, height: 300, source: null },
    });
    expect(
      p.changes.filter((c) => c.entityId === 'I2').map((c) => [c.field, c.to]),
    ).toEqual([
      ['name', 'Frente'],
      ['placement', { x: 5000, y: 5000, scale: 1 }],
      ['markingColor', '#FFEB3B'],
      ['locked', true],
      ['source', FIGMA],
    ]);

    const removed = propose(base, removeImage(base, 'I2'));
    expect(removed.changes.map((c) => [c.kind, c.entity, c.entityId])).toEqual([
      ['remove', 'image', 'I2'],
      ['remove', 'marking', 'M4'],
      ['remove', 'annotation', 'A4'],
    ]);
  });

  it('troca de arquivo: `file` com as dimensões; as marcações reescaladas mudam de rect', () => {
    const base = sampleProject();
    const after = replaceImage(base, 'I2', {
      file: 'images/frente-2.jpg',
      width: 2000,
      height: 2000,
    });
    const p = propose(base, after);
    expect(changeOf(p, 'image', 'I2', 'file')).toMatchObject({
      from: { file: 'images/frente.jpg', width: 1000, height: 1000 },
      to: { file: 'images/frente-2.jpg', width: 2000, height: 2000 },
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

describe('cálculo das mudanças: anotações', () => {
  it('criação, nome, herança, dona e remoção com as vinculadas', () => {
    const base = sampleProject();
    let after = addAnnotation(base, {
      id: 'A9',
      markingId: 'M4',
      layerId: 'L1',
      entries: [{ id: 'E9', key: 'cor', value: 'azul' }],
    });
    after = renameAnnotation(after, 'A3', 'Trinco');
    after = setAnnotationInherit(after, 'A1', true);
    after = setAnnotationParent(after, 'A2', 'A1');
    const p = propose(base, after);
    expect(changeOf(p, 'annotation', 'A9')).toMatchObject({
      kind: 'create',
      imageId: 'I2',
      markingId: 'M4',
      to: { id: 'A9', entries: [{ id: 'E9', key: 'cor', value: 'azul' }] },
    });
    expect(changeOf(p, 'annotation', 'A3', 'name').to).toBe('Trinco');
    expect(changeOf(p, 'annotation', 'A1', 'inherit').to).toBe(true);
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

  it('pares: uma mudança por par (criado, alterado, removido), pelo id', () => {
    const base = sampleProject();
    let after = addEntry(base, 'A1', { id: 'E7', key: 'lado', value: 'esquerdo' });
    after = updateEntry(after, 'A1', 'E1', { key: 'tipo', value: 'risco' });
    after = removeEntry(after, 'A1', 'E2');
    const p = propose(base, after);
    expect(p.changes.map((c) => [c.field, c.from, c.to])).toEqual([
      ['entries.E1', { key: 'tipo', value: 'amassado' }, { key: 'tipo', value: 'risco' }],
      ['entries.E7', null, { key: 'lado', value: 'esquerdo' }],
      ['entries.E2', { key: 'gravidade', value: 'média' }, null],
    ]);
  });

  it('anotação tipada: uma mudança por chave de values', () => {
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

  it('troca de tipo (anotação convertida em livre): uma mudança `type` com values e entries', () => {
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

describe('cálculo das mudanças: grupo Projeto', () => {
  it('camadas: criação, nome, cor, remoção e posição só de quem muda de ordem relativa', () => {
    const base = addLayer(sampleProject(), { id: 'L3', name: 'Rodas', color: '#2E7D32' });
    let after = addLayer(base, { id: 'L4', name: 'Faróis', color: '#E65100' });
    after = renameLayer(after, 'L1', 'Pintura');
    after = setLayerColor(after, 'L1', '#000000');
    after = moveLayer(after, 'L3', 0);
    const p = propose(base, after);
    expect(changeOf(p, 'layer', 'L4')).toMatchObject({ kind: 'create', imageId: null });
    expect(changeOf(p, 'layer', 'L1', 'name').to).toBe('Pintura');
    expect(changeOf(p, 'layer', 'L1', 'color').to).toBe('#000000');
    // Só L3 mudou de ordem relativa (L1 e L2 continuam na mesma ordem entre si).
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

  it('especialização: aplicar, atualizar e remover; uma mudança cada (camadas à parte)', () => {
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

  it('repositório por plataforma: criar, alterar e remover, uma mudança cada', () => {
    const base = codeProject();
    const repo = { urlTemplate: 'https://git.example.com/ios/{path}', localPath: null };
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

describe('proposta', () => {
  function bigChange(base: Project): Project {
    let after = addLayer(base, { id: 'L3', name: 'Rodas', color: '#2E7D32' });
    after = renameImage(after, 'I2', 'Frente');
    after = renameMarking(after, 'M3', 'Chave');
    after = renameMarking(after, 'M1', 'Porta da frente');
    after = renameAnnotation(after, 'A1', 'Risco');
    return after;
  }

  it('ordem e ids: Projeto, imagens, marcações e anotações, cada uma na ordem do projeto', () => {
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

  it('nasce aberta, com a revision de base e os metadados; texto e leitura são idênticos', () => {
    const base = { ...sampleProject(), revision: 41 };
    const p = propose(base, bigChange(base), {
      title: '  Checkout a partir do Figma ',
      description: 'Telas da página Checkout.',
      origin: 'Figma: Loja v3 › Checkout',
      author: 'Claude Code',
      operations: [{ op: 'update_marking', marking: 'M3', name: 'Chave' }],
    });
    expect(p).toMatchObject({
      format: 'mapping-proposal',
      formatVersion: 1,
      id: 'P1',
      title: 'Checkout a partir do Figma',
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
