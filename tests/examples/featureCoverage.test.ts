import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BASE_KEYS,
  CONDITION_OPS,
  EXPR_OPS,
  EXTRA_KEYS,
  NODE_TYPES,
  REPEAT_BASE_KEYS,
  ROOT_KEYS,
  classify,
  componentFeatureList,
  componentFeaturesUsed,
  listJsonFiles,
  readJson,
  specFeatureList,
  specFeaturesUsed,
} from './featureCoverage';

/**
 * Guarda dos exemplos: todo recurso dos formatos de especialização (derivado do `specSchema`)
 * e de componente (lista explícita) tem pelo menos um exemplo nas bibliotecas e exemplos
 * distribuídos. Só contam estas raízes (descobertas pelas pastas, para um pacote novo contar
 * sozinho): `libraries/*`, `examples/libraries/*` e `examples/specs/*.json`. Não entram
 * `tests/fixtures/`, `viewer/`, `examples/exemplo-completo/` (cópias) nem zips.
 */

const ROOT = join(__dirname, '..', '..');

/**
 * Recursos que nenhum exemplo precisa cobrir, com o motivo. Só entram chaves legadas aceitas
 * por compatibilidade ou sem sentido num exemplo; nunca um recurso atual só para passar.
 */
const EXCEPTIONS: Record<string, string> = {
  'spec:layers[].annotationTypes[].fields[].type=codeRef':
    'tipo removido na etapa 9 (schema v9); o parser o aceita só para ignorá-lo e avisar',
  'spec:layers[].annotationTypes[].fields[].platforms':
    'chave do tipo removido codeRef; nos outros tipos é recusada',
  'spec:layers[].annotationTypes[].fields[].columns[].type=codeRef':
    'tipo removido na etapa 9; o parser o aceita só para ignorá-lo e avisar',
  'spec:layers[].annotationTypes[].fields[].columns[].type=table':
    'o schema declara a coluna com a forma do campo, mas uma coluna de coluna não existe',
  'spec:fonts[].style':
    'exemplo exige um arquivo de fonte no pacote (sem ele o validador avisa); decisão do dono (2026-11-01): a fonte é fixa no cliente mobile, não no SDUI',
  'spec:fonts[].style=italic':
    'idem fonts[].style: sem arquivo de fonte em nenhuma biblioteca de exemplo',
  'spec:fonts[].style=normal':
    'idem fonts[].style: sem arquivo de fonte em nenhuma biblioteca de exemplo',
};

/**
 * Raízes que serão removidas na limpeza de exemplos (pastas ou arquivos, a partir da raiz do
 * repositório).
 */
const LEAVING: string[] = [];

/**
 * O que só as raízes de LEAVING cobrem hoje: precisa ganhar exemplo noutro lugar antes da
 * remoção. Cada item sai daqui quando ganhar exemplo fora de LEAVING; com LEAVING vazio, esta
 * lista é vazia.
 */
const PENDING_AFTER_REMOVAL: string[] = [];

/** Recursos sem exemplo hoje; ganham exemplo nesta etapa. */
/*
 * `notices` (formatVersion 10, etapa #486): o guia e os exemplos não ganham avisos nesta etapa
 * (decisão 'Fora' da #486); o recurso é coberto por tests/model/specV10.test.ts e pelo roteiro R18.
 */
