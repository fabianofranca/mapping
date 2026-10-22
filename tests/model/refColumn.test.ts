// Coluna `ref` em `table` (ME4, decisão (e)): a lista de referências como dado. A célula guarda
// uma referência, com o mesmo `accepts` de um campo `ref`; as pendências, a resolução, as
// migrações da biblioteca e o texto das exibições tratam a célula como tratam o campo.
import { describe, expect, it } from 'vitest';
import {
  addTableRow,
  codeBlueprint,
  countBrokenRefs,
  drawingValues,
  findCellRefTargets,
  getAnnotationIssues,
  getBacklinks,
  isRefAccepted,
  ModelError,
  refColumnOf,
  refLabel,
  refPathText,
  refsBrokenBy,
  refsOf,
  removeTableRow,
  resolveRef,
  runLibraryMigrations,
  setFieldValue,
  setTableCell,
  typedDisplayLines,
  typedValuesToPairs,
  type JsonValue,
  type Project,
} from '../../src/model';
import { R1, R2, E1, build, cell, spec, type Raw } from './refColumnFixtures';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ModelError);
    expect((e as ModelError).code).toBe(code);
    return;
  }
  throw new Error(`esperava o erro ${code}`);
}

describe('definir a célula', () => {
  it('grava uma linha de tabela e uma tupla livre aceitas; null limpa', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    expect(cell(p)).toEqual(R1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', E1);
    expect(cell(p)).toEqual(E1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', null);
    expect(cell(p)).toBeNull();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R2);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', '');
    expect(cell(p)).toBeNull();
  });

  it('recusa valor que não é referência, alvo inexistente, alvo não aceito e a própria anotação', () => {
    const p = build();
    const set = (value: JsonValue) => () =>
      setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', value);
    expectCode(set('texto'), 'invalid-value');
    expectCode(set({ annotationId: 'AM' }), 'invalid-value');
    expectCode(set({ annotationId: 'NADA', key: 'x' }), 'ref-not-accepted');
    // A tabela inteira não é um alvo (só as linhas dela).
    expectCode(set({ annotationId: 'AM', key: 'campos' }), 'ref-not-accepted');
    // Campo simples sem a etiqueta aceita.
    expectCode(set({ annotationId: 'AM', key: 'solto' }), 'ref-not-accepted');
    // A própria anotação.
    expectCode(set({ annotationId: 'AL', key: 'titulo' }), 'self-ref');
  });

  it('as outras colunas continuam simples; ref numa linha nova começa vazia', () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    const row = (
      p.annotations.find((a) => a.id === 'AL')?.values?.alvos as JsonValue[]
    )[1];
    expect(row).toEqual({ _id: 'L2', nota: null, alvo: null });
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'nota', 'ok');
    expectCode(() => setTableCell(p, 'AL', 'alvos', 'L2', 'nota', R1), 'invalid-value');
  });
});

