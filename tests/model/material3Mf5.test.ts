// MF5 (etapa #899): o dia de hoje no `date-picker` e as variantes como campo (`avatar` do `chip`, `contentScale` do
// `image`, `color`/`insetStart`/`insetEnd` do `divider`, `trackColor`/`strokeCap` do `progress-indicator`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import type { Spec } from '../../src/model/spec';
import { diffSpecs, missingMigrations } from '../../src/model/specVersions';
import { validateLibrary } from '../../src/model/library';
import { resolveTokens } from '../../src/model/components/tokens';
import type { SceneNode } from '../../src/model/components/scene';
import { SPEC_FILE, drawIn, files, spec, typeOf } from '../support/material3Library';

const catalog = buildCatalog(files);
type Mode = 'light' | 'dark';
type Values = Record<string, unknown>;

function entryOf(id: string) {
  const entry = findEntry(catalog, id);
  if (entry === undefined || entry.component === null) throw new Error(`sem ${id}`);
  return entry;
}
const draw = (id: string, values: Values, mode: Mode = 'light') =>
  drawIn(catalog, entryOf(id), values as never, mode);
const tokens = (mode: Mode) => resolveTokens(catalog.library!.tokens, {}, mode);

function findAll(node: SceneNode, name: string, out: SceneNode[] = []): SceneNode[] {
  if (node.name === name) out.push(node);
  if ('children' in node) for (const child of node.children) findAll(child, name, out);
  return out;
}
const visibleOf = (root: SceneNode, name: string) =>
  findAll(root, name).filter((n) => n.visible);
/** A cor de um preenchimento sólido; `#rrggbbff` (alfa total) vale `#rrggbb`. */
const rgb = (color: string | undefined): string | undefined =>
  color !== undefined && /^#[0-9a-f]{8}$/i.test(color) && color.endsWith('ff')
    ? color.slice(0, 7)
    : color;
const solid = (paints: readonly { type: string; color?: string }[] | undefined) => {
  const first = paints?.[0];
  return first?.type === 'solid' ? rgb(first.color) : undefined;
};
/** Os nós `text` visíveis com o texto dado, na ordem da cena. */
function texts(node: SceneNode, content: string, out: SceneNode[] = []): SceneNode[] {
  if (node.type === 'text' && node.visible && node.text === content) out.push(node);
  if ('children' in node) for (const child of node.children) texts(child, content, out);
  return out;
}
/** `x` do centro da caixa do nó (os nós aqui não giram). */
const cx = (n: SceneNode) => n.transform[4] + n.width / 2;

describe('MF5: versão e atualização aditiva', () => {
  it('continua na versão 7, os campos novos são opcionais e a atualização da 6 é aditiva', () => {
    expect(spec.version).toBe(7);
    const added: [string, string[]][] = [
      ['date-picker', ['today']],
      ['chip', ['avatar']],
      ['divider', ['color', 'insetStart', 'insetEnd']],
      ['progress-indicator', ['trackColor', 'strokeCap']],
    ];
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 6;
    for (const [id, keys] of added) {
      for (const key of keys) {
        const field = typeOf(id).fields.find((f) => f.key === key);
        expect(field, `${id}.${key}`).toBeDefined();
        expect(field?.required ?? false, `${id}.${key} opcional`).toBe(false);
      }
      for (const layer of previous.layers)
        for (const type of layer.annotationTypes)
          if (type.id === id)
            type.fields = type.fields.filter((f) => !keys.includes(f.key));
    }
    const changes = diffSpecs(previous, spec);
    expect(changes.filter((c) => c.kind === 'breaking')).toEqual([]);
    expect(missingMigrations(previous, spec)).toEqual([]);
    expect(validateLibrary({ files, specPath: SPEC_FILE, previous }).errors).toEqual([]);
  });
});

