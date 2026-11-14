import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addAnnotation,
  addContainer,
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

// pt-BR kept: shared fixture data asserted by tests/mcp, tests/components, tests/store, tests/storage, tests/app and tests/model (Portuguese marking names, field keys and values, layer ids)

export function loadExample(name: 'sdui' | 'modelo-de-dados' | 'papeis-migracao'): Spec {
  // From the project root: in the jsdom environment, `import.meta.url` is not `file:`.
  const text = readFileSync(
    join(process.cwd(), 'examples', 'specs', `${name}.json`),
    'utf8',
  );
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/**
 * The SDUI as it was before `repo` (formatVersion 2, version 2; `tests/fixtures/sdui-v2.json`): the
 * base of the test projects from before the instantiation code and of the updates to the
 * current version. The real example is `loadExample('sdui')`.
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

/** Predictable id generator: `prefix1`, `prefix2`… */
export function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Id of the project layer created from the specialization's layer. */
export function layerOf(p: Project, specId: string, specLayerId: string): string {
  const layer = projectLayerFor(p, specId, specLayerId);
  if (!layer) throw new Error(`layer ${specId}/${specLayerId} not found`);
  return layer.id;
}

/** Project with the free layer Model and the two specializations applied (step 1 of 13.9). */
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
 * Sign-up screen of the 13.9 script (steps 2 to 7): Formulário › Nome, Idade,
 * E-mail, Cadastrar; and Título. Annotations:
 * - AU (Model, free, Formulário): User with EN `name: string` and EA `age: number`;
 * - AC (Classe, Formulário): Contato, with the row R1 `email` in `atributos`;
 * - AIN/AII/AIE: Inputs with `dado` → User.name, User.age and Contato.email;
 * - AB: Button of Cadastrar, with AOC (onClick) and AOH (onHold) linked;
 * - AT: Text of the Título with an empty `id` (incomplete);
 * - AOE: onChange of the E-mail; AE: Endpoint on the Formulário.
 */
export function cadastroProject(): Project {
  let p = specProject();
  p = addContainer(p, {
    id: 'I1',
    file: 'images/cadastro.png',
    width: 1000,
    height: 2000,
  });
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  p = createMarking(p, {
    id: 'MT',
    containerId: 'I1',
    rect: rect(100, 50, 800, 100),
    name: 'Título',
  });
  p = createMarking(p, {
    id: 'MF',
    containerId: 'I1',
    rect: rect(50, 200, 900, 1200),
    name: 'Formulário',
  });
  p = createMarking(p, {
    id: 'MN',
    containerId: 'I1',
    rect: rect(100, 250, 800, 100),
    name: 'Nome',
  });
  p = createMarking(p, {
    id: 'MI',
    containerId: 'I1',
    rect: rect(100, 400, 800, 100),
    name: 'Idade',
  });
  p = createMarking(p, {
    id: 'ME',
    containerId: 'I1',
    rect: rect(100, 550, 800, 100),
    name: 'E-mail',
  });
  p = createMarking(p, {
    id: 'MC',
    containerId: 'I1',
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

/** `repo` that the SDUI specialization declares for `android` in the code tests. */
export const ANDROID_REPO = {
  url: 'https://github.com/org/app-android',
  urlTemplate: 'https://github.com/org/app-android/blob/main/{path}#L{line}',
  ref: 'v1.2.0',
} as const;

/** The project with the given `repo` on the applied specialization's platform (becomes `formatVersion` 5). */
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

/** The project without any `repo` on the specializations' platforms (the example may declare one). */
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
 * `cadastroProject` with the R3 script: the Screen `AS` (`Cadastro`, `rota: /cadastro`) on the
 * Formulário; the SDUI specialization declares the `repo` of `android` (`ANDROID_REPO`) and the
 * project overrides only the local clone (`../../..`).
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

/** Code field removed in stage 9, as the old specializations declared it. */
export const LEGACY_CODE_FIELD = {
  key: 'implementacao',
  label: 'implementação',
  type: 'codeRef',
} as const;

/** Value of the removed field on the Screen `AS` of a v8 project (two entries). */
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
 * The SDUI copy (text of `specs/sdui.json`) with the removed field put back on the Screen and the
 * `repo` of `android` from `codeProject`.
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
  if (!screen) throw new Error('Screen not found in the SDUI example');
  screen.fields.push(LEGACY_CODE_FIELD);
  spec.formatVersion = 5;
  const android = spec.platforms.find((platform) => platform.id === 'android');
  if (!android) throw new Error('android not found in the SDUI example');
  android.repo = ANDROID_REPO;
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/**
 * A v8 project as stage 3b left it (the `codeProject` with the Screen `AS` filled in the removed
 * field) and the copies of `specs/` with the field declared: what the v8 → v9 migration reads.
 */
export function legacyCodeFiles(p: Project = codeProject()): {
  readonly text: string;
  readonly specs: Map<string, string>;
} {
  const data = JSON.parse(serialize(p)) as {
    annotations: { id: string; values: Record<string, unknown> | null }[];
  };
  const screen = data.annotations.find((a) => a.id === 'AS');
  if (!screen?.values) throw new Error('Screen AS not found');
  screen.values.implementacao = LEGACY_CODE_VALUE;
  const text = `${JSON.stringify({ ...data, schemaVersion: 8 }, null, 2)}\n`;
  const specs = specFiles(p);
  specs.set('specs/sdui.json', legacySduiText());
  return { text, specs };
}
