import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addAnnotation,
  addImage,
  addLayer,
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpecText,
  projectLayerFor,
  setFieldValue,
  setPlatformRepo,
  setTableCell,
  serialize,
  specFiles,
  type JsonValue,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';

export function loadExample(name: 'sdui' | 'modelo-de-dados'): Spec {
  // A partir da raiz do projeto: no ambiente jsdom, `import.meta.url` não é `file:`.
  const text = readFileSync(
    join(process.cwd(), 'examples', 'specs', `${name}.json`),
    'utf8',
  );
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/**
 * A SDUI como era antes do `repo` (formatVersion 2, versão 2; `tests/fixtures/sdui-v2.json`): a
 * base dos projetos de teste anteriores ao código de instanciação e das atualizações para a
 * versão atual. O exemplo de verdade é `loadExample('sdui')`.
 */
export function loadLegacySdui(): Spec {
  const text = readFileSync(
    join(process.cwd(), 'tests', 'fixtures', 'sdui-v2.json'),
    'utf8',
  );
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Gerador de ids previsíveis: `prefix1`, `prefix2`… */
export function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Id da camada do projeto criada a partir da camada da especialização. */
export function layerOf(p: Project, specId: string, specLayerId: string): string {
  const layer = projectLayerFor(p, specId, specLayerId);
  if (!layer) throw new Error(`camada ${specId}/${specLayerId} não encontrada`);
  return layer.id;
}

/** Projeto com a camada livre Model e as duas especializações aplicadas (passo 1 da 13.9). */
export function specProject(): Project {
  let p = emptyProject();
  p = addLayer(p, { id: 'LM', name: 'Model', color: '#757575' });
  p = applySpecialization(p, loadLegacySdui(), { newId: idGen('LS') });
  p = applySpecialization(p, loadExample('modelo-de-dados'), { newId: idGen('LD') });
  return p;
}

function typed(
  p: Project,
  id: string,
  markingId: string,
  specId: string,
  typeId: string,
  values: Record<string, JsonValue>,
  owner?: string,
): Project {
  const layers: Record<string, string> = {
    button: 'componentes',
    input: 'componentes',
    text: 'componentes',
    image: 'componentes',
    onClick: 'eventos',
    onHold: 'eventos',
    onChange: 'eventos',
    screen: 'telas',
    classe: 'classes',
    endpoint: 'endpoints',
  };
  const layerId = layerOf(p, specId, layers[typeId] ?? '');
  let next = addTypedAnnotation(p, {
    id,
    markingId,
    layerId,
    type: { specId, typeId },
    parentAnnotationId: owner ?? null,
  });
  for (const [key, value] of Object.entries(values)) {
    next = setFieldValue(next, id, key, value);
  }
  return next;
}

/**
 * Tela de cadastro do roteiro da 13.9 (passos 2 a 7): Formulário › Nome, Idade,
 * E-mail, Cadastrar; e Título. Anotações:
 * - AU (Model, livre, Formulário): User com EN `name: string` e EA `age: number`;
 * - AC (Classe, Formulário): Contato, com a linha R1 `email` em `atributos`;
 * - AIN/AII/AIE: Inputs com `dado` → User.name, User.age e Contato.email;
 * - AB: Button do Cadastrar, com AOC (onClick) e AOH (onHold) vinculados;
 * - AT: Text do Título com `id` vazio (incompleta);
 * - AOE: onChange do E-mail; AE: Endpoint no Formulário.
 */
export function cadastroProject(): Project {
  let p = specProject();
  p = addImage(p, { id: 'I1', file: 'images/cadastro.png', width: 1000, height: 2000 });
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  p = createMarking(p, {
    id: 'MT',
    imageId: 'I1',
    rect: rect(100, 50, 800, 100),
    name: 'Título',
  });
  p = createMarking(p, {
    id: 'MF',
    imageId: 'I1',
    rect: rect(50, 200, 900, 1200),
    name: 'Formulário',
  });
  p = createMarking(p, {
    id: 'MN',
    imageId: 'I1',
    rect: rect(100, 250, 800, 100),
    name: 'Nome',
  });
  p = createMarking(p, {
    id: 'MI',
    imageId: 'I1',
    rect: rect(100, 400, 800, 100),
    name: 'Idade',
  });
  p = createMarking(p, {
    id: 'ME',
    imageId: 'I1',
    rect: rect(100, 550, 800, 100),
    name: 'E-mail',
  });
  p = createMarking(p, {
    id: 'MC',
    imageId: 'I1',
    rect: rect(100, 700, 800, 100),
    name: 'Cadastrar',
  });

  p = addAnnotation(p, {
    id: 'AU',
    markingId: 'MF',
    layerId: 'LM',
    name: 'User',
    entries: [
      { id: 'EN', key: 'name', value: 'string' },
      { id: 'EA', key: 'age', value: 'number' },
    ],
  });
  p = typed(p, 'AC', 'MF', 'modelo-dados', 'classe', {
    nome: 'Contato',
    revisadoEm: '2026-10-02',
  });
  p = addTableRow(p, 'AC', 'atributos', 'R1');
  p = setTableCell(p, 'AC', 'atributos', 'R1', 'nome', 'email');
  p = setTableCell(p, 'AC', 'atributos', 'R1', 'tipo', 'String');
  p = setTableCell(p, 'AC', 'atributos', 'R1', 'exemplo', 'ana@exemplo.com');

  p = typed(p, 'AIN', 'MN', 'sdui', 'input', {
    id: 'input_nome',
    dado: { annotationId: 'AU', entryId: 'EN' },
  });
  p = typed(p, 'AII', 'MI', 'sdui', 'input', {
    id: 'input_idade',
    tipo: 'number',
    dado: { annotationId: 'AU', entryId: 'EA' },
  });
  p = typed(p, 'AIE', 'ME', 'sdui', 'input', {
    id: 'input_email',
    tipo: 'email',
    obrigatorio: 'sim',
    dado: { annotationId: 'AC', key: 'atributos', rowId: 'R1' },
  });
  p = typed(p, 'AB', 'MC', 'sdui', 'button', { id: 'btn_cadastrar', texto: 'Cadastrar' });
  p = typed(p, 'AT', 'MT', 'sdui', 'text', { conteudo: 'Crie sua conta' });

  p = typed(
    p,
    'AOC',
    'MC',
    'sdui',
    'onClick',
    { acao: 'submit', destino: '/usuarios' },
    'AB',
  );
  p = addTableRow(p, 'AOC', 'parametros', 'RP1');
  p = setTableCell(p, 'AOC', 'parametros', 'RP1', 'nome', 'origem');
  p = setTableCell(p, 'AOC', 'parametros', 'RP1', 'valor', 'cadastro');
  p = typed(p, 'AOH', 'MC', 'sdui', 'onHold', { acao: 'track' }, 'AB');
  p = typed(
    p,
    'AOE',
    'ME',
    'sdui',
    'onChange',
    { acao: 'validate', regra: 'email' },
    'AIE',
  );
  p = typed(p, 'AE', 'MF', 'modelo-dados', 'endpoint', {
    metodo: 'POST',
    path: '/v1/usuarios',
    request: 'User',
    response: 'User',
  });
  return p;
}

/** `repo` que a especialização SDUI declara para `android` nos testes de código. */
export const ANDROID_REPO = {
  url: 'https://github.com/org/app-android',
  urlTemplate: 'https://github.com/org/app-android/blob/main/{path}#L{line}',
  ref: 'v1.2.0',
} as const;

/** O projeto com o `repo` dado na plataforma da especialização aplicada (vira `formatVersion` 5). */
export function withSpecRepo(
  p: Project,
  specId: string,
  platformId: string,
  repo: { url: string; urlTemplate?: string; ref?: string },
): Project {
  return {
    ...p,
    specializations: p.specializations.map((s) =>
      s.id === specId && s.spec
        ? {
            ...s,
            spec: {
              ...s.spec,
              formatVersion: 5,
              platforms: (s.spec.platforms ?? []).map((platform) =>
                platform.id === platformId ? { ...platform, repo } : platform,
              ),
            },
          }
        : s,
    ),
  };
}

/** O projeto sem nenhum `repo` nas plataformas das especializações (o exemplo pode declarar). */
export function withoutSpecRepos(p: Project): Project {
  return {
    ...p,
    specializations: p.specializations.map((s) =>
      s.spec?.platforms
        ? {
            ...s,
            spec: {
              ...s.spec,
              platforms: s.spec.platforms.map((platform) => {
                const copy = { ...platform };
                delete copy.repo;
                return copy;
              }),
            },
          }
        : s,
    ),
  };
}

/**
 * `cadastroProject` com o roteiro R3: o Screen `AS` (`Cadastro`, `rota: /cadastro`) no
 * Formulário; a especialização SDUI declara o `repo` de `android` (`ANDROID_REPO`) e o projeto
 * sobrepõe só o clone local (`../../..`).
 */
export function codeProject(): Project {
  let p = typed(cadastroProject(), 'AS', 'MF', 'sdui', 'screen', {
    nome: 'Cadastro',
    rota: '/cadastro',
  });
  p = withSpecRepo(withoutSpecRepos(p), 'sdui', 'android', ANDROID_REPO);
  p = setPlatformRepo(p, 'android', { localPath: '../../..' });
  return p;
}

/** Campo de código removido na etapa 9, como as especializações antigas o declaravam. */
export const LEGACY_CODE_FIELD = {
  key: 'implementacao',
  label: 'implementação',
  type: 'codeRef',
} as const;

/** Valor do campo removido no Screen `AS` de um projeto v8 (duas entradas). */
export const LEGACY_CODE_VALUE = [
  {
    _id: 'C1',
    platform: 'android',
    path: 'app/src/main/java/com/app/cadastro/CadastroScreen.kt',
    symbol: 'CadastroScreen',
    line: null,
  },
  {
    _id: 'C2',
    platform: 'ios',
    path: 'App/Cadastro/CadastroView.swift',
    symbol: 'CadastroView',
    line: 12,
  },
];

/**
 * A cópia do SDUI (texto de `specs/sdui.json`) com o campo removido de volta no Screen e o
 * `repo` de `android` do `codeProject`.
 */
export function legacySduiText(): string {
  const spec = JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'fixtures', 'sdui-v2.json'), 'utf8'),
  ) as {
    formatVersion: number;
    platforms: { id: string; repo?: unknown }[];
    layers: { annotationTypes: { id: string; fields: unknown[] }[] }[];
  };
  const screen = spec.layers
    .flatMap((l) => l.annotationTypes)
    .find((t) => t.id === 'screen');
  if (!screen) throw new Error('Screen não encontrado no exemplo SDUI');
  screen.fields.push(LEGACY_CODE_FIELD);
  spec.formatVersion = 5;
  const android = spec.platforms.find((platform) => platform.id === 'android');
  if (!android) throw new Error('android não encontrado no exemplo SDUI');
  android.repo = ANDROID_REPO;
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/**
 * Um projeto v8 como a etapa 3b deixava (o `codeProject` com o Screen `AS` preenchido no
 * campo removido) e as cópias de `specs/` com o campo declarado: o que a migração v8 → v9 lê.
 */
export function legacyCodeFiles(p: Project = codeProject()): {
  readonly text: string;
  readonly specs: Map<string, string>;
} {
  const data = JSON.parse(serialize(p)) as {
    annotations: { id: string; values: Record<string, unknown> | null }[];
  };
  const screen = data.annotations.find((a) => a.id === 'AS');
  if (!screen?.values) throw new Error('Screen AS não encontrado');
  screen.values.implementacao = LEGACY_CODE_VALUE;
  const text = `${JSON.stringify({ ...data, schemaVersion: 8 }, null, 2)}\n`;
  const specs = specFiles(p);
  specs.set('specs/sdui.json', legacySduiText());
  return { text, specs };
}
