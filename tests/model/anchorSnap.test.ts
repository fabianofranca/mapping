// `snapToAnchor` (R3, decisão 12): encosta a marcação ancorada na âncora, do lado, alinhada e com o
// deslocamento. `start`/`end` seguem a direção de leitura efetiva do espaço; `offset.cross` é no
// sentido da leitura em `top`/`bottom` e para baixo em `start`/`end`.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  setMarkingRect,
  setContainerDensity,
  setMarkingAnchor,
  setProjectDirection,
  snapToAnchor,
  type AnchorAlign,
  type AnchorSide,
  type MarkingAnchor,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject, marking } from './fixtures';

const T: Rect = { x: 400, y: 300, width: 200, height: 100 };

/** I1 1000×800 com T (200×100 em 400,300) e M (100×40 em 10,10); canvas com CT e CM. */
function base(anchor: MarkingAnchor = { to: 'T' }): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  p = createMarking(p, { id: 'T', containerId: 'I1', rect: T });
  p = createMarking(p, {
    id: 'M',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 40 },
  });
  p = createMarking(p, {
    id: 'CT',
    containerId: null,
    rect: { x: -2000, y: -2000, width: 200, height: 100 },
  });
  p = createMarking(p, {
    id: 'CM',
    containerId: null,
    rect: { x: -3000, y: -3000, width: 100, height: 40 },
  });
  return setMarkingAnchor(setMarkingAnchor(p, 'M', anchor), 'CM', {
    ...anchor,
    to: 'CT',
  });
}

const moveMarkingTo = (p: Project, id: string, to: { x: number; y: number }): Project =>
  setMarkingRect(p, id, { ...marking(p, id).rect, ...to });

const snap = (p: Project, id = 'M', options?: Parameters<typeof snapToAnchor>[2]) =>
  snapToAnchor(p, id, options);
const at = (p: Project, id = 'M') => {
  const { x, y } = marking(p, id).rect;
  return { x, y };
};

describe('snapToAnchor: lados × alinhamentos (ltr, sem deslocamento)', () => {
  // M é 100×40; T é 200×100 em (400,300).
  const cases: [AnchorSide, AnchorAlign, { x: number; y: number }][] = [
    ['top', 'start', { x: 400, y: 260 }],
    ['top', 'center', { x: 450, y: 260 }],
    ['top', 'end', { x: 500, y: 260 }],
    ['bottom', 'start', { x: 400, y: 400 }],
    ['bottom', 'center', { x: 450, y: 400 }],
    ['bottom', 'end', { x: 500, y: 400 }],
    ['start', 'start', { x: 300, y: 300 }],
    ['start', 'center', { x: 300, y: 330 }],
    ['start', 'end', { x: 300, y: 360 }],
    ['end', 'start', { x: 600, y: 300 }],
    ['end', 'center', { x: 600, y: 330 }],
    ['end', 'end', { x: 600, y: 360 }],
  ];
  it.each(cases)('%s / %s', (side, align, expected) => {
    const { project, warnings } = snap(base({ to: 'T', side, align }));
    expect(at(project)).toEqual(expected);
    expect(marking(project, 'M').rect).toMatchObject({ width: 100, height: 40 });
    expect(warnings).toEqual([]);
  });

  it('sem side, align e offset vale top / center / 0', () => {
    expect(at(snap(base()).project)).toEqual({ x: 450, y: 260 });
  });

  it('a âncora não muda (só o retângulo da ancorada) e a âncora do alvo fica onde está', () => {
    const { project } = snap(base());
    expect(marking(project, 'T').rect).toEqual(T);
    expect(marking(project, 'M').anchor).toEqual({ to: 'T' });
  });
});

