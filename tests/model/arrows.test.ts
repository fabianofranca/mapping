import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addTypedAnnotation,
  arrowDeletionImpact,
  arrowLabel,
  arrowPointsSpace,
  arrowRoute,
  arrowsOf,
  autoArrowSide,
  canEditArrow,
  createArrow,
  createMarking,
  getProjectIssues,
  projectIndex,
  removeArrow,
  setArrowEndpoint,
  setArrowLocked,
  setArrowName,
  setArrowRoute,
  setArrowStyle,
  setContainerPlacement,
  setMarkingLocked,
  sideAnchor,
  validateProject,
  type Arrow,
  type Project,
} from '../../src/model';
import { arrowBase, arrowProject, withArrow } from './arrowFixtures';
import { expectValid } from './fixtures';
import { cadastroProject } from './specFixtures';

// Setas (ME4, decisão 14): uma marcação que aponta. Fixture: tests/model/arrowFixtures.ts.

const arrow = (p: Project, id: string): Arrow => {
  const found = p.arrows.find((a) => a.id === id);
  if (!found) throw new Error(`seta ${id} não encontrada`);
  return found;
};

describe('createArrow', () => {
  it('cria com os padrões: curva, sem rota, sem lados, sem nome, destrancada', () => {
    const p = arrowBase();
    const next = expectValid(createArrow(p, { id: 'r1', from: 'a1', to: 'b1' }));
    expect(next.arrows).toEqual([
      {
        id: 'r1',
        from: 'a1',
        to: 'b1',
        fromSide: null,
        toSide: null,
        points: [],
        style: 'curve',
        name: null,
        locked: false,
      },
    ]);
    // Imutável: o projeto de antes continua como estava.
    expect(p.arrows).toEqual([]);
    expect(next.markings).toBe(p.markings);
  });

  it('aceita estilo, lados e nome (o nome é aparado; vazio vira null)', () => {
    const p = arrowBase();
    const next = createArrow(p, {
      id: 'r1',
      from: 'a1',
      to: 'b1',
      style: 'elbow',
      fromSide: 'bottom',
      toSide: 'left',
      name: '  abre o menu  ',
    });
    expect(arrow(next, 'r1')).toMatchObject({
      style: 'elbow',
      fromSide: 'bottom',
      toSide: 'left',
      name: 'abre o menu',
    });
    expect(
      arrow(createArrow(p, { id: 'r2', from: 'a1', to: 'b1', name: '  ' }), 'r2').name,
    ).toBeNull();
  });

  it('liga marcações de qualquer espaço, flutuante e do canvas inclusive', () => {
    let p = arrowBase();
    p = createArrow(p, { id: 'r1', from: 'N', to: 'a1' });
    p = createArrow(p, { id: 'r2', from: 'G', to: 'H' });
    p = createArrow(p, { id: 'r3', from: 'a1', to: 'c1' });
    expectValid(p);
    expect(p.arrows.map((a) => a.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('duas setas iguais são permitidas', () => {
    let p = arrowBase();
    p = createArrow(p, { id: 'r1', from: 'a1', to: 'a3' });
    p = createArrow(p, { id: 'r2', from: 'a1', to: 'a3' });
    expect(expectValid(p).arrows).toHaveLength(2);
  });

  it('recusa ponta que não existe, que é uma seta ou que é um container', () => {
    const p = arrowProject();
    expect(() => createArrow(p, { id: 'x', from: 'zz', to: 'a1' })).toThrow('not-found');
    expect(() => createArrow(p, { id: 'x', from: 'a1', to: 'zz' })).toThrow('not-found');
    // Seta nunca liga outra seta.
    expect(() => createArrow(p, { id: 'x', from: 'r1', to: 'a1' })).toThrow(
      'arrow-endpoint',
    );
    expect(() => createArrow(p, { id: 'x', from: 'a1', to: 'r1' })).toThrow(
      'arrow-endpoint',
    );
    // Nem container: apontar para uma tela é apontar para uma marcação dela.
    expect(() => createArrow(p, { id: 'x', from: 'a1', to: 'A' })).toThrow('not-found');
  });

  it('recusa origem e destino iguais', () => {
    expect(() => createArrow(arrowBase(), { id: 'x', from: 'a1', to: 'a1' })).toThrow(
      'arrow-self',
    );
  });

  it('o id divide o espaço das marcações: repetir o de uma marcação ou de outra seta falha', () => {
    const p = arrowProject();
    expect(() => createArrow(p, { id: 'a1', from: 'a1', to: 'a3' })).toThrow(
      'duplicate-id',
    );
    expect(() => createArrow(p, { id: 'r1', from: 'a1', to: 'a3' })).toThrow(
      'duplicate-id',
    );
    // E o contrário: uma marcação nova não pode repetir o id de uma seta.
    expect(() =>
      createMarking(p, {
        id: 'r1',
        containerId: 'A',
        rect: { x: 700, y: 100, width: 50, height: 50 },
      }),
    ).toThrow('duplicate-id');
  });

  it('lado ou estilo fora do formato falham', () => {
    const p = arrowBase();
    expect(() =>
      createArrow(p, {
        id: 'x',
        from: 'a1',
        to: 'a3',
        fromSide: 'diagonal' as unknown as 'top',
      }),
    ).toThrow('invalid-value');
    expect(() =>
      createArrow(p, {
        id: 'x',
        from: 'a1',
        to: 'a3',
        style: 'zigzag' as unknown as 'curve',
      }),
    ).toThrow('invalid-value');
  });
});

describe('anotações numa seta', () => {
  it('a seta é dona de anotações como uma marcação; dona inexistente falha', () => {
    const p = arrowProject();
    expect(
      projectIndex(p)
        .annotationsByMarking.get('r1')
        ?.map((a) => a.id),
    ).toEqual(['ra1', 'ra2']);
    expect(validateProject(p)).toEqual([]);
    expect(() => addAnnotation(p, { id: 'x', markingId: 'zz', layerId: 'L1' })).toThrow(
      'not-found',
    );
    // O container não é dona de anotação.
    expect(() => addAnnotation(p, { id: 'x', markingId: 'A', layerId: 'L1' })).toThrow(
      'not-found',
    );
  });
});

describe('anotação tipada numa seta', () => {
  it('é criada na camada do tipo e entra nas pendências como a de uma marcação', () => {
    let p = createArrow(cadastroProject(), { id: 'R1', from: 'MN', to: 'MC' });
    const layer = p.layers.find(
      (l) => l.spec?.specId === 'sdui' && l.spec.layerId === 'componentes',
    );
    if (!layer) throw new Error('fixture');
    p = addTypedAnnotation(p, {
      id: 'AX',
      markingId: 'R1',
      layerId: layer.id,
      type: { specId: 'sdui', typeId: 'text' },
    });
    expect(validateProject(p)).toEqual([]);
    expect(
      projectIndex(p)
        .annotationsByMarking.get('R1')
        ?.map((a) => a.id),
    ).toEqual(['AX']);
    // Os campos obrigatórios vazios do Text são pendências da anotação da seta.
    expect(getProjectIssues(p).get('AX')).toEqual(
      expect.arrayContaining([{ code: 'required-empty', key: 'conteudo' }]),
    );
    // Dona inexistente continua falhando.
    expect(() =>
      addTypedAnnotation(p, {
        id: 'AY',
        markingId: 'R9',
        layerId: layer.id,
        type: { specId: 'sdui', typeId: 'text' },
      }),
    ).toThrow('not-found');
  });
});

describe('removeArrow', () => {
  it('apaga a seta e as anotações dela, inclusive as vinculadas, e deixa o resto', () => {
    let p = arrowProject();
    p = withArrow(p, 'r2', 'a1', 'b1');
    p = addAnnotation(p, { id: 'rb', markingId: 'r2', layerId: 'L1' });
    p = addAnnotation(p, { id: 'ma', markingId: 'a1', layerId: 'L1' });
    expect(arrowDeletionImpact(p, 'r1')).toEqual({ annotations: 2, brokenRefs: 0 });
    const next = expectValid(removeArrow(p, 'r1'));
    expect(next.arrows.map((a) => a.id)).toEqual(['r2']);
    expect(next.annotations.map((a) => a.id)).toEqual(['rb', 'ma']);
    expect(next.markings).toBe(p.markings);
  });

  it('seta trancada recusa; a inexistente falha', () => {
    const p = setArrowLocked(arrowProject(), 'r1', true);
    expect(() => removeArrow(p, 'r1')).toThrow('locked');
    expect(() => removeArrow(p, 'zz')).toThrow('not-found');
  });
});

describe('setArrowEndpoint', () => {
  it('troca a marcação de uma ponta, mantendo a rota quando o espaço dos pontos é o mesmo', () => {
    let p = arrowProject();
    p = setArrowRoute(p, 'r1', [{ x: 500, y: 100 }]);
    // a1 → a3 (os dois no container A); a2 também é de A: o espaço dos pontos não muda.
    const next = expectValid(setArrowEndpoint(p, 'r1', 'to', 'a2', null));
    expect(arrow(next, 'r1')).toMatchObject({
      from: 'a1',
      to: 'a2',
      points: [{ x: 500, y: 100 }],
    });
    const back = setArrowEndpoint(next, 'r1', 'from', 'a3', null);
    expect(arrow(back, 'r1')).toMatchObject({ from: 'a3', to: 'a2' });
    expect(arrow(back, 'r1').points).toHaveLength(1);
  });

  it('apaga os pontos quando o espaço deles muda', () => {
    let p = arrowProject();
    p = setArrowRoute(p, 'r1', [{ x: 500, y: 100 }]);
    // b1 é do container B: os pontos deixam de ser do container A (viram do canvas).
    const toOther = setArrowEndpoint(p, 'r1', 'to', 'b1', null);
    expect(arrow(toOther, 'r1')).toMatchObject({ to: 'b1', points: [] });
    // Para o canvas também.
    expect(arrow(setArrowEndpoint(p, 'r1', 'from', 'H', null), 'r1').points).toEqual([]);
  });

  it('apaga os pontos ao passar de canvas para container', () => {
    let p = withArrow(arrowBase(), 'rc', 'a1', 'c1');
    p = setArrowRoute(p, 'rc', [{ x: 2000, y: 50 }]);
    // a1 (A) e c1 (C): pontos no canvas. Trocar c1 por a3 junta as duas pontas em A.
    expect(arrow(setArrowEndpoint(p, 'rc', 'to', 'a3', null), 'rc').points).toEqual([]);
  });

  it('troca só o lado, ou o lado e a marcação, e volta ao automático com null', () => {
    const p = arrowProject();
    const side = setArrowEndpoint(p, 'r1', 'from', 'a1', 'bottom');
    expect(arrow(side, 'r1')).toMatchObject({ from: 'a1', fromSide: 'bottom' });
    const both = setArrowEndpoint(side, 'r1', 'to', 'a2', 'top');
    expect(arrow(both, 'r1')).toMatchObject({
      to: 'a2',
      toSide: 'top',
      fromSide: 'bottom',
    });
    expect(
      arrow(setArrowEndpoint(both, 'r1', 'from', 'a1', null), 'r1').fromSide,
    ).toBeNull();
  });

  it('recusa a outra ponta, uma seta, o que não existe e um lado inválido', () => {
    const p = arrowProject();
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'a1', null)).toThrow('arrow-self');
    expect(() => setArrowEndpoint(p, 'r1', 'from', 'a3', null)).toThrow('arrow-self');
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'r1', null)).toThrow('arrow-endpoint');
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'zz', null)).toThrow('not-found');
    expect(() => setArrowEndpoint(p, 'zz', 'to', 'a2', null)).toThrow('not-found');
    expect(() =>
      setArrowEndpoint(p, 'r1', 'to', 'a2', 'middle' as unknown as 'top'),
    ).toThrow('invalid-value');
  });

  it('sem mudança devolve o mesmo projeto; trancada recusa só a mudança', () => {
    const p = setArrowLocked(arrowProject(), 'r1', true);
    expect(setArrowEndpoint(p, 'r1', 'to', 'a3', null)).toBe(p);
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'a2', null)).toThrow('locked');
    expect(() => setArrowEndpoint(p, 'r1', 'from', 'a1', 'top')).toThrow('locked');
  });
});

