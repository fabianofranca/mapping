// Componente em pixels de tela (`screen`) e `stroke.scale` (formato 4, decisões 22 e 23 da etapa #747).
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  type NewComponentArgs,
  type Project,
} from '../../../src/model';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { COMPONENTS, SPEC_ID, componentProject, testCatalog } from '../componentFixtures';

function file(version: number, extra: Record<string, unknown> = {}, stroke?: unknown) {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 120, height: 40 },
    template: {
      type: 'frame',
      children:
        stroke === undefined ? [] : [{ type: 'rect', width: 10, height: 10, stroke }],
    },
    ...extra,
  };
}

describe('parse: screen e stroke.scale', () => {
  it('numa formatVersion 3, screen é erro de versão no caminho da chave', () => {
    expect(validateComponent(file(3, { screen: { anchor: 'top-left' } }))).toEqual([
      'screen: só é permitido com formatVersion 4',
    ]);
  });

  it('numa formatVersion 3, stroke.scale é erro de versão no caminho da chave', () => {
    expect(validateComponent(file(3, {}, { color: '#000', scale: false }))).toEqual([
      'template.children[0].stroke.scale: só é permitido com formatVersion 4',
    ]);
  });

  it('na 4 são aceitos (screen vazio vale: âncora center)', () => {
    expect(
      validateComponent(file(4, { screen: {} }, { color: '#000', scale: false })),
    ).toEqual([]);
    expect(parseComponent(file(4, { screen: { anchor: 'bottom-right' } })).ok).toBe(true);
  });

  it('as nove âncoras valem; outra é erro com caminho', () => {
    for (const anchor of [
      'center',
      'top-left',
      'top',
      'top-right',
      'left',
      'right',
      'bottom-left',
      'bottom',
      'bottom-right',
    ])
      expect(validateComponent(file(4, { screen: { anchor } }))).toEqual([]);
    expect(validateComponent(file(4, { screen: { anchor: 'middle' } }))[0]).toMatch(
      /^screen\.anchor: /,
    );
    expect(validateComponent(file(4, { screen: { x: 1 } }))[0]).toMatch(/^screen\.x: /);
    expect(validateComponent(file(4, { screen: 'center' }))[0]).toMatch(/^screen: /);
  });

  it('stroke.scale precisa ser booleano', () => {
    expect(validateComponent(file(4, {}, { color: '#000', scale: 'no' }))[0]).toMatch(
      /^template\.children\[0\]\.stroke\.scale: /,
    );
  });

  it('screen em nó filho é erro (chave desconhecida)', () => {
    const f = file(4) as { template: Record<string, unknown> };
    f.template.screen = { anchor: 'center' };
    expect(validateComponent(f)[0]).toMatch(/screen/);
  });
});

function catalogWith(extra: Record<string, unknown>) {
  return testCatalog({
    ...COMPONENTS,
    wide: { ...COMPONENTS.wide, formatVersion: 4, ...extra },
  });
}

function drawWide(
  extra: Record<string, unknown>,
  rect = { x: 10, y: 20, width: 50, height: 30 },
) {
  const catalog = catalogWith(extra);
  const args: NewComponentArgs = {
    markingId: 'W',
    annotationId: 'A_W',
    containerId: 'I1',
    parentId: null,
    specId: SPEC_ID,
    typeId: 'wide',
    rect,
  };
  const p: Project = addComponentMarking(
    componentProject(),
    catalog,
    args,
    approximateMeasurer,
  );
  const marking = p.markings.find((m) => m.id === 'W')!;
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('W')!;
  return { marking, drawing };
}

describe('desenho com screen', () => {
  it('a cena mede o size do componente na origem e leva a âncora e o retângulo da marcação', () => {
    const { marking, drawing } = drawWide({ screen: { anchor: 'top-left' } });
    expect(marking.rect).toEqual({ x: 10, y: 20, width: 50, height: 30 });
    expect(drawing.root).toMatchObject({ width: 100, height: 40 });
    expect(drawing.root.transform.slice(4)).toEqual([0, 0]);
    expect(drawing.screen).toEqual({
      anchor: 'top-left',
      rect: { x: 10, y: 20, width: 50, height: 30 },
    });
  });

  it('âncora padrão é center', () => {
    expect(drawWide({ screen: {} }).drawing.screen?.anchor).toBe('center');
  });

  it('sem screen o desenho segue o retângulo e não tem screen', () => {
    const { drawing } = drawWide({});
    expect(drawing.screen).toBeUndefined();
    expect(drawing.root).toMatchObject({ width: 50, height: 30 });
    expect(drawing.root.transform.slice(4)).toEqual([10, 20]);
  });

  it('passar do retângulo não gera a pendência "não cabe"', () => {
    expect(drawWide({}, { x: 0, y: 0, width: 100, height: 40 }).drawing.overflow).toBe(
      true,
    );
    const { drawing } = drawWide({ screen: {} }, { x: 0, y: 0, width: 20, height: 10 });
    expect(drawing.overflow).toBe(false);
  });
});
