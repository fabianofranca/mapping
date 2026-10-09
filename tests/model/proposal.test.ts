import { describe, expect, it } from 'vitest';
import {
  addImage,
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

/** Proposta com criação, alteração e remoção, decisões, nota e uma aplicada, como JSON. */
function sample(): Json {
  const base = sampleProject();
  let after = createMarking(base, {
    id: 'M9',
    imageId: 'I2',
    rect: { x: 300, y: 300, width: 100, height: 100 },
  });
  after = renameMarking(after, 'M4', 'Farol');
  after = removeMarking(after, 'M3');
  let p = propose(base, after);
  // Mudanças: c1 altera M4, c2 cria M9, c3 remove M3. No JSON, na ordem criação,
  // alteração e remoção; c2 aceita e aplicada, c1 rejeitada com uma nota.
  p = decided(p, base, { level: 'change', id: 'c2' }, 'accepted');
  p = decided(p, base, { level: 'change', id: 'c1' }, 'rejected');
  const json = JSON.parse(serializeProposal(p)) as Json;
  const byId = (id: string) => json.changes.find((c: Json) => c.id === id);
  json.changes = [byId('c2'), byId('c1'), byId('c3')];
  json.applied = { c2: { at: AT } };
  json.notes = [
    { id: 'n1', target: { level: 'change', id: 'c1' }, text: 'Não.', at: AT },
  ];
  return json;
}

function errorsOf(data: unknown): string[] {
  const result = parseProposal(data);
  if (result.ok) throw new Error('era para falhar');
  return result.errors;
}

describe('formato da proposta', () => {
  it('o exemplo é válido e volta igual', () => {
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

  it('caminhos de arquivo da proposta', () => {
    expect(proposalFilePath('8c1f')).toBe('proposals/8c1f/proposal.json');
    expect(proposalImagePath('8c1f', 'images/tela.webp')).toBe(
      'proposals/8c1f/images/tela.webp',
    );
  });

  it.each<[string, (p: Json) => void, string]>([
    [
      'format errado',
      (p) => (p.format = 'mapping-spec'),
      'format: deve ser "mapping-proposal"',
    ],
    ['formatVersion errado', (p) => (p.formatVersion = 2), 'formatVersion: deve ser 1'],
    ['id com barra', (p) => (p.id = '../fora'), 'id: id inválido'],
    ['título vazio', (p) => (p.title = '  '), 'title: não pode ser vazio'],
    ['data inválida', (p) => (p.createdAt = 'ontem'), 'createdAt: data inválida'],
    ['status desconhecido', (p) => (p.status = 'draft'), 'status: deve ser "open"'],
    ['substitui a si mesma', (p) => (p.supersedes = p.id), 'supersedes: uma proposta'],
    ['tipo de mudança inválido', (p) => (p.changes[0].kind = 'move'), 'changes[0].kind:'],
    ['entidade inválida', (p) => (p.changes[0].entity = 'tela'), 'changes[0].entity:'],
    [
      'rect fracionado na criação',
      (p) => (p.changes[0].to.rect.width = 10.5),
      'changes[0].to.rect.width:',
    ],
    [
      'criação com from',
      (p) => (p.changes[0].from = {}),
      'changes[0].from: deve ser null',
    ],
    ['id da entidade diferente', (p) => (p.changes[0].to.id = 'M8'), 'changes[0].to.id:'],
    [
      'campo desconhecido',
      (p) => (p.changes[1].field = 'cor'),
      'changes[1].field: "cor" não é um campo de marking',
    ],
    [
      'alteração sem campo',
      (p) => (p.changes[1].field = null),
      'changes[1].field: obrigatório',
    ],
    ['valor do campo com tipo errado', (p) => (p.changes[1].to = 3), 'changes[1].to:'],
    ['remoção com to', (p) => (p.changes[2].to = {}), 'changes[2].to: deve ser null'],
    [
      'marcação sem markingId',
      (p) => (p.changes[2].markingId = null),
      'changes[2].markingId:',
    ],
    [
      'id de mudança repetido',
      (p) => (p.changes[1].id = 'c2'),
      'changes[1].id: id "c2" repetido',
    ],
    [
      'decisão de mudança inexistente',
      (p) => (p.decisions.c9 = { state: 'accepted', at: AT }),
      'decisions.c9: mudança inexistente',
    ],
    ['decisão inválida', (p) => (p.decisions.c1.state = 'maybe'), 'decisions.c1.state:'],
    [
      'aplicada sem aceitar',
      (p) => (p.applied.c1 = { at: AT }),
      'applied.c1: só uma mudança aceita',
    ],
    [
      'nota com id em proposta',
      (p) => (p.notes[0].target = { level: 'proposal', id: 'x' }),
      'notes[0].target.id: deve ser null',
    ],
    [
      'nota de mudança inexistente',
      (p) => (p.notes[0].target.id = 'c9'),
      'notes[0].target.id: mudança inexistente',
    ],
    [
      'nota de item sem id',
      (p) => (p.notes[0].target = { level: 'item', id: null }),
      'notes[0].target.id: obrigatório',
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

  it('valores de especialização e repositório também são validados por caminho', () => {
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
      errors.some((e) => e.startsWith('changes[4].entityId: id de plataforma inválido')),
    ).toBe(true);
    expect(errors.some((e) => e.startsWith('changes[4].to.localPath:'))).toBe(true);
  });

  it('JSON malformado vira um erro legível', () => {
    const result = parseProposalText('{ "format": ');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]?.startsWith('JSON inválido')).toBe(true);
  });
});

describe('comparação com a proposta que substitui', () => {
  function rounds(): { base: Project; first: Proposal; second: Proposal } {
    const base = sampleProject();
    let a = renameMarking(base, 'M4', 'Farol');
    a = setMarkingRect(a, 'M2', { x: 1200, y: 1200, width: 400, height: 300 });
    a = renameMarking(a, 'M1', 'Porta dianteira');
    a = addImage(a, { id: 'T1', file: 'images/t.png', width: 500, height: 500 });
    a = createMarking(a, {
      id: 'X1',
      imageId: 'T1',
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    a = setMarkingSource(a, 'X1', { system: 'figma', id: '9:9', url: null });
    a = createMarking(a, {
      id: 'X2',
      imageId: 'T1',
      rect: { x: 100, y: 0, width: 50, height: 50 },
    });
    const first = propose(base, a, { id: 'P1' });

    let b = renameMarking(base, 'M4', 'Farol');
    b = setMarkingRect(b, 'M2', { x: 1200, y: 1200, width: 400, height: 250 });
    b = addImage(b, { id: 'T1', file: 'images/t.png', width: 500, height: 500 });
    // A mesma marcação de origem, recriada com outro id.
    b = createMarking(b, {
      id: 'Z1',
      imageId: 'T1',
      rect: { x: 0, y: 0, width: 50, height: 50 },
    });
    b = setMarkingSource(b, 'Z1', { system: 'figma', id: '9:9', url: null });
    const second = propose(base, b, { id: 'P2', supersedes: 'P1' });
    return { base, first, second };
  }

  it('cada mudança da antiga é igual, diferente ou não consta na nova', () => {
    const { first, second } = rounds();
    const result = compareProposals(first, second);
    const of = (entity: 'image' | 'marking', id: string, field?: string) =>
      result.get(changeOf(first, entity, id, field).id);
    expect(of('marking', 'M4', 'name')).toBe('same');
    expect(of('marking', 'M2', 'rect')).toBe('different');
    expect(of('marking', 'M1', 'name')).toBe('missing');
    expect(of('image', 'T1')).toBe('same');
    // Casada pela origem, apesar do id novo.
    expect(of('marking', 'X1')).toBe('same');
    expect(of('marking', 'X2')).toBe('missing');
    expect(result.size).toBe(first.changes.length);
  });

  it('mexer de outro jeito na mesma entidade conta como diferente', () => {
    const base = sampleProject();
    const first = propose(base, renameMarking(base, 'M4', 'Farol'));
    const second = propose(base, removeMarking(base, 'M4'), { id: 'P2' });
    expect([...compareProposals(first, second).values()]).toEqual(['different']);
  });
});
