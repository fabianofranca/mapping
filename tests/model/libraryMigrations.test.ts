import { describe, expect, it } from 'vitest';
import {
  runLibraryMigrations,
  type Annotation,
  type JsonValue,
  type Project,
  type Spec,
  type SpecMigrationStep,
} from '../../src/model';
import {
  annotationOf,
  badgeType,
  buttonType,
  libProject,
  libSpec,
  row,
  setRaw,
  valuesOf,
} from './libraryMigrationFixtures';
import { idGen } from './specFixtures';

// Execução pura das `migrations` (`runLibraryMigrations`): um teste por passo, o encadeamento de
// duas versões, a cadeia rompida e o passo sem efeito. A atualização inteira (camadas, contrato,
// impacto) está em libraryUpdate.test.ts.

/** `next` v2 com os passos dados numa entrada 1 → 2. */
function nextWith(...steps: SpecMigrationStep[]): Spec {
  return libSpec(2, undefined, { migrations: [{ from: 1, to: 2, steps }] });
}

function run(p: Project, next: Spec, from = 1) {
  return runLibraryMigrations(p, next, from, { newId: idGen('N') });
}

const ref = (annotationId: string, key: string, rowId?: string): JsonValue =>
  rowId === undefined ? { annotationId, key } : { annotationId, key, rowId };

describe('rename-type', () => {
  it('troca o typeId, mantém a camada e deixa as outras anotações como estão', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'G1', type: 'badge' },
    ]);
    const out = run(p, nextWith({ op: 'rename-type', from: 'button', to: 'cta' }));
    expect(annotationOf(out.project, 'B1').type).toEqual({
      specId: 'lib',
      typeId: 'cta',
    });
    expect(annotationOf(out.project, 'B1').layerId).toBe(annotationOf(p, 'B1').layerId);
    expect(annotationOf(out.project, 'G1')).toBe(annotationOf(p, 'G1'));
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0]).toMatchObject({ from: 1, to: 2, index: 0, annotations: 1 });
    expect(out.losses).toEqual([]);
  });
});

describe('remove-type', () => {
  it('convert: vira livre com os valores em pares; o resto não muda', () => {
    const p = libProject(libSpec(1), [
      { id: 'G1', type: 'badge', values: { text: 'novo' } },
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const out = run(p, nextWith({ op: 'remove-type', type: 'badge', mode: 'convert' }));
    const free = annotationOf(out.project, 'G1');
    expect(free.type).toBeNull();
    expect(free.values).toBeNull();
    expect(free.name).toBe('Badge');
    expect(free.entries.map((e) => [e.key, e.value])).toEqual([['text', 'novo']]);
    expect(annotationOf(out.project, 'B1')).toBe(annotationOf(p, 'B1'));
    expect(out.steps[0]).toMatchObject({ annotations: 1, converted: 1, deleted: 0 });
    expect(out.losses).toEqual([]);
  });

  it('delete: apaga a anotação e as vinculadas, uma perda por apagada', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'C1', type: 'chip', parent: 'B1' },
      { id: 'G1', type: 'badge' },
    ]);
    const out = run(p, nextWith({ op: 'remove-type', type: 'button', mode: 'delete' }));
    expect(out.project.annotations.map((a) => a.id)).toEqual(['G1']);
    expect(out.steps[0]).toMatchObject({ annotations: 1, deleted: 2, converted: 0 });
    expect(out.losses).toEqual([
      { reason: 'removed-type', annotationId: 'B1', markingId: 'M1', typeId: 'button' },
      { reason: 'removed-type', annotationId: 'C1', markingId: 'M1', typeId: 'chip' },
    ]);
  });

  it('delete: vinculada livre sai com typeId vazio', () => {
    let p = libProject(libSpec(1), [{ id: 'B1', type: 'button' }]);
    const free: Annotation = {
      id: 'F1',
      markingId: 'M1',
      layerId: 'L1',
      name: null,
      inherit: false,
      parentAnnotationId: 'B1',
      type: null,
      values: null,
      entries: [],
    };
    p = { ...p, annotations: [...p.annotations, free] };
    const out = run(p, nextWith({ op: 'remove-type', type: 'button', mode: 'delete' }));
    expect(out.project.annotations).toEqual([]);
    expect(out.losses.map((l) => [l.annotationId, l.typeId])).toEqual([
      ['B1', 'button'],
      ['F1', ''],
    ]);
  });
});

