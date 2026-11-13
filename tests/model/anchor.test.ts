// Âncora da marcação (schema v20, etapa "direção e âncora", R3): `markings[].anchor` liga uma
// marcação a outra do mesmo espaço. Aqui: formato, invariantes, índice, mover/excluir e
// `setMarkingAnchor`. O encosto (`snapToAnchor`) está em `anchorSnap.test.ts`.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  deserialize,
  migrations,
  moveItems,
  moveMarking,
  projectIndex,
  removeMarking,
  serialize,
  setMarkingAnchor,
  setMarkingRect,
  validateProject,
  type MarkingAnchor,
  type Project,
} from '../../src/model';
import { emptyProject, marking } from './fixtures';

type Raw = Record<string, unknown>;

/** I1 (1000×800) com A, B, C e D soltos (lado a lado); I2 com E; F no canvas, G no canvas. */
function base(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  p = addContainer(p, {
    id: 'I2',
    file: 'b.png',
    width: 500,
    height: 500,
    center: { x: 3250, y: 250 },
  });
  const make = (id: string, containerId: string | null, x: number, y: number) =>
    (p = createMarking(p, {
      id,
      containerId,
      rect: { x, y, width: 100, height: 50 },
    }));
  make('A', 'I1', 100, 100);
  make('B', 'I1', 400, 100);
  make('C', 'I1', 700, 100);
  make('E', 'I2', 10, 10);
  make('F', null, -500, -500);
  make('G', null, -300, -500);
  return p;
}

const anchored = (p: Project, id: string, anchor: MarkingAnchor | null): Project =>
  setMarkingAnchor(p, id, anchor);

const codes = (p: Project) => validateProject(p).map((i) => i.code);

describe('formato da âncora (v20)', () => {
  it('a gravação só escreve a chave quando há âncora; null e ausência não gravam', () => {
    const p = anchored(base(), 'B', {
      to: 'A',
      side: 'bottom',
      align: 'end',
      offset: { main: 8, cross: -4 },
    });
    const saved = JSON.parse(serialize(p)) as { markings: Raw[] };
    const byId = (id: string) => saved.markings.find((m) => m.id === id)!;
    expect(byId('B').anchor).toEqual({
      to: 'A',
      side: 'bottom',
      align: 'end',
      offset: { main: 8, cross: -4 },
    });
    expect('anchor' in byId('A')).toBe(false);
    const cleared = anchored(p, 'B', null);
    expect(marking(cleared, 'B').anchor).toBeNull();
    const again = JSON.parse(serialize(cleared)) as { markings: Raw[] };
    expect(again.markings.every((m) => !('anchor' in m))).toBe(true);
  });

  it('a âncora é a última chave da marcação gravada (ordem estável)', () => {
    const p = anchored(base(), 'B', { to: 'A' });
    const saved = JSON.parse(serialize(p)) as { markings: Raw[] };
    const keys = Object.keys(saved.markings.find((m) => m.id === 'B')!);
    expect(keys[keys.length - 1]).toBe('anchor');
  });

  it('lê e regrava a âncora sem perda; a versão continua a mesma', () => {
    const p = anchored(base(), 'B', {
      to: 'A',
      side: 'start',
      offset: { main: 2, cross: 3 },
    });
    const result = deserialize(serialize(p), migrations);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(marking(result.project, 'B').anchor).toEqual({
      to: 'A',
      side: 'start',
      offset: { main: 2, cross: 3 },
    });
    expect(result.project.schemaVersion).toBe(p.schemaVersion);
    expect(serialize(result.project)).toBe(serialize(p));
  });

  it('side ou align fora do conjunto é erro de leitura', () => {
    const raw = JSON.parse(serialize(anchored(base(), 'B', { to: 'A' }))) as {
      markings: Raw[];
    };
    const open = (anchor: unknown) => {
      const copy = structuredClone(raw);
      copy.markings.find((m) => m.id === 'B')!.anchor = anchor;
      return deserialize(JSON.stringify(copy), migrations).ok;
    };
    expect(open({ to: 'A', side: 'top', align: 'center' })).toBe(true);
    expect(open({ to: 'A', side: 'left' })).toBe(false);
    expect(open({ to: 'A', align: 'middle' })).toBe(false);
    expect(open({ side: 'top' })).toBe(false);
  });
});

