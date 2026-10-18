import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  type Spec,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// validate_library, list_components, get_component e get_specialization servindo a v4 (fase
// B2). O pacote de prova é o Material 3 de `examples/libraries/material3/`.

const MATERIAL3 = 'examples/libraries/material3';

interface Issue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
interface Validated {
  valid: boolean;
  path: string;
  spec?: Record<string, unknown>;
  summary: { level: number; types: number; components: number; docs: number };
  errors: Issue[];
  warnings: Issue[];
  moreErrors?: number;
  hint: string;
}
interface Listed {
  count: number;
  typesWithoutComponent: number;
  components: {
    type: string;
    name: string;
    layer: string;
    size: { width: number; height: number };
    minSize: { width: number; height: number } | null;
    hasDoc: boolean;
    examples: number;
    problem?: string;
  }[];
  hint?: string;
}
interface Component {
  type: string;
  hasComponent: boolean;
  doc: string | null;
  docPath: string | null;
  fields: { key: string; type: string; required: boolean; options?: string[] }[];
  examples: { name: string; values?: Record<string, unknown> }[];
  component: { format: string; id: string } | null;
  sources: unknown[];
  hint?: string;
}

let base: string;
let root: string;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-lib-'));
  root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });
  cpSync(MATERIAL3, join(root, 'lib', 'material3'), { recursive: true });

  // Cópia quebrada: falta o componente do botão.
  cpSync(MATERIAL3, join(root, 'quebrado', 'material3'), { recursive: true });
  rmSync(join(root, 'quebrado', 'material3', 'components', 'm3-button.json'));

  // Exemplo de sistema externo sem o tamanho da tela, que a declaração exige.
  cpSync(MATERIAL3, join(root, 'externo', 'material3'), { recursive: true });
  const example = join(root, 'externo', 'material3', 'examples', 'settings.sdui.json');
  const screen = JSON.parse(readFileSync(example, 'utf8')) as {
    screen: { device?: unknown };
  };
  delete screen.screen.device;
  writeFileSync(example, JSON.stringify(screen));

  mkdirSync(join(root, 'vazia'));
  writeFileSync(join(root, 'vazia', 'LEIA-ME.md'), 'nada aqui');

  // Projeto com a biblioteca aplicada na pasta `specs/material3/`.
  const dir = join(root, 'projetos', 'telas');
  const specFile = 'specs/material3/material3.spec.json';
  cpSync(MATERIAL3, join(dir, 'specs', 'material3'), { recursive: true });
  const parsed = parseSpecText(
    readFileSync(join(MATERIAL3, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      name: 'Livre',
      color: '#D32F2F',
    },
  });
  let n = 0;
  p = applySpecialization(p, parsed.spec, {
    newId: () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  });
  p = {
    ...p,
    specializations: p.specializations.map((s) => ({ ...s, file: specFile })),
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));

  // Fora das raízes.
  mkdirSync(join(base, 'fora'), { recursive: true });
  cpSync(MATERIAL3, join(base, 'fora', 'material3'), { recursive: true });
  symlinkSync(join(base, 'fora', 'material3'), join(root, 'link-para-fora'));

  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

