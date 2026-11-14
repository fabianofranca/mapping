// `ref` para a anotação inteira (etapa #679, CF1): o quarto formato `{ annotationId }`, o alvo
// aceito por `accepts.annotations`, o rótulo, as pendências e os leitores do valor.
import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addTableRow,
  removeAnnotation,
  drawingValues,
  findCellRefTargets,
  findRefTargets,
  getAnnotationIssues,
  getBacklinks,
  isRefAccepted,
  ModelError,
  parseRefValue,
  refLabel,
  refsOf,
  refTargetText,
  resolveRef,
  setFieldValue,
  setTableCell,
  countBrokenRefs,
  runLibraryMigrations,
  type Project,
  type Spec,
} from '../../src/model';
import { annotationSpec, world, type Mutable } from './refAnnotationFixtures';

const ann = (id: string) => ({ annotationId: id });

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
  return 'ok';
}

describe('parseRefValue com a anotação inteira', () => {
  it('{ annotationId } é o quarto formato; os três de hoje continuam; chave a mais é null', () => {
    expect(parseRefValue({ annotationId: 'A' })).toEqual({ annotationId: 'A' });
    expect(parseRefValue({ annotationId: 'A', entryId: 'E' })).toEqual({
      annotationId: 'A',
      entryId: 'E',
    });
    expect(parseRefValue({ annotationId: 'A', key: 'k' })).toEqual({
      annotationId: 'A',
      key: 'k',
    });
    expect(parseRefValue({ annotationId: 'A', key: 'k', rowId: 'R' })).toEqual({
      annotationId: 'A',
      key: 'k',
      rowId: 'R',
    });
    expect(parseRefValue({ annotationId: 'A', extra: 1 })).toBeNull();
    expect(parseRefValue({ annotationId: 'A', rowId: 'R' })).toBeNull();
    expect(parseRefValue({ annotationId: '' })).toBeNull();
    expect(parseRefValue({ key: 'k' })).toBeNull();
  });
});

describe('resolveRef da anotação inteira', () => {
  it('a anotação existe → alvo; sumiu → quebrada', () => {
    const p = world();
    const target = resolveRef(p, ann('AM'));
    expect(target?.kind).toBe('annotation');
    expect(target?.annotation.id).toBe('AM');
    expect(resolveRef(removeAnnotation(p, 'AM'), ann('AM'))).toBeNull();
  });
});

describe('rótulo da instância', () => {
  it('name; senão labelField; senão o nome do tipo; refTargetText dá o mesmo', () => {
    let p = world();
    expect(refLabel(p, ann('AM'))).toBe('Cliente'); // labelField
    expect(refLabel(p, ann('AM2'))).toBe('Modelo'); // nome do tipo
    expect(refLabel(p, ann('AV'))).toBe('Avulso'); // tipo sem labelField
    expect(refTargetText(p, ann('AM'))).toBe('Cliente');
    expect(refTargetText(p, ann('AM2'))).toBe('Modelo');
    expect(refTargetText(p, ann('AF'))).toBe('Glossário');
    p = {
      ...p,
      annotations: p.annotations.map((a) => (a.id === 'AM' ? { ...a, name: 'Dono' } : a)),
    };
    expect(refLabel(p, ann('AM'))).toBe('Dono');
    expect(refTargetText(p, ann('AM'))).toBe('Dono');
    expect(refLabel(removeAnnotation(p, 'AM'), ann('AM'))).toBe('(referência quebrada)');
    expect(refTargetText(removeAnnotation(p, 'AM'), ann('AM'))).toBeNull();
  });

  it('anotação livre sem nome não tem texto de alvo', () => {
    let p = world();
    p = addAnnotation(p, {
      id: 'AN',
      markingId: 'M4',
      layerId: p.layers[0]!.id,
      entries: [],
    });
    expect(refTargetText(p, ann('AN'))).toBeNull();
    expect(refLabel(p, ann('AN'))).toBe('Anotação');
  });
});