describe('MF5: dia de hoje no date-picker (decisão 19)', () => {
  const base = { selection: 'single', displayedMonth: 'Outubro de 2025' };

  it('sem month/year, o dia de hoje leva o contorno de 1 em primary e o número em primary', () => {
    for (const mode of ['light', 'dark'] as const) {
      const d = draw('date-picker', { ...base, selectedDay: 15, today: 22 }, mode);
      const rings = visibleOf(d.root, 'contorno de hoje');
      expect(rings).toHaveLength(1);
      const stroke = rings[0]!.stroke!;
      expect(stroke.width).toBe(1);
      expect(solid(stroke.paints)).toBe(rgb(tokens(mode)['primary'] as string));
      // O contorno fica na célula do dia 22 (as colunas são de 48): a mesma do número `22`.
      const dayCell = texts(d.root, '22');
      expect(dayCell.length).toBeGreaterThan(0);
      for (const t of dayCell)
        expect(solid(t.fills), `número 22 em ${mode}`).toBe(
          rgb(tokens(mode)['primary'] as string),
        );
      // Os outros números seguem em on-surface.
      for (const t of texts(d.root, '21'))
        expect(solid(t.fills)).toBe(rgb(tokens(mode)['on-surface'] as string));
    }
  });

  it('sem o campo, nenhum dia leva o contorno e todos os números ficam em on-surface', () => {
    const d = draw('date-picker', { ...base, selectedDay: 15 });
    expect(visibleOf(d.root, 'contorno de hoje')).toHaveLength(0);
    for (const t of texts(d.root, '22'))
      expect(solid(t.fills)).toBe(rgb(tokens('light')['on-surface'] as string));
  });

  it('o dia de hoje selecionado vale a seleção: sem contorno, com o círculo em primary', () => {
    const d = draw('date-picker', { ...base, selectedDay: 15, today: 15 });
    expect(visibleOf(d.root, 'contorno de hoje')).toHaveLength(0);
    expect(visibleOf(d.root, 'marcado')).toHaveLength(1);
  });

  it('no intervalo, o dia de hoje que é ponta do intervalo vale a seleção', () => {
    const d = draw('date-picker', {
      selection: 'range',
      displayedMonth: 'Outubro de 2025',
      rangeStartDay: 9,
      rangeEndDay: 16,
      today: 9,
    });
    expect(visibleOf(d.root, 'contorno de hoje')).toHaveLength(0);
    const e = draw('date-picker', {
      selection: 'range',
      displayedMonth: 'Outubro de 2025',
      rangeStartDay: 9,
      rangeEndDay: 16,
      today: 12,
    });
    expect(visibleOf(e.root, 'contorno de hoje')).toHaveLength(1);
  });

  it('o dia de hoje dentro da faixa leva o contorno, mas o número segue a cor da faixa (dayContentColor, DatePicker.kt 936 a 950)', () => {
    const d = draw('date-picker', {
      selection: 'range',
      displayedMonth: 'Outubro de 2025',
      rangeStartDay: 9,
      rangeEndDay: 16,
      today: 12,
    });
    expect(visibleOf(d.root, 'contorno de hoje')).toHaveLength(1);
    for (const t of texts(d.root, '12'))
      expect(solid(t.fills)).toBe(rgb(tokens('light')['on-surface'] as string));
  });

  it('com month e year, o contorno acompanha a grade do mês e um today fora do mês não desenha nada', () => {
    const feb = { ...base, month: 2, year: 2026, selectedDay: 14 };
    expect(
      visibleOf(draw('date-picker', { ...feb, today: 28 }).root, 'contorno de hoje'),
    ).toHaveLength(1);
    // Fevereiro de 2026 tem 28 dias: o 30 não existe.
    const out = draw('date-picker', { ...feb, today: 30 });
    expect(visibleOf(out.root, 'contorno de hoje')).toHaveLength(0);
    expect(out.warnings).toEqual([]);
    // Fevereiro de 2028 é bissexto: o 29 existe.
    const leap = { ...base, month: 2, year: 2028, selectedDay: 3 };
    expect(
      visibleOf(draw('date-picker', { ...leap, today: 29 }).root, 'contorno de hoje'),
    ).toHaveLength(1);
    // today fora de 1 a 31 também não desenha nada.
    for (const today of [0, 32])
      expect(
        visibleOf(draw('date-picker', { ...feb, today }).root, 'contorno de hoje'),
      ).toHaveLength(0);
  });

  it('o código diz que o today não é parâmetro (o Compose usa o relógio do aparelho)', () => {
    const notes = JSON.stringify(typeOf('date-picker').code);
    expect(notes).toMatch(/today/);
    expect(notes).toMatch(/relógio/);
  });
});

