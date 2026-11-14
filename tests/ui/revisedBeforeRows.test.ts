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

// "Before the revision" field by field (stage #676, AR1): in a revised creation, the block goes
// down into `values` and `entries` and lists only what changed, by the field label; no JSON.
// pt-BR kept: shared fixture data asserted by tests/model (cadastroProject field ids and values)

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

describe('beforeRows: creation of a typed annotation', () => {
  const now = { id: 'input_email', tipo: 'email', obrigatorio: 'sim' };

  it('lists only the values fields that changed, by the field label', () => {
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

  it('a values field that came in or went out shows up; the equal ones do not', () => {
    const c = create('AIE', typedTo(now));
    const before = typedTo({ id: 'input_email', tipo: 'email' });
    const rows = textOf(beforeRows(names(), c, before));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(label('obrigatorio'));
  });

  it('values and a top-level field: the rows of both, only the ones that changed', () => {
    const c = create('AIE', { ...typedTo(now), name: 'Current' });
    const before = { ...typedTo({ ...now, tipo: 'text' }), name: 'Previous' };
    const rows = textOf(beforeRows(names(), c, before));
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.endsWith('=Previous'))).toBe(true);
    expect(rows).toContain(`${label('tipo')}=text`);
  });

  it('the reference (ref) comes out by the target label, never as JSON', () => {
    const dado = { annotationId: 'AU', entryId: 'EN' };
    const c = create(
      'AIE',
      typedTo({ ...now, dado: { annotationId: 'AU', entryId: 'EA' } }),
    );
    const rows = textOf(beforeRows(names(), c, typedTo({ ...now, dado })));
    expect(rows).toEqual([`${label('dado')}=User.name`]);
  });
});

describe('beforeRows: creation of a free annotation', () => {
  const free = (entries: JsonValue): Record<string, JsonValue> => ({
    markingId: 'MF',
    layerId: 'LM',
    name: 'Free',
    type: null,
    values: null,
    entries,
  });

  it('one row per changed pair, by the key, with the previous value', () => {
    const c = create(
      'AL',
      free([
        { id: 'E1', key: 'a', value: 'new' },
        { id: 'E2', key: 'b', value: 'x' },
      ]),
    );
    const before = free([
      { id: 'E1', key: 'a', value: 'old' },
      { id: 'E2', key: 'b', value: 'x' },
    ]);
    expect(textOf(beforeRows(names(), c, before))).toEqual(['a=old']);
  });
});

describe('valueParts: change of values.<field>', () => {
  const update = (field: string, from: JsonValue, to: JsonValue): Change => ({
    ...create('AIE', {}),
    kind: 'update',
    field,
    from,
    to,
  });

  it('table by rows, without JSON', () => {
    const rows: JsonValue = [{ _id: 'R1', nome: 'email', tipo: 'String' }];
    const text = valueParts(names(), update('values.atributos', [], rows), rows)
      .map((p) => p.text)
      .join('');
    expect(text).toContain('nome: email');
    expect(text).not.toContain('{');
    expect(text).not.toContain('_id');
  });

  it('ref by the target label', () => {
    const ref: JsonValue = { annotationId: 'AU', entryId: 'EN' };
    const text = valueParts(names(), update('values.dado', ref, ref), ref)
      .map((p) => p.text)
      .join('');
    expect(text).toBe('User.name');
  });
});