describe('rename-field', () => {
  it('move o valor para a chave nova e preserva as outras', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK', size: 3 } },
    ]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    const values = valuesOf(out.project, 'B1');
    expect(values.title).toBe('OK');
    expect('label' in values).toBe(false);
    expect(values.size).toBe(3);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 1, refs: 0 });
    expect(out.losses).toEqual([]);
  });

  it('campo ausente: nada muda', () => {
    const p = libProject(libSpec(1), [{ id: 'B1', type: 'button' }]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'nope', to: 'title' }),
    );
    expect(out.project).toBe(p);
    expect(out.steps[0]).toMatchObject({ annotations: 0, values: 0 });
  });

  it('destino ocupado e diferente: sobrescreve com perda; igual ou origem vazia: sem perda', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'B2', type: 'button' },
      { id: 'B3', type: 'button' },
    ]);
    p = setRaw(p, 'B1', { label: 'novo', title: 'velho' });
    p = setRaw(p, 'B2', { label: '', title: 'fica' });
    p = setRaw(p, 'B3', { label: 'igual', title: 'igual' });
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    expect(valuesOf(out.project, 'B1')).toEqual({ title: 'novo' });
    expect(valuesOf(out.project, 'B2')).toEqual({ title: 'fica' });
    expect(valuesOf(out.project, 'B3')).toEqual({ title: 'igual' });
    expect(out.losses).toEqual([
      {
        reason: 'overwritten-value',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'title',
        value: 'velho',
      },
    ]);
  });

  it('coluna da mesma tabela: renomeia a chave em cada linha', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { col: 'x', kind: 'a' }),
            row('r2', { col: 'y', kind: 'b', extra: 'velho' }),
            row('r3', { kind: 'a' }),
          ],
        },
      },
    ]);
    const out = run(
      p,
      nextWith({
        op: 'rename-field',
        type: 'button',
        from: 'rows.col',
        to: 'rows.extra',
      }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { extra: 'x', kind: 'a' }),
      row('r2', { extra: 'y', kind: 'b' }),
      row('r3', { kind: 'a' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 2 });
    expect(out.losses).toEqual([
      {
        reason: 'overwritten-value',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'rows.extra',
        rowId: 'r2',
        value: 'velho',
      },
    ]);
  });

  it('formas diferentes (coluna para campo): os valores de from saem com perda', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { col: 'x' }),
            row('r2', { col: '' }),
            row('r3', { col: 'z' }),
          ],
        },
      },
    ]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'rows.col', to: 'label' }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', {}),
      row('r2', {}),
      row('r3', {}),
    ]);
    expect(valuesOf(out.project, 'B1').label).toBeNull();
    expect(out.losses.map((l) => [l.reason, l.field, l.rowId, l.value])).toEqual([
      ['removed-field', 'rows.col', 'r1', 'x'],
      ['removed-field', 'rows.col', 'r3', 'z'],
    ]);
  });

  it('tabelas diferentes: também apaga os valores de from', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { rows: [row('r1', { col: 'x' })] } },
    ]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'rows.col', to: 'other.col' }),
    );
    expect(out.losses).toHaveLength(1);
    expect(out.losses[0]).toMatchObject({ reason: 'removed-field', rowId: 'r1' });
  });

  it('reescreve as referências de campo e de linha, de qualquer especialização', () => {
    let p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: { label: 'OK', rows: [row('r1', { col: 'x' })] },
      },
      { id: 'B2', type: 'button', values: { label: 'outro' } },
      { id: 'G1', type: 'badge', marking: 'M2' },
      { id: 'G2', type: 'badge', marking: 'M2' },
    ]);
    p = setRaw(p, 'G1', { target: ref('B1', 'label') });
    p = setRaw(p, 'G2', { target: ref('B1', 'rows', 'r1') });
    const foreign: Annotation = {
      ...annotationOf(p, 'G1'),
      id: 'X1',
      type: { specId: 'outra', typeId: 'qualquer' },
      values: {
        a: ref('B1', 'label'),
        b: ref('B2', 'label'),
        c: ref('B1', 'size'),
        d: { annotationId: 'B1', entryId: 'e1' },
        e: 'texto',
      },
    };
    p = { ...p, annotations: [...p.annotations, foreign] };
    const out = run(
      p,
      nextWith(
        { op: 'rename-field', type: 'button', from: 'label', to: 'title' },
        { op: 'rename-field', type: 'button', from: 'rows', to: 'items' },
      ),
    );
    expect(valuesOf(out.project, 'G1').target).toEqual(ref('B1', 'title'));
    expect(valuesOf(out.project, 'G2').target).toEqual(ref('B1', 'items', 'r1'));
    expect(valuesOf(out.project, 'X1')).toEqual({
      a: ref('B1', 'title'),
      b: ref('B2', 'title'),
      c: ref('B1', 'size'),
      d: { annotationId: 'B1', entryId: 'e1' },
      e: 'texto',
    });
    // B2 também é do tipo renomeado: a referência a ela acompanha.
    expect(out.steps.map((s) => s.refs)).toEqual([3, 1]);
    // `annotations` conta só as do tipo do passo.
    expect(out.steps.map((s) => s.annotations)).toEqual([2, 2]);
    expect(out.losses).toEqual([]);
  });

  it('não reescreve referências de outro tipo nem de outra chave', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
      { id: 'G1', type: 'badge', values: { text: 'T' } },
      { id: 'G2', type: 'badge' },
    ]);
    p = setRaw(p, 'G2', { target: ref('G1', 'label') });
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    expect(valuesOf(out.project, 'G2').target).toEqual(ref('G1', 'label'));
    expect(out.steps[0]?.refs).toBe(0);
  });
});

