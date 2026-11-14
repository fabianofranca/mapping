import { describe, expect, it } from 'vitest';
import {
  addContainer,
  compareProposals,
  createMarking,
  parseProposal,
  parseProposalText,
  proposalFilePath,
  proposalImagePath,
  removeMarking,
  renameMarking,
  serializeProposal,
  setMarkingRect,
  setMarkingSource,
  type Project,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Proposal with creation, change and removal, decisions, a note and an applied one, as JSON. */
function sample(): Json {
  const base = sampleProject();
  let after = createMarking(base, {
    id: 'M9',
    containerId: 'I2',
    rect: { x: 300, y: 300, width: 100, height: 100 },
  });
  after = renameMarking(after, 'M4', 'Lighthouse');
  after = removeMarking(after, 'M3');
  let p = propose(base, after);
  // Changes: c1 changes M4, c2 creates M9, c3 removes M3. In the JSON, in the order creation,
  // change and removal; c2 accepted and applied, c1 rejected with a note.
  p = decided(p, base, { level: 'change', id: 'c2' }, 'accepted');
  p = decided(p, base, { level: 'change', id: 'c1' }, 'rejected');
  const json = JSON.parse(serializeProposal(p)) as Json;
  const byId = (id: string) => json.changes.find((c: Json) => c.id === id);
  json.changes = [byId('c2'), byId('c1'), byId('c3')];
  json.applied = { c2: { at: AT } };
  json.notes = [
    { id: 'n1', target: { level: 'change', id: 'c1' }, text: 'No.', at: AT },
  ];
  return json;
}

function errorsOf(data: unknown): string[] {
  const result = parseProposal(data);
  if (result.ok) throw new Error('expected to fail');
  return result.errors;
}

describe('formato da proposta', () => {
  it('reads formatVersion 1, 2 and 3', () => {
    for (const formatVersion of [1, 2, 3]) {
      const result = parseProposal({ ...sample(), formatVersion });
      if (!result.ok) throw new Error(result.errors.join('\n'));
      expect(result.proposal.formatVersion).toBe(formatVersion);
    }
  });

  it('the example is valid and comes back the same', () => {
    const json = sample();
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(JSON.parse(serializeProposal(result.proposal))).toEqual(json);
    expect(result.proposal.changes.map((c) => c.kind)).toEqual([
      'create',
      'update',
      'remove',
    ]);
  });

  it('proposal file paths', () => {
    expect(proposalFilePath('8c1f')).toBe('proposals/8c1f/proposal.json');
    expect(proposalImagePath('8c1f', 'images/tela.webp')).toBe(
      'proposals/8c1f/images/tela.webp',
    );
  });

  it.each<[string, (p: Json) => void, string]>([
    [
      'format errado',
      (p) => (p.format = 'mapping-spec'),
      'format: must be "mapping-proposal"',
    ],
    [
      'formatVersion errado',
      (p) => (p.formatVersion = 10),
      'formatVersion: must be 1, 2, 3, 4, 5, 6, 7, 8 or 9',
    ],
    ['id with a slash', (p) => (p.id = '../outside'), 'id: invalid id'],
    ['empty title', (p) => (p.title = '  '), 'title: cannot be empty'],
    ['invalid date', (p) => (p.createdAt = 'yesterday'), 'createdAt: invalid date'],
    ['status desconhecido', (p) => (p.status = 'draft'), 'status: must be "open"'],
    ['substitui a si mesma', (p) => (p.supersedes = p.id), 'supersedes: a proposal'],
    ['invalid change kind', (p) => (p.changes[0].kind = 'move'), 'changes[0].kind:'],
    ['invalid entity', (p) => (p.changes[0].entity = 'screen'), 'changes[0].entity:'],
    [
      'fractional rect on creation',
      (p) => (p.changes[0].to.rect.width = 10.5),
      'changes[0].to.rect.width:',
    ],
    [
      'creation with from',
      (p) => (p.changes[0].from = {}),
      'changes[0].from: must be null',
    ],
    ['different entity id', (p) => (p.changes[0].to.id = 'M8'), 'changes[0].to.id:'],
    [
      'campo desconhecido',
      (p) => (p.changes[1].field = 'cor'),
      'changes[1].field: "cor" is not a field of marking',
    ],
    [
      'change with no field',
      (p) => (p.changes[1].field = null),
      'changes[1].field: required',
    ],
    ['field value with the wrong type', (p) => (p.changes[1].to = 3), 'changes[1].to:'],
    ['removal with to', (p) => (p.changes[2].to = {}), 'changes[2].to: must be null'],
    [
      'marking with no markingId',
      (p) => (p.changes[2].markingId = null),
      'changes[2].markingId:',
    ],
    [
      'repeated change id',
      (p) => (p.changes[1].id = 'c2'),
      'changes[1].id: duplicate id "c2"',
    ],
    [
      'decision on a nonexistent change',
      (p) => (p.decisions.c9 = { state: 'accepted', at: AT }),
      'decisions.c9: nonexistent change',
    ],
    ['invalid decision', (p) => (p.decisions.c1.state = 'maybe'), 'decisions.c1.state:'],
    [
      'aplicada sem aceitar',
      (p) => (p.applied.c1 = { at: AT }),
      'applied.c1: only an accepted change',
    ],
    [
      'nota com id em proposta',
      (p) => (p.notes[0].target = { level: 'proposal', id: 'x' }),
      'notes[0].target.id: must be null',
    ],
    [
      'note on a nonexistent change',
      (p) => (p.notes[0].target.id = 'c9'),
      'notes[0].target.id: nonexistent change',
    ],
    [
      'note on an item with no id',
      (p) => (p.notes[0].target = { level: 'item', id: null }),
      'notes[0].target.id: required',
    ],
  ])('%s', (_name, mutate, expected) => {
    const json = sample();
    mutate(json);
    const errors = errorsOf(json);
    expect(
      errors.some((e) => e.startsWith(expected)),
      errors.join(' | '),
    ).toBe(true);
  });

  it('specialization and repository values are also validated by path', () => {
    const json = sample();
    json.changes.push({
      id: 'c4',
      kind: 'create',
      entity: 'specialization',
      entityId: 'sdui',
      imageId: null,
      markingId: null,
      field: null,
      from: null,
      to: {
        id: 'sdui',
        version: 1,
        file: 'specs/sdui.json',
        spec: { format: 'mapping-spec' },
      },
    });
    json.changes.push({
      id: 'c5',
      kind: 'create',
      entity: 'platformRepo',
      entityId: 'Android',
      imageId: null,
      markingId: null,
      field: null,
      from: null,
      to: { urlTemplate: null },
    });
    const errors = errorsOf(json);
    expect(errors.some((e) => e.startsWith('changes[3].to.spec.formatVersion:'))).toBe(
      true,
    );
    expect(
      errors.some((e) => e.startsWith('changes[4].entityId: invalid platform id')),
    ).toBe(true);
    expect(errors.some((e) => e.startsWith('changes[4].to.localPath:'))).toBe(true);
  });

  it('a proposal predating schema 11: the platformRepo urlTemplate is ignored on read', () => {
    const json = sample();
    const change = (id: string, kind: string, from: unknown, to: unknown) => ({
      id,
      kind,
      entity: 'platformRepo',
      entityId: id === 'c5' ? 'ios' : id === 'c6' ? 'android' : 'bff',
      imageId: null,
      markingId: null,
      field: null,
      from,
      to,
    });
    json.changes.push(
      change('c5', 'create', null, {
        urlTemplate: 'https://git.example.com/ios/{path}',
        localPath: '../ios',
      }),
      // The change was only to the address: it becomes a no-op update (from equal to to).
      change(
        'c6',
        'update',
        { urlTemplate: 'https://a/{path}', localPath: null },
        { urlTemplate: 'https://b/{path}', localPath: null },
      ),
      change('c7', 'remove', { urlTemplate: 'https://c/{path}', localPath: '..' }, null),
    );
    const result = parseProposal(json);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const repos = result.proposal.changes.filter((c) => c.entity === 'platformRepo');
    expect(repos.map((c) => [c.id, c.from, c.to])).toEqual([
      ['c5', null, { localPath: '../ios' }],
      ['c6', { localPath: null }, { localPath: null }],
      ['c7', { localPath: '..' }, null],
    ]);
    // Saved again, the proposal already comes out in the new format.
    expect(serializeProposal(result.proposal)).not.toContain('urlTemplate');
  });

  it('malformed JSON becomes a readable error', () => {
    const result = parseProposalText('{ "format": ');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]?.startsWith('invalid JSON')).toBe(true);
  });
});

