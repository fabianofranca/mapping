import { describe, expect, it } from 'vitest';
import {
  parseProposal,
  parseProposalText,
  renameMarking,
  serializeProposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { propose } from './proposalFixtures';

// formatVersion 5: a 4 com `revisions` na raiz, o histórico das revisões do agente
// (docs/PROPOSAL-FORMAT.md, "Revisão pelo agente"). Aqui: leitura, regravação e as regras.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Proposta da versão 4 como JSON canônico (chaves na ordem da serialização), com uma mudança c1. */
function base4(): Json {
  const base = sampleProject();
  const p = propose(base, renameMarking(base, 'M4', 'Farol'));
  return JSON.parse(serializeProposal(p)) as Json;
}

/** Mudança retirada: a mesma forma de `changes`, com outro id. */
function droppedChange(): Json {
  const c = base4().changes[0] as Json;
  return { ...c, id: 'c4' };
}

/** Proposta 5 canônica com uma revisão que preenche changed, added e dropped. */
function sample5(): Json {
  const json = base4();
  json.formatVersion = 5;
  json.notes = [
    {
      id: 'n9',
      target: { level: 'proposal', id: null },
      text: 'Veio da mudança c4',
      at: '2026-11-07T10:00:00.000Z',
    },
  ];
  json.revisions = [
    {
      at: '2026-11-07T10:00:00.000Z',
      baseRevision: 43,
      operations: [],
      changed: { c1: { to: 'Título da tela', state: 'rejected' } },
      added: ['c9'],
      dropped: [{ change: droppedChange(), state: null, notes: ['n2'] }],
    },
  ];
  return json;
}

const text = (json: Json) => `${JSON.stringify(json, null, 2)}\n`;

function errorsOf(json: Json): string[] {
  const result = parseProposal(json);
  if (result.ok) throw new Error('esperava erro');
  return result.errors;
}

describe('proposta formatVersion 5', () => {
  it('lê o arquivo com revisions e regrava byte a byte igual', () => {
    const input = text(sample5());
    const result = parseProposalText(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.formatVersion).toBe(5);
    expect(result.proposal.revisions).toHaveLength(1);
    expect(serializeProposal(result.proposal)).toBe(input);
  });

  it('a 4 com revisions dá erro com o caminho', () => {
    const json = sample5();
    json.formatVersion = 4;
    expect(errorsOf(json)).toContain('revisions: only in formatVersion 5 or later');
  });

  it('a 5 sem revisions dá erro', () => {
    const json = sample5();
    delete json.revisions;
    expect(errorsOf(json)).toContain('revisions: required in formatVersion 5');
  });

  it('um id de dropped que está em changes dá erro', () => {
    const json = sample5();
    json.revisions[0].dropped[0].change.id = 'c1';
    const errors = errorsOf(json);
    expect(errors.some((e) => e.startsWith('revisions[0].dropped[0].change.id: '))).toBe(
      true,
    );
  });

  it('um id repetido em added de duas revisões dá erro no segundo', () => {
    const json = sample5();
    json.revisions.push({
      at: '2026-11-07T11:00:00.000Z',
      baseRevision: 44,
      operations: [],
      changed: {},
      added: ['c9'],
      dropped: [],
    });
    const errors = errorsOf(json);
    expect(errors.some((e) => e.startsWith('revisions[1].added[0]: '))).toBe(true);
  });

  it('um id repetido dentro de added da mesma revisão dá erro', () => {
    const json = sample5();
    json.revisions[0].added = ['c9', 'c9'];
    const errors = errorsOf(json);
    expect(errors.some((e) => e.startsWith('revisions[0].added[1]: '))).toBe(true);
  });

  it.each([1, 2, 3, 4])(
    'a versão %i continua lida e regravada sem revisions',
    (version) => {
      const json = base4();
      json.formatVersion = version;
      if (version < 4) {
        for (const c of json.changes as Json[]) delete c.insertBefore;
      }
      const result = parseProposal(json);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.proposal.formatVersion).toBe(version);
      expect(result.proposal.revisions).toBeUndefined();
      const out = JSON.parse(serializeProposal(result.proposal)) as Json;
      expect(out.formatVersion).toBe(version);
      expect('revisions' in out).toBe(false);
    },
  );

  it('dropped[].change é validado como uma mudança', () => {
    const json = sample5();
    json.revisions[0].dropped[0].change.kind = 'move';
    const errors = errorsOf(json);
    expect(
      errors.some((e) => e.startsWith('revisions[0].dropped[0].change.kind: ')),
    ).toBe(true);
  });

  it('citar em changed, added ou dropped.notes o que já não existe não é erro', () => {
    const json = sample5();
    json.revisions[0].changed = { c77: { to: 1, state: null } };
    json.revisions[0].added = ['c88'];
    json.revisions[0].dropped[0].notes = ['n-sumida'];
    expect(parseProposal(json).ok).toBe(true);
  });

  it('at não ISO dá erro; changed.state só aceita "rejected" ou null', () => {
    const badDate = sample5();
    badDate.revisions[0].at = 'ontem';
    expect(errorsOf(badDate).some((e) => e.startsWith('revisions[0].at: '))).toBe(true);

    const badState = sample5();
    badState.revisions[0].changed.c1.state = 'accepted';
    expect(
      errorsOf(badState).some((e) => e.startsWith('revisions[0].changed.c1.state: ')),
    ).toBe(true);

    const noState = sample5();
    noState.revisions[0].dropped[0].state = 'accepted';
    expect(
      errorsOf(noState).some((e) => e.startsWith('revisions[0].dropped[0].state: ')),
    ).toBe(true);
  });
});
