import { z } from 'zod';
import { isValidCodePath, isValidUrlTemplate } from './codeLocations';
import { MAX_CONTAINER_SIZE } from './containers';
import { parseOrigins, parsePath, type Origin } from './components/origin';
import { isPackagePath, packagePathProblem } from './packagePaths';
import { childSets } from './specChildren';

export { isPackagePath };

// Formato da especialização (`formatVersion` 1 a 12), ver docs/SPEC-FORMAT.md. A versão 2 acrescenta `platforms` e `code`; a
// versão 1 é a 2 sem plataformas e sem `code`; a versão 3 é a 2 mais `sources` (origens
// externas nos tipos e nos campos, inclusive nas colunas de `table`); a versão 4 é a 3 mais a
// biblioteca: o pacote (pasta da especialização) com `component`, `doc` e `examples` nos
// tipos, `fonts`, `origins` (origens executáveis, com `slot`, `ignore` e `path` nas `sources`)
// e `migrations` (o contrato de versão); a versão 5 é a 4 mais `repo` em `platforms[]` (o
// repositório da biblioteca na plataforma, onde estão os arquivos citados nos `path` do `code`);
// a versão 6 é a 5 mais `containers` (presets de tamanho do diálogo Novo container); a versão 7
// é a 6 mais `floating` no tipo (a instância é uma marcação flutuante, como uma nota),
// `appliesTo` no tipo (onde a anotação se aplica: marcação, seta ou ambas) e `ref` como tipo
// de coluna de `table` (a lista de referências como dado, ME4); a versão 8 é a 7 mais
// `suggestions` e `linkedRef` em campo e coluna `string` (vocabulário sugerido ao digitar, sem
// restringir o valor; `linkedRef` liga o texto a um campo/coluna `ref` do mesmo tipo/tabela); a
// versão 9 é a 8 mais `variants` na entrada de `code` (um campo `enum` do tipo escolhe, por
// valor, o composable/classe/arquivo: `resolveCode` em `codeVariants.ts` aplica o caso); a
// versão 10 é a 9 mais `notices` (avisos `removed`, `deprecated`, `diverges` ou `pending` no
// tipo, no campo e na coluna de `table`: informam, não geram pendência; ver `notices.ts`); a
// versão 11 é a 10 mais os filhos por camada e grupo (`allowedChildren` aceita cláusulas
// `{ layer, groups? }` e a camada e o tipo têm `groups`; o resolvedor é `specChildren.ts`), os
// papéis no vínculo (`childRoles` e `childRolesLabel`) e o documento em repositório externo
// (`docRepos` na raiz e `doc` como objeto `{ repo, path }`); a versão 12 é a 11 mais os passos
// de papel em `migrations` (`rename-role`, `remove-role` e `set-role`).
// O zod daqui é a fonte da verdade; `docs/spec.schema.json` o espelha para quem
// não usa TypeScript. Sem APIs de navegador: reutilizável pelo servidor MCP.
//
// Campo removido (etapa 9, schema v9 do projeto): o tipo de campo `REMOVED_FIELD_TYPE` (onde
// a instância foi implementada) saiu do formato. Um arquivo antigo que o declara continua
// válido: o campo é lido e ignorado (sai do tipo, e os `params` do `code` que o citam também),
// e quem importa recebe a lista em `ignored` para avisar (`specWarnings`).

export const SPEC_FORMAT = 'mapping-spec';
/** Valor usado antes do renome do produto: a importação ainda o aceita. */
export const LEGACY_SPEC_FORMAT = 'mapeador-spec';
/** Versão atual do formato (a que a documentação e os exemplos novos usam). */
export const SPEC_FORMAT_VERSION = 12;
/** Versões aceitas na importação. */
export const SPEC_FORMAT_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type SpecFormatVersion = (typeof SPEC_FORMAT_VERSIONS)[number];

export type SimpleFieldType = 'string' | 'number' | 'date' | 'enum';
export type FieldType = SimpleFieldType | 'table' | 'ref';

/** Tipo de campo que saiu do formato na etapa 9: lido e ignorado (ver o cabeçalho). */
export const REMOVED_FIELD_TYPE = 'codeRef';

/** Campo de um tipo removido do formato, ignorado na leitura. */
export interface IgnoredSpecField {
  /** Caminho do campo no arquivo (ex: `layers[3].annotationTypes[0].fields[2]`). */
  readonly path: string;
  readonly typeId: string;
  readonly key: string;
}

/**
 * Repositório da biblioteca numa plataforma (só `formatVersion` 5): onde estão os arquivos
 * citados nos `path` do `code`.
 */
export interface SpecRepo {
  /** Endereço do repositório (`http(s)://`). */
  url: string;
  /** Modelo do endereço de um arquivo, com `{path}` (e `{line}` opcional); sem ele, sem link. */
  urlTemplate?: string;
  /** Revisão (tag, branch ou commit) a que o `code` corresponde; informativa. */
  ref?: string;
}

/** Plataforma declarada pela especialização: um alvo de código (um app, o BFF). */
export interface SpecPlatform {
  id: string;
  name: string;
  /** Informativo: ajuda o agente a saber em que linguagem o código está. */
  language?: string;
  /** Repositório da biblioteca nessa plataforma (só `formatVersion` 5). */
  repo?: SpecRepo;
}

/**
 * O que um valor da variante muda no `code` (só `formatVersion` 9): `symbol`, `path` e `notes`
 * substituem os da base; `params` e `values` se somam aos da base, chave por chave.
 */
export interface SpecCodeCase {
  symbol?: string;
  path?: string;
  params?: Record<string, string>;
  values?: Record<string, Record<string, string>>;
  notes?: string;
}

/** Um campo `enum` do tipo escolhe, por valor, o caso aplicado sobre a base do `code`. */
export interface SpecCodeVariants {
  /** Chave de um campo `enum` do tipo (nível de cima, nunca coluna de `table`). */
  field: string;
  /** Valor do campo (uma das `options`) → o que muda. */
  cases: Record<string, SpecCodeCase>;
}

/** Com que código se cria uma instância do tipo de anotação em uma plataforma. */
export interface SpecCode {
  /** O que se chama para criar a instância: composable, view, classe ou a função que gera o nó. */
  symbol: string;
  /**
   * Arquivo que define o símbolo, relativo à raiz do repositório da plataforma (sem
   * linha). Vira link pelo `urlTemplate` e caminho local pelo `localPath` do repositório.
   */
  path?: string;
  /** Chave do campo do tipo → nome do parâmetro no código. */
  params?: Record<string, string>;
  /** Chave de um campo `enum` → (valor no mapping → valor no código). */
  values?: Record<string, Record<string, string>>;
  notes?: string;
  /** Variantes por valor de um campo `enum` (só `formatVersion` 9); ver `resolveCode`. */
  variants?: SpecCodeVariants;
}

/** `code` de um tipo de anotação, por id de plataforma. */
export type SpecCodeMap = Record<string, SpecCode>;

/**
 * Elemento de um sistema externo a que um tipo de anotação corresponde (v3), ex:
 * `{ system: "figma", name: "DS/Button" }`. Tem `id`, `name` ou os dois. `slot` e `ignore`
 * (v4) só valem em sistema declarado em `origins`.
 */
export interface SpecTypeSource {
  system: string;
  id?: string;
  name?: string;
  /** Nome do slot do componente que recebe os filhos (v4, sistema executável). */
  slot?: string;
  /** Props aceitas e não desenhadas (v4, sistema executável). */
  ignore?: string[];
}

/**
 * Propriedade de origem de um campo (v3), ex: `{ system: "figma", name: "Style" }`.
 * `values` (só em `enum`) traduz o valor de origem para uma das `options`. Em sistema
 * declarado em `origins` (v4) vale `path` (o caminho do valor nas `props` do nó externo,
 * obrigatório) e `name` é só o nome de exibição; nos demais, `name` é obrigatório e `path`
 * proibido (a obrigatoriedade é regra de validação, não do tipo).
 */
export interface SpecFieldSource {
  system: string;
  name?: string;
  path?: string;
  values?: Record<string, string>;
}

/** Fonte tipográfica do pacote (v4): `file` é um caminho do pacote (`.ttf`, `.otf`, `.woff`, `.woff2`). */
export interface SpecFont {
  family: string;
  file: string;
  /** Inteiro de 100 a 1000 ou faixa `"100 900"`. */
  weight?: number | string;
  style?: 'normal' | 'italic';
}

/**
 * Exemplo de um tipo (v4), em um de dois modos: `values` (valores dos campos do tipo) ou
 * `system` + `file` (o JSON de um nó de um sistema externo declarado em `origins`).
 */
export interface SpecExample {
  name: string;
  description?: string;
  values?: Record<string, string | number | null>;
  system?: string;
  file?: string;
}

/** Passo de migração do contrato de versão (v4); ver `docs/SPEC-FORMAT.md`. */
export type SpecMigrationStep =
  | { op: 'rename-type'; from: string; to: string }
  | { op: 'remove-type'; type: string; mode: 'convert' | 'delete' }
  | { op: 'rename-field'; type: string; from: string; to: string }
  | { op: 'remove-field'; type: string; field: string }
  | { op: 'map-values'; type: string; field: string; values: Record<string, string> }
  | { op: 'fill-field'; type: string; field: string; default: string | number }
  // Passos de papel do vínculo (só `formatVersion` 12); `type` é o tipo do dono.
  | { op: 'rename-role'; type: string; from: string; to: string }
  | { op: 'remove-role'; type: string; role: string; mode: 'clear' | 'unlink' }
  | { op: 'set-role'; type: string; role: string; childType?: string };

/** Como ir da versão `from` do pacote até a `to` (v4). */
export interface SpecMigration {
  from: number;
  to: number;
  steps: SpecMigrationStep[];
}

export interface SpecRefAccepts {
  tags?: string[];
  free?: boolean;
}

/** Tipos de aviso (v10), na ordem de exibição; a gravidade está em `notices.ts`. */
export const SPEC_NOTICE_KINDS = [
  'removed',
  'deprecated',
  'diverges',
  'pending',
] as const;
export type SpecNoticeKind = (typeof SPEC_NOTICE_KINDS)[number];

/** Aviso de um tipo, campo ou coluna (só `formatVersion` 10). */
export interface SpecNotice {
  kind: SpecNoticeKind;
  message: string;
  /** Data real `AAAA-MM-DD` desde quando o aviso vale. */
  since?: string;
  /** Referência livre (issue, ticket, link) que explica o aviso. */
  ref?: string;
}

interface SpecFieldBase {
  key: string;
  label?: string;
  required?: boolean;
  description?: string;
  tags?: string[];
  /** Propriedades de origem (`formatVersion` 3 em diante). */
  sources?: SpecFieldSource[];
  /** Avisos do campo ou da coluna (só `formatVersion` 10). */
  notices?: SpecNotice[];
}

/** Campo simples (e coluna simples): texto, número, data ou enum. */
export type SpecSimpleColumn =
  | (SpecFieldBase & {
      type: 'string';
      default?: string;
      /** Vocabulário sugerido ao digitar (só `formatVersion` 8); não restringe o valor. */
      suggestions?: string[];
      /** Chave de um campo/coluna `ref` irmão cujos alvos também entram na lista (só `formatVersion` 8). */
      linkedRef?: string;
    })
  | (SpecFieldBase & { type: 'number'; default?: number })
  | (SpecFieldBase & { type: 'date'; default?: string })
  | (SpecFieldBase & { type: 'enum'; options: string[]; default?: string });

