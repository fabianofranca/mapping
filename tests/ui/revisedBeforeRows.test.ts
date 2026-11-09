import { describe, expect, it } from 'vitest';
import {
  fieldLabel,
  fieldOf,
  findSpecType,
  type Change,
  type JsonValue,
  type Proposal,
} from '../../src/model';
import { beforeRows } from '../../src/ui/review/RevisedBefore';
import { valueParts, type ReviewNames } from '../../src/ui/review/changeText';
import { cadastroProject } from '../model/specFixtures';

// "Antes da revisão" campo a campo (etapa #676, AR1): numa criação revisada, o bloco desce
// em `values` e `entries` e lista só o que mudou, pelo rótulo do campo; nada de JSON.

const project = cadastroProject();
const names = (): ReviewNames => ({
  current: project,
  preview: null,
  proposal: { changes: [] } as unknown as Proposal,
});

const textOf = ({ rows }: ReturnType<typeof beforeRows>) =>
  rows.map((r) => `${r.label}=${r.parts.map((p) => p.text).join('')}`);

function label(key: string): string {
  const a = project.annotations.find((x) => x.id === 'AIE');
  const type = findSpecType(project, a!.type!)!;
  return fieldLabel(fieldOf(type.type, key)!);
}

const create = (entityId: string, to: Record<string, JsonValue>): Change => ({
  id: 'C1',
  kind: 'create',
  entity: 'annotation',
  entityId,
  imageId: null,
  markingId: null,
  field: null,
  from: null,
  to,
});

const typedTo = (values: Record<string, JsonValue>): Record<string, JsonValue> => ({
  markingId: 'ME',
  layerId: 'LM',
  name: null,
  type: { specId: 'sdui', typeId: 'input' },
  values,
  entries: [],
});

describe('beforeRows: criação de anotação tipada', () => {
  const now = { id: 'input_email', tipo: 'email', obrigatorio: 'sim' };

  it('lista só os campos de values que mudaram, pelo rótulo do campo', () => {
    const c = create('AIE', typedTo(now));
    const before = typedTo({ ...now, tipo: 'text', obrigatorio: 'nao' });
    expect(beforeRows(names(), c, before).perField).toBe(true);
    const rows = textOf(beforeRows(names(), c, before));
    expect(rows).toEqual([`${label('tipo')}=text`, `${label('obrigatorio')}=nao`]);
    for (const row of rows) {
      expect(row).not.toContain('{');
      expect(row).not.toContain('annotationId');
    }
  });

  it('um campo de values que entrou ou saiu aparece; os iguais não', () => {
    const c = create('AIE', typedTo(now));
    const before = typedTo({ id: 'input_email', tipo: 'email' });
    const rows = textOf(beforeRows(names(), c, before));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(label('obrigatorio'));
  });

  it('values e um campo de primeiro nível: as linhas dos dois, só as que mudaram', () => {
    const c = create('AIE', { ...typedTo(now), name: 'Atual' });
    const before = { ...typedTo({ ...now, tipo: 'text' }), name: 'Antigo' };
    const rows = textOf(beforeRows(names(), c, before));
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.endsWith('=Antigo'))).toBe(true);
    expect(rows).toContain(`${label('tipo')}=text`);
  });

  it('a referência (ref) sai pelo rótulo do alvo, nunca em JSON', () => {
    const dado = { annotationId: 'AU', entryId: 'EN' };
    const c = create(
      'AIE',
      typedTo({ ...now, dado: { annotationId: 'AU', entryId: 'EA' } }),
    );
    const rows = textOf(beforeRows(names(), c, typedTo({ ...now, dado })));
    expect(rows).toEqual([`${label('dado')}=User.name`]);
  });
});

describe('beforeRows: criação de anotação livre', () => {
  const free = (entries: JsonValue): Record<string, JsonValue> => ({
    markingId: 'MF',
    layerId: 'LM',
    name: 'Livre',
    type: null,
    values: null,
    entries,
  });

  it('uma linha por par trocado, pela chave, com o valor anterior', () => {
    const c = create(
      'AL',
      free([
        { id: 'E1', key: 'a', value: 'novo' },
        { id: 'E2', key: 'b', value: 'x' },
      ]),
    );
    const before = free([
      { id: 'E1', key: 'a', value: 'velho' },
      { id: 'E2', key: 'b', value: 'x' },
    ]);
    expect(textOf(beforeRows(names(), c, before))).toEqual(['a=velho']);
  });
});

describe('valueParts: alteração de values.<campo>', () => {
  const update = (field: string, from: JsonValue, to: JsonValue): Change => ({
    ...create('AIE', {}),
    kind: 'update',
    field,
    from,
    to,
  });

  it('tabela pelas linhas, sem JSON', () => {
    const rows: JsonValue = [{ _id: 'R1', nome: 'email', tipo: 'String' }];
    const text = valueParts(names(), update('values.atributos', [], rows), rows)
      .map((p) => p.text)
      .join('');
    expect(text).toContain('nome: email');
    expect(text).not.toContain('{');
    expect(text).not.toContain('_id');
  });

  it('ref pelo rótulo do alvo', () => {
    const ref: JsonValue = { annotationId: 'AU', entryId: 'EN' };
    const text = valueParts(names(), update('values.dado', ref, ref), ref)
      .map((p) => p.text)
      .join('');
    expect(text).toBe('User.name');
  });
});