describe('comparison with the proposal that replaces it', () => {
  function rounds(): { base: Project; first: Proposal; second: Proposal } {
    const base = sampleProject();
    let a = renameMarking(base, 'M4', 'Lighthouse');
    a = setMarkingRect(a, 'M2', { x: 1200, y: 1200, width: 400, height: 300 });
    a = renameMarking(a, 'M1', 'Porta dianteira');
    a = addContainer(a, { id: 'T1', file: 'images/t.png', width: 500, height: 500 });
    a = createMarking(a, {
      id: 'X1',
      containerId: 'T1',
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    a = setMarkingSource(a, 'X1', { system: 'figma', id: '9:9', url: null });
    a = createMarking(a, {
      id: 'X2',
      containerId: 'T1',
      rect: { x: 100, y: 0, width: 50, height: 50 },
    });
    const first = propose(base, a, { id: 'P1' });

    let b = renameMarking(base, 'M4', 'Lighthouse');
    b = setMarkingRect(b, 'M2', { x: 1200, y: 1200, width: 400, height: 250 });
    b = addContainer(b, { id: 'T1', file: 'images/t.png', width: 500, height: 500 });
    // The same source marking, recreated with another id.
    b = createMarking(b, {
      id: 'Z1',
      containerId: 'T1',
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    b = setMarkingSource(b, 'Z1', { system: 'figma', id: '9:9', url: null });
    const second = propose(base, b, { id: 'P2', supersedes: 'P1' });
    return { base, first, second };
  }

  it('each change of the old one is equal, different or absent from the new one', () => {
    const { first, second } = rounds();
    const result = compareProposals(first, second);
    const of = (entity: 'image' | 'marking', id: string, field?: string) =>
      result.get(changeOf(first, entity, id, field).id);
    expect(of('marking', 'M4', 'name')).toBe('same');
    expect(of('marking', 'M2', 'rect')).toBe('different');
    expect(of('marking', 'M1', 'name')).toBe('missing');
    expect(of('image', 'T1')).toBe('same');
    // Matched by source, despite the new id.
    expect(of('marking', 'X1')).toBe('same');
    expect(of('marking', 'X2')).toBe('missing');
    expect(result.size).toBe(first.changes.length);
  });

  it('changing the same entity in another way counts as different', () => {
    const base = sampleProject();
    const first = propose(base, renameMarking(base, 'M4', 'Lighthouse'));
    const second = propose(base, removeMarking(base, 'M4'), { id: 'P2' });
    expect([...compareProposals(first, second).values()]).toEqual(['different']);
  });
});
