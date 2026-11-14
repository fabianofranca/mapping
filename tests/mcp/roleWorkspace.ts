import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { addTypedAnnotation, serialize, specFiles, type Project } from '../../src/model';
import { addChild, roleProject } from '../model/roleFixtures';
import { layerOf } from '../model/specFixtures';
import { v11Json, type Json } from '../model/specV11Fixtures';
import { PNG_1X1, allIds, codeOf, uuidFor, withUuids } from './workspace';

// Scenario for the MCP 0.18.0 tests (stage #559, PD6): a project with the v11 test
// specialization (`button` with roles Clique and Pressionar, `image` with the role Toque, documents in an
// external repository `design-docs`) and, beside it, the clone of that repository and a library
// package. Everything under `root/`, which is also the server's working directory.

export const DOC_REPO_URL = 'https://gitlab.example.com/g/design-docs';
export const DOC_TEMPLATE = `${DOC_REPO_URL}/-/blob/main/{path}`;

/** Edits the scenario's specialization: roles on the owners and the `doc` object on `button` and `image`. */
function roleEdit(s: Json): void {
  const [button, image, text] = s.layers[0].annotationTypes as Json[];
  button!.childRoles = [
    { id: 'click', name: 'Clique' },
    { id: 'hold', name: 'Pressionar' },
  ];
  button!.childRolesLabel = 'Trigger';
  s.docRepos = [
    { id: 'design-docs', url: DOC_REPO_URL, urlTemplate: DOC_TEMPLATE, ref: 'main' },
    { id: 'wiki', url: 'https://gitlab.example.com/g/wiki' },
  ];
  button!.doc = { repo: 'design-docs', path: 'components/button.md' };
  image!.allowedChildren = [{ layer: 'eventos' }];
  image!.childRoles = [{ id: 'tap', name: 'Toque' }];
  image!.doc = { repo: 'design-docs', path: 'components/image.md' };
  text!.doc = { repo: 'wiki', path: 'text.md' };
}

/** The scenario's specialization as JSON (`formatVersion` 11). */
export const roleSpec = (edit?: (spec: Json) => void): Json =>
  v11Json((s) => {
    roleEdit(s);
    edit?.(s);
  });

/** Project: owners `A1`, `A2` (button), `A3` (image); children `C1` (click) and `C2` (no role) in `A1`. */
export function roleScenarioProject(): Project {
  let p = roleProject(roleEdit);
  p = addTypedAnnotation(p, {
    id: 'A3',
    markingId: 'M1',
    layerId: layerOf(p, 's', 'componentes'),
    type: { specId: 's', typeId: 'image' },
  });
  p = addChild(p, 'C1', 'A1', 'click');
  p = addChild(p, 'C2', 'A1', null, 'onHold');
  return p;
}

export interface RoleWorkspace {
  readonly base: string;
  /** Server root and working directory. */
  readonly root: string;
  readonly ids: Readonly<Record<string, string>>;
  /** Projects: `proj` (clone in `../clone`), `proj-fora` (`localPath` outside the roots), `proj-sem`. */
  readonly project: string;
  /** Folder of the documents repository clone. */
  readonly clone: string;
  /** Library package (only the specialization file). */
  readonly lib: string;
  readonly ref: (id: string, kind?: 'a' | 'm') => string;
}

export function createRoleWorkspace(): RoleWorkspace {
  const base = mkdtempSync(join(tmpdir(), 'mapping-roles-'));
  const root = join(base, 'root');
  const clone = join(root, 'clone');
  const lib = join(root, 'lib');
  const source = roleScenarioProject();
  const keys = [...allIds(source)];
  const ids = Object.fromEntries(keys.map((id) => [id, uuidFor(id)]));
  const put = (file: string, text: string | Buffer) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const mapping = (docRepos: Record<string, unknown>) => {
    const doc = JSON.parse(withUuids(serialize(source), keys)) as Json;
    doc.docRepos = docRepos;
    return `${JSON.stringify(doc, null, 2)}\n`;
  };
  const projects: [string, Record<string, unknown>][] = [
    ['proj', { 'design-docs': { localPath: '../clone' } }],
    ['proj-fora', { 'design-docs': { localPath: '../../fora' } }],
    ['proj-sem', {}],
  ];
  for (const [name, docRepos] of projects) {
    const dir = join(root, name);
    put(join(dir, 'mapping.json'), mapping(docRepos));
    put(join(dir, 'a.png'), PNG_1X1);
    for (const [file, content] of specFiles(source)) put(join(dir, file), content);
  }
  put(join(base, 'fora', 'components', 'button.md'), 'SEGREDO outside the roots\n');
  put(join(clone, 'components', 'button.md'), '# Button\n\nDocumento externo.\n');
  put(join(lib, 's.json'), JSON.stringify(roleSpec(), null, 2));
  return {
    base,
    root,
    ids,
    project: 'proj',
    clone,
    lib,
    ref: (id, kind = 'a') => `mapping://proj/${kind}/${codeOf(ids[id]!)}`,
  };
}