/**
 * Coluna `ref` de uma `table` (`formatVersion` 7): a célula guarda uma referência a um alvo,
 * com o mesmo `accepts` de um campo `ref`. É dado: não desenha seta.
 */
export type SpecRefColumn = SpecFieldBase & { type: 'ref'; accepts: SpecRefAccepts };

export type SpecColumn = SpecSimpleColumn | SpecRefColumn;

export type SpecField =
  | SpecSimpleColumn
  | (SpecFieldBase & { type: 'table'; columns: SpecColumn[]; rowLabel?: string })
  | SpecRefColumn;

/**
 * Cláusula de `allowedChildren` (só `formatVersion` 11): os tipos da camada `layer`; com `groups`,
 * só os que estão em algum desses grupos da camada.
 */
export interface SpecChildClause {
  layer: string;
  groups?: string[];
}

/** Item de `allowedChildren`: o id de um tipo ou uma cláusula de camada e grupos. */
export type SpecAllowedChild = string | SpecChildClause;

/** Grupo de tipos de uma camada (só `formatVersion` 11): agrupa os tipos num cabeçalho. */
export interface SpecLayerGroup {
  /** Único dentro da camada. */
  id: string;
  name: string;
  description?: string;
}

/** Papel que um filho assume no vínculo com o dono (só `formatVersion` 11). */
export interface SpecChildRole {
  /** Único dentro do tipo. */
  id: string;
  name: string;
  description?: string;
}

/** Repositório onde vivem os documentos externos (só `formatVersion` 11); ver `doc`. */
export interface SpecDocRepo extends SpecRepo {
  /** Id citado por `doc.repo`: `[a-z0-9-]+`, único na especialização. */
  id: string;
}

/** Documento de um tipo que vive em um repositório declarado em `docRepos` (v11). */
export interface SpecDocRef {
  repo: string;
  /** Arquivo `.md` relativo à raiz do repositório, sem `#`. */
  path: string;
}

export interface SpecAnnotationType {
  id: string;
  name: string;
  description?: string;
  labelField?: string | null;
  requiresOwner?: boolean;
  /** Ids de tipo e, na `formatVersion` 11, cláusulas de camada e grupos (ver `specChildren.ts`). */
  allowedChildren?: SpecAllowedChild[];
  /** Grupos da própria camada a que o tipo pertence (só `formatVersion` 11). */
  groups?: string[];
  /** Papéis que um filho pode ter no vínculo com este tipo (só `formatVersion` 11). */
  childRoles?: SpecChildRole[];
  /** Rótulo do papel na interface; ausente = "Papel" (só `formatVersion` 11, com `childRoles`). */
  childRolesLabel?: string;
  fields: SpecField[];
  code?: SpecCodeMap;
  /** Elementos de origem a que o tipo corresponde (`formatVersion` 3 em diante). */
  sources?: SpecTypeSource[];
  /** Caminho do pacote do componente `.json` que desenha o tipo (só `formatVersion` 4). */
  component?: string;
  /**
   * Documento `.md` do tipo: um caminho do pacote (`formatVersion` 4 em diante) ou, na
   * `formatVersion` 11, `{ repo, path }` de um repositório declarado em `docRepos`.
   */
  doc?: string | SpecDocRef;
  /** Exemplos do tipo (só `formatVersion` 4). */
  examples?: SpecExample[];
  /**
   * A instância do tipo é uma marcação **flutuante** (só `formatVersion` 7): vive no canvas,
   * fora da árvore de pertencimento, e é desenhada acima de tudo. Ausente = `false`.
   */
  floating?: boolean;
  /**
   * Onde a anotação se aplica (só `formatVersion` 7): `marking` (padrão), `arrow` ou ambos.
   * Um tipo só de seta não tem `component` nem `floating`: a seta não tem desenho de componente.
   */
  appliesTo?: SpecAppliesTo[];
  /** Avisos do tipo (só `formatVersion` 10). */
  notices?: SpecNotice[];
}

/** Itens a que um tipo de anotação se aplica (ME4, decisão 14). */
export type SpecAppliesTo = 'marking' | 'arrow';
export const SPEC_APPLIES_TO: readonly SpecAppliesTo[] = ['marking', 'arrow'];

/**
 * O tipo se aplica a esse item? Sem `appliesTo` (ou na especialização antiga), só a
 * marcação; um tipo declarado só para a seta não se aplica à marcação.
 */
export function typeAppliesTo(
  type: Pick<SpecAnnotationType, 'appliesTo'>,
  kind: SpecAppliesTo,
): boolean {
  return (type.appliesTo ?? ['marking']).includes(kind);
}

/** Preset de container da especialização (só `formatVersion` 6): tamanho e fundo iniciais. */
export interface SpecContainer {
  /** `[a-z0-9-]+`, único na especialização. */
  id: string;
  name: string;
  /** Pixels, inteiro de 1 a `MAX_CONTAINER_SIZE`. */
  width: number;
  height: number;
  /** `#RRGGBB`; ausente = branco. */
  background?: string;
}

export interface SpecLayer {
  id: string;
  name: string;
  color: string;
  /** Grupos de tipos da camada, na ordem dos cabeçalhos (só `formatVersion` 11). */
  groups?: SpecLayerGroup[];
  annotationTypes: SpecAnnotationType[];
}

export interface Spec {
  format: typeof SPEC_FORMAT | typeof LEGACY_SPEC_FORMAT;
  formatVersion: SpecFormatVersion;
  id: string;
  name: string;
  version: number;
  description?: string;
  platforms?: SpecPlatform[];
  /** Repositórios dos documentos externos (só `formatVersion` 11). */
  docRepos?: SpecDocRepo[];
  /** Presets do diálogo Novo container (só `formatVersion` 6). */
  containers?: SpecContainer[];
  layers: SpecLayer[];
  /** Fontes do pacote (só `formatVersion` 4). */
  fonts?: SpecFont[];
  /** Origens executáveis, validadas por `parseOrigins` (só `formatVersion` 4). */
  origins?: Origin[];
  /** Contrato de versão (só `formatVersion` 4). */
  migrations?: SpecMigration[];
}

const KEY_RE = /^[A-Za-z0-9_]+$/;
const TAG_RE = /^[a-z0-9-]+$/;
/** Formato do id de uma plataforma (`platforms[].id`, chaves de `code` e de `platformRepos`). */
export const PLATFORM_ID_RE = /^[a-z0-9-]+$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const nonEmpty = z.string().min(1, 'não pode ser vazio');
const color = z.string().regex(COLOR_RE, 'cor inválida; use o formato #RRGGBB');
const tag = z.string().regex(TAG_RE, 'etiqueta inválida; use [a-z0-9-]+');
const tags = z.array(tag);

const key = z
  .string()
  .regex(KEY_RE, 'chave inválida; use apenas [A-Za-z0-9_], sem espaços')
  .refine((k) => !k.startsWith('_'), 'chave não pode começar com "_" (reservado)');

const platformId = z
  .string()
  .regex(PLATFORM_ID_RE, 'id de plataforma inválido; use [a-z0-9-]+');

// O tipo removido ainda é aceito aqui para o campo ser lido e ignorado (`dropRemovedFields`).
const fieldType = z.enum(
  ['string', 'number', 'date', 'enum', 'table', 'ref', REMOVED_FIELD_TYPE],
  {
    error: (issue) =>
      typeof issue.input === 'string'
        ? `"${issue.input}" inválido; use "string", "number", "date", "enum", "table" ou "ref"`
        : 'obrigatório',
  },
);

/** `true` para uma data existente no formato ISO `AAAA-MM-DD`. */
export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const dateString = z
  .string()
  .regex(DATE_RE, 'data inválida; use AAAA-MM-DD')
  .refine(isIsoDate, 'data inexistente');

/** Caminho de arquivo do pacote com a extensão (ou uma das extensões) dada. */
function packagePath(ext: string | readonly string[]) {
  return z.string({ error: () => 'deve ser texto' }).superRefine((path, ctx) => {
    const problem = packagePathProblem(path, ext);
    if (problem !== undefined) ctx.addIssue({ code: 'custom', message: problem });
  });
}

const typeSourceShape = z
  .object({
    system: nonEmpty,
    id: nonEmpty.optional(),
    name: nonEmpty.optional(),
    slot: nonEmpty.optional(),
    ignore: z.array(nonEmpty).optional(),
  })
  .strict()
  .refine((s) => s.id !== undefined || s.name !== undefined, 'precisa de "id" ou "name"');

// `name` e `path` são opcionais aqui; qual é obrigatório depende de o `system` estar em
// `origins` (regra cruzada, `checkFieldSources`).
const fieldSourceShape = z
  .object({
    system: nonEmpty,
    name: nonEmpty.optional(),
    path: nonEmpty.optional(),
    values: z.record(z.string(), nonEmpty).optional(),
  })
  .strict();

const acceptsSchema = z
  .object({ tags: tags.optional(), free: z.boolean().optional() })
  .strict()
  .refine(
    (a) => (a.tags?.length ?? 0) > 0 || a.free === true,
    'precisa de pelo menos uma etiqueta ou "free": true',
  );

const noticeShape = z
  .object({
    kind: z.enum(SPEC_NOTICE_KINDS, {
      error: (issue) =>
        issue.input === undefined
          ? 'obrigatório'
          : typeof issue.input === 'string'
            ? `"${issue.input}" inválido; use "removed", "deprecated", "diverges" ou "pending"`
            : 'deve ser "removed", "deprecated", "diverges" ou "pending"',
    }),
    message: z
      .string({
        error: (issue) => (issue.input === undefined ? 'obrigatório' : 'deve ser texto'),
      })
      .refine((m) => m.trim() !== '', 'não pode ser vazio'),
    since: dateString.optional(),
    ref: nonEmpty.optional(),
  })
  .strict();

const noticesShape = z.array(noticeShape);

/** Dois avisos com o mesmo `kind` e a mesma `message` no mesmo `notices` (v10). */
function checkNotices(
  notices: readonly { kind: string; message: string }[] | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const seen = new Set<string>();
  (notices ?? []).forEach((notice, i) => {
    const id = `${notice.kind}\u0000${notice.message}`;
    if (seen.has(id)) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'notices', i],
        message: 'aviso repetido',
      });
    }
    seen.add(id);
  });
}

/** Forma de um campo (coluna ou campo de nível superior); regras cruzadas ficam adiante. */
const fieldShape = z
  .object({
    key,
    label: z.string().min(1).optional(),
    type: fieldType,
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    options: z.array(z.string()).optional(),
    suggestions: z.array(z.string()).optional(),
    linkedRef: z.string().optional(),
    columns: z.array(z.unknown()).optional(),
    tags: tags.optional(),
    rowLabel: z.string().optional(),
    accepts: acceptsSchema.optional(),
    // Só existia no tipo removido: aceito nele (que é ignorado) e recusado nos outros.
    platforms: z.unknown().optional(),
    description: z.string().optional(),
    sources: z.array(fieldSourceShape).optional(),
    notices: noticesShape.optional(),
  })
  .strict();

type RawField = z.infer<typeof fieldShape>;