describe('invariantes da âncora', () => {
  const withRaw = (p: Project, id: string, anchor: MarkingAnchor): Project => ({
    ...p,
    markings: p.markings.map((m) => (m.id === id ? { ...m, anchor } : m)),
  });

  it('um projeto com âncoras válidas não tem problemas', () => {
    const p = anchored(anchored(base(), 'B', { to: 'A' }), 'C', { to: 'B' });
    expect(validateProject(p)).toEqual([]);
  });

  it('anchor-missing: o alvo não existe', () => {
    const issues = validateProject(withRaw(base(), 'B', { to: 'nada' }));
    expect(issues).toEqual([
      { code: 'anchor-missing', entity: 'marking', id: 'B', otherId: 'nada' },
    ]);
  });

  it('anchor-self: ancorada em si mesma (e não é ciclo)', () => {
    const c = codes(withRaw(base(), 'B', { to: 'B' }));
    expect(c).toEqual(['anchor-self']);
  });

  it('anchor-cycle: A→B→A, nas duas', () => {
    const p = withRaw(withRaw(base(), 'A', { to: 'B' }), 'B', { to: 'A' });
    const issues = validateProject(p).filter((i) => i.code === 'anchor-cycle');
    expect(issues.map((i) => i.id).sort()).toEqual(['A', 'B']);
  });

  it('anchor-cycle: ciclo de três; quem só entra no ciclo não é reportado', () => {
    let p = withRaw(base(), 'A', { to: 'B' });
    p = withRaw(p, 'B', { to: 'C' });
    p = withRaw(p, 'C', { to: 'A' });
    expect(
      validateProject(p)
        .filter((i) => i.code === 'anchor-cycle')
        .map((i) => i.id)
        .sort(),
    ).toEqual(['A', 'B', 'C']);
    const entering = withRaw(
      withRaw(withRaw(base(), 'A', { to: 'B' }), 'B', { to: 'A' }),
      'C',
      { to: 'A' },
    );
    expect(
      validateProject(entering)
        .filter((i) => i.code === 'anchor-cycle')
        .map((i) => i.id)
        .sort(),
    ).toEqual(['A', 'B']);
  });

  it('anchor-other-space: containers diferentes, ou container e canvas', () => {
    expect(validateProject(withRaw(base(), 'B', { to: 'E' }))).toEqual([
      { code: 'anchor-other-space', entity: 'marking', id: 'B', otherId: 'E' },
    ]);
    expect(codes(withRaw(base(), 'B', { to: 'F' }))).toEqual(['anchor-other-space']);
  });

  it('as duas no canvas (containerId nulo) é válido', () => {
    expect(validateProject(withRaw(base(), 'G', { to: 'F' }))).toEqual([]);
  });
});

describe('o assentar não lê a âncora', () => {
  it('o parentId de todas as marcações é o mesmo com e sem âncoras', () => {
    let p = base();
    // D dentro de A, ancorada em B (fora de A): o pai segue sendo só geometria.
    p = createMarking(p, {
      id: 'D',
      containerId: 'I1',
      rect: { x: 110, y: 110, width: 20, height: 20 },
    });
    const plain = p;
    const withAnchors = anchored(anchored(p, 'D', { to: 'B' }), 'C', { to: 'A' });
    const parents = (q: Project) => q.markings.map((m) => [m.id, m.parentId]);
    expect(parents(withAnchors)).toEqual(parents(plain));
    expect(marking(withAnchors, 'D').parentId).toBe('A');
    // E depois de mexer na geometria também.
    const moved = moveMarking(withAnchors, 'B', 5, 5);
    expect(parents(moved)).toEqual(parents(moveMarking(plain, 'B', 5, 5)));
  });
});