describe('validate_library', () => {
  it('aprova o Material 3 (pasta ou arquivo): sem erros, com os avisos esperados', async () => {
    for (const path of ['lib/material3', 'lib/material3/material3.spec.json']) {
      const result = ok(await mcp.call<Validated>('validate_library', { path }));
      expect(result.valid, path).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.summary).toMatchObject({ level: 3, components: 15, docs: 15 });
      expect(result.spec).toMatchObject({
        id: 'material3',
        formatVersion: 4,
        components: 15,
        fonts: 2,
        origins: 1,
        migrations: 0,
      });
      expect(result.warnings.length).toBeGreaterThan(0);
      for (const w of result.warnings) {
        expect(w.severity).toBe('warning');
        expect(typeof w.file).toBe('string');
      }
    }
  });

  it('o exemplo de sistema externo passa pela declaração (nível 3) e quebra se ela não o entende', async () => {
    const good = ok(
      await mcp.call<Validated>('validate_library', { path: 'lib/material3' }),
    );
    expect(good.errors).toEqual([]);
    const bad = ok(
      await mcp.call<Validated>('validate_library', { path: 'externo/material3' }),
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors).toHaveLength(1);
    expect(bad.errors[0]).toMatchObject({
      file: 'material3.spec.json',
      path: 'origins[0].examples[0].file',
    });
    expect(bad.errors[0]?.message).toMatch(/largura da tela/);
    // Com level 2 a prova de desenho não roda.
    const level2 = ok(
      await mcp.call<Validated>('validate_library', {
        path: 'externo/material3',
        level: 2,
      }),
    );
    expect(level2.valid).toBe(true);
    expect(level2.summary.level).toBe(2);
  });

  it('pacote sem um componente: erro com file e path certos', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'quebrado/material3' }),
    );
    expect(result.valid).toBe(false);
    const missing = result.errors.find((e) => e.message.includes('m3-button.json'));
    expect(missing).toMatchObject({ file: 'material3.spec.json', severity: 'error' });
    expect(missing?.path).toMatch(/^layers\[\d+\]\.annotationTypes\[\d+\]\.component$/);
    expect(result.hint).toMatch(/corrija/);
  });

  it('contrato de versão: previous liga a checagem (a mesma versão não é nova)', async () => {
    const same = ok(
      await mcp.call<Validated>('validate_library', {
        path: 'lib/material3',
        previous: 'lib/material3/material3.spec.json',
      }),
    );
    expect(same.errors.length + same.warnings.length).toBeGreaterThan(0);
    const semPrevious = ok(
      await mcp.call<Validated>('validate_library', { path: 'lib/material3' }),
    );
    expect(same.errors.length).toBeGreaterThanOrEqual(semPrevious.errors.length);
  });

  it('recusa caminho fora das raízes (inclusive link simbólico) e inexistente', async () => {
    expect(
      errorOf(
        await mcp.call('validate_library', { path: join(base, 'fora', 'material3') }),
      ).code,
    ).toBe('outside-roots');
    expect(
      errorOf(await mcp.call('validate_library', { path: 'link-para-fora' })).code,
    ).toBe('outside-roots');
    expect(errorOf(await mcp.call('validate_library', { path: '../fora' })).code).toBe(
      'outside-roots',
    );
    expect(errorOf(await mcp.call('validate_library', { path: 'nao-existe' })).code).toBe(
      'path-not-found',
    );
  });

  it('pasta sem especialização: valid false com a mensagem do validador', async () => {
    const result = ok(await mcp.call<Validated>('validate_library', { path: 'vazia' }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/nenhuma especialização/);
    expect(result.spec).toBeUndefined();
  });
});

describe('validate_specialization com a v4', () => {
  it('resume componentes, fontes, origens e migrações e aponta validate_library', async () => {
    const result = ok(
      await mcp.call<{
        valid: boolean;
        spec: Record<string, unknown>;
        hint: string;
      }>('validate_specialization', { path: 'lib/material3/material3.spec.json' }),
    );
    expect(result.valid).toBe(true);
    expect(result.spec).toMatchObject({
      formatVersion: 4,
      components: 15,
      fonts: 2,
      origins: 1,
      migrations: 0,
    });
    expect(result.hint).toMatch(/validate_library/);
    expect(result.hint).toMatch(/ARQUIVO/);
  });
});