/**
 * Por que `value` não serve como valor de um campo do tipo `type` (o `default` de um campo, o
 * `default` de um passo `fill-field`, o valor de um exemplo); `undefined` se serve.
 */
function valueProblem(
  type: RawField['type'],
  options: readonly string[] | undefined,
  value: unknown,
): string | undefined {
  switch (type) {
    case 'string':
      return typeof value === 'string' ? undefined : 'deve ser texto';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? undefined
        : 'deve ser número';
    case 'date':
      return dateString.safeParse(value).success
        ? undefined
        : 'deve ser uma data AAAA-MM-DD válida';
    case 'enum':
      return typeof value === 'string' && (options ?? []).includes(value)
        ? undefined
        : 'deve ser uma das options';
    case 'table':
      return 'não existe para table';
    case 'ref':
      return 'não existe para ref';
    default:
      return undefined;
  }
}

const MAX_SUGGESTIONS = 200;

/** `suggestions` (v8): lista não vazia, até 200 textos únicos, não vazios e sem espaço nas pontas. */
function checkSuggestions(
  suggestions: readonly string[],
  add: (sub: string, message: string) => void,
): void {
  if (suggestions.length === 0) {
    add('suggestions', 'não pode ser vazio; tire a chave ou liste ao menos uma sugestão');
    return;
  }
  if (suggestions.length > MAX_SUGGESTIONS) {
    add('suggestions', `no máximo ${MAX_SUGGESTIONS} sugestões`);
  }
  if (suggestions.some((x) => x === ''))
    add('suggestions', 'sugestões não podem ser vazias');
  if (suggestions.some((x) => x !== x.trim())) {
    add('suggestions', 'sugestões não podem ter espaço no começo nem no fim');
  }
  if (new Set(suggestions).size !== suggestions.length) {
    add('suggestions', 'sugestões repetidas');
  }
}

/** Valida um campo; `column` = dentro de `table` (tipos simples e `ref`, nunca `table`). */
function checkField(
  field: RawField,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  column: boolean,
  siblings: ReadonlyMap<string, string>,
): void {
  const add = (sub: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, sub], message });
  const add2 = (sub: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, ...sub], message });

  const { type } = field;
  if (column && (type === 'table' || type === REMOVED_FIELD_TYPE)) {
    add(
      'type',
      `"${type}" não é permitido dentro de table; use "string", "number", "date", "enum" ou "ref"`,
    );
    return;
  }
  // Tipo removido: o campo é ignorado inteiro (com um aviso de quem importa), sem conferir nada.
  if (type === REMOVED_FIELD_TYPE) return;
  checkNotices(field.notices, ctx, path);
  if (type === 'enum') {
    const options = field.options;
    if (!options || options.length === 0) {
      add('options', 'obrigatório e não vazio em enum');
    } else {
      if (options.some((o) => o === '')) add('options', 'opções não podem ser vazias');
      if (new Set(options).size !== options.length) add('options', 'opções repetidas');
    }
  } else if (field.options !== undefined) {
    add('options', 'só é permitido em enum');
  }

  if (field.suggestions !== undefined) {
    if (type !== 'string') {
      add('suggestions', 'só é permitido em campo ou coluna string');
    } else {
      checkSuggestions(field.suggestions, add);
    }
  }

  if (field.linkedRef !== undefined) {
    if (type !== 'string') {
      add('linkedRef', 'só é permitido em campo ou coluna string');
    } else {
      const target = siblings.get(field.linkedRef);
      const where = column ? 'uma coluna da tabela' : 'um campo do tipo';
      if (target === undefined) {
        add('linkedRef', `"${field.linkedRef}" não é ${where}`);
      } else if (target !== 'ref') {
        add(
          'linkedRef',
          `"${field.linkedRef}" deve ser ${column ? 'uma coluna' : 'um campo'} ref`,
        );
      }
    }
  }

  if (type !== 'table') {
    if (field.columns !== undefined) add('columns', 'só é permitido em table');
    if (field.rowLabel !== undefined) add('rowLabel', 'só é permitido em table');
  }
  if (type !== 'ref' && field.accepts !== undefined) {
    add('accepts', 'só é permitido em ref');
  }
  if (field.platforms !== undefined) {
    add('platforms', 'não é permitido neste tipo de campo');
  }

  if (field.default !== undefined) {
    const problem = valueProblem(type, field.options, field.default);
    if (problem !== undefined) add('default', problem);
  }

  if (type === 'ref') {
    if (!field.accepts) add('accepts', 'obrigatório em ref');
    if (field.tags !== undefined) add('tags', 'ref não pode ter etiquetas');
  }
  (field.sources ?? []).forEach((source, i) => {
    if (source.values === undefined) return;
    if (type !== 'enum') {
      add2(['sources', i, 'values'], 'só é permitido em campos enum');
      return;
    }
    for (const [from, to] of Object.entries(source.values)) {
      if (!(field.options ?? []).includes(to)) {
        add2(['sources', i, 'values', from], `"${to}" não está nas options`);
      }
    }
  });

  if (type === 'table' && column) return;
  if (column && field.tags !== undefined) {
    add('tags', 'colunas não têm etiquetas; use "tags" na table');
  }
}

/** Valida e normaliza os campos de um tipo (inclusive colunas de table). */
function checkFields(
  fields: RawField[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const seen = new Set<string>();
  const siblings = new Map(fields.map((f) => [f.key, f.type as string]));
  fields.forEach((field, i) => {
    const p = [...path, i];
    if (seen.has(field.key)) {
      ctx.addIssue({
        code: 'custom',
        path: [...p, 'key'],
        message: `chave "${field.key}" repetida`,
      });
    }
    seen.add(field.key);
    checkField(field, ctx, p, false, siblings);

    if (field.type !== 'table') return;
    const cols = field.columns;
    if (!cols || cols.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: [...p, 'columns'],
        message: 'obrigatório e não vazio em table',
      });
      return;
    }
    const colSeen = new Set<string>();
    const colTypes = new Map<string, string>();
    const colSiblings = new Map<string, string>();
    for (const raw of cols) {
      if (isRecord(raw) && typeof raw.key === 'string' && typeof raw.type === 'string') {
        colSiblings.set(raw.key, raw.type);
      }
    }
    cols.forEach((raw, j) => {
      const cp = [...p, 'columns', j];
      const parsed = fieldShape.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: [...cp, ...issue.path],
            message: issue.message,
          });
        }
        return;
      }
      const col = parsed.data;
      if (colSeen.has(col.key)) {
        ctx.addIssue({
          code: 'custom',
          path: [...cp, 'key'],
          message: `chave "${col.key}" repetida`,
        });
      }
      colSeen.add(col.key);
      colTypes.set(col.key, col.type);
      checkField(col, ctx, cp, true, colSiblings);
    });

    if ((field.tags?.length ?? 0) > 0) {
      if (field.rowLabel === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [...p, 'rowLabel'],
          message: 'obrigatório em table com tags',
        });
      }
    }
    if (field.rowLabel !== undefined && colTypes.get(field.rowLabel) !== 'string') {
      ctx.addIssue({
        code: 'custom',
        path: [...p, 'rowLabel'],
        message: `"${field.rowLabel}" deve ser uma coluna string da tabela`,
      });
    }
  });
}

const codePathShape = z
  .string({ error: () => 'deve ser texto' })
  .min(1, 'não pode ser vazio')
  .refine(isValidCodePath, {
    error:
      'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: app/src/Main.kt)',
  });

const codeCaseShape = z
  .object({
    symbol: z
      .string({ error: () => 'deve ser texto' })
      .min(1, 'não pode ser vazio')
      .optional(),
    path: codePathShape.optional(),
    params: z.record(z.string(), nonEmpty).optional(),
    values: z.record(z.string(), z.record(z.string(), nonEmpty)).optional(),
    notes: z.string().optional(),
  })
  .strict();

const codeVariantsShape = z
  .object({
    field: z
      .string({
        error: (issue) => (issue.input === undefined ? 'obrigatório' : 'deve ser texto'),
      })
      .min(1, 'não pode ser vazio'),
    cases: z.record(z.string(), codeCaseShape, {
      error: (issue) =>
        issue.input === undefined ? 'obrigatório' : 'deve ser um objeto',
    }),
  })
  .strict();

const codeEntryShape = z
  .object({
    symbol: z
      .string({
        error: (issue) => (issue.input === undefined ? 'obrigatório' : 'deve ser texto'),
      })
      .min(1, 'não pode ser vazio'),
    path: codePathShape.optional(),
    params: z.record(z.string(), nonEmpty).optional(),
    values: z.record(z.string(), z.record(z.string(), nonEmpty)).optional(),
    notes: z.string().optional(),
    variants: codeVariantsShape.optional(),
  })
  .strict();

type RawFieldMap = ReadonlyMap<string, RawField>;

/** `params` e `values` de um trecho do `code` (a base ou um caso) só citam campos e opções do tipo. */
function checkCodeMaps(
  entry: Pick<z.infer<typeof codeCaseShape>, 'params' | 'values'>,
  fields: RawFieldMap,
  base: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  for (const k of Object.keys(entry.params ?? {})) {
    if (!fields.has(k)) add([...base, 'params', k], `"${k}" não é um campo do tipo`);
  }
  for (const [k, translation] of Object.entries(entry.values ?? {})) {
    const field = fields.get(k);
    if (!field) {
      add([...base, 'values', k], `"${k}" não é um campo do tipo`);
      continue;
    }
    if (field.type !== 'enum') {
      add([...base, 'values', k], `"${k}" deve ser um campo enum do tipo`);
      continue;
    }
    for (const option of Object.keys(translation)) {
      if (!(field.options ?? []).includes(option)) {
        add([...base, 'values', k, option], `"${option}" não está nas options de "${k}"`);
      }
    }
  }
}

/** `variants`: o campo é um `enum` do tipo, os casos usam as `options` e cada caso muda algo. */
function checkCodeVariants(
  variants: z.infer<typeof codeVariantsShape>,
  fields: RawFieldMap,
  base: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  const vp = [...base, 'variants'];
  const field = fields.get(variants.field);
  let options: readonly string[] | undefined;
  if (!field) {
    add([...vp, 'field'], `"${variants.field}" não é um campo do tipo`);
  } else if (field.type !== 'enum') {
    add([...vp, 'field'], `"${variants.field}" deve ser um campo enum do tipo`);
  } else {
    options = field.options ?? [];
  }
  const entries = Object.entries(variants.cases);
  if (entries.length === 0) add([...vp, 'cases'], 'declare ao menos um caso');
  for (const [value, kase] of entries) {
    const cp = [...vp, 'cases', value];
    if (options !== undefined && !options.includes(value)) {
      add(cp, `"${value}" não está nas options de "${variants.field}"`);
    }
    if (Object.keys(kase).length === 0) {
      add(cp, 'caso vazio: declare symbol, path, params, values ou notes');
      continue;
    }
    checkCodeMaps(kase, fields, cp, add);
  }
}

/** `params`, `values` e `variants` de cada plataforma do `code` só citam campos (e opções) do tipo. */
function checkCode(
  type: { fields: RawField[]; code?: Record<string, z.infer<typeof codeEntryShape>> },
  ctx: z.RefinementCtx,
): void {
  const fields = new Map(type.fields.map((f) => [f.key, f]));
  const add = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  for (const [platform, entry] of Object.entries(type.code ?? {})) {
    const base = ['code', platform];
    checkCodeMaps(entry, fields, base, add);
    if (entry.variants !== undefined)
      checkCodeVariants(entry.variants, fields, base, add);
  }
}

