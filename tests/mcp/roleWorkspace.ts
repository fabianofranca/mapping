import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { addTypedAnnotation, serialize, specFiles, type Project } from '../../src/model';
import { addChild, roleProject } from '../model/roleFixtures';
import { layerOf } from '../model/specFixtures';
import { v11Json, type Json } from '../model/specV11Fixtures';
import { PNG_1X1, allIds, codeOf, uuidFor, withUuids } from './workspace';

// Cenário dos testes do MCP 0.18.0 (etapa #559, PD6): um projeto com a especialização v11 de
// teste (`button` com papéis Clique e Pressionar, `image` com o papel Toque, documentos num
// repositório externo `design-docs`) e, ao lado, o clone desse repositório e um pacote de
// biblioteca. Tudo sob `raiz/`, que é também o diretório de trabalho do servidor.

export const DOC_REPO_URL = 'https://gitlab.example.com/g/design-docs';
export const DOC_TEMPLATE = `${DOC_REPO_URL}/-/blob/main/{path}`;

/** Edita a especialização do cenário: papéis nos donos e o `doc` objeto em `button` e `image`. */
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

/** A especialização do cenário como JSON (`formatVersion` 11). */
export const roleSpec = (edit?: (spec: Json) => void): Json =>
  v11Json((s) => {
    roleEdit(s);
    edit?.(s);
  });

/** Projeto: donos `A1`, `A2` (button), `A3` (image); filhos `C1` (click) e `C2` (sem papel) em `A1`. */
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
  /** Raiz do servidor e diretório de trabalho. */
  readonly root: string;
  readonly ids: Readonly<Record<string, string>>;
  /** Projetos: `proj` (clone em `../clone`), `proj-fora` (`localPath` fora das raízes), `proj-sem`. */
  readonly project: string;
  /** Pasta do clone do repositório de documentos. */
  readonly clone: string;
  /** Pacote de biblioteca (só o arquivo da especialização). */
  readonly lib: string;
  readonly ref: (id: string, kind?: 'a' | 'm') => string;
}

export function createRoleWorkspace(): RoleWorkspace {
  const base = mkdtempSync(join(tmpdir(), 'mapping-roles-'));
  const root = join(base, 'raiz');
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
  put(join(base, 'fora', 'components', 'button.md'), 'SEGREDO fora das raízes\n');
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