describe('MF5: avatar do chip (decisão 20)', () => {
  const input = {
    label: 'ana@exemplo.com',
    style: 'input',
    trailingIcon: 'Close',
    avatar: 'https://example.com/ana.png',
  };

  it('no input, a imagem circular de 24 abre o chip e o ícone inicial sai', () => {
    const d = draw('chip', { ...input, leadingIcon: 'Home' });
    const avatars = visibleOf(d.root, 'avatar');
    expect(avatars).toHaveLength(1);
    const avatar = avatars[0]!;
    expect(avatar.width).toBe(24);
    expect(avatar.height).toBe(24);
    expect(avatar.type === 'frame' && avatar.clip).toBe(true);
    expect(avatar.type === 'frame' && avatar.cornerRadius).toBe(
      tokens('light')['corner-full'],
    );
    const image = visibleOf(avatar, 'imagem do avatar')[0]!;
    expect(image.fills.find((p) => p.type === 'image')).toMatchObject({
      url: 'https://example.com/ana.png',
    });
    // O avatar tem precedência sobre o leadingIcon (InputChip, Chip.kt 2204 a 2216).
    expect(visibleOf(d.root, 'done')).toHaveLength(0);
    const icons = d.root.children.flatMap((c) =>
      'children' in c ? findAll(c, 'home') : [],
    );
    expect(icons.filter((n) => n.visible)).toHaveLength(0);
  });

  it('sem avatar, ou fora do input, o chip fica como era', () => {
    expect(
      visibleOf(draw('chip', { ...input, avatar: undefined }).root, 'avatar'),
    ).toHaveLength(0);
    expect(
      visibleOf(draw('chip', { ...input, style: 'filter' }).root, 'avatar'),
    ).toHaveLength(0);
  });

  it('o avatar recua o rótulo e abre com 4 de folga no início (inputChipPadding, Chip.kt 2946)', () => {
    const withAvatar = draw('chip', input);
    const without = draw('chip', { ...input, avatar: undefined });
    const label = (d: ReturnType<typeof draw>) => visibleOf(d.root, 'rótulo')[0]!;
    // o avatar (24) e o vão (8) empurram o rótulo; o início sem ícone já é o de 12 (4 + 8)
    expect(cx(label(withAvatar)) - cx(label(without))).toBeGreaterThan(24);
    const avatar = visibleOf(withAvatar.root, 'avatar')[0]!;
    expect(avatar.transform[4]).toBe(12);
  });

  it('o avatar de um chip desabilitado sai a 0,38 (InputChipTokens.DisabledAvatarOpacity)', () => {
    const d = draw('chip', { ...input, enabled: 'false' });
    expect(visibleOf(d.root, 'avatar')[0]!.opacity).toBeCloseTo(0.38, 2);
  });
});

describe('MF5: contentScale do image (decisão 20)', () => {
  const fits: Record<string, string> = {
    Crop: 'cover',
    Fit: 'contain',
    FillBounds: 'fill',
    FillWidth: 'fill-width',
    FillHeight: 'fill-height',
    Inside: 'scale-down',
    None: 'none',
  };
  it.each(Object.entries(fits))('contentScale %s desenha com o fit %s', (scale, fit) => {
    const d = draw('image', { url: 'https://example.com/a.png', contentScale: scale });
    const images = d.root.children.filter(
      (n) => n.visible && n.fills.some((p) => p.type === 'image'),
    );
    expect(images).toHaveLength(1);
    expect(images[0]!.fills.find((p) => p.type === 'image')).toMatchObject({ fit });
  });
});