const exampleShape = z
  .object({
    name: nonEmpty,
    description: z.string().optional(),
    values: z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.null()], {
          error: 'deve ser texto, número ou null',
        }),
      )
      .optional(),
    system: nonEmpty.optional(),
    file: packagePath('.json').optional(),
  })
  .strict();

type RawExample = z.infer<typeof exampleShape>;

/** Nomes únicos, um só modo (`values` ou `system` + `file`) e valores que cabem nos campos. */
function checkExamples(
  type: { fields: RawField[]; examples?: RawExample[] },
  ctx: z.RefinementCtx,
): void {
  const fields = new Map(
    type.fields.filter((f) => f.type !== REMOVED_FIELD_TYPE).map((f) => [f.key, f]),
  );
  const names = new Set<string>();
  (type.examples ?? []).forEach((example, i) => {
    const p = ['examples', i];
    const add = (sub: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path: [...p, ...sub], message });

    if (names.has(example.name)) add(['name'], `nome "${example.name}" repetido`);
    names.add(example.name);

    const external = example.system !== undefined || example.file !== undefined;
    if (example.values !== undefined && external) {
      add([], 'use "values" ou "system" com "file", não os dois modos juntos');
    } else if (example.values === undefined && !external) {
      add([], 'precisa de "values" ou de "system" com "file"');
    } else if (example.values === undefined) {
      if (example.system === undefined) add(['system'], 'obrigatório com "file"');
      if (example.file === undefined) add(['file'], 'obrigatório com "system"');
    }

    for (const [k, value] of Object.entries(example.values ?? {})) {
      const field = fields.get(k);
      if (!field) {
        add(['values', k], `"${k}" não é um campo do tipo`);
      } else if (value === null) {
        continue;
      } else if (field.type === 'table' || field.type === 'ref') {
        add(['values', k], `campo "${field.type}" não aceita valor em exemplo`);
      } else {
        const problem = valueProblem(field.type, field.options, value);
        if (problem !== undefined) add(['values', k], problem);
      }
    }
  });
}

/** `appliesTo`: não vazio, sem repetição; um tipo só de seta não tem `component` nem `floating`. */
function checkAppliesTo(
  type: { appliesTo?: SpecAppliesTo[]; component?: string; floating?: boolean },
  ctx: z.RefinementCtx,
): void {
  const { appliesTo } = type;
  if (appliesTo === undefined) return;
  const add = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  if (appliesTo.length === 0) {
    add(['appliesTo'], 'não pode ser vazio; use "marking", "arrow" ou os dois');
    return;
  }
  if (new Set(appliesTo).size !== appliesTo.length) {
    add(['appliesTo'], 'valores repetidos');
  }
  if (!appliesTo.includes('marking')) {
    if (type.component !== undefined) {
      add(['component'], 'um tipo só de seta não pode ter component');
    }
    if (type.floating !== undefined) {
      add(['floating'], 'um tipo só de seta não pode ter floating');
    }
  }
}

const GROUPS_EMPTY = 'não pode ser vazio; tire a chave ou liste ao menos um grupo';
const ALLOWED_CHILD_SHAPE_MESSAGE =
  'deve ser um id de tipo (texto) ou uma cláusula { layer, groups }';
const DOC_SHAPE_MESSAGE =
  'deve ser texto (arquivo do pacote) ou um objeto { repo, path }';
const DOC_PATH_MESSAGE =
  'caminho inválido: use um caminho relativo à raiz do repositório, com "/", sem "." nem ".." e sem unidade (ex: components/button.md)';

/** Texto obrigatório e não vazio (as mensagens dos objetos novos da v11). */
const requiredText = z
  .string({
    error: (issue) => (issue.input === undefined ? 'obrigatório' : 'deve ser texto'),
  })
  .min(1, 'não pode ser vazio');

const childClauseShape = z
  .object({
    layer: requiredText,
    groups: z.array(nonEmpty, { error: 'deve ser uma lista de ids de grupo' }).optional(),
  })
  .strict();

/** Reemite no `ctx` os problemas de um objeto lido por outro schema, no mesmo caminho relativo. */
/** Propriedade a mais (`.strict()` do zod) em português, no molde dos outros erros da spec. */
function unknownKeysMessage(issue: { readonly keys: readonly string[] }): string {
  return `propriedade desconhecida: ${issue.keys.map((k) => `"${k}"`).join(', ')}`;
}

function forwardIssues(
  result: { success: boolean; error?: { issues: readonly z.core.$ZodIssue[] } },
  ctx: z.RefinementCtx,
): void {
  for (const issue of result.error?.issues ?? []) {
    ctx.addIssue({
      code: 'custom',
      path: [...issue.path],
      message:
        issue.code === 'unrecognized_keys' ? unknownKeysMessage(issue) : issue.message,
    });
  }
}

/** Um item de `allowedChildren`: o id de um tipo ou uma cláusula `{ layer, groups? }`. */
function checkAllowedChild(value: unknown, ctx: z.RefinementCtx): void {
  if (typeof value === 'string') {
    if (value === '') ctx.addIssue({ code: 'custom', message: 'não pode ser vazio' });
    return;
  }
  if (!isRecord(value)) {
    ctx.addIssue({ code: 'custom', message: ALLOWED_CHILD_SHAPE_MESSAGE });
    return;
  }
  const parsed = childClauseShape.safeParse(value);
  forwardIssues(parsed, ctx);
  if (parsed.success && parsed.data.groups?.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['groups'], message: GROUPS_EMPTY });
  }
}

const allowedChildShape = z
  .custom<SpecAllowedChild>()
  .superRefine((value: unknown, ctx) => checkAllowedChild(value, ctx));

/** Por que o `path` não vale como arquivo `.md` de um repositório; `undefined` se vale. */
function docPathProblem(path: string): string | undefined {
  if (path.includes('#')) return 'não pode ter "#" (âncora)';
  if (!isValidCodePath(path)) return DOC_PATH_MESSAGE;
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.length > '.md'.length && base.endsWith('.md')
    ? undefined
    : 'extensão inválida: esperava .md';
}

const docRefShape = z
  .object({
    repo: requiredText,
    path: z
      .string({
        error: (issue) => (issue.input === undefined ? 'obrigatório' : 'deve ser texto'),
      })
      .superRefine((path, ctx) => {
        const problem = docPathProblem(path);
        if (problem !== undefined) ctx.addIssue({ code: 'custom', message: problem });
      }),
  })
  .strict();

const docPackageShape = packagePath('.md');

/** `doc`: um caminho `.md` do pacote ou, na v11, `{ repo, path }` de um repositório de `docRepos`. */
const docShape = z.custom<string | SpecDocRef>().superRefine((value: unknown, ctx) => {
  if (typeof value === 'string') {
    forwardIssues(docPackageShape.safeParse(value), ctx);
  } else if (isRecord(value)) {
    forwardIssues(docRefShape.safeParse(value), ctx);
  } else {
    ctx.addIssue({ code: 'custom', message: DOC_SHAPE_MESSAGE });
  }
});

const childRoleShape = z
  .object({ id: requiredText, name: requiredText, description: z.string().optional() })
  .strict();

const layerGroupShape = z
  .object({ id: requiredText, name: requiredText, description: z.string().optional() })
  .strict();

/** `childRoles` e `childRolesLabel` (v11): papéis não vazios e únicos, só em tipo com filhos. */
function checkChildRoles(
  type: {
    allowedChildren?: readonly unknown[] | undefined;
    childRoles?: readonly { id: string }[] | undefined;
    childRolesLabel?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const add = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });
  const { childRoles } = type;
  if (childRoles === undefined) {
    if (type.childRolesLabel !== undefined) {
      add(['childRolesLabel'], 'só é permitido com childRoles');
    }
    return;
  }
  if ((type.allowedChildren ?? []).length === 0) {
    add(['childRoles'], 'só é permitido em tipo com allowedChildren');
  }
  if (childRoles.length === 0) {
    add(['childRoles'], 'não pode ser vazio; tire a chave ou declare ao menos um papel');
  }
  const seen = new Set<string>();
  childRoles.forEach((role, i) => {
    if (seen.has(role.id)) add(['childRoles', i, 'id'], `id "${role.id}" repetido`);
    seen.add(role.id);
  });
}

/** `groups` de um tipo (v11): não vazio e sem repetição; a existência é conferida na camada. */
function checkTypeGroups(
  groups: readonly string[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (groups === undefined) return;
  if (groups.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['groups'], message: GROUPS_EMPTY });
    return;
  }
  const seen = new Set<string>();
  groups.forEach((group, i) => {
    if (seen.has(group)) {
      ctx.addIssue({
        code: 'custom',
        path: ['groups', i],
        message: `grupo "${group}" repetido`,
      });
    }
    seen.add(group);
  });
}

const annotationTypeShape = z
  .object({
    id: nonEmpty,
    name: nonEmpty,
    description: z.string().optional(),
    labelField: z.string().nullable().optional(),
    requiresOwner: z.boolean().optional(),
    allowedChildren: z.array(allowedChildShape).optional(),
    groups: z.array(nonEmpty).optional(),
    childRoles: z.array(childRoleShape).optional(),
    childRolesLabel: nonEmpty.optional(),
    fields: z.array(fieldShape),
    code: z.record(z.string(), codeEntryShape).optional(),
    sources: z.array(typeSourceShape).optional(),
    component: packagePath('.json').optional(),
    doc: docShape.optional(),
    examples: z.array(exampleShape).optional(),
    floating: z.boolean().optional(),
    appliesTo: z
      .array(
        z.enum(SPEC_APPLIES_TO as [SpecAppliesTo, ...SpecAppliesTo[]], {
          error: (issue) =>
            typeof issue.input === 'string'
              ? `"${issue.input}" inválido; use "marking" ou "arrow"`
              : 'deve ser "marking" ou "arrow"',
        }),
      )
      .optional(),
    notices: noticesShape.optional(),
  })
  .strict()
  .superRefine((type, ctx) => {
    checkNotices(type.notices, ctx, []);
    checkFields(type.fields, ctx, ['fields']);
    checkAppliesTo(type, ctx);
    checkChildRoles(type, ctx);
    checkTypeGroups(type.groups, ctx);
    checkCode(type, ctx);
    checkExamples(type, ctx);
    if (type.labelField != null) {
      const f = type.fields.find((x) => x.key === type.labelField);
      if (!f || f.type !== 'string') {
        ctx.addIssue({
          code: 'custom',
          path: ['labelField'],
          message: `"${type.labelField}" deve ser um campo string do tipo`,
        });
      }
    }
  });

/** Antes da v10, `notices` (no tipo, no campo e na coluna) é erro no caminho exato. */
function checkNoNotices(
  layers: readonly { annotationTypes: readonly RawNoticeHolder[] }[],
  ctx: z.RefinementCtx,
): void {
  const only10 = (path: (string | number)[]) =>
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'notices'],
      message: 'só é permitido com formatVersion 10',
    });
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const typePath = ['layers', li, 'annotationTypes', ti];
      if (type.notices !== undefined) only10(typePath);
      type.fields.forEach((field, fi) => {
        const fieldPath = [...typePath, 'fields', fi];
        if (field.notices !== undefined) only10(fieldPath);
        (field.columns ?? []).forEach((column, ci) => {
          if (isRecord(column) && column.notices !== undefined) {
            only10([...fieldPath, 'columns', ci]);
          }
        });
      });
    });
  });
}