describe('pendências', () => {
  it('coluna ref obrigatória vazia é required-empty, com linha e coluna', () => {
    const p = build();
    expect(getAnnotationIssues(p, 'AL')).toEqual([
      { code: 'required-empty', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
  });

  it('alvo que some é broken-ref; célula com formato errado é invalid-value', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    expect(getAnnotationIssues(p, 'AL')).toEqual([]);
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    expect(getAnnotationIssues(broken, 'AL')).toEqual([
      { code: 'broken-ref', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
    const invalid: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AL'
          ? { ...a, values: { ...a.values, alvos: [{ _id: 'L1', alvo: 'texto' }] } }
          : a,
      ),
    };
    expect(getAnnotationIssues(invalid, 'AL')).toEqual([
      { code: 'invalid-value', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
  });

  it('alvo que perdeu a etiqueta deixa de ser aceito (ref-not-accepted)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    // A coluna passa a aceitar só tuplas livres: a linha de tabela deixa de valer.
    const lista = spec(1);
    const col = lista.layers[1]!.annotationTypes[0]!.fields[1];
    if (col?.type !== 'table') throw new Error('esperava table');
    const ref = col.columns[1];
    if (ref?.type !== 'ref') throw new Error('esperava ref');
    ref.accepts = { free: true };
    const changed: Project = {
      ...p,
      specializations: p.specializations.map((s) => ({ ...s, spec: lista })),
    };
    expect(getAnnotationIssues(changed, 'AL')).toEqual([
      { code: 'ref-not-accepted', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
  });
});

describe('resolução e alvos', () => {
  it('o texto do alvo e a resolução são os de sempre', () => {
    const p = build();
    expect(refLabel(p, R1)).toBe('Cliente.cpf');
    expect(resolveRef(p, R1)?.kind).toBe('row');
    expect(
      isRefAccepted(p, 'AL', refColumnOf(p, 'AL', 'alvos', 'alvo')!.accepts, R1),
    ).toBe(true);
  });

  it('refColumnOf acha a coluna ref e nega o resto', () => {
    const p = build();
    expect(refColumnOf(p, 'AL', 'alvos', 'alvo')).toMatchObject({
      type: 'ref',
      key: 'alvo',
    });
    expect(refColumnOf(p, 'AL', 'alvos', 'nota')).toBeNull();
    expect(refColumnOf(p, 'AL', 'titulo', 'alvo')).toBeNull();
    expect(refColumnOf(p, 'AM', 'campos', 'nome')).toBeNull();
  });

  it('findCellRefTargets lista as linhas com a etiqueta e as tuplas livres, nunca a própria anotação', () => {
    const p = build();
    expect(findCellRefTargets(p, 'AL', 'alvos', 'alvo').map((t) => t.label)).toEqual([
      'Cliente.cpf',
      'Cliente.nome',
      'Glossário.termo',
    ]);
    expect(findCellRefTargets(p, 'AL', 'alvos', 'nota')).toEqual([]);
    expect(findCellRefTargets(p, 'AL', 'titulo', 'alvo')).toEqual([]);
  });
});

describe('refsOf, backlinks e referências quebradas', () => {
  it('refsOf inclui a célula com a linha, a coluna e a posição; o campo ref segue como estava', () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'alvo', R2);
    p = setFieldValue(p, 'AL', 'principal', R1);
    const refs = refsOf(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
    );
    expect(refs).toEqual([
      { key: 'alvos', ref: R1, rowId: 'L1', column: 'alvo', rowIndex: 0 },
      { key: 'alvos', ref: R2, rowId: 'L2', column: 'alvo', rowIndex: 1 },
      { key: 'principal', ref: R1 },
    ]);
    expect(refPathText(refs[0]!)).toBe('alvos[1].alvo');
    expect(refPathText(refs[1]!)).toBe('alvos[2].alvo');
    expect(refPathText(refs[2]!)).toBe('principal');
  });

  it('o alvo recebe o backlink da célula', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const links = getBacklinks(p, 'AM');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ key: 'alvos', rowId: 'L1', column: 'alvo' });
    expect(links[0]?.source.id).toBe('AL');
  });

  it('apagar a linha alvo quebra a célula (contada para o diálogo)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    expect(refsBrokenBy(p, (x) => removeTableRow(x, 'AM', 'campos', 'R1'))).toBe(1);
    expect(refsBrokenBy(p, (x) => removeTableRow(x, 'AM', 'campos', 'R2'))).toBe(0);
    expect(countBrokenRefs(p, removeTableRow(p, 'AM', 'campos', 'R1'))).toBe(1);
  });

  it('sem tipo, uma célula no formato de referência ainda conta', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const orphan: Project = {
      ...p,
      specializations: [],
      annotations: p.annotations.map((a) => ({ ...a })),
    };
    const refs = refsOf(
      orphan,
      orphan.annotations.find((a) => a.id === 'AL')!,
    );
    expect(refs).toEqual([
      { key: 'alvos', ref: R1, rowId: 'L1', column: 'alvo', rowIndex: 0 },
    ]);
  });
});

describe('exibição, conversão em texto e blueprint', () => {
  it('a tabela mostra a célula como "→ alvo"; quebrada vira "→ (referência quebrada)" e alerta', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const lines = typedDisplayLines(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
      {
        tables: 'full',
      },
    );
    const table = lines.find((l) => l.kind === 'table');
    expect(table).toMatchObject({
      kind: 'table',
      key: 'alvos',
      alert: false,
      columns: [
        { key: 'nota', label: 'nota' },
        { key: 'alvo', label: 'Alvo' },
      ],
      rows: [{ id: 'L1', cells: ['', '→ Cliente.cpf'] }],
    });
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    const after = typedDisplayLines(
      broken,
      broken.annotations.find((a) => a.id === 'AL')!,
      {
        tables: 'full',
      },
    ).find((l) => l.kind === 'table');
    expect(after).toMatchObject({
      alert: true,
      rows: [{ id: 'L1', cells: ['', '→ (referência quebrada)'] }],
    });
  });

  it('a conversão em anotação livre escreve a célula como "→ alvo"', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', E1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'nota', 'primeira');
    const pairs = typedValuesToPairs(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
    );
    expect(pairs).toContainEqual({ key: 'alvos[1].nota', value: 'primeira' });
    expect(pairs).toContainEqual({ key: 'alvos[1].alvo', value: '→ Glossário.termo' });
  });

  it('o blueprint do código entrega o rótulo do alvo na célula (quebrada: null)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'nota', 'primeira');
    const param = (project: Project) => {
      const node = codeBlueprint(project, 'M2', 'web').root;
      return node.annotations[0]?.params.find((x) => x.key === 'alvos');
    };
    expect(param(p)).toMatchObject({
      name: 'destinos',
      value: [{ nota: 'primeira', alvo: 'Cliente.cpf' }],
    });
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    expect(param(broken)?.value).toEqual([{ nota: 'primeira', alvo: null }]);
  });
});