describe('MF5: divider com cor e recuo por ponta (decisão 20)', () => {
  const line = (values: Values, mode: Mode = 'light') =>
    visibleOf(draw('divider', values, mode).root, 'linha')[0]!;
  const ends = (values: Values) => {
    const l = line(values);
    return [l.transform[4], 360 - (l.transform[4] + l.width)];
  };

  it('a cor padrão é outline-variant e o campo color troca o papel, em light e dark', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(solid(line({}, mode).fills)).toBe(
        rgb(tokens(mode)['outline-variant'] as string),
      );
      expect(solid(line({ color: 'primary' }, mode).fills)).toBe(
        rgb(tokens(mode)['primary'] as string),
      );
      expect(solid(line({ color: 'surfaceContainerHighest' }, mode).fills)).toBe(
        rgb(tokens(mode)['surface-container-highest'] as string),
      );
    }
  });

  it('insetStart e insetEnd recuam cada ponta; o inset vale nas duas quando os dois estão vazios', () => {
    expect(ends({})).toEqual([0, 0]);
    expect(ends({ inset: 16 })).toEqual([16, 16]);
    expect(ends({ insetStart: 16 })).toEqual([16, 0]);
    expect(ends({ insetEnd: 24 })).toEqual([0, 24]);
    expect(ends({ insetStart: 8, insetEnd: 24 })).toEqual([8, 24]);
    // com um dos dois preenchidos o `inset` não vale na ponta vazia
    expect(ends({ inset: 16, insetStart: 4 })).toEqual([4, 0]);
    // 0 preenchido não é vazio: vale o recuo por ponta
    expect(ends({ inset: 16, insetStart: 0, insetEnd: 0 })).toEqual([0, 0]);
  });

  it('no vertical os recuos valem no alto (início) e embaixo (fim)', () => {
    const l = line({ orientation: 'vertical', insetStart: 10, insetEnd: 20 });
    expect(l.transform[5]).toBe(10);
  });
});

describe('MF5: progress-indicator com trilho e ponta (decisão 20)', () => {
  const lin = (values: Values, mode: Mode = 'light') =>
    draw('progress-indicator', { shape: 'linear', progress: 0.3, ...values }, mode);

  it('o trilho padrão é secondary-container e o trackColor troca o papel', () => {
    for (const mode of ['light', 'dark'] as const) {
      const std = visibleOf(lin({}, mode).root, 'faixa')[0]!;
      expect(solid(std.fills)).toBe(rgb(tokens(mode)['secondary-container'] as string));
      const alt = visibleOf(
        lin({ trackColor: 'errorContainer' }, mode).root,
        'faixa',
      )[0]!;
      expect(solid(alt.fills)).toBe(rgb(tokens(mode)['error-container'] as string));
    }
  });

  it('o trackColor também pinta o trilho circular, determinado e indeterminado', () => {
    const det = draw('progress-indicator', {
      shape: 'circular',
      progress: 0.6,
      trackColor: 'tertiaryContainer',
    });
    const arc = visibleOf(det.root, 'trilho arco')[0]!;
    expect(solid(arc.stroke!.paints)).toBe(
      rgb(tokens('light')['tertiary-container'] as string),
    );
    const ind = draw('progress-indicator', {
      shape: 'circular',
      trackColor: 'tertiaryContainer',
    });
    expect(visibleOf(ind.root, 'trilho completo')).toHaveLength(1);
    // sem trackColor, o indeterminado não leva trilho (circularIndeterminateTrackColor é transparente)
    expect(
      visibleOf(
        draw('progress-indicator', { shape: 'circular' }).root,
        'trilho completo',
      ),
    ).toHaveLength(0);
  });

  it('strokeCap: Round (padrão) arredonda, Butt e Square cortam reto, no linear e no circular', () => {
    const radius = (n: SceneNode) => (n.type === 'rect' ? n.cornerRadius : -1);
    const full = tokens('light')['corner-full'];
    expect(radius(visibleOf(lin({}).root, 'barra')[0]!)).toBe(full);
    expect(radius(visibleOf(lin({ strokeCap: 'Round' }).root, 'barra')[0]!)).toBe(full);
    expect(radius(visibleOf(lin({ strokeCap: 'Butt' }).root, 'barra')[0]!)).toBe(0);
    expect(radius(visibleOf(lin({ strokeCap: 'Square' }).root, 'barra')[0]!)).toBe(0);
    const cap = (values: Values) =>
      visibleOf(
        draw('progress-indicator', { shape: 'circular', progress: 0.6, ...values }).root,
        'indicador',
      )[0]!.stroke!.cap;
    expect(cap({})).toBe('round');
    expect(cap({ strokeCap: 'Butt' })).toBe('butt');
    expect(cap({ strokeCap: 'Square' })).toBe('square');
  });

  it('o vão entre o indicador e o trilho linear é sempre 4 (o Compose soma a espessura só fora do Butt)', () => {
    const absX = (root: SceneNode, target: SceneNode, acc = 0): number | undefined => {
      const here = acc + root.transform[4];
      if (root === target) return here;
      if ('children' in root)
        for (const child of root.children) {
          const found = absX(child, target, here);
          if (found !== undefined) return found;
        }
      return undefined;
    };
    const gap = (strokeCap?: string) => {
      const d = lin({ strokeCap });
      const bar = visibleOf(d.root, 'barra')[0]!;
      const track = visibleOf(d.root, 'faixa')[0]!;
      return absX(d.root, track)! - (absX(d.root, bar)! + bar.width);
    };
    for (const cap of [undefined, 'Round', 'Butt', 'Square']) expect(gap(cap)).toBe(4);
  });
});