interface RawNoticeHolder {
  notices?: unknown;
  fields: readonly { notices?: unknown; columns?: readonly unknown[] }[];
}

const layerShape = z
  .object({
    id: nonEmpty,
    name: nonEmpty,
    color,
    groups: z.array(layerGroupShape).optional(),
    annotationTypes: z.array(annotationTypeShape),
  })
  .strict();

const repoShape = z
  .object({
    url: z
      .string({
        error: (issue) => (issue.input === undefined ? 'obrigatório' : 'deve ser texto'),
      })
      .regex(/^https?:\/\/\S+$/i, 'deve começar com http:// ou https://, sem espaços'),
    urlTemplate: z
      .string({ error: () => 'deve ser texto' })
      .refine(
        (t) => /^https?:\/\/\S+$/i.test(t),
        'deve começar com http:// ou https://, sem espaços',
      )
      .refine(
        (t) => !/^https?:\/\/\S+$/i.test(t) || isValidUrlTemplate(t),
        'deve conter {path}',
      )
      .optional(),
    ref: nonEmpty.optional(),
  })
  .strict();

const docRepoShape = z
  .object({
    id: requiredText.regex(PLATFORM_ID_RE, 'id de repositório inválido; use [a-z0-9-]+'),
    ...repoShape.shape,
  })
  .strict();

const platformShape = z
  .object({
    id: platformId,
    name: nonEmpty,
    language: nonEmpty.optional(),
    repo: repoShape.optional(),
  })
  .strict();

const containerSide = z
  .number({ error: 'deve ser um número' })
  .int('deve ser inteiro')
  .min(1, 'deve ser >= 1')
  .max(MAX_CONTAINER_SIZE, `deve ser <= ${MAX_CONTAINER_SIZE}`);

const containerShape = z
  .object({
    id: z.string().regex(TAG_RE, 'id de container inválido; use [a-z0-9-]+'),
    name: nonEmpty,
    width: containerSide,
    height: containerSide,
    background: color.optional(),
  })
  .strict();

const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'] as const;
const WEIGHT_MIN = 100;
const WEIGHT_MAX = 1000;
const WEIGHT_RANGE_RE = /^(\d+) (\d+)$/;
const WEIGHT_MESSAGE = `peso inválido; use um inteiro de ${WEIGHT_MIN} a ${WEIGHT_MAX} ou uma faixa "100 900" (o primeiro menor que o segundo)`;

const fontWeight = z.union([z.number(), z.string()], { error: WEIGHT_MESSAGE }).refine(
  (w) => {
    if (typeof w === 'number') {
      return Number.isInteger(w) && w >= WEIGHT_MIN && w <= WEIGHT_MAX;
    }
    const m = WEIGHT_RANGE_RE.exec(w);
    if (!m) return false;
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    return lo >= WEIGHT_MIN && hi <= WEIGHT_MAX && lo < hi;
  },
  { error: WEIGHT_MESSAGE },
);

const fontShape = z
  .object({
    family: nonEmpty,
    file: packagePath(FONT_EXTENSIONS),
    weight: fontWeight.optional(),
    style: z
      .enum(['normal', 'italic'], { error: 'estilo inválido; use "normal" ou "italic"' })
      .optional(),
  })
  .strict();

const migrationVersion = z
  .number({ error: 'deve ser um número' })
  .int('deve ser inteiro');

const migrationStepShape = z.discriminatedUnion(
  'op',
  [
    z.object({ op: z.literal('rename-type'), from: nonEmpty, to: nonEmpty }).strict(),
    z
      .object({
        op: z.literal('remove-type'),
        type: nonEmpty,
        mode: z.enum(['convert', 'delete'], { error: 'use "convert" ou "delete"' }),
      })
      .strict(),
    z
      .object({
        op: z.literal('rename-field'),
        type: nonEmpty,
        from: nonEmpty,
        to: nonEmpty,
      })
      .strict(),
    z.object({ op: z.literal('remove-field'), type: nonEmpty, field: nonEmpty }).strict(),
    z
      .object({
        op: z.literal('map-values'),
        type: nonEmpty,
        field: nonEmpty,
        values: z.record(z.string(), nonEmpty),
      })
      .strict(),
    z
      .object({
        op: z.literal('fill-field'),
        type: nonEmpty,
        field: nonEmpty,
        default: z.union([z.string(), z.number()], { error: 'deve ser texto ou número' }),
      })
      .strict(),
    // Passos de papel do vínculo (só `formatVersion` 12); `type` é o tipo do dono.
    z
      .object({
        op: z.literal('rename-role'),
        type: nonEmpty,
        from: nonEmpty,
        to: nonEmpty,
      })
      .strict(),
    z
      .object({
        op: z.literal('remove-role'),
        type: nonEmpty,
        role: nonEmpty,
        mode: z.enum(['clear', 'unlink'], { error: 'use "clear" ou "unlink"' }),
      })
      .strict(),
    z
      .object({
        op: z.literal('set-role'),
        type: nonEmpty,
        role: nonEmpty,
        childType: nonEmpty.optional(),
      })
      .strict(),
  ],
  {
    error:
      '"op" inválido; use "rename-type", "remove-type", "rename-field", "remove-field", "map-values", "fill-field", "rename-role", "remove-role" ou "set-role"',
  },
);

const migrationShape = z
  .object({
    from: migrationVersion.min(1, 'deve ser >= 1'),
    to: migrationVersion,
    steps: z.array(migrationStepShape).min(1, 'não pode ser vazia'),
  })
  .strict();

type RawLayers = readonly {
  annotationTypes: readonly {
    sources?: readonly z.infer<typeof typeSourceShape>[] | undefined;
    fields: readonly RawField[];
  }[];
}[];

/** `sources` só existe na `formatVersion` 3: aponta cada uso numa versão anterior. */
function checkNoSources(
  layers: readonly {
    annotationTypes: readonly { sources?: unknown; fields: readonly RawField[] }[];
  }[],
  ctx: z.RefinementCtx,
): void {
  const add = (path: (string | number)[]) =>
    ctx.addIssue({ code: 'custom', path, message: 'só é permitido com formatVersion 3' });
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const tp = ['layers', li, 'annotationTypes', ti];
      if (type.sources !== undefined) add([...tp, 'sources']);
      type.fields.forEach((field, fi) => {
        const fp = [...tp, 'fields', fi];
        if (field.sources !== undefined) add([...fp, 'sources']);
        (field.columns ?? []).forEach((column, ci) => {
          if (typeof column === 'object' && column !== null && 'sources' in column) {
            add([...fp, 'columns', ci, 'sources']);
          }
        });
      });
    });
  });
}

type PathKeys = (string | number)[];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Chaves da `formatVersion` 4 nos tipos (`component`, `doc`, `examples`) em versão anterior. */
function checkNoLibraryKeys(
  layers: readonly {
    annotationTypes: readonly {
      component?: unknown;
      doc?: unknown;
      examples?: unknown;
    }[];
  }[],
  ctx: z.RefinementCtx,
): void {
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      for (const k of ['component', 'doc', 'examples'] as const) {
        if (type[k] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['layers', li, 'annotationTypes', ti, k],
            message: 'só é permitido com formatVersion 4',
          });
        }
      }
    });
  });
}

/**
 * `path` de uma origem de campo (`a.b[0].c`): sintaxe válida e sem `[*]`. `undefined` se vale.
 */
function fieldPathProblem(path: string): string | undefined {
  const parsed = parsePath(path);
  if (!parsed.ok) return `caminho inválido "${path}" (${parsed.error})`;
  if (parsed.segments.includes(null)) {
    return `caminho inválido "${path}" ("[*]" só vale em roots[].path de uma origem)`;
  }
  return undefined;
}

/**
 * Regras cruzadas das `sources` de um campo ou coluna (v3 em diante) que dependem de o `system`
 * estar em `origins`: sistema executável pede `path` (e `name` vira só o nome de exibição);
 * os demais pedem `name` e não aceitam `path`.
 */
function checkFieldSources(
  sources: readonly z.infer<typeof fieldSourceShape>[] | undefined,
  path: PathKeys,
  version: number,
  executable: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  (sources ?? []).forEach((source, i) => {
    const at = [...path, 'sources', i];
    const add = (key: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [...at, key], message });
    const isExecutable = version >= 4 && executable.has(source.system);
    if (source.path !== undefined) {
      if (version < 4) add('path', 'só é permitido com formatVersion 4');
      else if (!isExecutable)
        add('path', 'só é permitido em sistema declarado em origins');
      else {
        const problem = fieldPathProblem(source.path);
        if (problem !== undefined) add('path', problem);
      }
    } else if (isExecutable) {
      add('path', 'obrigatório em sistema declarado em origins');
    }
    if (source.name === undefined && !isExecutable) {
      add('name', 'obrigatório em sistema que não está em origins');
    }
  });
}

/** `slot` e `ignore` das `sources` de um tipo: só em sistema declarado em `origins`. */
function checkTypeSources(
  sources: readonly z.infer<typeof typeSourceShape>[] | undefined,
  path: PathKeys,
  version: number,
  executable: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  (sources ?? []).forEach((source, i) => {
    const at = [...path, 'sources', i];
    for (const key of ['slot', 'ignore'] as const) {
      if (source[key] === undefined) continue;
      if (version < 4) {
        ctx.addIssue({
          code: 'custom',
          path: [...at, key],
          message: 'só é permitido com formatVersion 4',
        });
      } else if (!executable.has(source.system)) {
        ctx.addIssue({
          code: 'custom',
          path: [...at, key],
          message: 'só é permitido em sistema declarado em origins',
        });
      }
    }
    const seen = new Set<string>();
    (source.ignore ?? []).forEach((prop, pi) => {
      if (seen.has(prop)) {
        ctx.addIssue({
          code: 'custom',
          path: [...at, 'ignore', pi],
          message: `"${prop}" repetido`,
        });
      }
      seen.add(prop);
    });
  });
}

/** Aplica `checkTypeSources` e `checkFieldSources` (campos e colunas) a todos os tipos. */
function checkSources(
  layers: RawLayers,
  version: number,
  executable: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const tp = ['layers', li, 'annotationTypes', ti];
      checkTypeSources(type.sources, tp, version, executable, ctx);
      type.fields.forEach((field, fi) => {
        const fp = [...tp, 'fields', fi];
        checkFieldSources(field.sources, fp, version, executable, ctx);
        (field.columns ?? []).forEach((raw, ci) => {
          const column = fieldShape.safeParse(raw);
          if (column.success) {
            checkFieldSources(
              column.data.sources,
              [...fp, 'columns', ci],
              version,
              executable,
              ctx,
            );
          }
        });
      });
    });
  });
}

