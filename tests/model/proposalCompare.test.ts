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

// Comparison between proposals (finding 15 of the 2026-10-11 report): creations without `source`
// (annotations and markings without a source) recreated in the new proposal with other ids. The MCP generates
// new ids on every `propose_changes`, so only the readable path (image › parent › name) matches.

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

/** Password (with a source) in the form, an Input on it and a Button on the sign-up button, with the given ids. */
function password(
  base: Project,
  ids: { marking: string; input: string; button: string },
  input: Record<string, JsonValue>,
): Project {
  let p = createMarking(base, {
    id: ids.marking,
    containerId: 'I1',
    rect: { x: 100, y: 1100, width: 800, height: 100 },
    name: 'Password',
  });
  p = setMarkingSource(p, ids.marking, { system: 'figma', id: '7:1', url: null });
  p = typed(p, ids.input, ids.marking, 'input', input);
  p = typed(p, ids.button, 'MC', 'button', { id: 'btn_entrar', texto: 'Sign in' });
  return p;
}

function rounds(nextInput: Record<string, JsonValue>): {
  first: Proposal;
  second: Proposal;
} {
  const base = cadastroProject();
  const first = propose(
    base,
    password(base, { marking: 'X1', input: 'XA', button: 'XB' }, { id: 'input_senha' }),
    { id: 'P1' },
  );
  const second = propose(
    base,
    password(base, { marking: 'Z1', input: 'ZA', button: 'ZB' }, nextInput),
    { id: 'P2', supersedes: 'P1' },
  );
  return { first, second };
}

describe('comparison of creations without source (finding 15)', () => {
  it('the three creations recreated with other ids are present in the new one', () => {
    const { first, second } = rounds({ id: 'input_senha', placeholder: 'Your password' });
    const result = compareProposals(first, second);
    expect(result.get(changeOf(first, 'marking', 'X1').id)).toBe('same');
    // The Input gained a `placeholder`: same point, different result.
    expect(result.get(changeOf(first, 'annotation', 'XA').id)).toBe('different');
    // The Button is equal, although its marking exists and only the annotation is new.
    expect(result.get(changeOf(first, 'annotation', 'XB').id)).toBe('same');
    expect(result.size).toBe(first.changes.length);
    expect([...result.values()].filter((v) => v === 'missing')).toEqual([]);
  });

  it('recreated identical: all the same', () => {
    const { first, second } = rounds({ id: 'input_senha' });
    expect([...compareProposals(first, second).values()]).toEqual([
      'same',
      'same',
      'same',
    ]);
  });

  it('what the new one does not recreate stays "missing"', () => {
    const base = cadastroProject();
    const first = propose(
      base,
      password(base, { marking: 'X1', input: 'XA', button: 'XB' }, { id: 'input_senha' }),
    );
    // The new one only recreates the marking (with another id) and the Input on another marking.
    let b = createMarking(base, {
      id: 'Z1',
      containerId: 'I1',
      rect: { x: 100, y: 1100, width: 800, height: 100 },
      name: 'Password',
    });
    b = setMarkingSource(b, 'Z1', { system: 'figma', id: '7:1', url: null });
    b = typed(b, 'ZA', 'MN', 'input', { id: 'input_senha' });
    const second = propose(base, b, { id: 'P2' });
    const result = compareProposals(first, second);
    expect(result.get(changeOf(first, 'marking', 'X1').id)).toBe('same');
    expect(result.get(changeOf(first, 'annotation', 'XA').id)).toBe('missing');
    expect(result.get(changeOf(first, 'annotation', 'XB').id)).toBe('missing');
  });

  it('markings without source match by path (image › parent › name), children of created ones included', () => {
    const base = cadastroProject();
    const build = (prefix: string, childName: string) => {
      let p = createMarking(base, {
        id: `${prefix}1`,
        containerId: 'I1',
        rect: { x: 50, y: 1500, width: 900, height: 300 },
        name: 'Footer',
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
        entries: [{ id: `${prefix}E`, key: 'note', value: 'link' }],
      });
      return p;
    };
    const first = propose(base, build('X', 'Help'));
    const same = propose(base, build('Z', 'Help'), { id: 'P2' });
    expect([...compareProposals(first, same).values()]).toEqual(['same', 'same', 'same']);
    // Another name on the child: the child and its annotation are missing (the path is different).
    const renamed = propose(base, build('Z', 'Support'), { id: 'P2' });
    const result = compareProposals(first, renamed);
    expect(result.get(changeOf(first, 'marking', 'X1').id)).toBe('same');
    expect(result.get(changeOf(first, 'marking', 'X2').id)).toBe('missing');
    expect(result.get(changeOf(first, 'annotation', 'XA').id)).toBe('missing');
  });

  it('references between creations count by path, not by generated id', () => {
    const base = cadastroProject();
    const build = (prefix: string, value: string) => {
      let p = addAnnotation(base, {
        id: `${prefix}U`,
        markingId: 'MF',
        layerId: 'LM',
        name: 'Password',
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
      propose(base, build('Z', 'text'), { id: 'P2' }),
    );
    expect(result.get(changeOf(first, 'annotation', 'XU').id)).toBe('different');
    expect(result.get(changeOf(first, 'annotation', 'XI').id)).toBe('same');
  });

  it('repeated creations on the same path match one by one, in order', () => {
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