describe('migrações da biblioteca com a célula ref', () => {
  const modeloFields = (raw: Raw) => raw.layers[0].annotationTypes[0].fields;
  const alvosColumns = (raw: Raw) => raw.layers[1].annotationTypes[0].fields[1].columns;
  const migrations = (steps: Raw[]) => ({ migrations: [{ from: 1, to: 2, steps }] });

  it('rename-field de uma tabela reescreve a chave nas referências de linha que estão em células', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setFieldValue(p, 'AL', 'principal', R2);
    const next = spec(
      2,
      migrations([
        { op: 'rename-field', type: 'modelo', from: 'campos', to: 'atributos' },
      ]),
      (raw) => {
        modeloFields(raw)[1].key = 'atributos';
      },
    );
    const run = runLibraryMigrations(p, next, 1);
    expect(run.steps[0]).toMatchObject({ refs: 2 });
    const lista = run.project.annotations.find((a) => a.id === 'AL')!;
    expect(cell(run.project)).toEqual({
      annotationId: 'AM',
      key: 'atributos',
      rowId: 'R1',
    });
    expect(lista.values?.principal).toEqual({
      annotationId: 'AM',
      key: 'atributos',
      rowId: 'R2',
    });
    // A outra coluna da mesma linha não muda.
    const row = (lista.values?.alvos as Record<string, JsonValue>[])[0];
    expect(row?.nota).toBeNull();
  });

  it('rename-field da coluna ref (alvos.alvo para alvos.destino) leva a referência junto, sem perda', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const next = spec(
      2,
      migrations([
        { op: 'rename-field', type: 'lista', from: 'alvos.alvo', to: 'alvos.destino' },
      ]),
      (raw) => {
        alvosColumns(raw)[1].key = 'destino';
      },
    );
    const run = runLibraryMigrations(p, next, 1);
    expect(run.losses).toEqual([]);
    const row = (
      run.project.annotations.find((a) => a.id === 'AL')?.values?.alvos as Record<
        string,
        JsonValue
      >[]
    )[0];
    expect(row?.destino).toEqual(R1);
    expect(row).not.toHaveProperty('alvo');
  });

  it('remove-field da coluna ref perde a referência preenchida (e a conta)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const next = spec(
      2,
      migrations([{ op: 'remove-field', type: 'lista', field: 'alvos.alvo' }]),
      (raw) => {
        alvosColumns(raw).splice(1, 1);
      },
    );
    const run = runLibraryMigrations(p, next, 1);
    expect(run.losses).toEqual([
      expect.objectContaining({
        reason: 'removed-field',
        annotationId: 'AL',
        field: 'alvos.alvo',
        rowId: 'L1',
        value: R1,
      }),
    ]);
  });

  it('fill-field em coluna ref não é válido na especialização (a coluna ref não tem default)', () => {
    expect(() =>
      spec(
        2,
        migrations([
          { op: 'fill-field', type: 'lista', field: 'alvos.alvo', default: 'x' },
        ]),
      ),
    ).toThrow(/default/);
  });
});

describe('valores do desenho (motor de componentes)', () => {
  const lista = () => {
    const type = spec(1).layers[1]!.annotationTypes[0]!;
    return type;
  };

  it('a tabela chega ao motor como linhas e a célula ref como o valor do alvo (a linha pelo rowLabel, a tupla livre pelo value)', () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    p = addTableRow(p, 'AL', 'alvos', 'L3');
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'nota', 'primeira');
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'alvo', E1);
    const { values, warnings } = drawingValues(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
      lista(),
    );
    expect(values.alvos).toEqual([
      { nota: 'primeira', alvo: 'cpf' },
      { nota: null, alvo: 'valor' },
      { nota: null, alvo: null },
    ]);
    expect(warnings).toEqual([]);
  });

  it('célula quebrada vira null com o aviso "tabela[n].coluna"; o resto da tabela segue', () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'alvo', R2);
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    const { values, warnings } = drawingValues(
      broken,
      broken.annotations.find((a) => a.id === 'AL')!,
      lista(),
    );
    expect(values.alvos).toEqual([
      { nota: null, alvo: null },
      { nota: null, alvo: 'nome' },
    ]);
    expect(warnings).toEqual(['referência quebrada: alvos[1].alvo']);
  });
});