describe('isRefAccepted com accepts.annotations', () => {
  const accepts = (p: Project, key: string) => {
    const lista = p.specializations
      .find((s) => s.id === 'rc')!
      .spec!.layers.flatMap((l) => l.annotationTypes)
      .find((t) => t.id === 'lista')!;
    const f = lista.fields.find((x) => x.key === key);
    if (f?.type !== 'ref') throw new Error(key);
    return f.accepts;
  };

  it('aceita o tipo coberto da mesma especialização', () => {
    const p = world();
    expect(isRefAccepted(p, 'AL', accepts(p, 'item'), ann('AM'))).toBe(true);
    expect(isRefAccepted(p, 'AL', accepts(p, 'item'), ann('AV'))).toBe(true);
    expect(isRefAccepted(p, 'AL', accepts(p, 'soAvulso'), ann('AV'))).toBe(true);
  });

  it('recusa outro tipo, outra especialização, anotação livre e a própria origem', () => {
    const p = world();
    expect(isRefAccepted(p, 'AL', accepts(p, 'soAvulso'), ann('AM'))).toBe(false);
    expect(isRefAccepted(p, 'AL', accepts(p, 'item'), ann('AL2'))).toBe(false);
    expect(isRefAccepted(p, 'AL', accepts(p, 'item'), ann('AX'))).toBe(false);
    expect(isRefAccepted(p, 'AL', accepts(p, 'item'), ann('AF'))).toBe(false);
    expect(isRefAccepted(p, 'AL', accepts(p, 'item'), ann('AL'))).toBe(false);
    expect(isRefAccepted(p, 'AL', accepts(p, 'item'), ann('NADA'))).toBe(false);
    // Sem accepts.annotations, a anotação inteira não é alvo.
    expect(isRefAccepted(p, 'AL', { tags: ['data-field'] }, ann('AM'))).toBe(false);
  });

  it('setFieldValue e setTableCell gravam o aceito e recusam o resto', () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'item', ann('AM'));
    expect(p.annotations.find((a) => a.id === 'AL')?.values?.item).toEqual(ann('AM'));
    expect(code(() => setFieldValue(p, 'AL', 'soAvulso', ann('AM')))).toBe(
      'ref-not-accepted',
    );
    expect(code(() => setFieldValue(p, 'AL', 'item', ann('AL')))).toBe('self-ref');
    p = addTableRow(p, 'AL', 'itens', 'I1');
    p = setTableCell(p, 'AL', 'itens', 'I1', 'alvo', ann('AV'));
    expect(code(() => setTableCell(p, 'AL', 'itens', 'I1', 'alvo', ann('AX')))).toBe(
      'ref-not-accepted',
    );
  });
});

describe('alvos do seletor', () => {
  it('findRefTargets e findCellRefTargets listam as anotações aceitas, na ordem do projeto', () => {
    const p = world();
    const targets = findRefTargets(p, 'AL', 'item');
    expect(targets.map((t) => [t.ref, t.label, t.annotation.id, t.tags])).toEqual([
      [ann('AM'), 'Cliente', 'AM', []],
      [ann('AM2'), 'Modelo', 'AM2', []],
      [ann('AV'), 'Avulso', 'AV', []],
    ]);
    const cells = findCellRefTargets(p, 'AL', 'itens', 'alvo');
    expect(cells.map((t) => t.ref)).toEqual([ann('AM'), ann('AM2'), ann('AV')]);
  });

  it('um campo com tags e annotations lista os dois tipos de alvo; a anotação sai uma vez', () => {
    const p = world();
    const refs = findRefTargets(p, 'AL', 'mix').map((t) => t.ref);
    expect(refs).toEqual([
      ann('AM'),
      { annotationId: 'AM', key: 'campos', rowId: 'R1' },
      { annotationId: 'AM', key: 'campos', rowId: 'R2' },
      ann('AM2'),
    ]);
    const row = findRefTargets(p, 'AL', 'mix').find((t) => 'rowId' in t.ref)!;
    expect(row.tags).toEqual(['data-field']);
  });
});

/** As pendências de referência da anotação (o resto, como `required-empty`, não interessa). */
const refIssues = (p: Project, id: string) =>
  getAnnotationIssues(p, id).filter(
    (i) => i.code === 'broken-ref' || i.code === 'ref-not-accepted',
  );

describe('pendências', () => {
  it('alvo apagado → broken-ref; tipo que deixou de ser aceito → ref-not-accepted', () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'item', ann('AM'));
    expect(refIssues(p, 'AL')).toEqual([]);
    expect(refIssues(removeAnnotation(p, 'AM'), 'AL')).toEqual([
      { code: 'broken-ref', key: 'item' },
    ]);
    // O campo passa a aceitar só `avulso`: o `modelo` apontado deixou de ser aceito.
    const narrowed = structuredClone(annotationSpec()) as unknown as Mutable;
    const lista = narrowed.layers
      .find((l) => l.id === 'telas')!
      .annotationTypes.find((t) => t.id === 'lista')!;
    const item = (lista.fields as { key: string; accepts?: unknown }[]).find(
      (f) => f.key === 'item',
    )!;
    item.accepts = { annotations: ['avulso'] };
    const q = {
      ...p,
      specializations: p.specializations.map((s) =>
        s.id === 'rc' ? { ...s, spec: narrowed as unknown as Spec } : s,
      ),
    };
    expect(refIssues(q, 'AL')).toEqual([{ code: 'ref-not-accepted', key: 'item' }]);
  });

  it('a célula também: apagar o alvo → broken-ref com a linha e a coluna', () => {
    let p = world();
    p = addTableRow(p, 'AL', 'itens', 'I1');
    p = setTableCell(p, 'AL', 'itens', 'I1', 'alvo', ann('AV'));
    expect(refIssues(p, 'AL')).toEqual([]);
    expect(refIssues(removeAnnotation(p, 'AV'), 'AL')).toEqual([
      { code: 'broken-ref', key: 'itens', rowId: 'I1', column: 'alvo' },
    ]);
  });
});