describe('snapToAnchor: deslocamento', () => {
  it('main afasta da borda (negativo sobrepõe) e cross anda ao longo do lado', () => {
    const top = snap(
      base({ to: 'T', side: 'top', align: 'center', offset: { main: 10, cross: 5 } }),
    );
    expect(at(top.project)).toEqual({ x: 455, y: 250 });
    const over = snap(
      base({ to: 'T', side: 'bottom', align: 'start', offset: { main: -8, cross: 0 } }),
    );
    expect(at(over.project)).toEqual({ x: 400, y: 392 });
    const side = snap(
      base({ to: 'T', side: 'end', align: 'start', offset: { main: 12, cross: 7 } }),
    );
    expect(at(side.project)).toEqual({ x: 612, y: 307 });
    const left = snap(
      base({ to: 'T', side: 'start', align: 'end', offset: { main: 12, cross: -3 } }),
    );
    expect(at(left.project)).toEqual({ x: 288, y: 357 });
  });

  it('o deslocamento da âncora é em pixels; os padrões do componente são em unidades × densidade', () => {
    const dense = (anchor: MarkingAnchor) => setContainerDensity(base(anchor), 'I1', 2);
    const own = snap(dense({ to: 'T', side: 'top', offset: { main: 4, cross: 2 } }));
    expect(at(own.project)).toEqual({ x: 452, y: 256 });
    const fromDefaults = snap(dense({ to: 'T' }), 'M', {
      defaults: { side: 'bottom', align: 'start', offset: { main: 4, cross: 2 } },
    });
    // main 4 u × 2 = 8 px; cross 2 u × 2 = 4 px.
    expect(at(fromDefaults.project)).toEqual({ x: 404, y: 408 });
  });

  it('o que a âncora informa vence os padrões; o resto vem deles (objeto ou função)', () => {
    const defaults = {
      side: 'bottom',
      align: 'end',
      offset: { main: 2, cross: 0 },
    } as const;
    const mixed = snap(base({ to: 'T', align: 'start' }), 'M', { defaults });
    expect(at(mixed.project)).toEqual({ x: 400, y: 402 });
    const byFn = snap(base({ to: 'T', align: 'start' }), 'M', {
      defaults: (m) => (m.id === 'M' ? defaults : undefined),
    });
    expect(at(byFn.project)).toEqual({ x: 400, y: 402 });
  });

  it('densidade 1 não escala o padrão', () => {
    const r = snap(base({ to: 'T' }), 'M', {
      defaults: { offset: { main: 4, cross: 0 } },
    });
    expect(at(r.project)).toEqual({ x: 450, y: 256 });
  });
});

describe('snapToAnchor: rtl', () => {
  const rtl = (anchor: MarkingAnchor) => setProjectDirection(base(anchor), 'rtl');

  it('em top/bottom, start é a direita e o cross positivo vai para a esquerda', () => {
    expect(at(snap(rtl({ to: 'T', side: 'top', align: 'start' })).project)).toEqual({
      x: 500,
      y: 260,
    });
    expect(at(snap(rtl({ to: 'T', side: 'top', align: 'end' })).project)).toEqual({
      x: 400,
      y: 260,
    });
    expect(
      at(
        snap(
          rtl({ to: 'T', side: 'bottom', align: 'start', offset: { main: 0, cross: 6 } }),
        ).project,
      ),
    ).toEqual({ x: 494, y: 400 });
    expect(at(snap(rtl({ to: 'T', side: 'top', align: 'center' })).project).x).toBe(450);
  });

  it('nos lados, start é o lado direito físico e end o esquerdo; align segue de cima para baixo', () => {
    expect(at(snap(rtl({ to: 'T', side: 'start', align: 'start' })).project)).toEqual({
      x: 600,
      y: 300,
    });
    expect(at(snap(rtl({ to: 'T', side: 'end', align: 'end' })).project)).toEqual({
      x: 300,
      y: 360,
    });
  });

  it('o container que fixa ltr num projeto rtl encosta em ltr', async () => {
    const { setContainerDirection } = await import('../../src/model');
    const p = setContainerDirection(
      rtl({ to: 'T', side: 'top', align: 'start' }),
      'I1',
      'ltr',
    );
    expect(at(snap(p).project)).toEqual({ x: 400, y: 260 });
  });
});