describe('remove-field', () => {
  it('apaga a chave e perde só o que não era vazio', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK', size: 2 } },
      { id: 'B2', type: 'button', values: { label: '' } },
      { id: 'B3', type: 'button' },
    ]);
    p = setRaw(p, 'B3', { size: 1 });
    const out = run(p, nextWith({ op: 'remove-field', type: 'button', field: 'label' }));
    expect(valuesOf(out.project, 'B1')).toEqual({ style: null, size: 2, rows: [] });
    expect('label' in valuesOf(out.project, 'B2')).toBe(false);
    expect(valuesOf(out.project, 'B3')).toEqual({ size: 1 });
    expect(out.steps[0]).toMatchObject({ annotations: 2, values: 2 });
    expect(out.losses).toEqual([
      {
        reason: 'removed-field',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'label',
        value: 'OK',
      },
    ]);
  });

  it('tabela inteira com linhas é perda; vazia não', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { rows: [row('r1', { col: 'x' })] } },
      { id: 'B2', type: 'button' },
    ]);
    const out = run(p, nextWith({ op: 'remove-field', type: 'button', field: 'rows' }));
    expect(out.losses.map((l) => [l.annotationId, l.field])).toEqual([['B1', 'rows']]);
    expect(out.losses[0]?.value).toEqual([row('r1', { col: 'x' })]);
  });

  it('coluna: apaga a célula de cada linha, com a perda por linha', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: { rows: [row('r1', { col: 'x', kind: 'a' }), row('r2', { kind: 'b' })] },
      },
    ]);
    const out = run(
      p,
      nextWith({ op: 'remove-field', type: 'button', field: 'rows.col' }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { kind: 'a' }),
      row('r2', { kind: 'b' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 1 });
    expect(out.losses).toEqual([
      {
        reason: 'removed-field',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'rows.col',
        rowId: 'r1',
        value: 'x',
      },
    ]);
  });
});

