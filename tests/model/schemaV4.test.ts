import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addAnnotation,
  addTableRow,
  addTypedAnnotation,
  annotationDeletionImpact,
  applySpecialization,
  checkSpecApply,
  childTypesOf,
  convertAnnotationToFree,
  deserialize,
  findRefTargets,
  getAnnotationIssues,
  getBacklinks,
  getProjectIssues,
  layerAnnotationTypes,
  migrations,
  moveTableRow,
  refLabel,
  refsBrokenBy,
  removeAnnotation,
  removeLayer,
  removeSpecialization,
  removeTableRow,
  renameLayer,
  resolveRef,
  serialize,
  setAnnotationParent,
  setFieldValue,
  setLayerColor,
  setTableCell,
  specFiles,
  specializationRemovalImpact,
  specializationUpdateImpact,
  updateEntry,
  updateSpecialization,
  validAnnotationOwners,
  validTypedOwners,
  validateProject,
  type Annotation,
  type Project,
  type Spec,
} from '../../src/model';
import { expectValid, sampleProject } from './fixtures';
import {
  cadastroProject,
  idGen,
  layerOf,
  loadExample,
  specProject,
} from './specFixtures';

/** Versão do conteúdo do exemplo SDUI (os testes de atualização usam a seguinte). */
const SDUI_VERSION = loadExample('sdui').version;