describe('projectIndex: anchoredBy e anchorOf', () => {
  it('anchoredBy lista as ancoradas de cada alvo na ordem do array; anchorOf dá o alvo', () => {
    const p = anchored(anchored(base(), 'C', { to: 'A' }), 'B', { to: 'A' });
    const index = projectIndex(p);
    expect(index.anchoredBy.get('A')?.map((m) => m.id)).toEqual(['B', 'C']);
    expect(index.anchoredBy.get('B')).toBeUndefined();
    expect(index.anchorOf.get('B')).toBe('A');
    expect(index.anchorOf.get('C')).toBe('A');
    expect(index.anchorOf.get('A')).toBeUndefined();
    expect(projectIndex(p)).toBe(index);
  });

  it('anchor null não entra no índice', () => {
    const p = anchored(anchored(base(), 'B', { to: 'A' }), 'B', null);
    expect(projectIndex(p).anchoredBy.size).toBe(0);
    expect(projectIndex(p).anchorOf.size).toBe(0);
  });
});

describe('mover a âncora leva as ancoradas', () => {
  const rect = (p: Project, id: string) => marking(p, id).rect;

  it('moveMarking leva as ancoradas, as descendentes delas e as ancoradas das ancoradas, sem duplicar', () => {
    let p = base();
    // H dentro de B (descendente da ancorada B); C ancorada em B (ancorada da ancorada).
    p = createMarking(p, {
      id: 'H',
      containerId: 'I1',
      rect: { x: 410, y: 110, width: 20, height: 20 },
    });
    p = anchored(anchored(p, 'B', { to: 'A' }), 'C', { to: 'B' });
    // H também é ancorada em A: já está no conjunto movido pela descendência de B.
    p = anchored(p, 'H', { to: 'A' });
    const moved = moveMarking(p, 'A', 10, 20);
    expect(rect(moved, 'A')).toMatchObject({ x: 110, y: 120 });
    expect(rect(moved, 'B')).toMatchObject({ x: 410, y: 120 });
    expect(rect(moved, 'C')).toMatchObject({ x: 710, y: 120 });
    expect(rect(moved, 'H')).toMatchObject({ x: 420, y: 130 });
    // Quem não é ancorada fica.
    expect(rect(moved, 'E')).toEqual(rect(p, 'E'));
  });

  it('a ancorada movida sozinha não leva a âncora', () => {
    const p = anchored(base(), 'B', { to: 'A' });
    const moved = moveMarking(p, 'B', 7, 0);
    expect(rect(moved, 'A')).toEqual(rect(p, 'A'));
    expect(rect(moved, 'B').x).toBe(407);
  });

  it('um ciclo inválido não trava o mover', () => {
    const p = {
      ...base(),
      markings: base().markings.map((m) =>
        m.id === 'A'
          ? { ...m, anchor: { to: 'B' } }
          : m.id === 'B'
            ? { ...m, anchor: { to: 'A' } }
            : m,
      ),
    };
    const moved = moveMarking(p, 'A', 1, 1);
    expect(rect(moved, 'B').x).toBe(401);
  });

  it('moveItems leva as ancoradas (marcação de container e do canvas)', () => {
    const p = anchored(anchored(base(), 'B', { to: 'A' }), 'G', { to: 'F' });
    const moved = moveItems(p, [{ kind: 'marking', id: 'A' }], 12, 3);
    expect(rect(moved, 'A')).toMatchObject({ x: 112, y: 103 });
    expect(rect(moved, 'B')).toMatchObject({ x: 412, y: 103 });
    const canvas = moveItems(p, [{ kind: 'marking', id: 'F' }], 5, 5);
    expect(rect(canvas, 'F')).toMatchObject({ x: -495, y: -495 });
    expect(rect(canvas, 'G')).toMatchObject({ x: -295, y: -495 });
  });

  it('moveItems com a ancorada também selecionada move uma vez só', () => {
    const p = anchored(base(), 'B', { to: 'A' });
    const moved = moveItems(
      p,
      [
        { kind: 'marking', id: 'A' },
        { kind: 'marking', id: 'B' },
      ],
      10,
      0,
    );
    expect(rect(moved, 'A').x).toBe(110);
    expect(rect(moved, 'B').x).toBe(410);
  });

  it('redimensionar a âncora não move as ancoradas', () => {
    const p = anchored(base(), 'B', { to: 'A' });
    const resized = setMarkingRect(p, 'A', { x: 100, y: 100, width: 300, height: 80 });
    expect(rect(resized, 'B')).toEqual(rect(p, 'B'));
  });
});