const MISSING_TODAY: string[] = [
  // Layout do componente v4 (etapa #747, CF2): as bibliotecas distribuídas não migram para o
  // formato 4 nesta etapa (decisão 'Fora' da #747); coberto por
  // tests/model/components/layoutFidelity.test.ts, layoutV4Parse.test.ts e pelo roteiro R25.
  // `font.family` literal: o último componente da Material 3 que o usava migrou (etapa #833, M5) e
  // herda a Roboto do token `font-sans`; coberto por tests/model/components/ e pelo roteiro R25.
  'component:font.family',
  // `font.verticalAlign: "middle"`: a Material 3 passou os rótulos e os números a `cap-middle` (etapa #896,
  // FX6, decisão 23); o `middle` segue coberto por tests/e2e/textMetrics.spec.ts e pelo roteiro R25.
  'component:font.verticalAlign=middle',
  // Texto do componente v4 (etapa #747, CF3): a biblioteca Material 3 já usa o `font.maxLines` no
  // `text` (etapa #833, M1); o resto das bibliotecas distribuídas não migrou. Coberto por
  // tests/model/components/textWrap.test.ts, tests/e2e/textMetrics.spec.ts e pelo roteiro R25.
  // Texto rico do componente v4 (etapa #747, CF4): as bibliotecas distribuídas não migram; coberto
  // por tests/model/components/richText.test.ts, tests/e2e/ e pelo roteiro R25.
  'component:node.text.runs',
  // Quebra de fileira (etapa #898, MC4): o `repeat` com `wrap` não é adotado por nenhuma biblioteca
  // distribuída (a Material 3 usa o `layout.wrap` no flow-row na MC6); coberto por
  // tests/model/components/wrapLayout.test.ts e pelo roteiro R25.
  'component:node.repeat.wrap',
  'component:node.repeat.lineGap',
  'component:node.repeat.maxPerLine',
  'component:node.repeat.maxLines',
  'component:run.text',
  'component:run.weight',
  'component:run.italic',
  'component:run.color',
  'component:run.decoration',
  'component:run.family',
  'component:run.size',
  'component:run.background',
  'component:run.radius',
  'component:run.padding',
  // Tokens (formatVersion 15, etapa #747, CF5): a raiz `tokens` já tem exemplo na biblioteca Material 3
  // (etapa #833, M1); o `$token` nos componentes das outras bibliotecas ainda não. Coberto por
  // tests/model/specTokens.test.ts, tests/model/components/tokens.test.ts, libraryTokens.test.ts e
  // pelo roteiro R25.
  'component:expr.$token',
  // Ícones (formatVersion 15, etapa #747, CF7): a raiz `icons` e o nó `icon` já têm exemplo na
  // biblioteca Material 3 (etapa #833, M1); o `icon.name`/`strokeWidth` ainda não. Coberto por
  // tests/model/components/icons.test.ts, libraryIcons.test.ts, tests/mcp/libraryIcons.test.ts e
  // pelo roteiro R25.
  'component:node.icon.name',
  'component:node.icon.strokeWidth',
  // Tela e traço em escala (CF8, etapa #747): `screen` na raiz e `stroke.scale` (formato 4) e
  // `structural` no tipo (formatVersion 15); as bibliotecas distribuídas não migram; coberto por
  // tests/model/components/ e pelo roteiro R25.
  'component:root.screen',
  'component:stroke.scale',
  'spec:layers[].annotationTypes[].structural',
  // `accepts.annotations` (formatVersion 14, etapa #679): os exemplos não ganham o recurso nesta
  // etapa (o roteiro usa uma especialização inline); coberto por tests/model/specAcceptsAnnotations.
  'spec:layers[].annotationTypes[].fields[].accepts.annotations',
  'spec:layers[].annotationTypes[].fields[].columns[].accepts.annotations',
  'spec:layers[].annotationTypes[].notices',
  'spec:layers[].annotationTypes[].notices[].kind',
  'spec:layers[].annotationTypes[].notices[].kind=deprecated',
  'spec:layers[].annotationTypes[].notices[].kind=diverges',
  'spec:layers[].annotationTypes[].notices[].kind=pending',
  'spec:layers[].annotationTypes[].notices[].kind=removed',
  'spec:layers[].annotationTypes[].notices[].message',
  'spec:layers[].annotationTypes[].notices[].ref',
  'spec:layers[].annotationTypes[].notices[].since',
  'spec:layers[].annotationTypes[].fields[].notices',
  'spec:layers[].annotationTypes[].fields[].notices[].kind',
  'spec:layers[].annotationTypes[].fields[].notices[].kind=deprecated',
  'spec:layers[].annotationTypes[].fields[].notices[].kind=diverges',
  'spec:layers[].annotationTypes[].fields[].notices[].kind=pending',
  'spec:layers[].annotationTypes[].fields[].notices[].kind=removed',
  'spec:layers[].annotationTypes[].fields[].notices[].message',
  'spec:layers[].annotationTypes[].fields[].notices[].ref',
  'spec:layers[].annotationTypes[].fields[].notices[].since',
  'spec:layers[].annotationTypes[].fields[].columns[].notices',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=deprecated',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=diverges',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=pending',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].kind=removed',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].message',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].ref',
  'spec:layers[].annotationTypes[].fields[].columns[].notices[].since',
];