function annotation(p: Project, id: string): Annotation {
  const a = p.annotations.find((x) => x.id === id);
  if (!a) throw new Error(`anotação ${id} não encontrada`);
  return a;
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const issueCodes = (p: Project, id: string) =>
  getAnnotationIssues(p, id).map((i) => (i.key ? `${i.code}:${i.key}` : i.code));

/** Copia a especialização com alterações (para simular uma nova versão). */
function withChanges(spec: Spec, change: (s: Spec) => void): Spec {
  const copy = structuredClone(spec);
  change(copy);
  return copy;
}

describe('migração v3 → v4', () => {
  /** Um mapping.json v3: sem `specializations`, `spec`, `type`, `values` nem ids de tupla. */
  function v3Text(): string {
    const data = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
    delete data.specializations;
    const drop = (item: Record<string, unknown>, keys: string[]) =>
      Object.fromEntries(Object.entries(item).filter(([k]) => !keys.includes(k)));
    const layers = (data.layers as Record<string, unknown>[]).map((l) =>
      drop(l, ['spec']),
    );
    const annotations = (data.annotations as Record<string, unknown>[]).map((a) => ({
      ...drop(a, ['type', 'values']),
      entries: (a.entries as Record<string, unknown>[]).map((e) => drop(e, ['id'])),
    }));
    return JSON.stringify({ ...data, schemaVersion: 3, layers, annotations });
  }

  it('abre um v3 como v6: camadas livres, anotações livres e ids nas tuplas', () => {
    const result = deserialize(v3Text());
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(3);
    const p = result.project;
    expect(p.schemaVersion).toBe(6);
    expect(p.specializations).toEqual([]);
    expect(p.layers.every((l) => l.spec === null)).toBe(true);
    expect(p.annotations.every((a) => a.type === null && a.values === null)).toBe(true);
    const ids = p.annotations.flatMap((a) => a.entries.map((e) => e.id));
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
    // Os pares continuam os mesmos, na mesma ordem.
    expect(annotation(p, 'A1').entries.map((e) => [e.key, e.value])).toEqual([
      ['tipo', 'amassado'],
      ['gravidade', 'média'],
    ]);
  });

  it('o v3 migrado salva como v6 estável', () => {
    const first = deserialize(v3Text());
    if (!first.ok) throw new Error('falhou');
    const saved = serialize(first.project);
    expect(JSON.parse(saved).schemaVersion).toBe(6);
    const again = deserialize(saved);
    if (!again.ok) throw new Error('falhou');
    expect(serialize(again.project)).toBe(saved);
  });
});

describe('aplicar especialização', () => {
  it('copia para specs/ e cria as camadas no fim, com cor e nome da especialização', () => {
    const p = expectValid(specProject());
    expect(
      p.specializations.map(({ id, version, file }) => ({ id, version, file })),
    ).toEqual([
      { id: 'sdui', version: SDUI_VERSION, file: 'specs/sdui.json' },
      { id: 'modelo-dados', version: 1, file: 'specs/modelo-dados.json' },
    ]);
    expect(p.layers.map((l) => [l.id, l.name, l.color, l.spec])).toEqual([
      ['L1', 'Lataria', '#D32F2F', null],
      ['LM', 'Model', '#757575', null],
      ['LS1', 'Componentes', '#1E88E5', { specId: 'sdui', layerId: 'componentes' }],
      ['LS2', 'Eventos', '#FB8C00', { specId: 'sdui', layerId: 'eventos' }],
      ['LS3', 'Telas', '#00897B', { specId: 'sdui', layerId: 'telas' }],
      ['LD1', 'Classes', '#43A047', { specId: 'modelo-dados', layerId: 'classes' }],
      ['LD2', 'Endpoints', '#8E24AA', { specId: 'modelo-dados', layerId: 'endpoints' }],
    ]);
    expect(layerAnnotationTypes(p, 'LS1').map((t) => t.id)).toEqual([
      'button',
      'input',
      'text',
      'image',
    ]);
    expect(layerAnnotationTypes(p, 'LM')).toEqual([]);
  });

  it('mesma especialização: maior versão atualiza; igual ou menor não faz nada', () => {
    const p = specProject();
    const sdui = loadExample('sdui');
    expect(checkSpecApply(sampleProject(), sdui)).toBe('apply');
    expect(checkSpecApply(p, sdui)).toBe('not-newer');
    expect(checkSpecApply(p, { ...sdui, version: SDUI_VERSION + 1 })).toBe('update');
    expect(codeOf(() => applySpecialization(p, sdui))).toBe('spec-already-applied');
  });

  it('camadas da especialização: sem renomear nem excluir; cor pode mudar', () => {
    const p = specProject();
    expect(codeOf(() => renameLayer(p, 'LS1', 'Outro'))).toBe('spec-layer');
    expect(codeOf(() => removeLayer(p, 'LS1'))).toBe('spec-layer');
    expect(setLayerColor(p, 'LS1', '#123456').layers[2]?.color).toBe('#123456');
  });

  it('id com caracteres estranhos vira um nome de arquivo seguro', () => {
    const spec = { ...loadExample('sdui'), id: 'a/b c' };
    const p = applySpecialization(sampleProject(), spec, { newId: idGen('X') });
    expect(p.specializations[0]?.file).toBe('specs/a-b-c.json');
  });
});

describe('anotações tipadas', () => {
  it('criam com os defaults, todos os campos na ordem do tipo e sem entries', () => {
    const p = cadastroProject();
    const button = annotation(p, 'AB');
    expect(button.type).toEqual({ specId: 'sdui', typeId: 'button' });
    expect(button.entries).toEqual([]);
    expect(button.values).toEqual({
      id: 'btn_cadastrar',
      texto: 'Cadastrar',
      estilo: 'primary',
      habilitado: 'sim',
    });
    expect(annotation(p, 'AOH').values).toEqual({ acao: 'track', duracaoMs: 500 });
    expect(annotation(p, 'AC').values).toEqual({
      nome: 'Contato',
      descricao: null,
      versao: 1,
      revisadoEm: '2026-10-02',
      atributos: [
        {
          _id: 'R1',
          nome: 'email',
          tipo: 'String',
          obrigatorio: 'sim',
          exemplo: 'ana@exemplo.com',
        },
      ],
    });
    expectValid(p);
    expect(getProjectIssues(p)).toEqual(
      new Map([['AT', [{ code: 'required-empty', key: 'id' }]]]),
    );
  });

  it('camada e tipo precisam combinar; camada da especialização não aceita livre', () => {
    const p = cadastroProject();
    const eventos = layerOf(p, 'sdui', 'eventos');
    const base = { id: 'N', markingId: 'MC' };
    expect(
      codeOf(() =>
        addTypedAnnotation(p, {
          ...base,
          layerId: eventos,
          type: { specId: 'sdui', typeId: 'button' },
        }),
      ),
    ).toBe('type-not-in-layer');
    expect(
      codeOf(() =>
        addTypedAnnotation(p, {
          ...base,
          layerId: 'LM',
          type: { specId: 'sdui', typeId: 'button' },
        }),
      ),
    ).toBe('type-not-in-layer');
    expect(
      codeOf(() =>
        addTypedAnnotation(p, {
          ...base,
          layerId: 'LS1',
          type: { specId: 'sdui', typeId: 'nada' },
        }),
      ),
    ).toBe('unknown-type');
    expect(codeOf(() => addAnnotation(p, { ...base, layerId: 'LS1' }))).toBe(
      'typed-layer',
    );
  });

  it('requiresOwner: sem dono não cria; o dono precisa aceitar o filho', () => {
    const p = cadastroProject();
    const eventos = layerOf(p, 'sdui', 'eventos');
    const onClick = { specId: 'sdui', typeId: 'onClick' };
    // Na Idade só há um Input, que não aceita onClick.
    expect(validTypedOwners(p, 'MI', onClick)).toEqual([]);
    expect(
      codeOf(() =>
        addTypedAnnotation(p, {
          id: 'N',
          markingId: 'MI',
          layerId: eventos,
          type: onClick,
        }),
      ),
    ).toBe('owner-required');
    expect(
      codeOf(() =>
        addTypedAnnotation(p, {
          id: 'N',
          markingId: 'MI',
          layerId: eventos,
          type: onClick,
          parentAnnotationId: 'AII',
        }),
      ),
    ).toBe('invalid-annotation-parent');
    expect(validTypedOwners(p, 'MC', onClick).map((a) => a.id)).toEqual(['AB']);
  });

  it('botões "+ filho" a partir do dono, na camada do tipo filho', () => {
    const p = cadastroProject();
    expect(childTypesOf(p, 'AB').map((c) => [c.type.typeId, c.layer?.id])).toEqual([
      ['onClick', 'LS2'],
      ['onHold', 'LS2'],
    ]);
    expect(childTypesOf(p, 'AIE').map((c) => c.type.typeId)).toEqual(['onChange']);
    expect(childTypesOf(p, 'AT')).toEqual([]);
    expect(childTypesOf(p, 'AU')).toEqual([]);
  });

  it('vínculos: donas válidas seguem allowedChildren; requiresOwner não pode ficar sem dono', () => {
    let p = cadastroProject();
    expect(validAnnotationOwners(p, 'AOC').map((a) => a.id)).toEqual(['AB']);
    expect(codeOf(() => setAnnotationParent(p, 'AOC', null))).toBe('owner-required');
    // Livre continua podendo ter qualquer dona de outra camada.
    p = addAnnotation(p, { id: 'NL', markingId: 'MC', layerId: 'LM' });
    expect(validAnnotationOwners(p, 'NL').map((a) => a.id)).toEqual(['AB', 'AOC', 'AOH']);
  });

  it('editar valores: valida o tipo; texto vazio vira null', () => {
    const p = cadastroProject();
    expect(codeOf(() => setFieldValue(p, 'AB', 'estilo', 'gigante'))).toBe(
      'unknown-option',
    );
    expect(codeOf(() => setFieldValue(p, 'AB', 'texto', 3))).toBe('invalid-value');
    expect(codeOf(() => setFieldValue(p, 'AII', 'maxLength', '10'))).toBe(
      'invalid-value',
    );
    expect(codeOf(() => setFieldValue(p, 'AC', 'revisadoEm', '2026-02-30'))).toBe(
      'invalid-value',
    );
    expect(codeOf(() => setFieldValue(p, 'AC', 'atributos', []))).toBe('invalid-value');
    expect(codeOf(() => setFieldValue(p, 'AB', 'extra', 'x'))).toBe('unknown-field');
    expect(codeOf(() => setFieldValue(p, 'AU', 'name', 'x'))).toBe('not-typed');
    expect(codeOf(() => updateEntry(p, 'AB', 'EN', { key: 'a', value: 'b' }))).toBe(
      'typed-annotation',
    );
    expect(
      annotation(setFieldValue(p, 'AII', 'maxLength', 3), 'AII').values?.maxLength,
    ).toBe(3);
    expect(
      annotation(setFieldValue(p, 'AB', 'texto', ''), 'AB').values?.texto,
    ).toBeNull();
    // A ordem das chaves se mantém.
    expect(
      Object.keys(annotation(setFieldValue(p, 'AB', 'id', 'x'), 'AB').values ?? {}),
    ).toEqual(['id', 'texto', 'estilo', 'habilitado']);
  });

  it('linhas de tabela com _id: adicionar, editar, reordenar e remover', () => {
    let p = cadastroProject();
    p = addTableRow(p, 'AC', 'atributos', 'R2');
    expect(codeOf(() => addTableRow(p, 'AC', 'atributos', 'R2'))).toBe('duplicate-id');
    p = setTableCell(p, 'AC', 'atributos', 'R2', 'nome', 'idade');
    p = setTableCell(p, 'AC', 'atributos', 'R2', 'tipo', 'Int');
    expect(codeOf(() => setTableCell(p, 'AC', 'atributos', 'R2', 'tipo', 'Float'))).toBe(
      'unknown-option',
    );
    expect(codeOf(() => setTableCell(p, 'AC', 'atributos', 'R9', 'nome', 'x'))).toBe(
      'not-found',
    );
    expect(codeOf(() => setTableCell(p, 'AC', 'atributos', 'R2', 'cor', 'x'))).toBe(
      'unknown-field',
    );
    expect(annotation(p, 'AC').values?.atributos).toEqual([
      {
        _id: 'R1',
        nome: 'email',
        tipo: 'String',
        obrigatorio: 'sim',
        exemplo: 'ana@exemplo.com',
      },
      { _id: 'R2', nome: 'idade', tipo: 'Int', obrigatorio: 'sim', exemplo: null },
    ]);
    p = moveTableRow(p, 'AC', 'atributos', 'R2', 0);
    const rows = () =>
      (annotation(p, 'AC').values?.atributos as { _id: string }[]).map((r) => r._id);
    expect(rows()).toEqual(['R2', 'R1']);
    p = removeTableRow(p, 'AC', 'atributos', 'R2');
    expect(rows()).toEqual(['R1']);
    expectValid(p);
  });
});

describe('referências', () => {
  it('os três formatos resolvem com o rótulo do alvo', () => {
    let p = cadastroProject();
    expect(refLabel(p, { annotationId: 'AU', entryId: 'EN' })).toBe('User.name');
    expect(refLabel(p, { annotationId: 'AC', key: 'atributos', rowId: 'R1' })).toBe(
      'Contato.email',
    );
    // Campo simples com etiqueta: um "glossário" com o campo `nome` etiquetado.
    const glossario: Spec = {
      format: 'mapping-spec',
      formatVersion: 1,
      id: 'glossario',
      name: 'Glossário',
      version: 1,
      layers: [
        {
          id: 'termos',
          name: 'Termos',
          color: '#00ACC1',
          annotationTypes: [
            {
              id: 'termo',
              name: 'Termo',
              fields: [
                {
                  key: 'nome',
                  label: 'nome do termo',
                  type: 'string',
                  tags: ['data-field'],
                },
              ],
            },
          ],
        },
      ],
    };
    p = applySpecialization(p, glossario, { newId: idGen('LG') });
    p = addTypedAnnotation(p, {
      id: 'AG',
      markingId: 'MT',
      layerId: 'LG1',
      type: { specId: 'glossario', typeId: 'termo' },
    });
    const ref = { annotationId: 'AG', key: 'nome' };
    expect(refLabel(p, ref)).toBe('Termo.nome do termo');
    expect(resolveRef(p, ref)?.kind).toBe('field');
    p = setFieldValue(p, 'AIN', 'dado', ref);
    expect(getAnnotationIssues(p, 'AIN')).toEqual([]);
    expect(findRefTargets(p, 'AIN', 'dado').map((t) => t.label)).toContain(
      'Termo.nome do termo',
    );
  });

  it('o seletor do dado lista só os alvos aceitos (tuplas livres e linhas com data-field)', () => {
    const p = cadastroProject();
    expect(
      findRefTargets(p, 'AIN', 'dado').map((t) => [t.label, t.annotation.id]),
    ).toEqual([
      ['User.name', 'AU'],
      ['User.age', 'AU'],
      ['Contato.email', 'AC'],
    ]);
    // Por que cada alvo é aceito: tupla livre (sem etiqueta) ou a etiqueta da linha.
    expect(findRefTargets(p, 'AIN', 'dado').map((t) => t.tags)).toEqual([
      [],
      [],
      ['data-field'],
    ]);
    // Campo que não é ref não tem alvos.
    expect(findRefTargets(p, 'AIN', 'id')).toEqual([]);
  });

  it('accepts só com etiqueta não lista tuplas livres; accepts só free não lista linhas', () => {
    const sdui = withChanges(loadExample('sdui'), (s) => {
      const input = s.layers[0]?.annotationTypes[1];
      const dado = input?.fields.find((f) => f.key === 'dado');
      if (dado?.type === 'ref') dado.accepts = { tags: ['data-field'] };
      const text = s.layers[0]?.annotationTypes[2];
      const dadoText = text?.fields.find((f) => f.key === 'dado');
      if (dadoText?.type === 'ref') dadoText.accepts = { free: true };
      s.version = SDUI_VERSION + 1;
    });
    const p = updateSpecialization(cadastroProject(), sdui);
    expect(findRefTargets(p, 'AIN', 'dado').map((t) => t.label)).toEqual([
      'Contato.email',
    ]);
    expect(findRefTargets(p, 'AT', 'dado').map((t) => t.label)).toEqual([
      'User.name',
      'User.age',
    ]);
    // A referência existente para uma tupla livre deixa de ser aceita.
    expect(issueCodes(p, 'AIN')).toEqual(['ref-not-accepted:dado']);
    expect(
      codeOf(() =>
        setFieldValue(p, 'AIN', 'dado', { annotationId: 'AU', entryId: 'EA' }),
      ),
    ).toBe('ref-not-accepted');
  });

  it('não aceita referência para a própria anotação nem alvo inexistente', () => {
    const p = cadastroProject();
    expect(
      codeOf(() => setFieldValue(p, 'AIN', 'dado', { annotationId: 'AIN', key: 'id' })),
    ).toBe('self-ref');
    expect(
      codeOf(() => setFieldValue(p, 'AIN', 'dado', { annotationId: 'AU', entryId: 'X' })),
    ).toBe('ref-not-accepted');
    expect(codeOf(() => setFieldValue(p, 'AIN', 'dado', { annotationId: 'AU' }))).toBe(
      'invalid-value',
    );
    expect(
      annotation(setFieldValue(p, 'AIN', 'dado', null), 'AIN').values?.dado,
    ).toBeNull();
  });

  it('a referência sobrevive a renomear a chave da tupla', () => {
    const p = updateEntry(cadastroProject(), 'AU', 'EN', {
      key: 'nome',
      value: 'string',
    });
    expect(refLabel(p, annotation(p, 'AIN').values?.dado as never)).toBe('User.nome');
    expect(getAnnotationIssues(p, 'AIN')).toEqual([]);
  });

  it('excluir o alvo quebra a referência, sem apagá-la', () => {
    const p = cadastroProject();
    const op = (x: Project) => removeTableRow(x, 'AC', 'atributos', 'R1');
    expect(refsBrokenBy(p, op)).toBe(1);
    const after = op(p);
    expect(annotation(after, 'AIE').values?.dado).toEqual({
      annotationId: 'AC',
      key: 'atributos',
      rowId: 'R1',
    });
    expect(issueCodes(after, 'AIE')).toEqual(['broken-ref:dado']);
    expect(refLabel(after, { annotationId: 'AC', key: 'atributos', rowId: 'R1' })).toBe(
      '(referência quebrada)',
    );
    // Excluir a anotação dona das tuplas quebra as duas referências para ela.
    expect(annotationDeletionImpact(p, 'AU')).toEqual({ annotations: 1, brokenRefs: 2 });
    expect(issueCodes(removeAnnotation(p, 'AU'), 'AII')).toEqual(['broken-ref:dado']);
  });

  it('backlinks: quem aponta para cada tupla ou linha', () => {
    const p = cadastroProject();
    expect(
      getBacklinks(p, 'AU').map((b) => [
        b.source.id,
        b.key,
        'entryId' in b.ref && b.ref.entryId,
      ]),
    ).toEqual([
      ['AIN', 'dado', 'EN'],
      ['AII', 'dado', 'EA'],
    ]);
    expect(getBacklinks(p, 'AC').map((b) => b.source.id)).toEqual(['AIE']);
    expect(getBacklinks(p, 'AB')).toEqual([]);
  });
});

describe('remover especialização', () => {
  it('apagar dados: camadas, anotações e vinculadas em outras camadas, com contagens', () => {
    let p = cadastroProject();
    // Uma anotação livre vinculada ao Button sai junto.
    p = addAnnotation(p, { id: 'NL', markingId: 'MC', layerId: 'LM' });
    p = setAnnotationParent(p, 'NL', 'AB');
    const impact = specializationRemovalImpact(p, 'sdui', 'delete');
    expect(impact.annotations).toBe(9);
    expect([...impact.byLayer]).toEqual([
      ['LS1', 5],
      ['LS2', 3],
      ['LM', 1],
    ]);
    expect(impact.brokenRefs).toBe(0);
    const after = expectValid(removeSpecialization(p, 'sdui', 'delete'));
    expect(after.specializations.map((s) => s.id)).toEqual(['modelo-dados']);
    expect(after.layers.map((l) => l.id)).toEqual(['L1', 'LM', 'LD1', 'LD2']);
    expect(after.annotations.map((a) => a.id)).toEqual(['AU', 'AC', 'AE']);
    expect(specFiles(after).has('specs/sdui.json')).toBe(false);
  });

  it('apagar dados do modelo quebra as referências vindas da SDUI', () => {
    const p = cadastroProject();
    expect(specializationRemovalImpact(p, 'modelo-dados', 'delete').brokenRefs).toBe(1);
    const after = removeSpecialization(p, 'modelo-dados', 'delete');
    expect(issueCodes(after, 'AIE')).toEqual(['broken-ref:dado']);
  });

  it('apagar dados não pode deixar o projeto sem camadas', () => {
    let p = specProject();
    p = removeLayer(removeLayer(p, 'L1'), 'LM');
    p = removeSpecialization(p, 'modelo-dados', 'delete');
    expect(codeOf(() => removeSpecialization(p, 'sdui', 'delete'))).toBe('last-layer');
    expect(removeSpecialization(p, 'sdui', 'convert').layers.every((l) => !l.spec)).toBe(
      true,
    );
  });

  it('converter: camadas e anotações livres, table achatada e ref em texto', () => {
    const p = cadastroProject();
    const impact = specializationRemovalImpact(p, 'modelo-dados', 'convert');
    expect(impact.annotations).toBe(2);
    expect(impact.brokenRefs).toBe(1);
    const after = expectValid(
      removeSpecialization(p, 'modelo-dados', 'convert', { newId: idGen('EC') }),
    );
    expect(after.specializations.map((s) => s.id)).toEqual(['sdui']);
    expect(after.layers.find((l) => l.id === 'LD1')).toEqual({
      id: 'LD1',
      name: 'Classes',
      color: '#43A047',
      spec: null,
    });
    const classe = annotation(after, 'AC');
    expect(classe.name).toBe('Contato');
    expect(classe.type).toBeNull();
    expect(classe.values).toBeNull();
    expect(classe.entries).toEqual([
      { id: 'EC1', key: 'nome', value: 'Contato' },
      { id: 'EC2', key: 'versao', value: '1' },
      { id: 'EC3', key: 'revisadoEm', value: '2026-10-02' },
      { id: 'EC4', key: 'atributos[1].nome', value: 'email' },
      { id: 'EC5', key: 'atributos[1].tipo', value: 'String' },
      { id: 'EC6', key: 'atributos[1].obrigatorio', value: 'sim' },
      { id: 'EC7', key: 'atributos[1].exemplo', value: 'ana@exemplo.com' },
    ]);
    expect(annotation(after, 'AE').name).toBe('Endpoint');
    // O Input do e-mail quebra; os do nome e da idade apontam para a User livre.
    expect(issueCodes(after, 'AIE')).toEqual(['broken-ref:dado']);
    expect(getAnnotationIssues(after, 'AIN')).toEqual([]);
    expect(getAnnotationIssues(after, 'AII')).toEqual([]);
  });

  it('converter a SDUI: ref vira "→ rótulo" e vínculos e inherit são mantidos', () => {
    const p = cadastroProject();
    const after = expectValid(
      removeSpecialization(p, 'sdui', 'convert', { newId: idGen('EC') }),
    );
    const input = annotation(after, 'AIE');
    expect(input.name).toBe('Input');
    expect(input.entries.map((e) => `${e.key}: ${e.value}`)).toEqual([
      'id: input_email',
      'tipo: email',
      'obrigatorio: sim',
      'dado: → Contato.email',
    ]);
    const click = annotation(after, 'AOC');
    expect(click.parentAnnotationId).toBe('AB');
    expect(click.entries.map((e) => `${e.key}: ${e.value}`)).toEqual([
      'acao: submit',
      'destino: /usuarios',
      'parametros[1].nome: origem',
      'parametros[1].valor: cadastro',
    ]);
    expect(annotation(after, 'AOH').entries.map((e) => `${e.key}: ${e.value}`)).toEqual([
      'acao: track',
      'duracaoMs: 500',
    ]);
    expect(getProjectIssues(after).size).toBe(0);
  });
});

describe('atualizar especialização', () => {
  /** SDUI v2: camada "Estados" nova, "Eventos" removida, "Componentes" renomeada. */
  function sduiV2(): Spec {
    return withChanges(loadExample('sdui'), (s) => {
      s.version = SDUI_VERSION + 1;
      const componentes = s.layers[0];
      if (!componentes) throw new Error('sem camada');
      componentes.name = 'Componentes de tela';
      for (const type of componentes.annotationTypes) delete type.allowedChildren;
      s.layers = [
        componentes,
        {
          id: 'estados',
          name: 'Estados',
          color: '#5E35B1',
          annotationTypes: [{ id: 'estado', name: 'Estado', fields: [] }],
        },
      ];
    });
  }

  it('cria as novas, mantém cor e anotações das existentes e libera as que sumiram', () => {
    let p = setLayerColor(cadastroProject(), 'LS1', '#000000');
    const impact = specializationUpdateImpact(p, sduiV2());
    expect(impact.addedLayers.map((l) => l.id)).toEqual(['estados']);
    expect(impact.freedLayers.map((l) => l.id)).toEqual(['LS2', 'LS3']);
    p = expectValid(updateSpecialization(p, sduiV2(), { newId: idGen('N') }));
    expect(p.specializations.find((s) => s.id === 'sdui')?.version).toBe(
      SDUI_VERSION + 1,
    );
    expect(
      p.layers
        .filter((l) => l.id.startsWith('LS') || l.id.startsWith('N'))
        .map((l) => [l.id, l.name, l.color, l.spec?.layerId ?? null]),
    ).toEqual([
      ['LS1', 'Componentes de tela', '#000000', 'componentes'],
      ['LS2', 'Eventos', '#FB8C00', null],
      ['LS3', 'Telas', '#00897B', null],
      // N1…N8 foram para as tuplas dos eventos convertidos.
      ['N9', 'Estados', '#5E35B1', 'estados'],
    ]);
    // Eventos viraram livres, mantendo o vínculo com o Button.
    const click = annotation(p, 'AOC');
    expect(click.type).toBeNull();
    expect(click.name).toBe('onClick');
    expect(click.parentAnnotationId).toBe('AB');
    expect(annotation(p, 'AB').type).toEqual({ specId: 'sdui', typeId: 'button' });
    expect(codeOf(() => updateSpecialization(p, sduiV2()))).toBe('spec-not-newer');
  });

  it('anotações que ficaram inválidas não mudam: viram pendências', () => {
    const v2 = withChanges(loadExample('sdui'), (s) => {
      s.version = SDUI_VERSION + 1;
      const [button, input, , image] = s.layers[0]?.annotationTypes ?? [];
      if (!button || !input || !image) throw new Error('tipos');
      // Campo obrigatório novo e opção removida.
      button.fields.push({ key: 'acessibilidade', type: 'string', required: true });
      const estilo = button.fields.find((f) => f.key === 'estilo');
      if (estilo?.type === 'enum') estilo.options = ['secondary', 'text'];
      button.allowedChildren = ['onHold'];
      // Tipo removido.
      const layer = s.layers[0];
      if (layer)
        layer.annotationTypes = layer.annotationTypes.filter((t) => t.id !== 'text');
    });
    const before = cadastroProject();
    const p = updateSpecialization(before, v2);
    expect(annotation(p, 'AB')).toEqual(annotation(before, 'AB'));
    expect(issueCodes(p, 'AB')).toEqual([
      'unknown-option:estilo',
      'required-empty:acessibilidade',
    ]);
    expect(issueCodes(p, 'AOC')).toEqual(['owner-not-allowed']);
    expect(issueCodes(p, 'AT')).toEqual(['unknown-type']);
    // Tipo removido: só leitura, com a conversão em livre.
    expect(codeOf(() => setFieldValue(p, 'AT', 'id', 'x'))).toBe('unknown-type');
    const converted = convertAnnotationToFree(p, 'AT', { newId: idGen('E') });
    expect(annotation(converted, 'AT').entries).toEqual([
      { id: 'E1', key: 'conteudo', value: 'Crie sua conta' },
      { id: 'E2', key: 'estilo', value: 'corpo' },
    ]);
  });

  it('alvo que perdeu a etiqueta deixa a referência "não aceita"', () => {
    const v2 = withChanges(loadExample('modelo-de-dados'), (s) => {
      s.version = SDUI_VERSION + 1;
      const atributos = s.layers[0]?.annotationTypes[0]?.fields.find(
        (f) => f.key === 'atributos',
      );
      if (atributos?.type === 'table') delete atributos.tags;
    });
    const p = updateSpecialization(cadastroProject(), v2);
    expect(issueCodes(p, 'AIE')).toEqual(['ref-not-accepted:dado']);
  });
});

describe('pendências e invariantes', () => {
  /** Simula um arquivo externo editado à mão: troca uma anotação. */
  function patch(p: Project, id: string, change: Partial<Annotation>): Project {
    return {
      ...p,
      annotations: p.annotations.map((a) => (a.id === id ? { ...a, ...change } : a)),
    };
  }

  it('cobre todos os motivos da 13.5', () => {
    const p = cadastroProject();
    const values = annotation(p, 'AIE').values ?? {};
    const bad = patch(p, 'AIE', {
      values: { ...values, maxLength: 'dez', tipo: 'cpf', extra: 1, placeholder: null },
    });
    expect(issueCodes(bad, 'AIE')).toEqual([
      'unknown-field:extra',
      'unknown-option:tipo',
      'invalid-value:maxLength',
    ]);
    const rows = patch(p, 'AC', {
      values: {
        ...(annotation(p, 'AC').values ?? {}),
        atributos: [{ _id: 'R1', nome: '', tipo: 'Texto' }],
      },
    });
    expect(getAnnotationIssues(rows, 'AC')).toEqual([
      { code: 'required-empty', key: 'atributos', rowId: 'R1', column: 'nome' },
      { code: 'unknown-option', key: 'atributos', rowId: 'R1', column: 'tipo' },
    ]);
    expect(issueCodes(patch(p, 'AOC', { parentAnnotationId: null }), 'AOC')).toEqual([
      'missing-owner',
    ]);
    expect(issueCodes(patch(p, 'AOC', { layerId: 'LS1' }), 'AOC')).toEqual([
      'layer-mismatch',
    ]);
    expect(issueCodes(patch(p, 'AU', { layerId: 'LS1' }), 'AU')).toEqual([
      'layer-mismatch',
    ]);
    expect(
      issueCodes(patch(p, 'AIN', { type: { specId: 'sdui', typeId: 'sumiu' } }), 'AIN'),
    ).toEqual(['unknown-type']);
    expect(
      issueCodes(
        patch(p, 'AIN', {
          values: { ...(annotation(p, 'AIN').values ?? {}), dado: 'User.name' },
        }),
        'AIN',
      ),
    ).toEqual(['invalid-value:dado']);
  });

  it('as pendências não impedem a abertura; ids de tupla e linha repetidos sim', () => {
    const p = cadastroProject();
    const external = patch(p, 'AOC', { parentAnnotationId: null, layerId: 'LS1' });
    const loaded = deserialize(serialize(external), migrations, specFiles(external));
    expect(loaded.ok).toBe(true);

    const dupEntry = patch(p, 'AU', {
      entries: [
        { id: 'EN', key: 'name', value: 'string' },
        { id: 'EN', key: 'age', value: 'number' },
      ],
    });
    expect(validateProject(dupEntry).map((i) => i.code)).toEqual(['duplicate-entry-id']);
    const dupRow = patch(p, 'AC', {
      values: {
        ...(annotation(p, 'AC').values ?? {}),
        atributos: [{ _id: 'R1' }, { _id: 'R1' }],
      },
    });
    expect(validateProject(dupRow).map((i) => i.code)).toEqual(['duplicate-row-id']);
  });
});

describe('serialização v4', () => {
  it('round-trip sem perdas, com valores JSON nativos', () => {
    const p = cadastroProject();
    const text = serialize(p);
    const data = JSON.parse(text);
    expect(data.specializations).toEqual([
      { id: 'sdui', version: SDUI_VERSION, file: 'specs/sdui.json' },
      { id: 'modelo-dados', version: 1, file: 'specs/modelo-dados.json' },
    ]);
    const classe = data.annotations.find((a: { id: string }) => a.id === 'AC');
    expect(classe.values.versao).toBe(1);
    expect(classe.values.revisadoEm).toBe('2026-10-02');
    expect(classe.values.atributos[0]._id).toBe('R1');
    expect(classe.entries).toEqual([]);
    const user = data.annotations.find((a: { id: string }) => a.id === 'AU');
    expect(user.type).toBeNull();
    expect(user.values).toBeNull();
    expect(user.entries[0]).toEqual({ id: 'EN', key: 'name', value: 'string' });
    const input = data.annotations.find((a: { id: string }) => a.id === 'AIN');
    expect(input.values.dado).toEqual({ annotationId: 'AU', entryId: 'EN' });
    expect(Object.keys(data.layers[2])).toEqual(['id', 'name', 'color', 'spec']);
    expect(Object.keys(input)).toEqual([
      'id',
      'markingId',
      'layerId',
      'name',
      'inherit',
      'parentAnnotationId',
      'type',
      'values',
      'entries',
    ]);

    const loaded = deserialize(text, migrations, specFiles(p));
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
    expect(loaded.specWarnings).toEqual([]);
    expect(loaded.project).toEqual(p);
    expect(serialize(loaded.project)).toBe(text);
  });

  it('cópia ausente ou inválida em specs/: abre com aviso e as anotações ficam pendentes', () => {
    const p = cadastroProject();
    const files = specFiles(p);
    files.delete('specs/sdui.json');
    files.set('specs/modelo-dados.json', '{"format": "outro"}');
    const loaded = deserialize(serialize(p), migrations, files);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
    expect(loaded.specWarnings.map((w) => [w.specId, w.problem])).toEqual([
      ['sdui', 'missing'],
      ['modelo-dados', 'invalid'],
    ]);
    expect(loaded.project.specializations.every((s) => s.spec === null)).toBe(true);
    expect(issueCodes(loaded.project, 'AB')).toEqual(['unknown-type']);
  });

  it('rejeita tipada com entries e livre com values', () => {
    const data = JSON.parse(serialize(cadastroProject()));
    data.annotations[0].values = {};
    expect(deserialize(JSON.stringify(data))).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });
  });
});
