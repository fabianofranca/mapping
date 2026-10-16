// Laboratório: um SVG copiado do Figma vira um arquivo de componente válido, com os textos como campos.
import { describe, expect, it } from 'vitest';
import { parseComponent } from '../../../lab/components/parseComponent';
import { instantiate, approximateMeasurer } from '../../../lab/components/instantiate';
import { SAMPLE_SVG } from '../../../lab/figma/samples';
import { fieldKey, sceneToComponent } from '../../../lab/figma/sceneToComponent';
import { svgToScene } from '../../../lab/figma/svgToScene';
import { walk } from '../../../lab/scene/scene';

describe('sceneToComponent', () => {
  it('gera chaves de campo estáveis e únicas a partir dos nomes', () => {
    const taken = new Set<string>();
    expect(fieldKey('Button/label', taken)).toBe('button_label');
    expect(fieldKey('Button/label', taken)).toBe('button_label_2');
    expect(fieldKey('Título', taken)).toBe('titulo');
    expect(fieldKey('', taken)).toBe('text');
    expect(fieldKey('1º', taken)).toBe('text_1');
  });

  it('o exemplo SVG vira um componente válido com um campo por texto', () => {
    const scene = svgToScene(SAMPLE_SVG);
    const { component, fields, warnings } = sceneToComponent(
      scene,
      'card-figma',
      'Cartão',
    );
    expect(() => parseComponent(component)).not.toThrow();
    expect(component.size).toEqual({ width: 360, height: 220 });
    expect(fields.map((f) => f.key)).toEqual([
      'title',
      'subtitle',
      'button_label',
      'pill_label',
    ]);
    expect(component.preview).toMatchObject({
      title: 'Maria Souza',
      button_label: 'Seguir',
    });
    expect(warnings).toEqual([]);

    // Instanciado numa caixa, mantém os textos de exemplo e aceita a troca pelo campo.
    const box = { x: 0, y: 0, width: 360, height: 220 };
    const made = instantiate(component, { title: 'Ana Lima' }, box, {
      measure: approximateMeasurer,
    });
    const texts = [...walk(made.root)]
      .filter((n) => n.type === 'text')
      .map((n) => (n.type === 'text' ? n.text : ''));
    expect(texts).toContain('Ana Lima');
    expect(texts).toContain('Seguir');
  });
});
