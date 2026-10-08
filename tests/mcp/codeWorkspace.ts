import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { serialize, specFiles, type Project } from '../../src/model';
import {
  CADASTRO_SCREEN_KT,
  CADASTRO_VIEW_MODEL_KT,
  CADASTRO_VIEW_SWIFT,
  codeProject,
} from '../model/specFixtures';
import { PNG_1X1, allIds, uuidFor, withUuids } from './workspace';

// Cenário da 3b.4 (passo 6 do roteiro): o repositório do app com o projeto Mapping dentro
// (`repo/design/mapeamentos/<projeto>`), como o `.mcp.json` do Claude Code o enxerga:
// o servidor roda com `repo/` como diretório de trabalho e `--root design/mapeamentos`.
// O `localPath` do `android` é `../../..` (a raiz do repositório, acima da raiz do servidor).

type Doc = Record<string, unknown>;

/** Código "vazio" que existe no repositório: só a conferência de existência é testada. */
export const EXISTING_CODE_FILES = [CADASTRO_SCREEN_KT];

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

function items(doc: Doc, key: 'annotations' | 'images'): Doc[] {
  return doc[key] as Doc[];
}

/**
 * Projetos (todos com o `codeProject()`: SDUI v2 + Modelo de dados v1, Screen `Cadastro`):
 * - `cadastro`: leitura (`android` com repositório e `localPath`; `ios` sem repositório);
 * - `escrita`: o mesmo, para os testes que gravam;
 * - `escapa`: `localPath` sobe acima do diretório de trabalho (o arquivo existe lá, mas não pode aparecer);
 * - `link`: o caminho passa por um link simbólico do repositório que leva para fora dele.
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
  const write = (name: string, text: string) => {
    const dir = join(root, name);
    mkdirSync(join(dir, 'images'), { recursive: true });
    mkdirSync(join(dir, 'specs'), { recursive: true });
    writeFileSync(join(dir, 'mapping.json'), text);
    writeFileSync(join(dir, 'images', 'cadastro.png'), PNG_1X1);
    for (const [file, content] of specFiles(source))
      writeFileSync(join(dir, file), content);
  };
  const screen = (doc: Doc): Record<string, unknown> => {
    const a = items(doc, 'annotations').find((x) => x.id === ids.AS)!;
    return a.values as Record<string, unknown>;
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
  writeFileSync(join(base, 'CadastroOculto.kt'), '');

  // `repo/saida` é um link simbólico para fora do repositório, onde existe `segredo.kt`.
  write(
    'link',
    mappingText((doc) => {
      screen(doc).implementacao = [
        {
          _id: uuidFor('L1'),
          platform: 'android',
          path: 'saida/segredo.kt',
          symbol: 'Segredo',
          line: null,
        },
      ];
    }),
  );
  mkdirSync(join(base, 'fora'));
  writeFileSync(join(base, 'fora', 'segredo.kt'), '');
  symlinkSync(join(base, 'fora'), join(repo, 'saida'), 'dir');

  // Os arquivos de código do app: vazios, só para a conferência de existência.
  for (const file of EXISTING_CODE_FILES) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), '');
  }

  return { base, repo, root, ids, projectDir: (name) => join(root, name) };
}

export { CADASTRO_SCREEN_KT, CADASTRO_VIEW_MODEL_KT, CADASTRO_VIEW_SWIFT };
