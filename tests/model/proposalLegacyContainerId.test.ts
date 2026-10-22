import { describe, expect, it } from 'vitest';
import {
  applyAccepted,
  createMarking,
  parseProposal,
  parseProposalText,
  previewProject,
  removeMarking,
  serializeProposal,
  type Proposal,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, decided, propose } from './proposalFixtures';

// Proposta escrita antes do schema v12: a marcação criada ou removida leva `imageId` no valor
// inteiro e a mudança de campo da marcação se chama `imageId`. A leitura normaliza para
// `containerId`; o cabeçalho `imageId` da mudança (onde ela aparece na revisão) continua.

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Troca `containerId` por `imageId` no valor de uma marcação, como gravava a versão antiga. */
function legacyValue(value: Json | null): Json | null {
  if (value === null) return null;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k === 'containerId' ? 'imageId' : k, v]),
  );
}

/**
 * Proposta no formato antigo: cria M9, remove M3 e muda o campo de container de M4 (I2 → I1),
 * tudo com `imageId` no lugar de `containerId`.
 */
function legacyJson(): Json {
  const base = sampleProject();
  let after = createMarking(base, {
    id: 'M9',
    containerId: 'I2',
    rect: { x: 300, y: 300, width: 100, height: 100 },
  });
  after = removeMarking(after, 'M3');
  const json = JSON.parse(serializeProposal(propose(base, after))) as Json;
  for (const c of json.changes as Json[]) {
    if (c.entity !== 'marking' || c.field !== null) continue;
    c.from = legacyValue(c.from);
    c.to = legacyValue(c.to);
  }
  json.changes.push({
    id: 'c9',
    kind: 'update',
    entity: 'marking',
    entityId: 'M4',
    imageId: 'I2',
    markingId: 'M4',
    field: 'imageId',
    from: 'I2',
    to: 'I1',
  });
  return json;
}

function parsed(json: Json): Proposal {
  const result = parseProposal(json);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.proposal;
}

describe('proposta escrita com imageId na marcação (antes da v12)', () => {
  it('o JSON de partida tem mesmo o formato antigo', () => {
    const json = legacyJson();
    const create = json.changes.find(
      (c: Json) => c.kind === 'create' && c.entity === 'marking',
    );
    const remove = json.changes.find(
      (c: Json) => c.kind === 'remove' && c.entity === 'marking',
    );
    expect(create.to.imageId).toBe('I2');
    expect(create.to.containerId).toBeUndefined();
    expect(remove.from.imageId).toBe('I1');
    expect(remove.from.containerId).toBeUndefined();
  });

  it('criação, remoção e mudança de campo são lidas com containerId', () => {
    const p = parsed(legacyJson());
    const create = p.changes.find((c) => c.kind === 'create' && c.entity === 'marking');
    const remove = p.changes.find((c) => c.kind === 'remove' && c.entity === 'marking');
    const field = p.changes.find((c) => c.id === 'c9');
    expect(create?.to).toMatchObject({ id: 'M9', containerId: 'I2' });
    expect(create?.to).not.toHaveProperty('imageId');
    expect(remove?.from).toMatchObject({ id: 'M3', containerId: 'I1' });
    expect(remove?.from).not.toHaveProperty('imageId');
    expect(field?.field).toBe('containerId');
    expect(field?.from).toBe('I2');
    expect(field?.to).toBe('I1');
    // O cabeçalho da mudança não muda: diz em que container ela aparece na revisão.
    expect(create?.imageId).toBe('I2');
    expect(remove?.imageId).toBe('I1');
    expect(field?.imageId).toBe('I2');
  });

  it('é igual à proposta já no formato novo e regrava sem imageId nos valores', () => {
    const legacy = parsed(legacyJson());
    const modern = legacyJson();
    // O mesmo conteúdo, escrito no formato novo.
    for (const c of modern.changes as Json[]) {
      if (c.entity !== 'marking') continue;
      if (c.field === 'imageId') c.field = 'containerId';
      if (c.field !== null) continue;
      const toNew = (v: Json | null) =>
        v === null
          ? null
          : Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k === 'imageId' ? 'containerId' : k, x]),
            );
      c.from = toNew(c.from);
      c.to = toNew(c.to);
    }
    expect(legacy).toEqual(parsed(modern));
    const text = serializeProposal(legacy);
    const again = parseProposalText(text);
    expect(again.ok && again.proposal).toEqual(legacy);
    const reparsed = JSON.parse(text) as Json;
    for (const c of reparsed.changes as Json[]) {
      if (c.entity !== 'marking' || c.field !== null) continue;
      expect(JSON.stringify(c.from ?? c.to)).not.toContain('"imageId"');
    }
  });

  it('uma proposta que já traz containerId (e imageId só no cabeçalho) segue como está', () => {
    const base = sampleProject();
    const after = createMarking(base, {
      id: 'M9',
      containerId: 'I2',
      rect: { x: 300, y: 300, width: 100, height: 100 },
    });
    const p = propose(base, after);
    expect(parsed(JSON.parse(serializeProposal(p)))).toEqual(p);
  });

  it('aplica: a marcação criada, a removida e o campo de container chegam ao projeto', () => {
    const base = sampleProject();
    let p = parsed(legacyJson());
    for (const c of p.changes) {
      p = decided(p, base, { level: 'change', id: c.id }, 'accepted');
    }
    const preview = previewProject(base, p).project;
    expect(preview.markings.find((m) => m.id === 'M9')?.containerId).toBe('I2');
    expect(preview.markings.some((m) => m.id === 'M3')).toBe(false);
    expect(preview.markings.find((m) => m.id === 'M4')?.containerId).toBe('I1');

    const applied = applyAccepted(base, p, AT);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.project.markings.find((m) => m.id === 'M9')?.containerId).toBe('I2');
    expect(applied.project.markings.find((m) => m.id === 'M4')?.containerId).toBe('I1');
  });
});