/** O `system` de um exemplo de sistema externo precisa estar em `origins`. */
function checkExampleSystems(
  layers: readonly {
    annotationTypes: readonly { examples?: readonly RawExample[] | undefined }[];
  }[],
  executable: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void {
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      (type.examples ?? []).forEach((example, ei) => {
        if (example.system === undefined || executable.has(example.system)) return;
        ctx.addIssue({
          code: 'custom',
          path: ['layers', li, 'annotationTypes', ti, 'examples', ei, 'system'],
          message: `sistema "${example.system}" não declarado em origins`,
        });
      });
    });
  });
}

/** Texto do peso para a mensagem de fonte repetida. */
function weightLabel(weight: number | string | undefined): string {
  return weight === undefined ? 'sem peso' : `peso ${weight}`;
}

/** Par `family` + `weight` + `style` repetido em `fonts`. */
function checkFonts(
  fonts: readonly z.infer<typeof fontShape>[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  fonts.forEach((font, i) => {
    const style = font.style ?? 'normal';
    const id = JSON.stringify([font.family, font.weight ?? null, style]);
    if (seen.has(id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fonts', i],
        message: `fonte "${font.family}" (${weightLabel(font.weight)}, ${style}) repetida`,
      });
    }
    seen.add(id);
  });
}

/** Coluna `key` de um campo `table` (lida pela mesma forma dos campos); `undefined` se não há. */
function columnOf(table: RawField, key: string): RawField | undefined {
  for (const raw of table.columns ?? []) {
    const parsed = fieldShape.safeParse(raw);
    if (parsed.success && parsed.data.key === key) return parsed.data;
  }
  return undefined;
}

/** A chave de campo de um passo: `key` (nível superior) ou `tabela.coluna`. */
type FieldRef =
  | { kind: 'field' }
  | { kind: 'column'; table: string; column: string }
  | { kind: 'invalid'; message: string };

function parseFieldRef(ref: string): FieldRef {
  const parts = ref.split('.');
  if (parts.length === 1) return { kind: 'field' };
  if (parts.length > 2) {
    return {
      kind: 'invalid',
      message: `"${ref}" tem mais de um ponto; use "campo" ou "tabela.coluna"`,
    };
  }
  const [table = '', column = ''] = parts;
  if (table === '' || column === '') {
    return {
      kind: 'invalid',
      message: `"${ref}" tem uma parte vazia; use "campo" ou "tabela.coluna"`,
    };
  }
  return { kind: 'column', table, column };
}

/** Passo de papel do vínculo (só `formatVersion` 12). */
type RoleStep = Extract<
  SpecMigrationStep,
  { op: 'rename-role' | 'remove-role' | 'set-role' }
>;

/** O que `checkRoleStep` lê da especialização: tipos e papéis desta versão e o `add` do passo. */
interface RoleStepEnv {
  readonly formatVersion: number;
  /** id do tipo → papéis (`childRoles`); o tipo sem `childRoles` não tem entrada. */
  readonly roles: ReadonlyMap<string, ReadonlySet<string>>;
  readonly hasType: (id: string) => boolean;
  /** Erro no caminho `migrations[i].steps[j].<key>`. */
  readonly add: (key: string, message: string) => void;
}

/** O papel existe no tipo (lado novo). */
function roleHere(
  roles: ReadonlySet<string>,
  typeId: string,
  role: string,
  where: string,
  env: RoleStepEnv,
): void {
  if (!roles.has(role)) env.add(where, `"${role}" não é um papel do tipo "${typeId}"`);
}

/** O papel não existe mais no tipo (lado antigo). */
function roleGone(
  roles: ReadonlySet<string> | undefined,
  typeId: string,
  role: string,
  where: string,
  env: RoleStepEnv,
): void {
  if (roles?.has(role)) {
    env.add(where, `papel "${role}" ainda existe no tipo "${typeId}" nesta versão`);
  }
}

/**
 * Os passos de papel (formatVersion 12): `rename-role` e `set-role` pedem um tipo desta versão com
 * `childRoles`; `remove-role` pede só o tipo (pode não ter mais papéis). `childType` de `set-role`
 * só tem o formato conferido pelo zod, o tipo não precisa existir.
 */
function checkRoleStep(step: RoleStep, env: RoleStepEnv): void {
  if (env.formatVersion < 12) {
    env.add('op', 'só é permitido com formatVersion 12');
    return;
  }
  if (!env.hasType(step.type)) {
    env.add('type', `tipo "${step.type}" não existe nesta versão`);
    return;
  }
  const roles = env.roles.get(step.type);
  if (step.op === 'remove-role') {
    roleGone(roles, step.type, step.role, 'role', env);
    return;
  }
  if (roles === undefined) {
    env.add('type', `o tipo "${step.type}" não tem papéis (childRoles) nesta versão`);
    return;
  }
  if (step.op === 'set-role') {
    roleHere(roles, step.type, step.role, 'role', env);
    return;
  }
  roleHere(roles, step.type, step.to, 'to', env);
  roleGone(roles, step.type, step.from, 'from', env);
}

/** id do tipo → ids dos papéis (`childRoles`); o tipo sem `childRoles` fica de fora. */
function rolesByType(
  layers: readonly {
    annotationTypes: readonly {
      id: string;
      childRoles?: readonly { id: string }[] | undefined;
    }[];
  }[],
): Map<string, Set<string>> {
  const roles = new Map<string, Set<string>>();
  for (const layer of layers) {
    for (const type of layer.annotationTypes) {
      if (type.childRoles !== undefined) {
        roles.set(type.id, new Set(type.childRoles.map((r) => r.id)));
      }
    }
  }
  return roles;
}

/**
 * Conferências das `migrations` que um arquivo só permite: versões, `from` único e, em cada
 * passo, o lado novo existe e o lado antigo não existe mais nesta versão. A chave de campo de um
 * passo é `key` (campo de nível superior) ou `tabela.coluna` (coluna de um campo `table`, que
 * também guarda dados). Se o lado antigo
 * existia na versão anterior é coisa do `diffSpecs`, que compara duas versões.
 */
function checkMigrations(
  spec: {
    version: number;
    formatVersion: number;
    layers: readonly {
      annotationTypes: readonly {
        id: string;
        fields: readonly RawField[];
        childRoles?: readonly { id: string }[] | undefined;
      }[];
    }[];
  },
  migrations: readonly z.infer<typeof migrationShape>[],
  ctx: z.RefinementCtx,
): void {
  /** id do tipo → campos (sem o tipo removido) por chave. */
  const types = new Map<string, Map<string, RawField>>();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      types.set(
        type.id,
        new Map(
          type.fields.filter((f) => f.type !== REMOVED_FIELD_TYPE).map((f) => [f.key, f]),
        ),
      );
    }
  }
  const roles = rolesByType(spec.layers);
  const fromSeen = new Set<number>();
  migrations.forEach((migration, mi) => {
    const mp: PathKeys = ['migrations', mi];
    const add = (sub: PathKeys, message: string) =>
      ctx.addIssue({ code: 'custom', path: [...mp, ...sub], message });

    if (fromSeen.has(migration.from)) {
      add(['from'], `já existe uma migração a partir da versão ${migration.from}`);
    }
    fromSeen.add(migration.from);
    if (migration.to <= migration.from) {
      add(['to'], `deve ser maior que "from" (${migration.from})`);
    }
    if (migration.to > spec.version) {
      add(['to'], `não pode passar de "version" (${spec.version})`);
    }

    migration.steps.forEach((step, si) => {
      const sp: PathKeys = ['steps', si];
      const stepAdd = (key: string | PathKeys, message: string) =>
        add([...sp, ...(typeof key === 'string' ? [key] : key)], message);
      /** O tipo existe nesta versão (o passo trata de um campo dele). */
      const typeHere = (id: string): Map<string, RawField> | undefined => {
        const fields = types.get(id);
        if (!fields) stepAdd('type', `tipo "${id}" não existe nesta versão`);
        return fields;
      };
      /** O campo (ou a coluna `tabela.coluna`) existe no tipo (lado novo). */
      const fieldHere = (
        fields: Map<string, RawField>,
        typeId: string,
        key: string,
        where: string,
      ): RawField | undefined => {
        const ref = parseFieldRef(key);
        if (ref.kind === 'invalid') {
          stepAdd(where, ref.message);
          return undefined;
        }
        if (ref.kind === 'field') {
          const field = fields.get(key);
          if (!field) stepAdd(where, `"${key}" não é um campo do tipo "${typeId}"`);
          return field;
        }
        const table = fields.get(ref.table);
        if (!table) {
          stepAdd(where, `"${ref.table}" não é um campo do tipo "${typeId}"`);
          return undefined;
        }
        if (table.type !== 'table') {
          stepAdd(where, `"${ref.table}" não é uma tabela do tipo "${typeId}"`);
          return undefined;
        }
        const column = columnOf(table, ref.column);
        if (!column) {
          stepAdd(
            where,
            `"${key}" não é uma coluna da tabela "${ref.table}" do tipo "${typeId}"`,
          );
        }
        return column;
      };
      /** O campo (ou a coluna `tabela.coluna`) não existe mais no tipo (lado antigo). */
      const fieldGone = (
        fields: Map<string, RawField>,
        typeId: string,
        key: string,
        where: string,
      ): void => {
        const ref = parseFieldRef(key);
        if (ref.kind === 'invalid') {
          stepAdd(where, ref.message);
        } else if (ref.kind === 'field') {
          if (fields.has(key)) {
            stepAdd(
              where,
              `campo "${key}" ainda existe no tipo "${typeId}" nesta versão`,
            );
          }
        } else {
          // Tabela que não existe mais: a coluna foi junto, e é isso que o passo declara.
          const table = fields.get(ref.table);
          if (!table) return;
          if (table.type !== 'table') {
            stepAdd(where, `"${ref.table}" não é uma tabela do tipo "${typeId}"`);
          } else if (columnOf(table, ref.column)) {
            stepAdd(
              where,
              `coluna "${ref.column}" ainda existe na tabela "${ref.table}" do tipo "${typeId}" nesta versão`,
            );
          }
        }
      };
      const typeGone = (id: string, where: string): void => {
        if (types.has(id)) stepAdd(where, `tipo "${id}" ainda existe nesta versão`);
      };

      switch (step.op) {
        case 'rename-type':
          if (!types.has(step.to))
            stepAdd('to', `tipo "${step.to}" não existe nesta versão`);
          typeGone(step.from, 'from');
          break;
        case 'remove-type':
          typeGone(step.type, 'type');
          break;
        case 'rename-field': {
          const fields = typeHere(step.type);
          if (!fields) break;
          fieldHere(fields, step.type, step.to, 'to');
          fieldGone(fields, step.type, step.from, 'from');
          break;
        }
        case 'remove-field': {
          const fields = typeHere(step.type);
          if (fields) fieldGone(fields, step.type, step.field, 'field');
          break;
        }
        case 'map-values': {
          const fields = typeHere(step.type);
          if (!fields) break;
          const field = fieldHere(fields, step.type, step.field, 'field');
          if (!field) break;
          if (field.type !== 'enum') {
            stepAdd(
              'field',
              step.field.includes('.')
                ? `"${step.field}" deve ser uma coluna enum da tabela`
                : `"${step.field}" deve ser um campo enum do tipo`,
            );
            break;
          }
          for (const [from, to] of Object.entries(step.values)) {
            if (!(field.options ?? []).includes(to)) {
              stepAdd(['values', from], `"${to}" não está nas options`);
            }
          }
          break;
        }
        case 'fill-field': {
          const fields = typeHere(step.type);
          if (!fields) break;
          const field = fieldHere(fields, step.type, step.field, 'field');
          if (!field) break;
          const problem = valueProblem(field.type, field.options, step.default);
          if (problem !== undefined) stepAdd('default', problem);
          break;
        }
        case 'rename-role':
        case 'remove-role':
        case 'set-role':
          checkRoleStep(step, {
            formatVersion: spec.formatVersion,
            roles,
            hasType: (id) => types.has(id),
            add: stepAdd,
          });
          break;
      }
    });
  });
}

