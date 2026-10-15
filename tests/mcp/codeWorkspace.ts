import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { serialize, specFiles, type Project } from '../../src/model';
import { codeProject } from '../model/specFixtures';
import { PNG_1X1, allIds, uuidFor, withUuids } from './workspace';

// Cenário da 3b.4 (o R3 do guia): o repositório do app com o projeto Mapping dentro
// (`repo/design/mapeamentos/<projeto>`), como o `.mcp.json` do Claude Code o enxerga:
// o servidor roda com `repo/` como diretório de trabalho e `--root design/mapeamentos`.
// O `localPath` do `android` é `../../..` (a raiz do repositório, acima da raiz do servidor).
// O código citado é o `code.<plataforma>.path` dos tipos da especialização (etapa 9).

type Doc = Record<string, unknown>;

/** Arquivo do `symbol` do Button no Android (`code.android.path` do exemplo SDUI). */
export const DS_BUTTON_KT = 'app/src/main/java/com/app/ds/DSButton.kt';
/** Arquivo do `symbol` do Input no Android (`code.android.path` do exemplo SDUI); não existe no repositório. */
export const DS_TEXT_FIELD_KT = 'app/src/main/java/com/app/ds/DSTextField.kt';
/** Arquivo do `symbol` do Button no iOS (`code.ios.path` do exemplo SDUI). */
export const DS_BUTTON_SWIFT = 'App/DesignSystem/DSButton.swift';

/** Código "vazio" que existe no repositório: só a conferência de existência é testada. */
export const EXISTING_CODE_FILES = [DS_BUTTON_KT];

export interface CodeWorkspace {
  readonly base: string;
  /** Diretório de trabalho do cliente (a raiz do repositório do app). */
  readonly repo: string;
  /** Raiz do servidor: `repo/design/mapeamentos`. */
  readonly root: string;
  readonly ids: Readonly<Record<string, string>>;
  /** Pasta de um projeto da raiz. */
  readonly projectDir: (name: string) => string;
}

/** Tipo `typeId` da cópia de uma especialização (JSON já lido). */
function specType(spec: Doc, typeId: string): Doc {
  const layers = spec.layers as { annotationTypes: Doc[] }[];
  return layers.flatMap((l) => l.annotationTypes).find((t) => t.id === typeId)!;
}

/**
 * Projetos (todos com o `codeProject()`: SDUI v2 + Modelo de dados v1, Screen `Cadastro`):
 * - `cadastro`: leitura (`android` com repositório e `localPath`; `ios` sem repositório);
 * - `escrita`: o mesmo, para os testes que gravam;
 * - `escapa`: `localPath` sobe acima do diretório de trabalho (o arquivo existe lá, mas não pode aparecer);
 * - `link`: o `path` do Input no Android passa por um link simbólico do repositório que leva para fora dele;
 * - `antigo`: o mesmo projeto gravado na v8, com o campo de código removido (`implementacao`)
 *   no Screen da cópia da especialização e preenchido na anotação (migra para a v9 na leitura).
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

  // O `localPath` sobe um nível além do repositório: o arquivo (que existe em `base/`) não pode aparecer.
  write(
    'escapa',
    mappingText((doc) => {
      (doc.platformRepos as Record<string, { localPath: string }>).android!.localPath =
        '../../../..';
    }),
  );
  mkdirSync(dirname(join(base, DS_BUTTON_KT)), { recursive: true });
  writeFileSync(join(base, DS_BUTTON_KT), '');

  // `repo/saida` é um link simbólico para fora do repositório, onde existe `segredo.kt`.
  write('link', mappingText(), (spec) => {
    const code = specType(spec, 'input').code as Record<string, Doc>;
    code.android!.path = 'saida/segredo.kt';
  });
  mkdirSync(join(base, 'fora'));
  writeFileSync(join(base, 'fora', 'segredo.kt'), '');
  symlinkSync(join(base, 'fora'), join(repo, 'saida'), 'dir');

  // Projeto v8 com o campo removido: a cópia declara o campo e a anotação tem o valor.
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
        label: 'implementação',
        type: 'codeRef',
      });
    },
  );

  // Os arquivos de código do app: vazios, só para a conferência de existência.
  for (const file of EXISTING_CODE_FILES) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), '');
  }

  return { base, repo, root, ids, projectDir: (name) => join(root, name) };
}
