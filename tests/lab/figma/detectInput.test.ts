// Laboratório Figma: o que foi colado é SVG, JSON, a cópia nativa do Figma ou nada reconhecível.
import { describe, expect, it } from 'vitest';
import { classifyText, detectInput, toScene } from '../../../lab/figma/detectInput';
import { SAMPLE_JSON, SAMPLE_SVG } from '../../../lab/figma/samples';

describe('detectInput', () => {
  it('reconhece SVG (com ou sem prólogo XML) e JSON pelo texto', () => {
    expect(classifyText('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe('svg');
    expect(classifyText('<?xml version="1.0"?>\n<svg></svg>')).toBe('svg');
    expect(classifyText('  {"nodes": {}}')).toBe('json');
    expect(classifyText('[{"type":"FRAME"}]')).toBe('json');
    expect(classifyText('Maria Souza')).toBe('unknown');
  });

  it('reconhece a cópia nativa do Figma pelo HTML, quando o texto não ajuda', () => {
    const html =
      '<meta charset="utf-8"><span data-metadata="<!--(figmeta)eyJmaWxlS2V5Ijoi…(/figmeta)-->"></span>' +
      '<span data-buffer="<!--(figma)ZmlnLWtpd2k…(/figma)-->"></span><span>Seguir</span>';
    expect(detectInput({ text: 'Seguir', html })).toEqual({
      kind: 'figma-native',
      payload: '',
    });
    expect(toScene.bind(null, 'figma-native', '')).toThrow(/Copy as SVG/);
  });

  it('o texto vence o HTML: um SVG colado com HTML em volta continua SVG', () => {
    const detected = detectInput({ text: SAMPLE_SVG, html: '<pre>…</pre>' });
    expect(detected.kind).toBe('svg');
    expect(detected.payload).toBe(SAMPLE_SVG.trim());
  });

  it('converte os dois exemplos embutidos sem erro e com a mesma caixa', () => {
    const svg = toScene('svg', SAMPLE_SVG);
    const json = toScene('json', SAMPLE_JSON);
    expect(svg.source).toBe('svg');
    expect(json.source).toBe('figma-json');
    expect([svg.root.width, svg.root.height]).toEqual([360, 220]);
    expect([json.root.width, json.root.height]).toEqual([328, 188]);
  });

  it('explica JSON inválido e conteúdo desconhecido', () => {
    expect(() => toScene('json', '{oops')).toThrow(/JSON inválido/);
    expect(() => toScene('unknown', 'x')).toThrow(/cole um SVG ou um JSON/);
  });
});
