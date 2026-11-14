import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { serialize, specFiles, type Project } from '../../src/model';
import { codeProject } from '../model/specFixtures';
import { PNG_1X1, allIds, uuidFor, withUuids } from './workspace';

// Scenario of 3b.4 (R3 of the guide): the app's repository with the Mapping project inside
// (`repo/design/mapeamentos/<project>`), as Claude Code's `.mcp.json` sees it:
// the server runs with `repo/` as its working directory and `--root design/mapeamentos`.
// The `android` `localPath` is `../../..` (the repository root, above the server's root).
// The cited code is the `code.<platform>.path` of the specialization's types (stage 9).

type Doc = Record<string, unknown>;

/** File of the Button `symbol` on Android (`code.android.path` of the SDUI example). */
export const DS_BUTTON_KT = 'app/src/main/java/com/app/ds/DSButton.kt';
/** File of the Input `symbol` on Android (`code.android.path` of the SDUI example); it does not exist in the repository. */
export const DS_TEXT_FIELD_KT = 'app/src/main/java/com/app/ds/DSTextField.kt';
/** File of the Button `symbol` on iOS (`code.ios.path` of the SDUI example). */
export const DS_BUTTON_SWIFT = 'App/DesignSystem/DSButton.swift';

/** "Empty" code that exists in the repository: only the existence check is tested. */
export const EXISTING_CODE_FILES = [DS_BUTTON_KT];

export interface CodeWorkspace {
  readonly base: string;
  /** The client's working directory (the app repository's root). */
  readonly repo: string;
  /** The server's root: `repo/design/mapeamentos`. */
  readonly root: string;
  readonly ids: Readonly<Record<string, string>>;
  /** Folder of a project in the root. */
  readonly projectDir: (name: string) => string;
}

/** Type `typeId` of a specialization copy (JSON already read). */
function specType(spec: Doc, typeId: string): Doc {
  const layers = spec.layers as { annotationTypes: Doc[] }[];
  return layers.flatMap((l) => l.annotationTypes).find((t) => t.id === typeId)!;
}

/**
 * Projects (all with the `codeProject()`: SDUI v2 + Data model v1, Screen `Cadastro`):
 * - `cadastro`: reading (`android` with repository and `localPath`; `ios` without a repository);
 * - `escrita`: the same, for the tests that write;
 * - `escapa`: `localPath` climbs above the working directory (the file exists there, but must not show up);
 * - `link`: the Input's `path` on Android goes through a symbolic link in the repository that leads outside it;
 * - `antigo`: the same project saved as v8, with the code field removed (`implementacao`)
 *   on the Screen of the specialization copy and filled in on the annotation (migrates to v9 on read).
 */
export function createCodeWorkspace(): CodeWorkspace {
  const base = mkdtempSync(join(tmpdir(), 'mapping-mcp-code-'));
  const repo = join(base, 'repo');
  const root = join(repo, 'design', 'mapeamentos');
  mkdirSync(root, { recursive: true });

  const source: Project = codeProject();
  const ids = Object.fromEntries([...allIds(source)].map((id) => [id, uuidFor(id)]));
  const mappingText = (edit?: (doc: Doc) => void): string => {
    const text = withUuids(serialize(source), Object.keys(ids));
    if (!edit) return text;
    const doc = JSON.parse(text) as Doc;
    edit(doc);
    return `${JSON.stringify(doc, null, 2)}\n`;
  };
  const write = (name: string, text: string, editSdui?: (spec: Doc) => void) => {
    const dir = join(root, name);
    mkdirSync(join(dir, 'images'), { recursive: true });
    mkdirSync(join(dir, 'specs'), { recursive: true });
    writeFileSync(join(dir, 'mapping.json'), text);
    writeFileSync(join(dir, 'images', 'cadastro.png'), PNG_1X1);
    for (const [file, content] of specFiles(source)) {
      let out = content;
      if (editSdui && file === 'specs/sdui.json') {
        const spec = JSON.parse(content) as Doc;
        editSdui(spec);
        out = `${JSON.stringify(spec, null, 2)}\n`;
      }
      writeFileSync(join(dir, file), out);
    }
  };

  write('cadastro', mappingText());
  write('escrita', mappingText());

  // The `localPath` climbs one level above the repository: the file (which exists in `base/`) must not show up.
  write(
    'escapa',
    mappingText((doc) => {
      (doc.platformRepos as Record<string, { localPath: string }>).android!.localPath =
        '../../../..';
    }),
  );
  mkdirSync(dirname(join(base, DS_BUTTON_KT)), { recursive: true });
  writeFileSync(join(base, DS_BUTTON_KT), '');

  // `repo/saida` is a symbolic link outside the repository, where `segredo.kt` exists.
  write('link', mappingText(), (spec) => {
    const code = specType(spec, 'input').code as Record<string, Doc>;
    code.android!.path = 'saida/segredo.kt';
  });
  mkdirSync(join(base, 'fora'));
  writeFileSync(join(base, 'fora', 'segredo.kt'), '');
  symlinkSync(join(base, 'fora'), join(repo, 'saida'), 'dir');

  // v8 project with the removed field: the copy declares the field and the annotation has the value.
  write(
    'antigo',
    mappingText((doc) => {
      doc.schemaVersion = 8;
      const annotations = doc.annotations as Doc[];
      const screen = annotations.find((a) => a.id === ids.AS)!;
      (screen.values as Doc).implementacao = [
        {
          _id: uuidFor('C1'),
          platform: 'android',
          path: 'app/src/main/java/com/app/cadastro/CadastroScreen.kt',
          symbol: 'CadastroScreen',
          line: null,
        },
      ];
    }),
    (spec) => {
      (specType(spec, 'screen').fields as Doc[]).push({
        key: 'implementacao',
        label: 'implementation',
        type: 'codeRef',
      });
    },
  );

  // The app's code files: empty, only for the existence check.
  for (const file of EXISTING_CODE_FILES) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), '');
  }

  return { base, repo, root, ids, projectDir: (name) => join(root, name) };
}