/** Cada problema `"caminho: mensagem"` do `parseOrigins` vira uma issue no caminho exato. */
function addOriginIssues(raw: unknown, ctx: z.RefinementCtx): void {
  for (const problem of parseOrigins(raw, 'origins').problems) {
    const cut = problem.indexOf(': ');
    ctx.addIssue({
      code: 'custom',
      path: cut < 0 ? [] : parseSpecPath(problem.slice(0, cut)),
      message: cut < 0 ? problem : problem.slice(cut + 2),
    });
  }
}

/** Sistemas declarados em `origins` (lidos do JSON cru, mesmo se uma origem tiver problema). */
function declaredSystems(raw: unknown): Set<string> {
  const systems = new Set<string>();
  if (!Array.isArray(raw)) return systems;
  for (const item of raw) {
    if (isRecord(item) && typeof item.system === 'string' && item.system.trim() !== '') {
      systems.add(item.system);
    }
  }
  return systems;
}

/**
 * `layers[1].annotationTypes[0].fields[2]` → `['layers', 1, 'annotationTypes', 0, 'fields', 2]`:
 * o inverso de `formatSpecPath`, para montar o caminho de uma issue do zod a partir de um
 * caminho em texto (os do `parseOrigins`). Chaves com `.`, `[` ou `]` não são suportadas.
 */
export function parseSpecPath(text: string): (string | number)[] {
  const keys: (string | number)[] = [];
  for (const match of text.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    keys.push(match[2] !== undefined ? Number(match[2]) : (match[1] ?? ''));
  }
  return keys;
}

/** O que os conferidores da v11 leem de um tipo (a forma crua, lida pelo zod). */
interface V11Type {
  readonly id: string;
  readonly requiresOwner?: boolean | undefined;
  readonly groups?: readonly string[] | undefined;
  readonly allowedChildren?: readonly SpecAllowedChild[] | undefined;
  readonly childRoles?: readonly unknown[] | undefined;
  readonly childRolesLabel?: string | undefined;
  readonly doc?: string | SpecDocRef | undefined;
}

interface V11Layer {
  readonly id: string;
  readonly groups?: readonly { readonly id: string }[] | undefined;
  readonly annotationTypes: readonly V11Type[];
}

type IssueAdder = (path: (string | number)[], message: string) => void;

const issueAdder =
  (ctx: z.RefinementCtx): IssueAdder =>
  (path, message) =>
    ctx.addIssue({ code: 'custom', path, message });

/** Caminho de cada tipo: `['layers', li, 'annotationTypes', ti]`. */
function eachV11Type(
  layers: readonly V11Layer[],
  visit: (type: V11Type, layer: V11Layer, path: (string | number)[], li: number) => void,
): void {
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      visit(type, layer, ['layers', li, 'annotationTypes', ti], li);
    });
  });
}

/** Antes da v11, cada chave nova (cláusula, groups, childRoles, docRepos, doc objeto) é erro. */
function checkNoV11Keys(
  spec: { formatVersion: number; docRepos?: unknown; layers: readonly V11Layer[] },
  ctx: z.RefinementCtx,
): void {
  const add = issueAdder(ctx);
  const only11 = (path: (string | number)[]) =>
    add(path, 'só é permitido com formatVersion 11');
  if (spec.docRepos !== undefined) only11(['docRepos']);
  spec.layers.forEach((layer, li) => {
    if (layer.groups !== undefined) only11(['layers', li, 'groups']);
  });
  eachV11Type(spec.layers, (type, _layer, path) => {
    for (const key of ['groups', 'childRoles', 'childRolesLabel'] as const) {
      if (type[key] !== undefined) only11([...path, key]);
    }
    // Antes da v4 o `doc` já é erro (qualquer forma); da v4 à v10 só o objeto.
    if (isRecord(type.doc) && spec.formatVersion >= 4) only11([...path, 'doc']);
    (type.allowedChildren ?? []).forEach((item, ci) => {
      if (isRecord(item)) only11([...path, 'allowedChildren', ci]);
    });
  });
}

/** Ids dos grupos de cada camada (a primeira camada com o id vale) e o índice dela. */
function layerGroupIndex(
  layers: readonly V11Layer[],
): Map<string, { index: number; groups: Set<string> }> {
  const byId = new Map<string, { index: number; groups: Set<string> }>();
  layers.forEach((layer, index) => {
    if (byId.has(layer.id)) return;
    byId.set(layer.id, { index, groups: new Set((layer.groups ?? []).map((g) => g.id)) });
  });
  return byId;
}

/** Uma cláusula de `allowedChildren` (v11): a camada existe, é outra e os grupos são dela. */
function checkChildClause(
  clause: SpecChildClause,
  li: number,
  layers: ReadonlyMap<string, { index: number; groups: ReadonlySet<string> }>,
  path: (string | number)[],
  add: IssueAdder,
): void {
  const target = layers.get(clause.layer);
  if (target === undefined) {
    add([...path, 'layer'], `camada "${clause.layer}" não existe na especialização`);
    return;
  }
  if (target.index === li) {
    add(
      [...path, 'layer'],
      `camada "${clause.layer}" é a do próprio tipo; filhos devem estar em outra camada`,
    );
    return;
  }
  (clause.groups ?? []).forEach((group, gi) => {
    if (target.groups.has(group)) return;
    add(
      [...path, 'groups', gi],
      `grupo "${group}" não existe na camada "${clause.layer}"`,
    );
  });
}

/** Um id de tipo de `allowedChildren`: existe e está em outra camada. */
function checkChildId(
  childId: string,
  li: number,
  typeLayer: ReadonlyMap<string, number>,
  path: (string | number)[],
  add: IssueAdder,
): void {
  const childLayer = typeLayer.get(childId);
  if (childLayer === undefined) {
    add(path, `tipo "${childId}" não existe na especialização`);
  } else if (childLayer === li) {
    add(
      path,
      `tipo "${childId}" está na mesma camada; filhos devem estar em outra camada`,
    );
  }
}

/** Cada item de `allowedChildren` (id ou, na v11, cláusula) aponta para o que existe. */
function checkAllowedChildren(
  spec: { formatVersion: number; layers: readonly V11Layer[] },
  typeLayer: ReadonlyMap<string, number>,
  ctx: z.RefinementCtx,
): void {
  const add = issueAdder(ctx);
  const layers = layerGroupIndex(spec.layers);
  eachV11Type(spec.layers, (type, _layer, path, li) => {
    (type.allowedChildren ?? []).forEach((item, ci) => {
      const itemPath = [...path, 'allowedChildren', ci];
      if (typeof item === 'string') checkChildId(item, li, typeLayer, itemPath, add);
      else if (
        spec.formatVersion >= 11 &&
        isRecord(item) &&
        typeof item.layer === 'string'
      ) {
        checkChildClause(item, li, layers, itemPath, add);
      }
    });
  });
}

/** v11: ids de grupo únicos na camada e `groups` do tipo só com grupos da própria camada. */
function checkLayerGroups(layers: readonly V11Layer[], ctx: z.RefinementCtx): void {
  const add = issueAdder(ctx);
  layers.forEach((layer, li) => {
    const declared = new Set<string>();
    (layer.groups ?? []).forEach((group, gi) => {
      if (declared.has(group.id)) {
        add(['layers', li, 'groups', gi, 'id'], `id "${group.id}" repetido`);
      }
      declared.add(group.id);
    });
    layer.annotationTypes.forEach((type, ti) => {
      (type.groups ?? []).forEach((group, gi) => {
        if (declared.has(group)) return;
        add(
          ['layers', li, 'annotationTypes', ti, 'groups', gi],
          `grupo "${group}" não existe na camada "${layer.id}"`,
        );
      });
    });
  });
}

/** v11: `docRepos` com ids únicos e todo `doc` objeto citando um deles. */
function checkDocRepos(
  spec: {
    docRepos?: readonly { readonly id: string }[] | undefined;
    layers: readonly V11Layer[];
  },
  ctx: z.RefinementCtx,
): void {
  const add = issueAdder(ctx);
  const declared = new Set<string>();
  (spec.docRepos ?? []).forEach((repo, ri) => {
    if (declared.has(repo.id)) add(['docRepos', ri, 'id'], `id "${repo.id}" repetido`);
    declared.add(repo.id);
  });
  eachV11Type(spec.layers, (type, _layer, path) => {
    const { doc } = type;
    if (!isRecord(doc) || typeof doc.repo !== 'string' || declared.has(doc.repo)) return;
    add([...path, 'doc', 'repo'], `repositório "${doc.repo}" não declarado em docRepos`);
  });
}

/** `requiresOwner`: o tipo precisa estar no conjunto resolvido de filhos de algum tipo. */
function checkRequiresOwner(
  spec: { layers: readonly V11Layer[] },
  ctx: z.RefinementCtx,
): void {
  const owners = childSets(spec).owners;
  const add = issueAdder(ctx);
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      if (type.requiresOwner && !owners.has(type.id)) {
        add(
          ['layers', li, 'annotationTypes', ti, 'requiresOwner'],
          `"${type.id}" exige dono, mas nenhum tipo o lista em allowedChildren`,
        );
      }
    });
  });
}