describe('excluir a âncora', () => {
  it('as ancoradas ficam com anchor null; as demais ancoras não mudam', () => {
    let p = anchored(anchored(base(), 'B', { to: 'A' }), 'C', { to: 'B' });
    p = removeMarking(p, 'A');
    expect(marking(p, 'B').anchor).toBeNull();
    expect(marking(p, 'C').anchor).toEqual({ to: 'B' });
    expect(validateProject(p)).toEqual([]);
  });

  it('excluir a mãe leva as descendentes e solta as ancoradas nelas', () => {
    let p = base();
    p = createMarking(p, {
      id: 'H',
      containerId: 'I1',
      rect: { x: 110, y: 110, width: 20, height: 20 },
    });
    p = anchored(p, 'B', { to: 'H' });
    p = removeMarking(p, 'A');
    expect(marking(p, 'B').anchor).toBeNull();
  });

  it('excluir a própria ancorada não mexe nas outras', () => {
    const p = removeMarking(anchored(base(), 'B', { to: 'A' }), 'B');
    expect(p.markings.some((m) => m.id === 'B')).toBe(false);
    expect(validateProject(p)).toEqual([]);
  });
});

describe('setMarkingAnchor', () => {
  const fails = (fn: () => unknown, code: string) =>
    expect(fn).toThrowError(new RegExp(`^${code}`));

  it('grava e remove a âncora; o mesmo valor devolve o mesmo projeto', () => {
    const p = anchored(base(), 'B', { to: 'A', side: 'top' });
    expect(marking(p, 'B').anchor).toEqual({ to: 'A', side: 'top' });
    expect(anchored(p, 'B', { to: 'A', side: 'top' })).toBe(p);
    expect(anchored(base(), 'B', null)).toEqual(base());
    expect(marking(anchored(p, 'B', null), 'B').anchor).toBeNull();
  });

  it('recusa as quebras de invariante com o código do erro', () => {
    const p = base();
    fails(() => anchored(p, 'B', { to: 'nada' }), 'anchor-missing');
    fails(() => anchored(p, 'B', { to: 'B' }), 'anchor-self');
    fails(() => anchored(p, 'B', { to: 'E' }), 'anchor-other-space');
    fails(() => anchored(p, 'B', { to: 'F' }), 'anchor-other-space');
    fails(() => anchored(p, 'nada', { to: 'A' }), 'not-found');
    const chain = anchored(anchored(p, 'B', { to: 'A' }), 'C', { to: 'B' });
    fails(() => anchored(chain, 'A', { to: 'C' }), 'anchor-cycle');
    fails(
      () => anchored(anchored(p, 'B', { to: 'A' }), 'A', { to: 'B' }),
      'anchor-cycle',
    );
  });

  it('a marcação trancada pode ganhar âncora (não é geometria)', () => {
    const locked = {
      ...base(),
      markings: base().markings.map((m) => (m.id === 'B' ? { ...m, locked: true } : m)),
    };
    expect(marking(anchored(locked, 'B', { to: 'A' }), 'B').anchor).toEqual({ to: 'A' });
  });
});
