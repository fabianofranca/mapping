// Formato 4, fase CF7: o conjunto de ícones da biblioteca (`mapping-icons`) e o nó `icon`.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import { parseIconsFile } from '../../../src/model/components/icons';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import type { PathNode, SceneNode } from '../../../src/model/components/scene';
import { walk } from '../../../src/model/components/scene';
import { parseSpecText } from '../../../src/model/spec';
import { modelMessage } from '../../../src/model/modelMessage';
import { locale } from '../../../src/store/settings';
import { messageText } from '../../../src/ui/modelMessage';

const V4 = 'só é permitido com formatVersion 4';

const FILE = {
  format: 'mapping-icons',
  formatVersion: 1,
  viewBox: [24, 24],
  icons: {
    check: {
      paths: [{ d: 'M5 12l5 5L20 7', stroke: true, width: 2, cap: 'round' }],
    },
  },
};

function setOf(json: unknown): IconSet {
  const result = parseIconsFile(json);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.set;
}

describe('parseIconsFile', () => {
  it('aceita o conjunto com viewBox, caminhos, traço e ponta', () => {
    const result = parseIconsFile(FILE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.viewBox).toEqual([24, 24]);
      expect(result.set.icons.check?.paths[0]).toMatchObject({
        d: 'M5 12l5 5L20 7',
        stroke: true,
        width: 2,
        cap: 'round',
      });
    }
  });

  it('recusa o nome "Check" pelo padrão, com o caminho', () => {
    const result = parseIconsFile({ ...FILE, icons: { Check: FILE.icons.check } });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain('icons.Check: nome inválido');
  });

  it('recusa paths vazio', () => {
    const result = parseIconsFile({ ...FILE, icons: { check: { paths: [] } } });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain('icons.check.paths: esperava');
  });

  it('recusa formatVersion 3 com mensagem de versão (1 e 2 valem)', () => {
    const result = parseIconsFile({ ...FILE, formatVersion: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join('\n')).toContain('formatVersion: deve ser 1 ou 2');
    expect(parseIconsFile({ ...FILE, formatVersion: 1 }).ok).toBe(true);
    expect(parseIconsFile({ ...FILE, formatVersion: 2 }).ok).toBe(true);
  });

  it('a mensagem de formatVersion inválido sai inteira em cada idioma (sem "ou" em inglês)', () => {
    const result = parseIconsFile({ ...FILE, formatVersion: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((i) => i.path === 'formatVersion');
    expect(issue?.code).toBe('iconsFile.formatVersionInvalid');
    const message = modelMessage(
      'iconsFile.formatVersionInvalid',
      issue?.params ?? {},
      issue?.message ?? '',
    );
    try {
      locale.value = 'pt-BR';
      expect(messageText(message)).toBe('deve ser 1 ou 2');
      locale.value = 'en-US';
      expect(messageText(message)).toBe('must be 1 or 2');
    } finally {
      locale.value = 'pt-BR';
    }
  });

  it('mapping-icons 2 aceita mirror por ícone (booleano); a 1 continua aceita sem ele', () => {
    const icons = { back: { mirror: true, paths: FILE.icons.check.paths } };
    const ok = parseIconsFile({ ...FILE, formatVersion: 2, icons });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.set.icons.back?.mirror).toBe(true);
    const bad = parseIconsFile({
      ...FILE,
      formatVersion: 2,
      icons: { back: { mirror: 'sim', paths: FILE.icons.check.paths } },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.errors.join('\n')).toContain(
        'icons.back.mirror: esperava true ou false',
      );
  });

  it('mirror na formatVersion 1 é só é permitido com formatVersion 2', () => {
    const result = parseIconsFile({
      ...FILE,
      icons: { back: { mirror: true, paths: FILE.icons.check.paths } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContain(
        'icons.back.mirror: só é permitido com formatVersion 2',
      );
  });

  it('recusa chave desconhecida, cap/join inválidos e sem viewBox no conjunto', () => {
    const bad = parseIconsFile({
      format: 'mapping-icons',
      formatVersion: 1,
      icons: { x: { paths: [{ d: 'M0 0', cap: 'pontudo', extra: 1 }] } },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      const text = bad.errors.join('\n');
      expect(text).toContain('viewBox: campo obrigatório');
      expect(text).toContain('icons.x.paths[0].cap');
      expect(text).toContain('icons.x.paths[0].extra: chave desconhecida');
    }
  });
});

function component(template: unknown, version = 4): ComponentFile {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 48, height: 48 },
    template,
  } as unknown as ComponentFile;
}

const box = { x: 0, y: 0, width: 48, height: 48 };

function iconRoot(
  node: Record<string, unknown>,
  values: Record<string, string> = {},
  icons: IconSet = setOf(FILE),
) {
  const c = component({ type: 'frame', children: [{ type: 'icon', ...node }] });
  return instantiate(c, values, box, { measure: approximateMeasurer, icons });
}

const paths = (root: SceneNode): PathNode[] =>
  [...walk(root)].filter((n): n is PathNode => n.type === 'path');

describe('nó icon: validação', () => {
  it('aceita name literal e em expressão, color e strokeWidth', () => {
    const issues = validateComponent(
      component({
        type: 'frame',
        children: [
          { type: 'icon', name: 'check', color: '#0a7', strokeWidth: 3 },
          {
            type: 'icon',
            name: { $field: 'icone' },
            color: { $token: 'x' },
            width: 'hug',
            height: 'hug',
          },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it('exige name e recusa chave desconhecida', () => {
    const issues = validateComponent(
      component({ type: 'frame', children: [{ type: 'icon', d: 'M0 0' }] }),
    );
    expect(issues).toContain('template.children[0].name: campo obrigatório');
    expect(issues).toContain('template.children[0].d: chave desconhecida: d');
  });

  it('na v3 falha com só é permitido com formatVersion 4, no caminho do nó', () => {
    const issues = validateComponent(
      component({ type: 'frame', children: [{ type: 'icon', name: 'check' }] }, 3),
    );
    expect(issues).toContain(`template.children[0].type: ${V4}`);
  });
});

describe('nó icon: cena', () => {
  it('produz o caminho com a cor do nó e a ponta do ícone', () => {
    const { root, warnings } = iconRoot({ name: 'check', color: '#0a7' });
    expect(warnings).toEqual([]);
    const [path] = paths(root);
    expect(path?.d).toBe('M5 12l5 5L20 7');
    expect(path?.stroke?.paints).toEqual([{ type: 'solid', color: '#0a7' }]);
    expect(path?.stroke?.cap).toBe('round');
    expect(path?.stroke?.width).toBe(2);
    expect(path?.fills).toEqual([]);
  });

  it('hug dá o viewBox do conjunto, e o viewBox do ícone vence o padrão', () => {
    const icons = setOf({
      ...FILE,
      icons: { ...FILE.icons, dot: { viewBox: [10, 12], paths: [{ d: 'M0 0h10v12z' }] } },
    });
    const measure = (name: string) =>
      measureComponent(
        component({
          type: 'frame',
          layout: { type: 'row' },
          children: [{ type: 'icon', name, width: 'hug', height: 'hug' }],
        }),
        {},
        { width: null, height: null },
        { measure: approximateMeasurer, icons },
      );
    expect(measure('check')).toMatchObject({ width: 24, height: 24 });
    expect(measure('dot')).toMatchObject({ width: 10, height: 12 });
  });

  it('color pinta só o que não tem cor própria; fill/stroke true usam a cor do nó', () => {
    const icons = setOf({
      ...FILE,
      icons: {
        mix: {
          paths: [
            { d: 'M0 0', fill: '#ff0000' },
            { d: 'M1 1', fill: true },
            { d: 'M2 2' },
            { d: 'M3 3', stroke: '#00ff00', width: 1.5 },
            { d: 'M4 4', stroke: true },
          ],
        },
      },
    });
    const { root } = iconRoot({ name: 'mix', color: '#112233' }, {}, icons);
    const [own, filled, plain, strokeOwn, strokeNode] = paths(root);
    expect(own?.fills).toEqual([{ type: 'solid', color: '#ff0000' }]);
    expect(filled?.fills).toEqual([{ type: 'solid', color: '#112233' }]);
    expect(plain?.fills).toEqual([{ type: 'solid', color: '#112233' }]);
    expect(strokeOwn?.stroke?.paints).toEqual([{ type: 'solid', color: '#00ff00' }]);
    expect(strokeOwn?.fills).toEqual([]);
    expect(strokeNode?.stroke?.paints).toEqual([{ type: 'solid', color: '#112233' }]);
  });

  it('strokeWidth troca a largura do traço', () => {
    const { root } = iconRoot({ name: 'check', strokeWidth: 3.5 });
    expect(paths(root)[0]?.stroke?.width).toBe(3.5);
  });

  it('escala os caminhos do viewBox para a caixa do nó', () => {
    const { root } = iconRoot({ name: 'check', width: 48, height: 48 });
    const icon = [...walk(root)].find((n) => n.type === 'group');
    expect(icon?.width).toBe(48);
    expect(paths(root)[0]?.transform.slice(0, 4)).toEqual([2, 0, 0, 2]);
  });

  it('nome desconhecido em tempo de desenho vira reservado com o aviso', () => {
    const { root, warnings } = iconRoot(
      { name: { $field: 'icone' } },
      { icone: 'nuvem' },
    );
    expect(warnings).toContain('ícone desconhecido: nuvem');
    expect(paths(root)).toEqual([]);
    const unknown = [...walk(root)].find((n) => n.type === 'unknown');
    expect(unknown).toMatchObject({ sourceType: 'icon' });
  });

  it('sem conjunto declarado o ícone também é desconhecido', () => {
    const c = component({ type: 'frame', children: [{ type: 'icon', name: 'check' }] });
    const { warnings } = instantiate(c, {}, box, { measure: approximateMeasurer });
    expect(warnings).toContain('ícone desconhecido: check');
  });
});

describe('icons na especialização', () => {
  const spec = (formatVersion: number) =>
    JSON.stringify({
      format: 'mapping-spec',
      formatVersion,
      id: 's',
      name: 'S',
      version: 1,
      icons: 'icons/set.json',
      layers: [],
    });

  it('numa especialização v13 falha com a mensagem de versão', () => {
    const result = parseSpecText(spec(13));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues).toContainEqual({
        path: 'icons',
        message: 'só é permitido com formatVersion 15',
        code: 'spec.onlyFormat',
        params: { version: '15' },
      });
  });

  it('na v15 aceita o caminho de um .json do pacote e recusa outro', () => {
    expect(parseSpecText(spec(15)).ok).toBe(true);
    const bad = parseSpecText(spec(15).replace('icons/set.json', '../set.json'));
    expect(bad.ok).toBe(false);
  });
});
