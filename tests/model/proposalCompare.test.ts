import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addTypedAnnotation,
  compareProposals,
  createMarking,
  setFieldValue,
  setMarkingSource,
  type JsonValue,
  type Project,
  type Proposal,
} from '../../src/model';
import { changeOf, propose } from './proposalFixtures';
import { cadastroProject, layerOf } from './specFixtures';

// Comparação entre propostas (achado 15 do relato de 2026-10-11): criações sem `source`
// (anotações e marcações sem origem) recriadas na proposta nova com outros ids. O MCP gera
// ids novos a cada `propose_changes`, então só o caminho legível (imagem › pai › nome) casa.

function typed(
  p: Project,
  id: string,
  markingId: string,
  typeId: 'input' | 'button',
  values: Record<string, JsonValue>,
): Project {
  let next = addTypedAnnotation(p, {
    id,
    markingId,
    layerId: layerOf(p, 'sdui', 'componentes'),
    type: { specId: 'sdui', typeId },
    parentAnnotationId: null,
  });
  for (const [key, value] of Object.entries(values)) {
    next = setFieldValue(next, id, key, value);
  }
  return next;
}

/** Senha (com origem) no Formulário, Input nela e um Button no Cadastrar, com os ids dados. */
function senha(
  base: Project,
  ids: { marking: string; input: string; button: string },
  input: Record<string, JsonValue>,
): Project {
  let p = createMarking(base, {
    id: ids.marking,
    containerId: 'I1',
    rect: { x: 100, y: 1100, width: 800, height: 100 },
    name: 'Senha',
  });
  p = setMarkingSource(p, ids.marking, { system: 'figma', id: '7:1', url: null });
  p = typed(p, ids.input, ids.marking, 'input', input);
  p = typed(p, ids.button, 'MC', 'button', { id: 'btn_entrar', texto: 'Entrar' });
  return p;
}

function rounds(nextInput: Record<string, JsonValue>): {
  first: Proposal;
  second: Proposal;
} {
  const base = cadastroProject();
  const first = propose(
    base,
    senha(base, { marking: 'X1', input: 'XA', button: 'XB' }, { id: 'input_senha' }),
    { id: 'P1' },
  );
  const second = propose(
    base,
    senha(base, { marking: 'Z1', input: 'ZA', button: 'ZB' }, nextInput),
    { id: 'P2', supersedes: 'P1' },
  );
  return { first, second };
}