describe('refsOf e getBacklinks', () => {
  it('a origem lista o ref; a anotação-alvo lista a origem; entry/row/field não se confundem', () => {
    let p = world();
    p = setFieldValue(p, 'AL', 'item', ann('AM'));
    p = setFieldValue(p, 'AL', 'mix', { annotationId: 'AM', key: 'campos', rowId: 'R1' });
    p = addTableRow(p, 'AL', 'itens', 'I1');
    p = setTableCell(p, 'AL', 'itens', 'I1', 'alvo', ann('AM'));
    const al = p.annotations.find((a) => a.id === 'AL')!;
    expect(refsOf(p, al).map((r) => [r.key, r.ref, r.rowId, r.column])).toEqual([
      ['item', ann('AM'), undefined, undefined],
      ['mix', { annotationId: 'AM', key: 'campos', rowId: 'R1' }, undefined, undefined],
      ['itens', ann('AM'), 'I1', 'alvo'],
    ]);
    const backs = getBacklinks(p, 'AM');
    expect(backs.map((b) => [b.source.id, b.key])).toEqual([
      ['AL', 'item'],
      ['AL', 'mix'],
      ['AL', 'itens'],
    ]);
    const whole = backs.filter(
      (b) => !('key' in b.ref) && !('entryId' in b.ref) && !('rowId' in b.ref),
    );
    expect(whole.map((b) => b.key)).toEqual(['item', 'itens']);
  });
});

describe('rótulos nas exibições e no repeat do componente', () => {
  it('a célula resolvida pelo rótulo da instância; a quebrada vira null com aviso', () => {
    let p = world();
    p = addTableRow(p, 'AL', 'itens', 'I1');
    p = setTableCell(p, 'AL', 'itens', 'I1', 'alvo', ann('AM'));
    p = addTableRow(p, 'AL', 'itens', 'I2');
    p = setTableCell(p, 'AL', 'itens', 'I2', 'alvo', ann('AV'));
    const type = p.specializations
      .find((s) => s.id === 'rc')!
      .spec!.layers.flatMap((l) => l.annotationTypes)
      .find((t) => t.id === 'lista')!;
    const al = p.annotations.find((a) => a.id === 'AL')!;
    expect(drawingValues(p, al, type).values.itens).toEqual([
      { alvo: 'Cliente' },
      { alvo: 'Avulso' },
    ]);
    const q = removeAnnotation(p, 'AV');
    const out = drawingValues(
      q,
      q.annotations.find((a) => a.id === 'AL')!,
      type,
    );
    expect(out.values.itens).toEqual([{ alvo: 'Cliente' }, { alvo: null }]);
    expect(out.warnings.map((w) => w.text)).toEqual([
      'broken reference: itens[2].alvo',
    ]);
  });
});

describe('migrações da biblioteca (decisão 9)', () => {
  const withWholeRef = (): Project => {
    const p = world();
    return {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AL' ? { ...a, values: { ...a.values, item: ann('AM') } } : a,
      ),
    };
  };
  const next = (steps: unknown[]): Spec => {
    const s = structuredClone(annotationSpec()) as unknown as Record<string, unknown>;
    s.version = 2;
    s.migrations = [{ from: 1, to: 2, steps }];
    return s as unknown as Spec;
  };

  it('rename-field não mexe no { annotationId }', () => {
    const p = withWholeRef();
    const run = runLibraryMigrations(
      p,
      next([{ op: 'rename-field', type: 'modelo', from: 'campos', to: 'atributos' }]),
      1,
    );
    expect(run.steps[0]).toMatchObject({ refs: 0 });
    expect(run.project.annotations.find((a) => a.id === 'AL')?.values?.item).toEqual(
      ann('AM'),
    );
  });

  it('apagar o tipo do alvo apaga as anotações e o ref conta como quebrado', () => {
    const p = withWholeRef();
    const run = runLibraryMigrations(
      p,
      next([{ op: 'remove-type', type: 'modelo', mode: 'delete' }]),
      1,
    );
    expect(run.project.annotations.some((a) => a.id === 'AM')).toBe(false);
    expect(resolveRef(run.project, ann('AM'))).toBeNull();
    expect(countBrokenRefs(p, run.project)).toBeGreaterThanOrEqual(1);
  });
});
