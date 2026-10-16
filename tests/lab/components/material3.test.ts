// Material Design 3 escrito no formato do laboratório: um design system público inteiro
// (dez componentes) passa pela validação e instancia sem avisos, nos tamanhos e valores padrão.
import { describe, expect, it } from 'vitest';
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
  it('a biblioteca carrega os doze tipos, todos com componente válido e sem problemas', () => {
    const lib = loadLibrary(M3_FILES);
    expect(lib.specId).toBe('material3');
    expect(lib.problems).toEqual([]);
    expect(lib.types).toHaveLength(12);
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

  it('a tela de configurações instancia todas as 19 instâncias; só o cartão avisa (texto longo)', () => {
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
});
