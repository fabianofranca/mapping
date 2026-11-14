import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, ok } from './proposalSupport';
import { DOC_REPO_URL, createRoleWorkspace, type RoleWorkspace } from './roleWorkspace';
import { connect, type Connection } from './workspace';

// Stage #559, PD6 (MCP 0.18.0): the external document in get_component and `docClones` in
// validate_library / plan_library_update, over stdio.

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

describe('get_component with an external document', () => {
  it('with the clone and the file, the doc brings the text and the repository link', async () => {
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

  it('with the clone but without the file, doc is null and docExternal and the hint come', async () => {
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

  it('without the repository localPath, doc is null, the url is null without urlTemplate and the hint teaches set_doc_repo', async () => {
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
    // Without urlTemplate there is no link: the hint only says the path in the repository.
    expect(result.hint).not.toContain('link');
    expect(result.hint).toContain('text.md');

    const none = ok(await component('button', 'proj-sem'));
    expect(none.doc).toBeNull();
    expect(none.docExternal!.exists).toBeNull();
    expect(none.docExternal!.url).toContain('components/button.md');
  });

  it('a localPath that leaves the roots reads nothing', async () => {
    const result = ok(await component('button', 'proj-fora'));
    expect(result.doc).toBeNull();
    expect(JSON.stringify(result)).not.toContain('SEGREDO');
    expect(result.docExternal).toMatchObject({
      localFile: null,
      exists: null,
      localFileProblem: 'outside-workdir',
    });
  });

  it('reading the package by path, without a project, only the link', async () => {
    const result = ok(
      await mcp.call<Component>('get_component', { path: 'lib', type: 'button' }),
    );
    expect(result.doc).toBeNull();
    expect(result.docExternal).toMatchObject({ repo: 'design-docs', exists: null });
  });
});

describe('validate_library with docClones', () => {
  const validate = (extra: Record<string, unknown> = {}) =>
    mcp.call<Report>('validate_library', { path: 'lib', ...extra });

  it('summary.docs counts the package documents and the external ones and agrees with spec.docs', async () => {
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

  it('without docClones gives one warning per repository, with the count', async () => {
    const result = ok(await validate());
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining([
        '2 documents of design-docs not checked (no clone)',
        '1 document of wiki not checked (no clone)',
      ]),
    );
  });

  it('with docClones, the missing document is a warning and the present one generates nothing', async () => {
    const result = ok(await validate({ docClones: { 'design-docs': 'clone' } }));
    const messages = result.warnings.map((w) => w.message);
    expect(result.valid).toBe(true);
    expect(messages).toContain('document not found in design-docs: components/image.md');
    expect(messages.join('\n')).not.toContain('components/button.md');
    expect(messages.join('\n')).not.toContain('of design-docs not checked');
    expect(messages).toContain('1 document of wiki not checked (no clone)');
  });

  it('a clone outside the roots is refused', async () => {
    const error = errorOf(await validate({ docClones: { 'design-docs': '../outside' } }));
    expect(error.code).toBeTruthy();
  });

  it('the doc object with a repo outside docRepos is a level 1 error', async () => {
    const bad = (await import('./roleWorkspace')).roleSpec((s) => {
      s.layers[0].annotationTypes[0].doc = { repo: 'undeclared', path: 'a.md' };
    });
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    mkdirSync(join(ws.root, 'lib-bad'), { recursive: true });
    writeFileSync(join(ws.root, 'lib-bad', 's.json'), JSON.stringify(bad));
    const result = await mcp.call<Report>('validate_library', { path: 'lib-bad' });
    const text = JSON.stringify(result.data);
    expect(text).toContain('undeclared');
    expect(text).toMatch(/"valid":false|invalid-library/);
  });
});

describe('plan_library_update uses the project localPath', () => {
  it('checks the external document through the project clone', async () => {
    const result = ok(
      await mcp.call<{ validation: Report }>('plan_library_update', {
        project: ws.project,
        path: 'lib',
      }),
    );
    const messages = result.validation.warnings.map((w) => w.message);
    expect(messages).toContain('document not found in design-docs: components/image.md');
    expect(messages).toContain('1 document of wiki not checked (no clone)');
    expect(messages.join('\n')).not.toContain('of design-docs not checked');
  });
});

describe('validate_specialization accepts the v11', () => {
  it('validates the file and returns the PD1 errors with the path', async () => {
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
    writeFileSync(join(ws.root, 'bad.json'), JSON.stringify(bad));
    const result = await mcp.call<Report>('validate_specialization', {
      path: 'bad.json',
    });
    expect(result.data.valid).toBe(false);
    expect(JSON.stringify(result.data.errors)).toContain('childRoles');
  });
});