describe('snapToAnchor: limites, trava e sem mudança', () => {
  it('passando do container, prende dentro dele e avisa', () => {
    const { project, warnings } = snap(
      base({ to: 'T', side: 'top', offset: { main: 1000, cross: 0 } }),
    );
    expect(at(project)).toEqual({ x: 450, y: 0 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('arrange.outside');
    const right = snap(
      base({ to: 'T', side: 'end', align: 'start', offset: { main: 1000, cross: 0 } }),
    );
    expect(at(right.project).x).toBe(900);
  });

  it('a marcação já no limite que o encosto prenderia mantém o aviso (achado 4 do CL2)', () => {
    let p = base({
      to: 'T',
      side: 'end',
      align: 'start',
      offset: { main: 1000, cross: 0 },
    });
    p = moveMarkingTo(p, 'M', { x: 900, y: 300 });
    const { project, warnings } = snap(p);
    expect(project).toBe(p);
    expect(warnings.map((w) => w.code)).toEqual(['arrange.outside']);
  });

  it('o seguidor perto da borda não sai do container nem solta a âncora (achado 3 do CL2)', () => {
    let p = base({ to: 'T', side: 'end', align: 'start' });
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: { x: 880, y: 600, width: 100, height: 40 },
    });
    p = setMarkingAnchor(p, 'F', { to: 'M' });
    const { project, warnings } = snap(p);
    const f = marking(project, 'F');
    expect(f.containerId).toBe('I1');
    expect(f.anchor?.to).toBe('M');
    expect(f.rect.x + f.rect.width).toBeLessThanOrEqual(1000);
    expect(f.rect.x).toBeGreaterThanOrEqual(0);
    expect(warnings.map((w) => w.code)).toEqual(['arrange.outside']);
  });

  it('no canvas não há limite nem aviso', () => {
    const r = snap(
      base({ to: 'T', side: 'top', offset: { main: 100000, cross: 0 } }),
      'CM',
    );
    expect(at(r.project, 'CM')).toEqual({ x: -1950, y: -2000 - 40 - 100000 });
    expect(r.warnings).toEqual([]);
  });

  it('assenta: ao encostar dentro de outra marcação ela passa a ser a mãe', () => {
    let p = base({ to: 'T', side: 'top' });
    p = createMarking(p, {
      id: 'BIG',
      containerId: 'I1',
      rect: { x: 350, y: 250, width: 400, height: 300 },
    });
    expect(marking(p, 'M').parentId).toBeNull();
    expect(marking(snap(p).project, 'M').parentId).toBe('BIG');
  });

  it('trancada recusa com locked', () => {
    const p = base();
    const locked = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M' ? { ...m, locked: true } : m)),
    };
    expect(() => snap(locked)).toThrowError(/^locked/);
  });

  it('sem âncora falha com not-anchored; marcação inexistente com not-found', () => {
    const p = base();
    expect(() => snap(p, 'T')).toThrowError(/^not-anchored/);
    expect(() => snap(setMarkingAnchor(p, 'M', null))).toThrowError(/^not-anchored/);
    expect(() => snap(p, 'nada')).toThrowError(/^not-found/);
  });

  it('já encostada: devolve o mesmo Project (inclusive trancada)', () => {
    const once = snap(base()).project;
    const again = snap(once);
    expect(again.project).toBe(once);
    expect(again.warnings).toEqual([]);
    const locked = {
      ...once,
      markings: once.markings.map((m) => (m.id === 'M' ? { ...m, locked: true } : m)),
    };
    expect(snap(locked).project).toBe(locked);
  });
});

describe('snapToAnchor leva as ancoradas na marcação (como moveMarking)', () => {
  /** M encosta em T; F ancorada em M (e G em F); D é filha de M; Z não tem relação. */
  function chain(): Project {
    let p = base({ to: 'T', side: 'top', align: 'start' });
    p = createMarking(p, {
      id: 'D',
      containerId: 'I1',
      rect: { x: 12, y: 12, width: 20, height: 10 },
    });
    p = createMarking(p, {
      id: 'F',
      containerId: 'I1',
      rect: { x: 100, y: 500, width: 50, height: 30 },
    });
    p = createMarking(p, {
      id: 'G',
      containerId: 'I1',
      rect: { x: 200, y: 500, width: 50, height: 30 },
    });
    p = createMarking(p, {
      id: 'Z',
      containerId: 'I1',
      rect: { x: 900, y: 700, width: 50, height: 30 },
    });
    p = setMarkingAnchor(p, 'F', { to: 'M' });
    return setMarkingAnchor(p, 'G', { to: 'F' });
  }

  it('encostar M leva as filhas e as ancoradas nela (e as ancoradas das ancoradas), sem tocar nas outras', () => {
    const p = chain();
    // M vai de (10,10) a (400,260): dx 390, dy 250.
    const out = snap(p).project;
    expect(at(out, 'M')).toEqual({ x: 400, y: 260 });
    expect(at(out, 'D')).toEqual({ x: 402, y: 262 });
    expect(at(out, 'F')).toEqual({ x: 490, y: 750 });
    expect(at(out, 'G')).toEqual({ x: 590, y: 750 });
    expect(at(out, 'Z')).toEqual(at(p, 'Z'));
  });

  it('a ancorada que o encosto leva fica na mesma posição relativa (marcação do canvas inclusive)', () => {
    let p = base({ to: 'T', side: 'top', align: 'start' });
    p = createMarking(p, {
      id: 'CF',
      containerId: null,
      rect: { x: -3500, y: -3500, width: 50, height: 30 },
    });
    p = setMarkingAnchor(p, 'CF', { to: 'CM' });
    const out = snap(p, 'CM').project;
    const dx = at(out, 'CM').x - at(p, 'CM').x;
    const dy = at(out, 'CM').y - at(p, 'CM').y;
    expect(dx !== 0 || dy !== 0).toBe(true);
    expect(at(out, 'CF')).toEqual({ x: -3500 + dx, y: -3500 + dy });
  });

  it('sem mudança devolve o mesmo projeto (com ancoradas também)', () => {
    const once = snap(chain()).project;
    expect(snap(once).project).toBe(once);
  });
});