describe('setArrowRoute, setArrowStyle, setArrowName, setArrowLocked', () => {
  it('a rota guarda uma cópia dos pontos; [] volta ao padrão', () => {
    const p = arrowProject();
    const points = [
      { x: 10, y: 20 },
      { x: 30.5, y: 40 },
    ];
    const next = setArrowRoute(p, 'r1', points);
    expect(arrow(next, 'r1').points).toEqual(points);
    expect(arrow(next, 'r1').points[0]).not.toBe(points[0]);
    expect(arrow(setArrowRoute(next, 'r1', []), 'r1').points).toEqual([]);
    expect(setArrowRoute(next, 'r1', points)).toBe(next);
  });

  it('a rota recusa coordenada que não é finita', () => {
    const p = arrowProject();
    expect(() => setArrowRoute(p, 'r1', [{ x: Number.NaN, y: 0 }])).toThrow(
      'invalid-arrow-route',
    );
    expect(() => setArrowRoute(p, 'r1', [{ x: 0, y: Infinity }])).toThrow(
      'invalid-arrow-route',
    );
  });

  it('o estilo troca entre os três; o mesmo devolve o projeto; inválido falha', () => {
    const p = arrowProject();
    expect(arrow(p, 'r1').style).toBe('curve');
    expect(arrow(setArrowStyle(p, 'r1', 'straight'), 'r1').style).toBe('straight');
    expect(arrow(setArrowStyle(p, 'r1', 'elbow'), 'r1').style).toBe('elbow');
    expect(setArrowStyle(p, 'r1', 'curve')).toBe(p);
    expect(() => setArrowStyle(p, 'r1', 'zigzag' as unknown as 'curve')).toThrow(
      'invalid-value',
    );
  });

  it('o nome vazio vira null, como o da marcação', () => {
    const p = arrowProject();
    const named = setArrowName(p, 'r1', '  abre o menu ');
    expect(arrow(named, 'r1').name).toBe('abre o menu');
    expect(arrow(setArrowName(named, 'r1', ''), 'r1').name).toBeNull();
    expect(arrow(setArrowName(named, 'r1', null), 'r1').name).toBeNull();
    expect(() => setArrowName(p, 'zz', 'x')).toThrow('not-found');
  });

  it('seta trancada recusa rota, pontas, lados e estilo; o nome segue livre', () => {
    const p = setArrowLocked(arrowProject(), 'r1', true);
    expect(canEditArrow(p, 'r1')).toBe(false);
    expect(() => setArrowRoute(p, 'r1', [{ x: 1, y: 1 }])).toThrow('locked');
    expect(() => setArrowStyle(p, 'r1', 'elbow')).toThrow('locked');
    expect(() => setArrowEndpoint(p, 'r1', 'to', 'a2', null)).toThrow('locked');
    expect(arrow(setArrowName(p, 'r1', 'ok'), 'r1').name).toBe('ok');
    // Destrancar devolve a edição; o mesmo valor devolve o projeto.
    const open = setArrowLocked(p, 'r1', false);
    expect(canEditArrow(open, 'r1')).toBe(true);
    expect(setArrowLocked(open, 'r1', false)).toBe(open);
    expect(() => setArrowLocked(p, 'zz', true)).toThrow('not-found');
  });

  it('a trava é só da seta: a das pontas não a trava, nem a dela trava as pontas', () => {
    let p = arrowProject();
    p = setMarkingLocked(p, 'a1', true);
    p = setMarkingLocked(p, 'a3', true);
    expect(canEditArrow(p, 'r1')).toBe(true);
    expect(arrow(setArrowStyle(p, 'r1', 'straight'), 'r1').style).toBe('straight');
    const locked = setArrowLocked(arrowProject(), 'r1', true);
    expect(locked.markings.every((m) => !m.locked)).toBe(true);
    expect(canEditArrow(setMarkingLocked(locked, 'a1', false), 'r1')).toBe(false);
  });
});