describe('map-values', () => {
  it('troca a opção antiga; o que não está no mapa fica (pendência, não perda)', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { style: 'primary' } },
      { id: 'B2', type: 'button', values: { style: 'text' } },
      { id: 'B3', type: 'button', values: { style: 'estranho' } },
      { id: 'B4', type: 'button', values: { style: null } },
    ]);
    const out = run(
      p,
      nextWith({
        op: 'map-values',
        type: 'button',
        field: 'style',
        values: { primary: 'filled', toString: 'x' },
      }),
    );
    expect(valuesOf(out.project, 'B1').style).toBe('filled');
    expect(valuesOf(out.project, 'B2').style).toBe('text');
    expect(valuesOf(out.project, 'B3').style).toBe('estranho');
    expect(valuesOf(out.project, 'B4').style).toBeNull();
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 1 });
    expect(out.losses).toEqual([]);
  });

  it('coluna: troca a célula de cada linha', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { kind: 'a' }),
            row('r2', { kind: 'b' }),
            row('r3', { kind: 'a' }),
          ],
        },
      },
    ]);
    const out = run(
      p,
      nextWith({
        op: 'map-values',
        type: 'button',
        field: 'rows.kind',
        values: { a: 'alpha' },
      }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { kind: 'alpha' }),
      row('r2', { kind: 'b' }),
      row('r3', { kind: 'alpha' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 2 });
  });
});

describe('fill-field', () => {
  const nextFill = (default_: string | number, field = 'size') =>
    libSpec(2, undefined, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'fill-field', type: 'button', field, default: default_ }],
        },
      ],
    });

  it('vazio ou ausente recebe o default; valor válido fica', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { size: null } },
      { id: 'B2', type: 'button', values: { size: 5 } },
      { id: 'B3', type: 'button' },
    ]);
    p = setRaw(p, 'B3', { label: 'sem size' });
    const out = run(p, nextFill(1));
    expect(valuesOf(out.project, 'B1').size).toBe(1);
    expect(valuesOf(out.project, 'B2').size).toBe(5);
    expect(valuesOf(out.project, 'B3')).toEqual({ label: 'sem size', size: 1 });
    expect(out.steps[0]).toMatchObject({ annotations: 2, values: 2 });
    expect(out.losses).toEqual([]);
  });

  it('valor que não vale no tipo do campo é trocado, com perda', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { size: 'grande' } },
    ]);
    const out = run(p, nextFill(1));
    expect(valuesOf(out.project, 'B1').size).toBe(1);
    expect(out.losses).toEqual([
      {
        reason: 'replaced-value',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'size',
        value: 'grande',
      },
    ]);
  });

  it('opção desconhecida fica (pendência, sem perda)', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { style: 'estranho' } },
      { id: 'B2', type: 'button', values: { style: null } },
    ]);
    const out = run(p, nextFill('text', 'style'));
    expect(valuesOf(out.project, 'B1').style).toBe('estranho');
    expect(valuesOf(out.project, 'B2').style).toBe('text');
    expect(out.losses).toEqual([]);
  });

  it('coluna: preenche as células vazias de cada linha e troca as inválidas', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { col: 'x' }),
            row('r2', {}),
            row('r3', { col: 7 }),
            row('r4', { col: '' }),
          ],
        },
      },
    ]);
    const out = run(p, nextFill('?', 'rows.col'));
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { col: 'x' }),
      row('r2', { col: '?' }),
      row('r3', { col: '?' }),
      row('r4', { col: '?' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 3 });
    expect(out.losses.map((l) => [l.reason, l.rowId, l.value])).toEqual([
      ['replaced-value', 'r3', 7],
    ]);
  });

  it('campo que não existe na versão nova: só preenche os vazios', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { size: 'grande' } },
      { id: 'B2', type: 'button', values: { size: null } },
    ]);
    // `size` foi renomeado depois na cadeia: o tipo existe, o campo não.
    const next = libSpec(
      2,
      { c: [buttonType({ fields: [{ key: 'tamanho', type: 'number' }] }), badgeType()] },
      {
        migrations: [
          {
            from: 1,
            to: 2,
            steps: [{ op: 'fill-field', type: 'button', field: 'size', default: 1 }],
          },
        ],
      },
    );
    const out = run(p, next);
    expect(valuesOf(out.project, 'B1').size).toBe('grande');
    expect(valuesOf(out.project, 'B2').size).toBe(1);
    expect(out.losses).toEqual([]);
  });
});