// ---------------------------------------------------------------------------------------

interface ExampleFile {
  /** Caminho a partir da raiz do repositório. */
  rel: string;
  kind: 'spec' | 'component';
  features: Set<string>;
}

function subdirs(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .sort()
    .filter((name) => statSync(join(abs, name)).isDirectory())
    .map((name) => `${dir}/${name}`);
}

/** As raízes de exemplo, descobertas pelas pastas: pacotes e arquivos únicos. */
function discoverRoots(): string[] {
  const roots = [...subdirs('libraries'), ...subdirs('examples/libraries')];
  const specsDir = join(ROOT, 'examples/specs');
  if (existsSync(specsDir)) {
    for (const name of readdirSync(specsDir).sort()) {
      if (name.endsWith('.json')) roots.push(`examples/specs/${name}`);
    }
  }
  return roots;
}

function loadRoot(root: string): ExampleFile[] {
  const abs = join(ROOT, root);
  const files = statSync(abs).isDirectory() ? listJsonFiles(abs) : [abs];
  const out: ExampleFile[] = [];
  for (const file of files) {
    const data = readJson(file);
    const kind = classify(data);
    if (kind === 'other') continue;
    const rel = file
      .slice(ROOT.length + 1)
      .split('\\')
      .join('/');
    out.push({
      rel,
      kind,
      features: kind === 'spec' ? specFeaturesUsed(data) : componentFeaturesUsed(data),
    });
  }
  return out;
}

const roots = discoverRoots();
const byRoot = new Map(roots.map((root) => [root, loadRoot(root)]));

const SPEC_FEATURES = specFeatureList().map((f) => `spec:${f}`);
const COMPONENT_FEATURES = componentFeatureList().map((f) => `component:${f}`);
const ALL_FEATURES = [...SPEC_FEATURES, ...COMPONENT_FEATURES];

/** Recursos (com o prefixo do formato) usados pelos arquivos das raízes dadas. */
function coveredBy(selected: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const root of selected) {
    for (const file of byRoot.get(root) ?? []) {
      const prefix = file.kind === 'spec' ? 'spec:' : 'component:';
      for (const feature of file.features) out.add(`${prefix}${feature}`);
    }
  }
  return out;
}

const isLeaving = (root: string): boolean =>
  LEAVING.some((l) => root === l || root.startsWith(`${l}/`));
const leavingRoots = roots.filter(isLeaving);
const remainingRoots = roots.filter((root) => !isLeaving(root));

const covered = coveredBy(roots);
const withoutExceptions = ALL_FEATURES.filter((f) => !(f in EXCEPTIONS));