describe('arrowsOf e arrowLabel', () => {
  it('separa as que saem das que chegam, na ordem do array', () => {
    let p = arrowProject();
    p = withArrow(p, 'r2', 'a3', 'a1');
    p = withArrow(p, 'r3', 'a1', 'b1');
    const a1 = arrowsOf(p, 'a1');
    expect(a1.outgoing.map((a) => a.id)).toEqual(['r1', 'r3']);
    expect(a1.incoming.map((a) => a.id)).toEqual(['r2']);
    expect(arrowsOf(p, 'a3').incoming.map((a) => a.id)).toEqual(['r1']);
    expect(arrowsOf(p, 'a2')).toEqual({ outgoing: [], incoming: [] });
    expect(arrowsOf(p, 'zz')).toEqual({ outgoing: [], incoming: [] });
  });

  it('o rótulo devolve os dados: o nome e as marcações das pontas', () => {
    const p = setArrowName(arrowProject(), 'r1', 'abre');
    const label = arrowLabel(p, arrow(p, 'r1'));
    expect(label.name).toBe('abre');
    expect(label.from?.id).toBe('a1');
    expect(label.to?.id).toBe('a3');
    expect(arrowLabel(p, { name: null, from: 'zz', to: 'a1' })).toMatchObject({
      name: null,
      from: null,
    });
  });
});