describe('comparação de criações sem source (achado 15)', () => {
  it('as três criações recriadas com outros ids constam na nova', () => {
    const { first, second } = rounds({ id: 'input_senha', placeholder: 'Sua senha' });
    const result = compareProposals(first, second);
    expect(result.get(changeOf(first, 'marking', 'X1').id)).toBe('same');
    // O Input ganhou um `placeholder`: mesmo ponto, outro resultado.
    expect(result.get(changeOf(first, 'annotation', 'XA').id)).toBe('different');
    // O Button é igual, embora a marcação dele exista e só a anotação seja nova.
    expect(result.get(changeOf(first, 'annotation', 'XB').id)).toBe('same');
    expect(result.size).toBe(first.changes.length);
    expect([...result.values()].filter((v) => v === 'missing')).toEqual([]);
  });

  it('recriadas idênticas: todas iguais', () => {
    const { first, second } = rounds({ id: 'input_senha' });
    expect([...compareProposals(first, second).values()]).toEqual([
      'same',
      'same',
      'same',
    ]);
  });

  it('o que a nova não recria continua "não consta"', () => {
    const base = cadastroProject();
    const first = propose(
      base,
      senha(base, { marking: 'X1', input: 'XA', button: 'XB' }, { id: 'input_senha' }),
    );
    // A nova só recria a marcação (com outro id) e o Input em outra marcação.
    let b = createMarking(base, {
      id: 'Z1',
      containerId: 'I1',
      rect: { x: 100, y: 1100, width: 800, height: 100 },
      name: 'Senha',
    });
    b = setMarkingSource(b, 'Z1', { system: 'figma', id: '7:1', url: null });
    b = typed(b, 'ZA', 'MN', 'input', { id: 'input_senha' });
    const second = propose(base, b, { id: 'P2' });
    const result = compareProposals(first, second);
    expect(result.get(changeOf(first, 'marking', 'X1').id)).toBe('same');
    expect(result.get(changeOf(first, 'annotation', 'XA').id)).toBe('missing');
    expect(result.get(changeOf(first, 'annotation', 'XB').id)).toBe('missing');
  });

  it('marcações sem source casam pelo caminho (imagem › pai › nome), filhas de criadas inclusive', () => {
    const base = cadastroProject();
    const build = (prefix: string, childName: string) => {
      let p = createMarking(base, {
        id: `${prefix}1`,
        containerId: 'I1',
        rect: { x: 50, y: 1500, width: 900, height: 300 },
        name: 'Rodapé',
      });
      p = createMarking(p, {
        id: `${prefix}2`,
        containerId: 'I1',
        rect: { x: 60, y: 1510, width: 100, height: 50 },
        name: childName,
      });
      p = addAnnotation(p, {
        id: `${prefix}A`,
        markingId: `${prefix}2`,
        layerId: 'LM',
        entries: [{ id: `${prefix}E`, key: 'nota', value: 'link' }],
      });
      return p;
    };
    const first = propose(base, build('X', 'Ajuda'));
    const same = propose(base, build('Z', 'Ajuda'), { id: 'P2' });
    expect([...compareProposals(first, same).values()]).toEqual(['same', 'same', 'same']);
    // Outro nome na filha: a filha e a anotação dela não constam (o caminho é outro).
    const renamed = propose(base, build('Z', 'Suporte'), { id: 'P2' });
    const result = compareProposals(first, renamed);
    expect(result.get(changeOf(first, 'marking', 'X1').id)).toBe('same');
    expect(result.get(changeOf(first, 'marking', 'X2').id)).toBe('missing');
    expect(result.get(changeOf(first, 'annotation', 'XA').id)).toBe('missing');
  });

  it('referências entre criações contam pelo caminho, não pelo id gerado', () => {
    const base = cadastroProject();
    const build = (prefix: string, value: string) => {
      let p = addAnnotation(base, {
        id: `${prefix}U`,
        markingId: 'MF',
        layerId: 'LM',
        name: 'Senha',
        entries: [{ id: `${prefix}E`, key: 'password', value }],
      });
      p = typed(p, `${prefix}I`, 'MI', 'input', {
        id: 'input_idade',
        dado: { annotationId: `${prefix}U`, entryId: `${prefix}E` },
      });
      return p;
    };
    const first = propose(base, build('X', 'string'));
    expect([
      ...compareProposals(
        first,
        propose(base, build('Z', 'string'), { id: 'P2' }),
      ).values(),
    ]).toEqual(['same', 'same']);
    const result = compareProposals(
      first,
      propose(base, build('Z', 'texto'), { id: 'P2' }),
    );
    expect(result.get(changeOf(first, 'annotation', 'XU').id)).toBe('different');
    expect(result.get(changeOf(first, 'annotation', 'XI').id)).toBe('same');
  });

  it('criações repetidas no mesmo caminho casam uma a uma, na ordem', () => {
    const base = cadastroProject();
    const build = (prefix: string, widths: number[]) => {
      let p = base;
      widths.forEach((width, i) => {
        p = createMarking(p, {
          id: `${prefix}${i}`,
          containerId: 'I1',
          rect: { x: 10 + i * 30, y: 1900, width, height: 50 },
        });
      });
      return p;
    };
    const first = propose(base, build('X', [20, 20]));
    const second = propose(base, build('Z', [20]), { id: 'P2' });
    const result = compareProposals(first, second);
    expect(result.get(changeOf(first, 'marking', 'X0').id)).toBe('same');
    expect(result.get(changeOf(first, 'marking', 'X1').id)).toBe('missing');
  });
});