export const specSchema = z
  .object({
    format: z.union([z.literal(SPEC_FORMAT), z.literal(LEGACY_SPEC_FORMAT)], {
      error: `deve ser "${SPEC_FORMAT}"`,
    }),
    formatVersion: z.union(
      [
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
        z.literal(7),
        z.literal(8),
        z.literal(9),
        z.literal(10),
        z.literal(11),
        z.literal(12),
      ],
      {
        error: `deve ser ${SPEC_FORMAT_VERSIONS.slice(0, -1).join(', ')} ou ${String(SPEC_FORMAT_VERSIONS.at(-1))}`,
      },
    ),
    id: nonEmpty,
    name: nonEmpty,
    version: z.number().int('deve ser inteiro').min(1, 'deve ser >= 1'),
    description: z.string().optional(),
    platforms: z.array(platformShape).optional(),
    docRepos: z.array(docRepoShape).optional(),
    containers: z.array(containerShape).optional(),
    layers: z.array(layerShape),
    fonts: z.array(fontShape).optional(),
    // Validado por `parseOrigins` (a fonte da verdade da declaração de origem), no superRefine.
    origins: z.unknown().optional(),
    migrations: z.array(migrationShape).optional(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.platforms !== undefined && spec.formatVersion < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['platforms'],
        message: 'só é permitido com formatVersion 2',
      });
    }
    const platformIds = new Set<string>();
    (spec.platforms ?? []).forEach((platform, pi) => {
      if (platformIds.has(platform.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['platforms', pi, 'id'],
          message: `id "${platform.id}" repetido`,
        });
      }
      platformIds.add(platform.id);
    });
    // v5: `repo` nas plataformas. Antes dela, é erro no caminho exato.
    if (spec.formatVersion < 5) {
      (spec.platforms ?? []).forEach((platform, pi) => {
        if (platform.repo === undefined) return;
        ctx.addIssue({
          code: 'custom',
          path: ['platforms', pi, 'repo'],
          message: 'só é permitido com formatVersion 5',
        });
      });
    }
    // v7: `floating` e `appliesTo` no tipo e `ref` como coluna de `table`. Antes dela, é erro
    // no caminho exato.
    if (spec.formatVersion < 7) {
      spec.layers.forEach((layer, li) => {
        layer.annotationTypes.forEach((type, ti) => {
          const typePath = ['layers', li, 'annotationTypes', ti];
          const only7 = (sub: (string | number)[]) =>
            ctx.addIssue({
              code: 'custom',
              path: [...typePath, ...sub],
              message: 'só é permitido com formatVersion 7',
            });
          if (type.floating !== undefined) only7(['floating']);
          if (type.appliesTo !== undefined) only7(['appliesTo']);
          type.fields.forEach((field, fi) => {
            (field.columns ?? []).forEach((column, ci) => {
              if (isRecord(column) && column.type === 'ref') {
                only7(['fields', fi, 'columns', ci, 'type']);
              }
            });
          });
        });
      });
    }
    // v8: `suggestions` e `linkedRef` em campo e coluna `string`. Antes dela, é erro no caminho exato.
    if (spec.formatVersion < 8) {
      spec.layers.forEach((layer, li) => {
        layer.annotationTypes.forEach((type, ti) => {
          type.fields.forEach((field, fi) => {
            const fieldPath = ['layers', li, 'annotationTypes', ti, 'fields', fi];
            const only8 = (sub: (string | number)[]) =>
              ctx.addIssue({
                code: 'custom',
                path: [...fieldPath, ...sub],
                message: 'só é permitido com formatVersion 8',
              });
            if (field.suggestions !== undefined) only8(['suggestions']);
            if (field.linkedRef !== undefined) only8(['linkedRef']);
            (field.columns ?? []).forEach((column, ci) => {
              if (isRecord(column) && column.suggestions !== undefined) {
                only8(['columns', ci, 'suggestions']);
              }
              if (isRecord(column) && column.linkedRef !== undefined) {
                only8(['columns', ci, 'linkedRef']);
              }
            });
          });
        });
      });
    }
    // v9: `variants` na entrada de `code`. Antes dela, é erro no caminho exato.
    if (spec.formatVersion < 9) {
      spec.layers.forEach((layer, li) => {
        layer.annotationTypes.forEach((type, ti) => {
          for (const [platform, entry] of Object.entries(type.code ?? {})) {
            if (entry.variants === undefined) continue;
            ctx.addIssue({
              code: 'custom',
              path: ['layers', li, 'annotationTypes', ti, 'code', platform, 'variants'],
              message: 'só é permitido com formatVersion 9',
            });
          }
        });
      });
    }
    // v10: `notices` no tipo, no campo e na coluna. Antes dela, é erro no caminho exato.
    if (spec.formatVersion < 10) checkNoNotices(spec.layers, ctx);
    // v11: cláusulas, `groups`, papéis e documento externo. Antes dela, é erro no caminho exato.
    if (spec.formatVersion < 11) checkNoV11Keys(spec, ctx);
    // v6: `containers`. Antes dela, é erro no caminho exato.
    if (spec.containers !== undefined && spec.formatVersion < 6) {
      ctx.addIssue({
        code: 'custom',
        path: ['containers'],
        message: 'só é permitido com formatVersion 6',
      });
    }
    const containerIds = new Set<string>();
    (spec.containers ?? []).forEach((container, ci) => {
      if (containerIds.has(container.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['containers', ci, 'id'],
          message: `id "${container.id}" repetido`,
        });
      }
      containerIds.add(container.id);
    });
    const hasPlatforms = platformIds.size > 0;
    if (spec.formatVersion < 3) checkNoSources(spec.layers, ctx);

    // v4: biblioteca. Antes dela, cada chave nova é erro no caminho exato.
    const v4 = spec.formatVersion >= 4;
    const executable = v4 ? declaredSystems(spec.origins) : new Set<string>();
    if (!v4) {
      for (const key of ['fonts', 'origins', 'migrations'] as const) {
        if (spec[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'só é permitido com formatVersion 4',
          });
        }
      }
      checkNoLibraryKeys(spec.layers, ctx);
    } else if (spec.origins !== undefined) {
      addOriginIssues(spec.origins, ctx);
    }
    if (spec.formatVersion >= 3) {
      checkSources(spec.layers, spec.formatVersion, executable, ctx);
    }
    if (v4) {
      checkExampleSystems(spec.layers, executable, ctx);
      checkFonts(spec.fonts ?? [], ctx);
      checkMigrations(spec, spec.migrations ?? [], ctx);
    }
    const layerIds = new Set<string>();
    /** id do tipo → índice da camada onde está definido. */
    const typeLayer = new Map<string, number>();

    spec.layers.forEach((layer, li) => {
      if (layerIds.has(layer.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['layers', li, 'id'],
          message: `id "${layer.id}" repetido`,
        });
      }
      layerIds.add(layer.id);
      layer.annotationTypes.forEach((type, ti) => {
        if (typeLayer.has(type.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['layers', li, 'annotationTypes', ti, 'id'],
            message: `id "${type.id}" repetido na especialização`,
          });
        } else {
          typeLayer.set(type.id, li);
        }
      });
    });

    checkAllowedChildren(spec, typeLayer, ctx);
    if (spec.formatVersion >= 11) {
      checkLayerGroups(spec.layers, ctx);
      checkDocRepos(spec, ctx);
    }

    spec.layers.forEach((layer, li) => {
      layer.annotationTypes.forEach((type, ti) => {
        const tp = ['layers', li, 'annotationTypes', ti];
        if (type.code !== undefined) {
          if (!hasPlatforms) {
            ctx.addIssue({
              code: 'custom',
              path: [...tp, 'code'],
              message: 'só é permitido em especializações que declaram platforms',
            });
          } else {
            for (const id of Object.keys(type.code)) {
              if (platformIds.has(id)) continue;
              ctx.addIssue({
                code: 'custom',
                path: [...tp, 'code', id],
                message: `plataforma "${id}" não declarada em platforms`,
              });
            }
          }
        }
      });
    });

    checkRequiresOwner(spec, ctx);
  });

export type SpecIssue = { path: string; message: string };

/** `layers[1].annotationTypes[0].fields[2].type` a partir de um caminho do zod. */
export function formatSpecPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

export type SpecParseResult =
  | { ok: true; spec: Spec; ignored: IgnoredSpecField[] }
  | { ok: false; issues: SpecIssue[]; errors: string[] };

type ParsedSpec = z.infer<typeof specSchema>;

/** Sem as chaves de `removed`; `undefined` se não sobrar nenhuma. */
function withoutKeys(
  record: Record<string, string> | undefined,
  removed: ReadonlySet<string>,
): Record<string, string> | undefined {
  if (record === undefined) return undefined;
  const kept = Object.entries(record).filter(([k]) => !removed.has(k));
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** `variants` sem os `params` dos campos removidos em cada caso (um caso só de `params` esvazia). */
function withoutRemovedInCases(
  variants: SpecCodeVariants,
  removed: ReadonlySet<string>,
): SpecCodeVariants {
  return {
    ...variants,
    cases: Object.fromEntries(
      Object.entries(variants.cases).map(([value, kase]) => {
        const { params, ...others } = kase;
        const kept = withoutKeys(params, removed);
        return [value, kept === undefined ? others : { ...others, params: kept }];
      }),
    ),
  };
}

/**
 * Tira dos tipos os campos do tipo removido (`REMOVED_FIELD_TYPE`) e os `params` do `code`
 * que os citam; devolve o que foi ignorado, com o caminho no arquivo original.
 */
function dropRemovedFields(parsed: ParsedSpec): {
  spec: Spec;
  ignored: IgnoredSpecField[];
} {
  const ignored: IgnoredSpecField[] = [];
  const layers = parsed.layers.map((layer, li) => ({
    ...layer,
    annotationTypes: layer.annotationTypes.map((type, ti) => {
      const removed = new Set<string>();
      type.fields.forEach((field, fi) => {
        if (field.type !== REMOVED_FIELD_TYPE) return;
        removed.add(field.key);
        ignored.push({
          path: `layers[${li}].annotationTypes[${ti}].fields[${fi}]`,
          typeId: type.id,
          key: field.key,
        });
      });
      if (removed.size === 0) return type;
      const { code, ...rest } = type;
      return {
        ...rest,
        fields: type.fields.filter((f) => f.type !== REMOVED_FIELD_TYPE),
        ...(code === undefined
          ? {}
          : {
              code: Object.fromEntries(
                Object.entries(code).map(([platform, entry]) => {
                  const { params, variants, ...others } = entry;
                  const kept = withoutKeys(params, removed);
                  return [
                    platform,
                    {
                      ...others,
                      ...(kept === undefined ? {} : { params: kept }),
                      ...(variants === undefined
                        ? {}
                        : { variants: withoutRemovedInCases(variants, removed) }),
                    },
                  ];
                }),
              ),
            }),
      };
    }),
  }));
  // `origins` foi validado por `parseOrigins` no schema; a forma lida é a dele.
  const { origins: rawOrigins, ...rest } = parsed;
  const origins =
    rawOrigins === undefined ? {} : { origins: parseOrigins(rawOrigins).origins };
  return { spec: { ...rest, ...origins, layers } as Spec, ignored };
}

/**
 * Chaves dos campos do tipo removido (`REMOVED_FIELD_TYPE`) por id de tipo, lidas do JSON
 * cru de uma especialização (sem validar): a migração v8 → v9 do projeto as usa para
 * descartar os valores desses campos. Vazio se o JSON não tiver a forma esperada.
 */
export function removedFieldKeys(data: unknown): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  if (!isObject(data)) return result;
  for (const layer of list(data.layers)) {
    if (!isObject(layer)) continue;
    for (const type of list(layer.annotationTypes)) {
      if (!isObject(type) || typeof type.id !== 'string') continue;
      for (const field of list(type.fields)) {
        if (!isObject(field) || field.type !== REMOVED_FIELD_TYPE) continue;
        if (typeof field.key !== 'string') continue;
        const keys = result.get(type.id) ?? new Set<string>();
        keys.add(field.key);
        result.set(type.id, keys);
      }
    }
  }
  return result;
}

/** Valida um JSON já lido; erros no formato `caminho: mensagem`. */
export function parseSpec(data: unknown): SpecParseResult {
  const result = specSchema.safeParse(data);
  if (result.success) return { ok: true, ...dropRemovedFields(result.data) };
  const issues = result.error.issues.map((i) => ({
    path: formatSpecPath(i.path),
    message: i.message,
  }));
  return {
    ok: false,
    issues,
    errors: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
  };
}

/** Lê o texto JSON de um arquivo de especialização. */
export function parseSpecText(text: string): SpecParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      issues: [{ path: '', message: `JSON inválido: ${message}` }],
      errors: [`JSON inválido: ${message}`],
    };
  }
  return parseSpec(data);
}
