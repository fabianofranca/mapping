// Material Design 3 escrito no formato do laboratório: um design system público inteiro
// (dez componentes) passa pela validação e instancia sem avisos, nos tamanhos e valores padrão.
import { describe, expect, it } from 'vitest';
import { findSlot, resolveSlotLayout } from '../../../lab/components/arrange';
import { approximateMeasurer, instantiate } from '../../../lab/components/instantiate';
import { initialValues, loadLibrary } from '../../../lab/components/library';
import { parseComponent } from '../../../lab/components/parseComponent';
import {
  ICONS,
  M3_COMPONENTS,
  M3_FILES,
  M3_SCREEN,
} from '../../../lab/components/samplesMaterial3';
import { walk } from '../../../lab/scene/scene';

describe('Material 3 no formato de componente', () => {
  it('a biblioteca carrega os quinze tipos, todos com componente válido e sem problemas', () => {
    const lib = loadLibrary(M3_FILES);
    expect(lib.specId).toBe('material3');
    expect(lib.problems).toEqual([]);
    expect(lib.types).toHaveLength(15);
    for (const type of lib.types) expect(type.component?.id, type.id).toBe(type.id);
  });

  it('cada componente instancia no tamanho padrão com os valores de pré-visualização, sem avisos', () => {
    const lib = loadLibrary(M3_FILES);
    for (const component of M3_COMPONENTS) {
      parseComponent(component);
      const type = lib.types.find((t) => t.id === component.id);
      expect(type, component.id).toBeDefined();
      const values = initialValues(type!);
      const box = { x: 0, y: 0, ...component.size };
      const made = instantiate(component, values, box, { measure: approximateMeasurer });
      expect(made.warnings, component.id).toEqual([]);
      expect(made.root.width).toBe(component.size.width);
    }
  });

  it('a tela de configurações instancia todas as 21 instâncias; só o cartão avisa (texto longo)', () => {
    const lib = loadLibrary(M3_FILES);
    const warnings: string[] = [];
    for (const instance of M3_SCREEN.instances) {
      const type = lib.types.find((t) => t.id === instance.typeId);
      expect(type?.component, instance.typeId).toBeDefined();
      const made = instantiate(type!.component!, instance.values, instance.box, {
        measure: approximateMeasurer,
      });
      warnings.push(...made.warnings.map((w) => `${instance.id}: ${w}`));
    }
    expect(warnings).toEqual([]);
  });

  it('as variantes do botão e o estado do campo mudam cor e visibilidade', () => {
    const button = M3_COMPONENTS.find((c) => c.id === 'm3-button')!;
    const box = { x: 0, y: 0, width: 120, height: 40 };
    const filled = instantiate(
      button,
      { label: 'OK', variant: 'filled', disabled: 'não' },
      box,
      { measure: approximateMeasurer },
    );
    const outlined = instantiate(
      button,
      { label: 'OK', variant: 'outlined', disabled: 'não' },
      box,
      { measure: approximateMeasurer },
    );
    const withIcon = instantiate(
      button,
      { label: 'OK', variant: 'filled', icon: 'check', disabled: 'não' },
      box,
      { measure: approximateMeasurer },
    );
    expect(filled.root.fills).toEqual([{ type: 'solid', color: '#6750A4' }]);
    // Transparente de propósito: a variante outlined mantém a área clicável sem cor.
    expect(outlined.root.fills).toEqual([{ type: 'solid', color: 'rgba(0, 0, 0, 0)' }]);
    expect(outlined.root.stroke?.paints).toEqual([{ type: 'solid', color: '#79747E' }]);
    const paths = (root: typeof filled.root) =>
      [...walk(root)].filter((n) => n.type === 'path');
    expect(paths(filled.root)).toHaveLength(0);
    expect(paths(withIcon.root)).toHaveLength(1);
    expect(paths(withIcon.root)[0]).toMatchObject({ d: ICONS.check });

    const field = M3_COMPONENTS.find((c) => c.id === 'm3-text-field')!;
    const error = instantiate(
      field,
      {
        label: 'E-mail',
        value: '',
        placeholder: '',
        supporting: 'Obrigatório',
        state: 'error',
        trailing: '',
      },
      { x: 0, y: 0, width: 280, height: 80 },
      { measure: approximateMeasurer },
    );
    const outline = [...walk(error.root)].find((n) => n.name === 'outline');
    expect(outline?.stroke?.paints).toEqual([{ type: 'solid', color: '#B3261E' }]);
  });

  it('cada componente declara o dimensionamento sem retângulo (sizing)', () => {
    const sizing = Object.fromEntries(M3_COMPONENTS.map((c) => [c.id, c.sizing]));
    expect(sizing).toEqual({
      'm3-top-app-bar': { width: 'fill', height: 64 },
      'm3-button': { width: 'hug', height: 40 },
      'm3-fab': { width: 56, height: 56 },
      'm3-text-field': { width: 'fill', height: 56 },
      'm3-switch': { width: 'fill', height: 32 },
      'm3-checkbox': { width: 'fill', height: 40 },
      'm3-chip': { width: 'hug', height: 32 },
      'm3-card': { width: 'fill', height: 'hug' },
      'm3-list-item': { width: 'fill', height: 72 },
      'm3-navigation-bar': { width: 'fill', height: 80 },
      'm3-bottom-sheet': { width: 'fill', height: 'hug' },
      'm3-scrim': { width: 'fill', height: 'fill' },
      'm3-box': { width: 'fill', height: 'hug' },
      'm3-row': { width: 'fill', height: 'hug' },
      'm3-column': { width: 'fill', height: 'hug' },
    });
  });

  it('o slot de ações do cartão enfileira os botões à direita, com 8 de espaço', () => {
    const card = M3_COMPONENTS.find((c) => c.id === 'm3-card')!;
    const slot = findSlot(card)!;
    expect(slot.name).toBe('ações');
    expect(resolveSlotLayout(slot, {})).toMatchObject({
      type: 'row',
      gap: 8,
      justify: 'end',
    });
  });

  it('a especialização declara a origem sdui e os tipos externos de cada componente', () => {
    const lib = loadLibrary(M3_FILES);
    expect(lib.origins).toHaveLength(1);
    const card = lib.types.find((t) => t.id === 'm3-card')!;
    expect(card.sources).toEqual([{ system: 'sdui', name: 'Card', slot: 'ações' }]);
    // Só a película do modal não corresponde a um nó do SDUI.
    expect(lib.types.filter((t) => t.sources.length === 0).map((t) => t.id)).toEqual([
      'm3-scrim',
    ]);
  });
});