describe('cobertura de recursos pelos exemplos', () => {
  it('descobre as raízes de exemplo pelas pastas', () => {
    expect(roots).toContain('libraries/kotlin');
    expect(roots).toContain('examples/specs/sdui.json');
    expect(roots.some((r) => r.startsWith('examples/libraries/'))).toBe(true);
    for (const root of LEAVING)
      expect(roots, `LEAVING: ${root} não existe`).toContain(root);
    expect(SPEC_FEATURES.length).toBeGreaterThan(100);
    expect(COMPONENT_FEATURES.length).toBeGreaterThan(80);
  });

  it('as exceções são recursos que existem', () => {
    for (const feature of Object.keys(EXCEPTIONS)) {
      expect(ALL_FEATURES, `exceção desconhecida: ${feature}`).toContain(feature);
      expect(EXCEPTIONS[feature]?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('todo recurso tem pelo menos um exemplo (fora as exceções e os gaps declarados)', () => {
    const missing = withoutExceptions.filter((f) => !covered.has(f)).sort();
    expect(
      missing,
      `recursos sem exemplo em nenhuma raiz:\n${missing.join('\n')}`,
    ).toEqual([...MISSING_TODAY].sort());
  });

  it('o que sai com LEAVING deixa descoberto exatamente PENDING_AFTER_REMOVAL', () => {
    const inLeaving = coveredBy(leavingRoots);
    const inRemaining = coveredBy(remainingRoots);
    const onlyLeaving = withoutExceptions
      .filter((f) => inLeaving.has(f) && !inRemaining.has(f))
      .sort();
    expect(
      onlyLeaving,
      `recursos que só as raízes de LEAVING cobrem:\n${onlyLeaving.join('\n')}`,
    ).toEqual([...PENDING_AFTER_REMOVAL].sort());
  });

  it('MISSING_TODAY não repete recursos cobertos nem exceções', () => {
    for (const feature of MISSING_TODAY) {
      expect(ALL_FEATURES, `desconhecido: ${feature}`).toContain(feature);
      expect(covered.has(feature), `${feature} já tem exemplo`).toBe(false);
      expect(feature in EXCEPTIONS).toBe(false);
    }
  });
});

describe('a lista de recursos do componente não esqueceu nada do código', () => {
  const source = readFileSync(
    join(ROOT, 'src/model/components/parseComponent.ts'),
    'utf8',
  );

  /** Itens de `const NAME = [ 'a', 'b' ]` ou de `NAME: … = [ … ]` no código. */
  function constList(name: string): string[] {
    const match = new RegExp(`const ${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source);
    if (!match) throw new Error(`const ${name} não encontrada em parseComponent.ts`);
    return [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
  }

  it('tipos de nó, operadores e chaves da raiz', () => {
    expect([...NODE_TYPES].sort()).toEqual(constList('NODE_TYPES').sort());
    expect([...EXPR_OPS].sort()).toEqual(constList('EXPR_OPS').sort());
    expect([...CONDITION_OPS].sort()).toEqual(constList('CONDITION_OPS').sort());
    expect([...ROOT_KEYS].sort()).toEqual(constList('ROOT_KEYS').sort());
  });

  it('chaves comuns dos nós (com `type`) e do repeat', () => {
    expect(['type', ...BASE_KEYS].sort()).toEqual(constList('BASE_KEYS').sort());
    const rejected = constList('REPEAT_REJECTED_KEYS');
    expect([...REPEAT_BASE_KEYS].sort()).toEqual(
      BASE_KEYS.filter((k) => !rejected.includes(k)).sort(),
    );
  });

  it('chaves próprias de cada tipo de nó', () => {
    const block = /const extra: Record<string, readonly string\[\]> = \{([^}]*)\}/.exec(
      source,
    );
    if (!block) throw new Error('mapa `extra` não encontrado em parseComponent.ts');
    const fromCode: Record<string, string[]> = {};
    for (const m of (block[1] ?? '').matchAll(/(\w+):\s*\[([^\]]*)\]/g))
      fromCode[m[1] ?? ''] = [...(m[2] ?? '').matchAll(/'([^']+)'/g)].map(
        (x) => x[1] ?? '',
      );
    for (const type of NODE_TYPES) {
      expect([...EXTRA_KEYS[type]].sort(), `chaves de ${type}`).toEqual(
        (fromCode[type] ?? []).sort(),
      );
    }
  });
});