describe('cadeia', () => {
  it('encadeia duas versões: rename-type e depois rename-field no tipo novo', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
      { id: 'B2', type: 'button', values: { label: 'Cancelar' } },
    ]);
    const next = libSpec(3, undefined, {
      migrations: [
        { from: 1, to: 2, steps: [{ op: 'rename-type', from: 'button', to: 'cta' }] },
        {
          from: 2,
          to: 3,
          steps: [
            { op: 'rename-field', type: 'cta', from: 'label', to: 'title' },
            { op: 'remove-field', type: 'cta', field: 'size' },
          ],
        },
      ],
    });
    const out = run(p, next);
    for (const id of ['B1', 'B2']) {
      expect(annotationOf(out.project, id).type).toEqual({
        specId: 'lib',
        typeId: 'cta',
      });
      expect('title' in valuesOf(out.project, id)).toBe(true);
      expect('label' in valuesOf(out.project, id)).toBe(false);
    }
    expect(valuesOf(out.project, 'B1').title).toBe('OK');
    expect(
      out.steps.map((s) => [s.from, s.to, s.index, s.step.op, s.annotations]),
    ).toEqual([
      [1, 2, 0, 'rename-type', 2],
      [2, 3, 0, 'rename-field', 2],
      [2, 3, 1, 'remove-field', 2],
    ]);
    // `size` valia o padrão (null): vazio, sem perda.
    expect(out.losses).toEqual([]);
  });

  it('projeto já na versão intermediária roda só a parte que falta', () => {
    const p = libProject(libSpec(2), [{ id: 'B1', type: 'button' }]);
    const next = libSpec(3, undefined, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'remove-type', type: 'button', mode: 'delete' }],
        },
        {
          from: 2,
          to: 3,
          steps: [{ op: 'remove-field', type: 'button', field: 'size' }],
        },
      ],
    });
    const out = run(p, next, 2);
    expect(out.steps.map((s) => s.step.op)).toEqual(['remove-field']);
    expect(out.project.annotations).toHaveLength(1);
  });

  it('cadeia rompida: nada roda', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const next = libSpec(3, undefined, {
      migrations: [
        {
          from: 2,
          to: 3,
          steps: [{ op: 'rename-field', type: 'button', from: 'label', to: 'title' }],
        },
      ],
    });
    const out = run(p, next);
    expect(out.project).toBe(p);
    expect(out.steps).toEqual([]);
    expect(out.losses).toEqual([]);
  });

  it('sem migrations ou na mesma versão: nada roda', () => {
    const p = libProject(libSpec(1), [{ id: 'B1', type: 'button' }]);
    expect(run(p, libSpec(2)).project).toBe(p);
    expect(run(p, libSpec(2), 2).steps).toEqual([]);
  });

  it('passo que não acha nada é um no-op, mas aparece no relatório', () => {
    const p = libProject(libSpec(1), [{ id: 'G1', type: 'badge' }]);
    const steps: SpecMigrationStep[] = [
      { op: 'rename-type', from: 'button', to: 'cta' },
      { op: 'remove-type', type: 'button', mode: 'delete' },
      { op: 'rename-field', type: 'button', from: 'label', to: 'title' },
      { op: 'remove-field', type: 'button', field: 'label' },
      { op: 'map-values', type: 'button', field: 'style', values: { primary: 'x' } },
      { op: 'fill-field', type: 'button', field: 'size', default: 1 },
    ];
    const out = run(p, nextWith(...steps));
    expect(out.project).toBe(p);
    expect(out.steps).toHaveLength(6);
    for (const report of out.steps) {
      expect(report).toMatchObject({
        annotations: 0,
        values: 0,
        converted: 0,
        deleted: 0,
        refs: 0,
        losses: [],
      });
    }
  });

  it('só toca as anotações da especialização e não altera a entrada', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const other: Annotation = {
      ...annotationOf(p, 'B1'),
      id: 'X1',
      type: { specId: 'outra', typeId: 'button' },
      values: { label: 'igual' },
    };
    const withOther = { ...p, annotations: [...p.annotations, other] };
    const before = JSON.stringify(withOther);
    const out = run(
      withOther,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    expect(JSON.stringify(withOther)).toBe(before);
    expect(annotationOf(out.project, 'X1')).toBe(other);
    expect(valuesOf(out.project, 'B1')).toEqual({
      ...valuesOf(p, 'B1'),
      label: undefined,
      title: 'OK',
    });
  });
});
