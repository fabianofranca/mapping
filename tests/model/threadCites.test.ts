import { describe, expect, it } from 'vitest';
import { citedItemIds, proposalThreads, type CitationTarget } from '../../src/model';
import { HUMAN, T0, T1, T2, message, sampleThread } from './threadFixtures';

// Ids que o filtro "só as que citam a seleção" compara (decisão 34) e a ligação proposta ↔ conversa
// da janela Propostas (decisão 36).

describe('citedItemIds', () => {
  it('o id do item ou o da anotação que contém a parte citada', () => {
    const targets: CitationTarget[] = [
      { kind: 'marking', id: 'M1' },
      { kind: 'container', id: 'I1' },
      { kind: 'arrow', id: 'R1' },
      { kind: 'annotation', id: 'A1' },
      { kind: 'field', annotationId: 'A2', key: 'tipo' },
      { kind: 'entry', annotationId: 'A3', entryId: 'E1' },
      { kind: 'row', annotationId: 'A4', key: 'tabela', rowId: 'W1' },
    ];
    expect(citedItemIds(targets)).toEqual(['M1', 'I1', 'R1', 'A1', 'A2', 'A3', 'A4']);
  });

  it('camada, conversa e proposta não são itens do canvas: ficam de fora', () => {
    expect(
      citedItemIds([
        { kind: 'layer', id: 'L1' },
        { kind: 'thread', id: 'c1' },
        { kind: 'proposal', id: 'P1' },
        { kind: 'marking', id: 'M1' },
      ]),
    ).toEqual(['M1']);
  });
});

describe('proposalThreads', () => {
  const withProposal = (id: string, at: string, proposal: string | null) => ({
    ...message(id, at, HUMAN, 'x'),
    proposal,
  });

  it('a primeira conversa que ligou a proposta (pela mensagem mais antiga)', () => {
    const late = sampleThread({
      id: 'late',
      messages: [withProposal('m1', T2, 'P1')],
    });
    const early = sampleThread({
      id: 'early',
      messages: [
        message('a', T0),
        withProposal('m2', T1, 'P1'),
        withProposal('m3', T2, 'P2'),
      ],
    });
    const map = proposalThreads([late, early]);
    expect(map.get('P1')).toBe('early');
    expect(map.get('P2')).toBe('early');
    expect(map.size).toBe(2);
  });

  it('sem proposta nas mensagens, o mapa é vazio', () => {
    expect(proposalThreads([sampleThread()]).size).toBe(0);
  });
});
