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
 * `tests/fixtures/`, `lab/`, `examples/exemplo-completo/` (cópias) nem zips.
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
const MISSING_TODAY: string[] = [];

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
    for (const line of (block[1] ?? '').split('\n')) {
      const m = /^\s*(\w+):\s*\[([^\]]*)\]/.exec(line);
      if (m)
        fromCode[m[1] ?? ''] = [...(m[2] ?? '').matchAll(/'([^']+)'/g)].map(
          (x) => x[1] ?? '',
        );
    }
    for (const type of NODE_TYPES) {
      expect([...EXTRA_KEYS[type]].sort(), `chaves de ${type}`).toEqual(
        (fromCode[type] ?? []).sort(),
      );
    }
  });
});