describe('MF5: o code leva o parâmetro quando o campo está preenchido (decisão 20)', () => {
  const params = (id: string) =>
    (typeOf(id).code as { compose?: { params?: Record<string, string> } }).compose
      ?.params ?? {};
  it('divider.color, progress.trackColor e strokeCap viram parâmetros', () => {
    expect(params('divider')['color']).toBe('color');
    expect(params('progress-indicator')['trackColor']).toBe('trackColor');
    expect(params('progress-indicator')['strokeCap']).toBe('strokeCap');
  });
  it('o strokeCap e o color têm tradução dos valores para o Compose', () => {
    const values = (id: string) =>
      (
        typeOf(id).code as {
          compose?: { values?: Record<string, Record<string, string>> };
        }
      ).compose?.values ?? {};
    expect(values('progress-indicator')['strokeCap']).toEqual({
      Round: 'StrokeCap.Round',
      Butt: 'StrokeCap.Butt',
      Square: 'StrokeCap.Square',
    });
    expect(values('divider')['color']?.['primary']).toBe(
      'MaterialTheme.colorScheme.primary',
    );
    expect(values('progress-indicator')['trackColor']?.['errorContainer']).toBe(
      'MaterialTheme.colorScheme.errorContainer',
    );
  });
  it('o avatar e o recuo por ponta aparecem nas notas do code', () => {
    expect(JSON.stringify(typeOf('chip').code)).toMatch(/avatar = \{/);
    expect(JSON.stringify(typeOf('divider').code)).toMatch(/insetStart/);
  });
});

describe('MF5: exemplos novos (decisão 22)', () => {
  const NEW: [string, string][] = [
    ['date-picker', 'Dia de hoje'],
    ['chip', 'Com avatar'],
    ['divider', 'Recuo por ponta'],
    ['progress-indicator', 'Trilho colorido e ponta reta'],
    ['text', 'Parágrafo justificado'],
    ['surface', 'Primário'],
  ];
  it.each(NEW)(
    '%s: o exemplo "%s" existe e desenha sem aviso em light e dark',
    (id, name) => {
      const entry = entryOf(id);
      const example = entry.examples.find((e) => e.name === name);
      expect(example, `${id}: ${name}`).toBeDefined();
      for (const mode of ['light', 'dark'] as const)
        expect(drawIn(catalog, entry, example!.values as never, mode).warnings).toEqual(
          [],
        );
    },
  );
  it('os exemplos usam os campos novos', () => {
    const values = (id: string, name: string) =>
      entryOf(id).examples.find((e) => e.name === name)?.values ?? {};
    expect(values('date-picker', 'Dia de hoje')).toHaveProperty('today');
    expect(values('chip', 'Com avatar')).toHaveProperty('avatar');
    expect(values('divider', 'Recuo por ponta')).toHaveProperty('insetStart');
    expect(values('divider', 'Recuo por ponta')).toHaveProperty('insetEnd');
    expect(values('progress-indicator', 'Trilho colorido e ponta reta')).toHaveProperty(
      'trackColor',
    );
    expect(values('progress-indicator', 'Trilho colorido e ponta reta')).toHaveProperty(
      'strokeCap',
    );
  });
});
