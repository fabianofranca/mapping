import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, ok } from './proposalSupport';
import { DOC_REPO_URL, createRoleWorkspace, type RoleWorkspace } from './roleWorkspace';
import { connect, type Connection } from './workspace';

// Etapa #559, PD6 (MCP 0.18.0): o documento externo no get_component e o `docClones` no
// validate_library / plan_library_update, por stdio.

interface External {
  repo: string;
  path: string;
  url: string | null;
  localFile: string | null;
  exists: boolean | null;
  localFileProblem?: string;
}
interface Component {
  doc: string | null;
  docExternal?: External;
  hint?: string;
}
interface Report {
  valid: boolean;
  errors: { file: string; path: string; message: string }[];
  warnings: { file: string; path: string; message: string }[];
}

let ws: RoleWorkspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createRoleWorkspace();
  mcp = await connect([ws.root], { cwd: ws.root });
});

afterAll(async () => {
  await mcp?.close();
});

const component = (type: string, project = ws.project) =>
  mcp.call<Component>('get_component', { project, specId: 's', type });

describe('get_component com documento externo', () => {
  it('com o clone e o arquivo, o doc traz o texto e o link do repositório', async () => {
    const result = ok(await component('button'));
    expect(result.doc).toContain('Documento externo.');
    expect(result.docExternal).toEqual({
      repo: 'design-docs',
      path: 'components/button.md',
      url: `${DOC_REPO_URL}/-/blob/main/components/button.md`,
      localFile: 'clone/components/button.md',
      exists: true,
    });
    expect(result.hint).toBeUndefined();
  });

  it('com o clone mas sem o arquivo, doc é null e vêm o docExternal e a hint', async () => {
    const result = ok(await component('image'));
    expect(result.doc).toBeNull();
    expect(result.docExternal).toMatchObject({
      repo: 'design-docs',
      path: 'components/image.md',
      localFile: 'clone/components/image.md',
      exists: false,
    });
    expect(result.docExternal!.url).toBe(
      `${DOC_REPO_URL}/-/blob/main/components/image.md`,
    );
    expect(result.hint).toContain('components/image.md');
  });

  it('sem localPath do repositório, doc é null, o url é null sem urlTemplate e a hint ensina o set_doc_repo', async () => {
    const result = ok(await component('text'));
    expect(result.doc).toBeNull();
    expect(result.docExternal).toEqual({
      repo: 'wiki',
      path: 'text.md',
      url: null,
      localFile: null,
      exists: null,
    });
    expect(result.hint).toContain('set_doc_repo');
    // Sem urlTemplate não há link: a hint diz só o caminho no repositório.
    expect(result.hint).not.toContain('link');
    expect(result.hint).toContain('text.md');

    const none = ok(await component('button', 'proj-sem'));
    expect(none.doc).toBeNull();
    expect(none.docExternal!.exists).toBeNull();
    expect(none.docExternal!.url).toContain('components/button.md');
  });

  it('um localPath que sai das raízes não lê nada', async () => {
    const result = ok(await component('button', 'proj-fora'));
    expect(result.doc).toBeNull();
    expect(JSON.stringify(result)).not.toContain('SEGREDO');
    expect(result.docExternal).toMatchObject({
      localFile: null,
      exists: null,
      localFileProblem: 'outside-workdir',
    });
  });

  it('lendo o pacote por path, sem projeto, só o link', async () => {
    const result = ok(
      await mcp.call<Component>('get_component', { path: 'lib', type: 'button' }),
    );
    expect(result.doc).toBeNull();
    expect(result.docExternal).toMatchObject({ repo: 'design-docs', exists: null });
  });
});

describe('validate_library com docClones', () => {
  const validate = (extra: Record<string, unknown> = {}) =>
    mcp.call<Report>('validate_library', { path: 'lib', ...extra });

  it('summary.docs conta os documentos do pacote e os externos e concorda com spec.docs', async () => {
    for (const extra of [{}, { docClones: { 'design-docs': 'clone' } }]) {
      const result = ok(
        await mcp.call<{ summary: { docs: number }; spec: { docs: number } }>(
          'validate_library',
          { path: 'lib', ...extra },
        ),
      );
      expect(result.spec.docs).toBe(3);
      expect(result.summary.docs).toBe(result.spec.docs);
    }
  });

  it('sem docClones dá um aviso por repositório, com a contagem', async () => {
    const result = ok(await validate());
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining([
        '2 documents of design-docs not checked (no clone)',
        '1 document of wiki not checked (no clone)',
      ]),
    );
  });

  it('com docClones, o documento ausente é aviso e o presente não gera nada', async () => {
    const result = ok(await validate({ docClones: { 'design-docs': 'clone' } }));
    const messages = result.warnings.map((w) => w.message);
    expect(result.valid).toBe(true);
    expect(messages).toContain('document not found in design-docs: components/image.md');
    expect(messages.join('\n')).not.toContain('components/button.md');
    expect(messages.join('\n')).not.toContain('de design-docs não conferidos');
    expect(messages).toContain('1 document of wiki not checked (no clone)');
  });

  it('um clone fora das raízes é recusado', async () => {
    const error = errorOf(await validate({ docClones: { 'design-docs': '../fora' } }));
    expect(error.code).toBeTruthy();
  });

  it('o doc objeto com repo fora de docRepos é erro do nível 1', async () => {
    const bad = (await import('./roleWorkspace')).roleSpec((s) => {
      s.layers[0].annotationTypes[0].doc = { repo: 'nao-declarado', path: 'a.md' };
    });
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    mkdirSync(join(ws.root, 'lib-ruim'), { recursive: true });
    writeFileSync(join(ws.root, 'lib-ruim', 's.json'), JSON.stringify(bad));
    const result = await mcp.call<Report>('validate_library', { path: 'lib-ruim' });
    const text = JSON.stringify(result.data);
    expect(text).toContain('nao-declarado');
    expect(text).toMatch(/"valid":false|invalid-library/);
  });
});

describe('plan_library_update usa o localPath do projeto', () => {
  it('confere o documento externo pelo clone do projeto', async () => {
    const result = ok(
      await mcp.call<{ validation: Report }>('plan_library_update', {
        project: ws.project,
        path: 'lib',
      }),
    );
    const messages = result.validation.warnings.map((w) => w.message);
    expect(messages).toContain('document not found in design-docs: components/image.md');
    expect(messages).toContain('1 document of wiki not checked (no clone)');
    expect(messages.join('\n')).not.toContain('de design-docs não conferidos');
  });
});

describe('validate_specialization aceita a v11', () => {
  it('valida o arquivo e devolve os erros da PD1 com o caminho', async () => {
    const good = ok(
      await mcp.call<Report>('validate_specialization', { path: 'lib/s.json' }),
    );
    expect(good.valid).toBe(true);
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { roleSpec } = await import('./roleWorkspace');
    const bad = roleSpec((s) => {
      s.layers[0].annotationTypes[1].childRoles = [];
    });
    writeFileSync(join(ws.root, 'ruim.json'), JSON.stringify(bad));
    const result = await mcp.call<Report>('validate_specialization', {
      path: 'ruim.json',
    });
    expect(result.data.valid).toBe(false);
    expect(JSON.stringify(result.data.errors)).toContain('childRoles');
  });
});