describe('arrowPointsSpace: derivado das duas pontas, nunca gravado', () => {
  it('o container quando as duas pontas são do mesmo container', () => {
    const p = arrowProject();
    const space = arrowPointsSpace(p, arrow(p, 'r1'));
    expect(space.containerId).toBe('A');
    expect(space.placement).toEqual({ x: 0, y: 0, scale: 1 });
    expect(space.bounds).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it('o canvas em qualquer outro caso', () => {
    let p = arrowBase();
    p = withArrow(p, 'cc', 'a1', 'c1'); // containers diferentes
    p = withArrow(p, 'cv', 'a1', 'H'); // uma ponta do canvas
    p = withArrow(p, 'fl', 'N', 'a1'); // uma ponta flutuante
    p = withArrow(p, 'kk', 'G', 'H'); // as duas do canvas
    for (const id of ['cc', 'cv', 'fl', 'kk']) {
      const space = arrowPointsSpace(p, arrow(p, id));
      expect(space.containerId).toBeNull();
      expect(space.placement).toEqual({ x: 0, y: 0, scale: 1 });
      expect(space.bounds).toBeNull();
    }
    // Ponta inexistente (projeto inválido): o canvas.
    expect(arrowPointsSpace(p, { from: 'zz', to: 'a1' }).containerId).toBeNull();
  });

  it('o container com escala: o placement é o dele', () => {
    const p = withArrow(arrowBase(), 'rb', 'b1', 'b2');
    expect(arrowPointsSpace(p, arrow(p, 'rb')).placement).toEqual({
      x: 2000,
      y: 0,
      scale: 2,
    });
  });
});

describe('sideAnchor e autoArrowSide', () => {
  const rect = { x: 100, y: 200, width: 40, height: 20 };

  it('a âncora é o ponto médio do lado', () => {
    expect(sideAnchor(rect, 'top')).toEqual({ x: 120, y: 200 });
    expect(sideAnchor(rect, 'bottom')).toEqual({ x: 120, y: 220 });
    expect(sideAnchor(rect, 'left')).toEqual({ x: 100, y: 210 });
    expect(sideAnchor(rect, 'right')).toEqual({ x: 140, y: 210 });
  });

  it('o lado automático é o do eixo dominante do vetor centro → alvo', () => {
    expect(autoArrowSide(rect, { x: 500, y: 215 })).toBe('right');
    expect(autoArrowSide(rect, { x: -300, y: 215 })).toBe('left');
    expect(autoArrowSide(rect, { x: 125, y: 900 })).toBe('bottom');
    expect(autoArrowSide(rect, { x: 125, y: -900 })).toBe('top');
  });

  it('empate fica no eixo horizontal; o alvo no centro, à direita', () => {
    expect(autoArrowSide(rect, { x: 220, y: 310 })).toBe('right');
    expect(autoArrowSide(rect, { x: 20, y: 110 })).toBe('left');
    expect(autoArrowSide(rect, { x: 120, y: 210 })).toBe('right');
  });
});

describe('arrowRoute: a polilinha em unidades do canvas', () => {
  it('lados automáticos: o lado voltado para a outra ponta, âncora no meio do lado', () => {
    const p = arrowProject();
    // a1 (100,100,300,300) e a3 (600,600,200,200): centros (250,250) e (700,700), empate →
    // horizontal nas duas pontas.
    expect(arrowRoute(p, arrow(p, 'r1'))).toEqual({
      points: [
        { x: 400, y: 250 },
        { x: 600, y: 700 },
      ],
      fromSide: 'right',
      toSide: 'left',
    });
  });

  it('eixo vertical dominante e ponta do canvas', () => {
    const p = withArrow(arrowBase(), 'rh', 'a1', 'H');
    // a1 centro (250,250); H (400,1300,200,100) centro (500,1350): dy domina.
    expect(arrowRoute(p, arrow(p, 'rh'))).toEqual({
      points: [
        { x: 250, y: 400 },
        { x: 500, y: 1300 },
      ],
      fromSide: 'bottom',
      toSide: 'top',
    });
  });

  it('a marcação de um container com escala entra pelo retângulo dela no canvas', () => {
    const p = withArrow(arrowBase(), 'rb', 'b1', 'b2');
    // b1 → (2100,100,200,200); b2 → (2600,600,200,200).
    expect(arrowRoute(p, arrow(p, 'rb'))).toEqual({
      points: [
        { x: 2300, y: 200 },
        { x: 2600, y: 700 },
      ],
      fromSide: 'right',
      toSide: 'left',
    });
  });

  it('lados explícitos valem sobre o automático, cada ponta por si', () => {
    const p = withArrow(arrowBase(), 'r2', 'a1', 'a3', {
      fromSide: 'top',
      toSide: 'right',
    });
    expect(arrowRoute(p, arrow(p, 'r2'))).toEqual({
      points: [
        { x: 250, y: 100 },
        { x: 800, y: 700 },
      ],
      fromSide: 'top',
      toSide: 'right',
    });
    const half = withArrow(arrowBase(), 'r3', 'a1', 'a3', { toSide: 'bottom' });
    expect(arrowRoute(half, arrow(half, 'r3'))).toMatchObject({
      fromSide: 'right',
      toSide: 'bottom',
    });
  });

  it('os pontos de passagem em pixels do container são convertidos para o canvas', () => {
    const p = withArrow(arrowBase(), 'rb', 'b1', 'b2', {
      points: [{ x: 200, y: 100 }],
    });
    // Espaço de B: x = 2000 + 2·200, y = 0 + 2·100 → (2400,200). O primeiro ponto define o lado
    // de saída (b1 centro (2200,200) → ponto (2400,200): direita) e o último, o de chegada
    // (b2 centro (2700,700) → ponto (2400,200): dx −300, dy −500: topo).
    expect(arrowRoute(p, arrow(p, 'rb'))).toEqual({
      points: [
        { x: 2300, y: 200 },
        { x: 2400, y: 200 },
        { x: 2700, y: 600 },
      ],
      fromSide: 'right',
      toSide: 'top',
    });
  });

  it('os pontos já em unidades do canvas ficam como estão', () => {
    const p = withArrow(arrowBase(), 'rc', 'a1', 'c1', {
      points: [
        { x: 1500, y: 50 },
        { x: 3000, y: 50 },
      ],
    });
    const route = arrowRoute(p, arrow(p, 'rc'));
    expect(route?.points.slice(1, 3)).toEqual([
      { x: 1500, y: 50 },
      { x: 3000, y: 50 },
    ]);
    // a1 (100,100,300,300) centro (250,250) → primeiro ponto (1500,50): direita.
    expect(route?.fromSide).toBe('right');
    // c1 (4900,900,100,100) centro (4950,950) → último ponto (3000,50): esquerda.
    expect(route?.toSide).toBe('left');
    expect(route?.points[0]).toEqual({ x: 400, y: 250 });
    expect(route?.points[3]).toEqual({ x: 4900, y: 950 });
  });

  it('a rota de pontos do container acompanha o container movido ou redimensionado', () => {
    let p = withArrow(arrowBase(), 'rb', 'b1', 'b2', { points: [{ x: 200, y: 100 }] });
    const before = arrowRoute(p, arrow(p, 'rb'));
    p = setContainerPlacement(p, 'B', { x: 2100, y: 50, scale: 2 });
    const after = arrowRoute(p, arrow(p, 'rb'));
    // Tudo (marcações e ponto) andou (100, 50); a rota não foi recalculada.
    expect(after?.points).toEqual(
      before?.points.map((pt) => ({ x: pt.x + 100, y: pt.y + 50 })),
    );
    expect(arrow(p, 'rb').points).toEqual([{ x: 200, y: 100 }]);
  });

  it('reta e curva têm a mesma polilinha (a curva é só a suavização do desenho)', () => {
    const base = withArrow(arrowBase(), 'r2', 'a1', 'a3', {
      points: [{ x: 500, y: 100 }],
    });
    const curve = arrowRoute(base, arrow(base, 'r2'));
    const straightProject = setArrowStyle(base, 'r2', 'straight');
    expect(arrowRoute(straightProject, arrow(straightProject, 'r2'))).toEqual(curve);
  });

  it('é null quando uma ponta não existe', () => {
    const p = arrowProject();
    const broken: Arrow = { ...arrow(p, 'r1'), to: 'zz' };
    expect(arrowRoute(p, broken)).toBeNull();
    expect(arrowRoute(p, { ...broken, to: 'a3', from: 'zz' })).toBeNull();
  });
});