describe('list_components e get_component', () => {
  it('por path de pacote', async () => {
    const list = ok(await mcp.call<Listed>('list_components', { path: 'lib/material3' }));
    expect(list.count).toBe(15);
    const button = list.components.find((c) => c.type === 'm3-button');
    expect(button).toMatchObject({ hasDoc: true });
    expect(button?.size.width).toBeGreaterThan(0);
    expect(button?.examples).toBeGreaterThan(0);

    const got = ok(
      await mcp.call<Component>('get_component', {
        path: 'lib/material3',
        type: 'm3-button',
      }),
    );
    expect(got).toMatchObject({ type: 'm3-button', hasComponent: true });
    expect(got.doc).toBe(readFileSync(`${MATERIAL3}/docs/m3-button.md`, 'utf8'));
    expect(got.component?.format).toBe('mapping-component');
    expect(got.fields.map((f) => f.key)).toContain('label');
    expect(got.examples.length).toBeGreaterThan(0);
    expect(got.examples[0]?.values).toBeDefined();
  });

  it('por projeto e specId (a cópia aplicada em specs/<pasta>/)', async () => {
    const list = ok(
      await mcp.call<Listed>('list_components', {
        project: 'telas',
        specId: 'material3',
      }),
    );
    expect(list.count).toBe(15);
    const got = ok(
      await mcp.call<Component>('get_component', {
        project: 'telas',
        specId: 'material3',
        type: 'm3-card',
      }),
    );
    expect(got.hasComponent).toBe(true);
    expect(got.doc).toBe(readFileSync(`${MATERIAL3}/docs/m3-card.md`, 'utf8'));
  });

  it('tipo desconhecido, argumentos errados e especialização não aplicada', async () => {
    expect(
      errorOf(
        await mcp.call('get_component', { path: 'lib/material3', type: 'nao-existe' }),
      ).code,
    ).toBe('unknown-type');
    expect(errorOf(await mcp.call('list_components', {})).code).toBe('invalid-arguments');
    expect(
      errorOf(
        await mcp.call('list_components', { path: 'lib/material3', project: 'telas' }),
      ).code,
    ).toBe('invalid-arguments');
    expect(errorOf(await mcp.call('list_components', { project: 'telas' })).code).toBe(
      'invalid-arguments',
    );
    expect(
      errorOf(await mcp.call('list_components', { project: 'telas', specId: 'outra' }))
        .code,
    ).toBe('not-found');
  });

  it('tipo sem componente nem documento: resposta clara, não erro', async () => {
    const dir = join(root, 'sem-componente');
    cpSync(MATERIAL3, dir, { recursive: true });
    const file = join(dir, 'material3.spec.json');
    const spec = JSON.parse(readFileSync(file, 'utf8')) as Spec;
    const type = spec.layers[0]!.annotationTypes[0]!;
    delete type.component;
    delete type.doc;
    writeFileSync(file, JSON.stringify(spec));
    const got = ok(
      await mcp.call<Component>('get_component', {
        path: 'sem-componente',
        type: type.id,
      }),
    );
    expect(got.hasComponent).toBe(false);
    expect(got.doc).toBeNull();
    expect(got.component).toBeNull();
    expect(got.hint).toMatch(/não tem componente/);
    const list = ok(
      await mcp.call<Listed>('list_components', { path: 'sem-componente' }),
    );
    expect(list.count).toBe(14);
    expect(list.typesWithoutComponent).toBe(1);
  });
});

describe('get_specialization com a v4', () => {
  it('mantém component, doc, examples, fonts e origins e lista os arquivos do pacote', async () => {
    const view = ok(
      await mcp.call<{
        spec: Spec;
        package?: { dir: string; files: string[] };
      }>('get_specialization', { project: 'telas', specId: 'material3' }),
    );
    expect(view.spec.fonts).toHaveLength(2);
    expect(view.spec.origins).toHaveLength(1);
    const type = view.spec.layers[0]!.annotationTypes[0]!;
    expect(type.component).toMatch(/^components\//);
    expect(type.doc).toMatch(/^docs\//);
    expect(type.examples?.length).toBeGreaterThan(0);
    expect(view.package?.dir).toBe('specs/material3');
    expect(view.package?.files).toContain('components/m3-button.json');
    expect(view.package?.files).toContain('fonts/LEIA-ME.txt');
    expect(existsSync(join(root, 'projetos', 'telas', view.package!.dir))).toBe(true);
  });
});

describe('apply_specialization com pacote v4', () => {
  it('é aceito: a pasta vai pela proposta (detalhes em libraryUpdate.test.ts)', async () => {
    const result = ok(
      await mcp.call<{
        valid: boolean;
        errors?: { op: string; code: string; message: string }[];
        summary: string[];
      }>('plan_changes', {
        project: 'telas',
        operations: [
          { op: 'apply_specialization', file: 'lib/material3/material3.spec.json' },
        ],
      }),
    );
    // A biblioteca já está aplicada nesse projeto: o erro é o de sempre, não uma recusa do pacote.
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]?.code).toBe('spec-already-applied');
  });
});
