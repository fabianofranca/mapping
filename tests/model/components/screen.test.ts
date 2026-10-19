// Laboratório Componentes: o modelo da tela é imutável e serializa/relê sem perda.
import { describe, expect, it } from 'vitest';
import {
  addInstance,
  bringToFront,
  newScreen,
  parseScreen,
  removeInstance,
  resize,
  serializeScreen,
  setValue,
  updateBox,
} from '../../../src/model/components/screen';
import { SAMPLE_SCREEN } from '../../../lab/components/samples';

describe('screen', () => {
  it('adiciona, move, edita, traz para frente e remove sem mutar o objeto anterior', () => {
    const empty = newScreen('T', 100, 200);
    const one = addInstance(empty, {
      typeId: 'button',
      box: { x: 1.4, y: 2.6, width: 10.2, height: 0 },
      values: { label: 'a' },
    });
    expect(empty.instances).toHaveLength(0);
    const id = one.instances[0]?.id ?? '';
    const moved = updateBox(one, id, { x: 5, y: 6, width: 7.6, height: 8 });
    expect(moved.instances[0]?.box).toEqual({ x: 5, y: 6, width: 8, height: 8 });
    expect(one.instances[0]?.box.x).toBe(1.4);
    const edited = setValue(moved, id, 'label', 'b');
    expect(edited.instances[0]?.values).toEqual({ label: 'b' });
    expect(setValue(edited, 'nope', 'label', 'c')).toBe(edited);
    const two = addInstance(edited, {
      typeId: 'card',
      box: { x: 0, y: 0, width: 1, height: 1 },
      values: {},
    });
    const front = bringToFront(two, id);
    expect(front.instances.map((i) => i.typeId)).toEqual(['card', 'button']);
    expect(removeInstance(front, id).instances).toHaveLength(1);
    expect(resize(front, 390.4, 0).width).toBe(390);
    expect(resize(front, 390.4, 0).height).toBe(1);
  });

  it('serializa e relê a tela de exemplo', () => {
    const text = serializeScreen(SAMPLE_SCREEN);
    const back = parseScreen(JSON.parse(text));
    expect(back).toEqual(SAMPLE_SCREEN);
  });

  it('recusa telas malformadas com mensagem em português', () => {
    expect(() => parseScreen(null)).toThrow(/Tela inválida/);
    expect(() => parseScreen({ format: 'x' })).toThrow(/format/);
    expect(() =>
      parseScreen({
        format: 'mapping-lab-screen',
        width: 1,
        height: 1,
        instances: [{ typeId: 1 }],
      }),
    ).toThrow(/typeId/);
  });
});
