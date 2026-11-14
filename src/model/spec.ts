import { HEX_COLOR_RE } from './hexColor';
import { z } from 'zod';
import { isValidCodePath, isValidUrlTemplate } from './codeLocations';
import { MAX_CONTAINER_SIZE } from './containers';
import {
  parseOrigins,
  parsePath,
  toSpecOrigin,
  type SpecOrigin,
} from './components/origin';
import { TOKEN_NAME_PATTERN, type SpecTokens } from './components/tokens';
import { isPackagePath, packagePathError } from './packagePaths';
import { childSets } from './specChildren';
import { checkSignatureKeys } from './specSignature';
import type { ModelMessageTemplateCode } from './messages';
import {
  addSpecIssue,
  forwardIssue,
  issueCoding,
  packagePathMsg,
  pathErrorMsg,
  specMsg,
  type MessageParams,
  type SpecMsg,
} from './specIssueCode';

export { isPackagePath };

/** "only allowed with formatVersion N" (the Ns with no catalog message of their own), with the code. */
function onlyFormat(version: number): SpecMsg {
  return specMsg('spec.onlyFormat', { version: String(version) });
}

// Specialization format (`formatVersion` 1 to 16), see docs/SPEC-FORMAT.md. Version 2 adds
// `platforms` and `code`; version 1 is 2 without platforms and without `code`; version 3 is 2 plus
// `sources` (external origins on types and fields, including `table` columns); version 4 is 3
// plus the library: the package (the specialization's folder) with `component`, `doc` and
// `examples` on types, `fonts`, `origins` (executable origins, with `slot`, `ignore` and `path`
// on `sources`) and `migrations` (the version contract); version 5 is 4 plus `repo` in
// `platforms[]` (the library's repository on the platform, where the files cited in the `code`
// `path`s live); version 6 is 5 plus `containers` (size presets of the New container dialog);
// version 7 is 6 plus `floating` on the type (the instance is a floating marking, like a note),
// `appliesTo` on the type (where the annotation applies: marking, arrow or both) and `ref` as a
// `table` column type (the list of references as data, ME4); version 8 is 7 plus `suggestions`
// and `linkedRef` on `string` fields and columns (vocabulary suggested while typing, without
// restricting the value; `linkedRef` links the text to a `ref` field/column of the same
// type/table); version 9 is 8 plus `variants` on the `code` entry (an `enum` field of the type
// picks, by value, the composable/class/file: `resolveCode` in `codeVariants.ts` applies the
// case); version 10 is 9 plus `notices` (`removed`, `deprecated`, `diverges` or `pending`
// notices on the type, the field and the `table` column: they inform, they do not create
// pending items; see `notices.ts`); version 11 is 10 plus children by layer and group
// (`allowedChildren` accepts `{ layer, groups? }` clauses and the layer and the type have
// `groups`; the resolver is `specChildren.ts`), the roles in the link (`childRoles` and
// `childRolesLabel`) and the document in an external repository (`docRepos` at the root and
// `doc` as a `{ repo, path }` object); version 12 is 11 plus the role steps in `migrations`
// (`rename-role`, `remove-role` and `set-role`); version 13 is 12 plus `allowedChildren` with
// types of the owner's own layer (link between annotations of the same layer).
// Version 14 is 13 plus `accepts.annotations` (the whole annotation as the target of a `ref`
// field or column); version 15 is 14 plus tokens, icons, `structural` and `origins[].kind`
// (`tree` or `measured`: the measured origin, only with `system`, `kind`, `name` and
// `booleans`; the tree comes from the MCP `import_measured` op); version 16 is 15 plus the
// signature sheet (stage #1079): `fieldModels` at the root and, in the `code` (and in each
// `variants` case), `signature`, `ignore`, `calls` and `formats`, with `params` by path
// (`colors.containerColor`) or positional (`#0`), plus `signature` on the type's `sources` (see
// `specSignature.ts`).
// The zod here is the source of truth; `docs/spec.schema.json` mirrors it for those who do not
// use TypeScript. No browser APIs: reusable by the MCP server.
//
// Removed field (stage 9, project schema v9): the field type `REMOVED_FIELD_TYPE` (where the
// instance was implemented) left the format. An old file that declares it stays valid: the field
// is read and ignored (it leaves the type, and so do the `code` `params` that cite it), and
// whoever imports receives the list in `ignored` to warn (`specWarnings`).

export const SPEC_FORMAT = 'mapping-spec';
/** Value used before the product rename: import still accepts it. */
export const LEGACY_SPEC_FORMAT = 'mapeador-spec';
/** Current format version (the one that the documentation and new examples use). */
export const SPEC_FORMAT_VERSION = 16;
/** Versions accepted on import. */
export const SPEC_FORMAT_VERSIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
] as const;
export type SpecFormatVersion = (typeof SPEC_FORMAT_VERSIONS)[number];

export type SimpleFieldType = 'string' | 'number' | 'date' | 'enum';
export type FieldType = SimpleFieldType | 'table' | 'ref';

/** Field type that left the format in stage 9: read and ignored (see the header). */
export const REMOVED_FIELD_TYPE = 'codeRef';

/** Field of a type removed from the format, ignored on reading. */
export interface IgnoredSpecField {
  /** Path of the field in the file (e.g. `layers[3].annotationTypes[0].fields[2]`). */
  readonly path: string;
  readonly typeId: string;
  readonly key: string;
}

/**
 * The library's repository on a platform (`formatVersion` 5 only): where the files cited in the
 * `code` `path`s live.
 */
export interface SpecRepo {
  /** Repository address (`http(s)://`). */
  url: string;
  /** Template of a file's address, with `{path}` (and optional `{line}`); without it, no link. */
  urlTemplate?: string;
  /** Revision (tag, branch or commit) the `code` corresponds to; informative. */
  ref?: string;
}

/** Platform declared by the specialization: a code target (an app, the BFF). */
export interface SpecPlatform {
  id: string;
  name: string;
  /** Informative: helps the agent know what language the code is in. */
  language?: string;
  /** The library's repository on this platform (`formatVersion` 5 only). */
  repo?: SpecRepo;
}

/**
 * What a variant value changes in the `code` (`formatVersion` 9 only): `symbol`, `path` and
 * `notes` replace the base's; `params` and `values` are added to the base's, key by key.
 */
export interface SpecCodeCase {
  symbol?: string;
  path?: string;
  params?: Record<string, string>;
  values?: Record<string, Record<string, string>>;
  notes?: string;
  /** Signature sheet of the case (`formatVersion` 16 only); replaces the base's. */
  signature?: string;
  /** Parameters left out on purpose (`formatVersion` 16 only); replaces the base's. */
  ignore?: string[];
  /** Factories (`formatVersion` 16 only): added to the base's, key by key. */
  calls?: Record<string, string>;
  /** Templates with `{value}` (`formatVersion` 16 only): added to the base's, key by key. */
  formats?: Record<string, string>;
}

/** An `enum` field of the type picks, by value, the case applied over the `code` base. */
export interface SpecCodeVariants {
  /** Key of an `enum` field of the type (top level, never a `table` column). */
  field: string;
  /** Field value (one of the `options`) → what changes. */
  cases: Record<string, SpecCodeCase>;
}

/** The code that creates an instance of the annotation type on a platform. */
export interface SpecCode {
  /** What is called to create the instance: composable, view, class or the node-making function. */
  symbol: string;
  /**
   * File that defines the symbol, relative to the root of the platform's repository (without
   * a line). Becomes a link through the `urlTemplate` and a local path through the repository's
   * `localPath`.
   */
  path?: string;
  /**
   * Key of the type's field → parameter name in the code. In `formatVersion` 16 the value may also
   * be a path (`colors.containerColor`: the `containerColor` argument of the `calls.colors`
   * factory) or positional (`#0`: the first unnamed argument); see `codeParams.ts`.
   */
  params?: Record<string, string>;
  /** Key of an `enum` field → (value in the mapping → value in the code). */
  values?: Record<string, Record<string, string>>;
  notes?: string;
  /** Path of the `mapping-signature` sheet in the package (`formatVersion` 16 only). */
  signature?: string;
  /** Parameter names left out on purpose, without a warning (`formatVersion` 16 only). */
  ignore?: string[];
  /** Parameter name → symbol of the nested argument's factory (`formatVersion` 16 only). */
  calls?: Record<string, string>;
  /** Field key → value template, with `{value}` (`{value}.dp`; `formatVersion` 16 only). */
  formats?: Record<string, string>;
  /** Variants by value of an `enum` field (`formatVersion` 9 only); see `resolveCode`. */
  variants?: SpecCodeVariants;
}

/** `code` of an annotation type, by platform id. */
export type SpecCodeMap = Record<string, SpecCode>;

/**
 * Element of an external system that an annotation type corresponds to (v3), e.g.
 * `{ system: "figma", name: "DS/Button" }`. Has `id`, `name` or both. `slot` and `ignore`
 * (v4) only apply to a system declared in `origins`.
 */
export interface SpecTypeSource {
  system: string;
  id?: string;
  name?: string;
  /** Name of the component slot that receives the children (v4, executable system). */
  slot?: string;
  /**
   * Props accepted and not drawn (v4, executable system); with `signature`, also those that
   * import leaves out on purpose, without a warning.
   */
  ignore?: string[];
  /** Path of the design component's `mapping-signature` sheet (`formatVersion` 16 only). */
  signature?: string;
}

/**
 * Origin property of a field (v3), e.g. `{ system: "figma", name: "Style" }`.
 * `values` (only on `enum`) translates the origin value into one of the `options`. In a system
 * declared in `origins` (v4), `path` applies (the path of the value in the external node's
 * `props`, required) and `name` is only the display name; in the others, `name` is required and
 * `path` is forbidden (being required is a validation rule, not part of the type).
 */
export interface SpecFieldSource {
  system: string;
  name?: string;
  path?: string;
  values?: Record<string, string>;
}

/** Font of the package (v4): `file` is a package path (`.ttf`, `.otf`, `.woff`, `.woff2`). */
export interface SpecFont {
  family: string;
  file: string;
  /** Integer from 100 to 1000 or a range such as `"100 900"`. */
  weight?: number | string;
  style?: 'normal' | 'italic';
}

/** A row of a `table` field in an example: column → text, number or `null`. */
export type SpecExampleRow = Record<string, string | number | null>;

/** Value of a field in an example: text, number, `null` or, in a `table` field, the list of rows. */
export type SpecExampleValue = string | number | null | SpecExampleRow[];

/**
 * Example of a type (v4), in one of two modes: `values` (values of the type's fields) or
 * `system` + `file` (the JSON of a node of an external system declared in `origins`).
 */
export interface SpecExample {
  name: string;
  description?: string;
  values?: Record<string, SpecExampleValue>;
  system?: string;
  file?: string;
}

/** Migration step of the version contract (v4); see `docs/SPEC-FORMAT.md`. */
export type SpecMigrationStep =
  | { op: 'rename-type'; from: string; to: string }
  | { op: 'remove-type'; type: string; mode: 'convert' | 'delete' }
  | { op: 'rename-field'; type: string; from: string; to: string }
  | { op: 'remove-field'; type: string; field: string }
  | { op: 'map-values'; type: string; field: string; values: Record<string, string> }
  | { op: 'fill-field'; type: string; field: string; default: string | number }
  // Role steps of the link (`formatVersion` 12 only); `type` is the owner's type.
  | { op: 'rename-role'; type: string; from: string; to: string }
  | { op: 'remove-role'; type: string; role: string; mode: 'clear' | 'unlink' }
  | { op: 'set-role'; type: string; role: string; childType?: string };

/** How to go from the package's version `from` to `to` (v4). */
export interface SpecMigration {
  from: number;
  to: number;
  steps: SpecMigrationStep[];
}

export interface SpecRefAccepts {
  tags?: string[];
  free?: boolean;
  /**
   * Whole annotation as the target (`formatVersion` 14 only): type ids or layer and group
   * clauses of the same specialization, with the same syntax and resolver as `allowedChildren`.
   */
  annotations?: SpecAllowedChild[];
}

/** Notice kinds (v10), in display order; the severity is in `notices.ts`. */
export const SPEC_NOTICE_KINDS = [
  'removed',
  'deprecated',
  'diverges',
  'pending',
] as const;
export type SpecNoticeKind = (typeof SPEC_NOTICE_KINDS)[number];

/** Notice on a type, field or column (`formatVersion` 10 only). */
export interface SpecNotice {
  kind: SpecNoticeKind;
  message: string;
  /** Real date `YYYY-MM-DD` since when the notice applies. */
  since?: string;
  /** Free reference (issue, ticket, link) that explains the notice. */
  ref?: string;
}

interface SpecFieldBase {
  key: string;
  label?: string;
  required?: boolean;
  description?: string;
  tags?: string[];
  /** Origin properties (`formatVersion` 3 onward). */
  sources?: SpecFieldSource[];
  /** Notices of the field or column (`formatVersion` 10 only). */
  notices?: SpecNotice[];
}

/** Simple field (and simple column): text, number, date or enum. */
export type SpecSimpleColumn =
  | (SpecFieldBase & {
      type: 'string';
      default?: string;
      /** Vocabulary suggested while typing (`formatVersion` 8 only); does not restrict the value. */
      suggestions?: string[];
      /** Key of a sibling `ref` field/column whose targets also join the list (`formatVersion` 8). */
      linkedRef?: string;
    })
  | (SpecFieldBase & { type: 'number'; default?: number })
  | (SpecFieldBase & { type: 'date'; default?: string })
  | (SpecFieldBase & { type: 'enum'; options: string[]; default?: string });

/**
 * `ref` column of a `table` (`formatVersion` 7): the cell holds a reference to a target, with
 * the same `accepts` as a `ref` field. It is data: it does not draw an arrow.
 */
export type SpecRefColumn = SpecFieldBase & { type: 'ref'; accepts: SpecRefAccepts };

export type SpecColumn = SpecSimpleColumn | SpecRefColumn;

export type SpecField =
  | SpecSimpleColumn
  | (SpecFieldBase & { type: 'table'; columns: SpecColumn[]; rowLabel?: string })
  | SpecRefColumn;

/**
 * `allowedChildren` clause (`formatVersion` 11 only): the types of layer `layer`; with `groups`,
 * only those in one of those groups of the layer.
 */
export interface SpecChildClause {
  layer: string;
  groups?: string[];
}

/** `allowedChildren` item: a type's id or a layer and groups clause. */
export type SpecAllowedChild = string | SpecChildClause;

/** Group of types of a layer (`formatVersion` 11 only): groups the types under a heading. */
export interface SpecLayerGroup {
  /** Unique within the layer. */
  id: string;
  name: string;
  description?: string;
}

/** Role a child takes in the link with the owner (`formatVersion` 11 only). */
export interface SpecChildRole {
  /** Unique within the type. */
  id: string;
  name: string;
  description?: string;
}

/** Repository where the external documents live (`formatVersion` 11 only); see `doc`. */
export interface SpecDocRepo extends SpecRepo {
  /** Id cited by `doc.repo`: `[a-z0-9-]+`, unique in the specialization. */
  id: string;
}

/** Document of a type that lives in a repository declared in `docRepos` (v11). */
export interface SpecDocRef {
  repo: string;
  /** `.md` file relative to the repository root, without `#`. */
  path: string;
}

export interface SpecAnnotationType {
  id: string;
  name: string;
  description?: string;
  labelField?: string | null;
  requiresOwner?: boolean;
  /** Type ids and, in `formatVersion` 11, layer and group clauses (see `specChildren.ts`). */
  allowedChildren?: SpecAllowedChild[];
  /** Groups of the own layer the type belongs to (`formatVersion` 11 only). */
  groups?: string[];
  /** Roles a child may have in the link with this type (`formatVersion` 11 only). */
  childRoles?: SpecChildRole[];
  /** Label of the role in the UI; absent = "Role" (`formatVersion` 11 only, with `childRoles`). */
  childRolesLabel?: string;
  fields: SpecField[];
  code?: SpecCodeMap;
  /** Origin elements the type corresponds to (`formatVersion` 3 onward). */
  sources?: SpecTypeSource[];
  /** Package path of the `.json` component that draws the type (`formatVersion` 4 only). */
  component?: string;
  /**
   * `.md` document of the type: a package path (`formatVersion` 4 onward) or, in
   * `formatVersion` 11, `{ repo, path }` of a repository declared in `docRepos`.
   */
  doc?: string | SpecDocRef;
  /** Examples of the type (`formatVersion` 4 only). */
  examples?: SpecExample[];
  /**
   * The type's instance is a **floating** marking (`formatVersion` 7 only): it lives on the
   * canvas, outside the containment tree, and is drawn above everything. Absent = `false`.
   */
  floating?: boolean;
  /**
   * Where the annotation applies (`formatVersion` 7 only): `marking` (default), `arrow` or both.
   * An arrow-only type has no `component` or `floating`: the arrow has no component drawing.
   */
  appliesTo?: SpecAppliesTo[];
  /** Notices of the type (`formatVersion` 10 only). */
  notices?: SpecNotice[];
  /**
   * The type groups and does not draw (`formatVersion` 15 only): no `component`; the marking does
   * not show the name header and the outline only appears on hover or when selected. Absent = `false`.
   */
  structural?: boolean;
}

/** Items an annotation type applies to (ME4, decision 14). */
export type SpecAppliesTo = 'marking' | 'arrow';
export const SPEC_APPLIES_TO: readonly SpecAppliesTo[] = ['marking', 'arrow'];

/**
 * Does the type apply to this item? Without `appliesTo` (or in the old specialization), only
 * markings; a type declared only for the arrow does not apply to the marking.
 */
export function typeAppliesTo(
  type: Pick<SpecAnnotationType, 'appliesTo'>,
  kind: SpecAppliesTo,
): boolean {
  return (type.appliesTo ?? ['marking']).includes(kind);
}

/** Container preset of the specialization (`formatVersion` 6 only): initial size and background. */
export interface SpecContainer {
  /** `[a-z0-9-]+`, unique in the specialization. */
  id: string;
  name: string;
  /** Pixels, integer from 1 to `MAX_CONTAINER_SIZE`. */
  width: number;
  height: number;
  /** `#RRGGBB`; absent = white. */
  background?: string;
}

export interface SpecLayer {
  id: string;
  name: string;
  color: string;
  /** Groups of types of the layer, in the order of the headings (`formatVersion` 11 only). */
  groups?: SpecLayerGroup[];
  annotationTypes: SpecAnnotationType[];
}

/** A field model (`formatVersion` 16 only), in one of these four forms. */
export type SpecFieldModel =
  /** Copies `type`, `options`, `suggestions`, `code.values`, `sources[].values` of `<type>.<field>`. */
  | { like: string }
  | { type: 'number' | 'string' | 'enum'; options?: string[]; format?: string }
  /** One field per factory parameter (optional `call`; parameter name → type in the source). */
  | { expand: { call?: string; params: Record<string, string> } }
  | { ignore: true };

/** `<platform id or system>` → (`<type in the source, exact text>` | `boolean`) → model. */
export type SpecFieldModels = Record<string, Record<string, SpecFieldModel>>;

export interface Spec {
  format: typeof SPEC_FORMAT | typeof LEGACY_SPEC_FORMAT;
  formatVersion: SpecFormatVersion;
  id: string;
  name: string;
  version: number;
  description?: string;
  platforms?: SpecPlatform[];
  /** Repositories of the external documents (`formatVersion` 11 only). */
  docRepos?: SpecDocRepo[];
  /** Presets of the New container dialog (`formatVersion` 6 only). */
  containers?: SpecContainer[];
  layers: SpecLayer[];
  /** Fonts of the package (`formatVersion` 4 only). */
  fonts?: SpecFont[];
  /** Executable origins, validated by `parseOrigins` (`formatVersion` 4 only). */
  origins?: SpecOrigin[];
  /** Version contract (`formatVersion` 4 only). */
  migrations?: SpecMigration[];
  /** Design tokens (color, number, family) per mode, read by `$token` (`formatVersion` 15 only). */
  tokens?: SpecTokens;
  /** Package `.json` file with the icon set (`mapping-icons`; `formatVersion` 15 only). */
  icons?: string;
  /**
   * Field models by platform or system and by type in the source (`formatVersion` 16 only): how
   * a source type (`Color`, `Dp`, `boolean`) becomes a field; see `specSignature.ts`.
   */
  fieldModels?: SpecFieldModels;
}

const KEY_RE = /^[A-Za-z0-9_]+$/;
const TAG_RE = /^[a-z0-9-]+$/;
/** Format of a platform id (`platforms[].id`, keys of `code` and of `platformRepos`). */
export const PLATFORM_ID_RE = /^[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const nonEmpty = z.string().min(1, 'não pode ser vazio');
const color = z.string().regex(HEX_COLOR_RE, 'cor inválida; use o formato #RRGGBB');
const tag = z.string().regex(TAG_RE, 'etiqueta inválida; use [a-z0-9-]+');
const tags = z.array(tag);

const key = z
  .string()
  .regex(KEY_RE, 'chave inválida; use apenas [A-Za-z0-9_], sem espaços')
  .refine((k) => !k.startsWith('_'), 'chave não pode começar com "_" (reservado)');

const platformId = z
  .string()
  .regex(PLATFORM_ID_RE, 'id de plataforma inválido; use [a-z0-9-]+');

// The removed type is still accepted here so the field can be read and ignored (`dropRemovedFields`).
const fieldType = z.enum(
  ['string', 'number', 'date', 'enum', 'table', 'ref', REMOVED_FIELD_TYPE],
  {
    error: (issue) =>
      typeof issue.input === 'string'
        ? specMsg('spec.fieldTypeInvalid', { value: issue.input }).text
        : 'obrigatório',
  },
);

/** `true` for an existing date in ISO format `YYYY-MM-DD`. */
export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const dateString = z
  .string()
  .regex(DATE_RE, 'data inválida; use AAAA-MM-DD')
  .refine(isIsoDate, 'data inexistente');

/** Package file path with the given extension (or one of the extensions). */
function packagePath(ext: string | readonly string[]) {
  return z.string({ error: () => 'deve ser texto' }).superRefine((path, ctx) => {
    const error = packagePathError(path, ext);
    if (error !== undefined) addSpecIssue(ctx, [], packagePathMsg(error));
  });
}

const typeSourceShape = z
  .object({
    system: nonEmpty,
    id: nonEmpty.optional(),
    name: nonEmpty.optional(),
    slot: nonEmpty.optional(),
    ignore: z.array(nonEmpty).optional(),
    // `formatVersion` 16 only (`specSignature.ts`).
    signature: packagePath('.json').optional(),
  })
  .strict()
  .refine((s) => s.id !== undefined || s.name !== undefined, 'precisa de "id" ou "name"');

// `name` and `path` are optional here; which one is required depends on whether the `system` is in
// `origins` (cross rule, `checkFieldSources`).
const fieldSourceShape = z
  .object({
    system: nonEmpty,
    name: nonEmpty.optional(),
    path: nonEmpty.optional(),
    values: z.record(z.string(), nonEmpty).optional(),
  })
  .strict();

const acceptsSchema = z
  .object({
    tags: tags.optional(),
    free: z.boolean().optional(),
    // `formatVersion` 14 only; the items use the form and the resolver of `allowedChildren`.
    annotations: z
      .array(z.lazy(() => allowedChildShape))
      .refine(
        (a) => a.length > 0,
        'não pode ser vazio; tire a chave ou liste ao menos um item',
      )
      .optional(),
  })
  .strict()
  .refine(
    (a) =>
      (a.tags?.length ?? 0) > 0 || a.free === true || (a.annotations?.length ?? 0) > 0,
    'precisa de pelo menos uma etiqueta, "free": true ou "annotations"',
  );

const noticeShape = z
  .object({
    kind: z.enum(SPEC_NOTICE_KINDS, {
      error: (issue) =>
        issue.input === undefined
          ? 'obrigatório'
          : typeof issue.input === 'string'
            ? specMsg('spec.noticeKindInvalid', { value: issue.input }).text
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

/** Two notices with the same `kind` and the same `message` in the same `notices` (v10). */
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

/** Shape of a field (column or top-level field); cross rules come further down. */
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
    // Only existed on the removed type: accepted there (where it is ignored) and refused in the others.
    platforms: z.unknown().optional(),
    description: z.string().optional(),
    sources: z.array(fieldSourceShape).optional(),
    notices: noticesShape.optional(),
  })
  .strict();

type RawField = z.infer<typeof fieldShape>;

/**
 * Why `value` does not work as the value of a field of type `type` (a field's `default`, the
 * `default` of a `fill-field` step, the value of an example); `undefined` if it works.
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

/** `suggestions` (v8): non-empty list, up to 200 unique, non-empty texts without edge spaces. */
function checkSuggestions(
  suggestions: readonly string[],
  add: (sub: string, message: string | SpecMsg) => void,
): void {
  if (suggestions.length === 0) {
    add('suggestions', 'não pode ser vazio; tire a chave ou liste ao menos uma sugestão');
    return;
  }
  if (suggestions.length > MAX_SUGGESTIONS) {
    add('suggestions', specMsg('spec.suggestionsMax', { max: MAX_SUGGESTIONS }));
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

/** Validates a field; `column` = inside `table` (simple types and `ref`, never `table`). */
function checkField(
  field: RawField,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  column: boolean,
  siblings: ReadonlyMap<string, string>,
): void {
  const add = (sub: string, message: string | SpecMsg) =>
    addSpecIssue(ctx, [...path, sub], message);
  const add2 = (sub: (string | number)[], message: string | SpecMsg) =>
    addSpecIssue(ctx, [...path, ...sub], message);

  const { type } = field;
  if (column && (type === 'table' || type === REMOVED_FIELD_TYPE)) {
    add('type', specMsg('spec.columnTypeNotAllowed', { type }));
    return;
  }
  // Removed type: the whole field is ignored (with a warning from whoever imports), nothing is checked.
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
      const key = field.linkedRef;
      if (target === undefined) {
        add(
          'linkedRef',
          specMsg(column ? 'spec.linkedRefNotColumn' : 'spec.notTypeField', { key }),
        );
      } else if (target !== 'ref') {
        add(
          'linkedRef',
          specMsg(column ? 'spec.linkedRefNotRefColumn' : 'spec.linkedRefNotRefField', {
            key,
          }),
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
        add2(['sources', i, 'values', from], specMsg('spec.notInOptions', { value: to }));
      }
    }
  });

  if (type === 'table' && column) return;
  if (column && field.tags !== undefined) {
    add('tags', 'colunas não têm etiquetas; use "tags" na table');
  }
}

/** The zod issues carry the `input`, which the default text's `received` comes from (not the model). */
const REPORT_INPUT = { reportInput: true } as const;

/** Validates and normalizes the fields of a type (including table columns). */
type ColumnParse = ReturnType<typeof fieldShape.safeParse>;
let columnParses = new WeakMap<object, ColumnParse>();

/** Reads a `table` column by the shape of the fields; the same column is read only once. */
function parseColumn(raw: unknown): ColumnParse {
  if (typeof raw !== 'object' || raw === null) {
    return fieldShape.safeParse(raw, REPORT_INPUT);
  }
  let hit = columnParses.get(raw);
  if (hit === undefined) {
    hit = fieldShape.safeParse(raw, REPORT_INPUT);
    columnParses.set(raw, hit);
  }
  return hit;
}

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
      addSpecIssue(ctx, [...p, 'key'], specMsg('spec.keyRepeated', { key: field.key }));
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
      const parsed = parseColumn(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues)
          forwardIssue(ctx, issue, cp, false, KNOWN_SPEC_MSGS);
        return;
      }
      const col = parsed.data;
      if (colSeen.has(col.key)) {
        addSpecIssue(ctx, [...cp, 'key'], specMsg('spec.keyRepeated', { key: col.key }));
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
      addSpecIssue(
        ctx,
        [...p, 'rowLabel'],
        specMsg('spec.rowLabelNotStringColumn', { key: field.rowLabel }),
      );
    }
  });
}

/**
 * The `formatVersion` 16 keys of the `code` (and of the `variants` case); the version and the
 * content are in `specSignature.ts`.
 */
const signatureKeys = {
  signature: packagePath('.json').optional(),
  ignore: z.array(nonEmpty).optional(),
  calls: z.record(z.string(), nonEmpty).optional(),
  formats: z.record(z.string(), nonEmpty).optional(),
};

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
    ...signatureKeys,
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
    ...signatureKeys,
    variants: codeVariantsShape.optional(),
  })
  .strict();

type RawFieldMap = ReadonlyMap<string, RawField>;

/** `params` and `values` of a `code` section (the base or a case) only cite the type's fields and options. */
function checkCodeMaps(
  entry: Pick<z.infer<typeof codeCaseShape>, 'params' | 'values'>,
  fields: RawFieldMap,
  base: (string | number)[],
  add: (path: (string | number)[], message: string | SpecMsg) => void,
): void {
  for (const k of Object.keys(entry.params ?? {})) {
    if (!fields.has(k))
      add([...base, 'params', k], specMsg('spec.notTypeField', { key: k }));
  }
  for (const [k, translation] of Object.entries(entry.values ?? {})) {
    const field = fields.get(k);
    if (!field) {
      add([...base, 'values', k], specMsg('spec.notTypeField', { key: k }));
      continue;
    }
    if (field.type !== 'enum') {
      add([...base, 'values', k], specMsg('spec.codeFieldNotEnum', { key: k }));
      continue;
    }
    for (const option of Object.keys(translation)) {
      if (!(field.options ?? []).includes(option)) {
        add(
          [...base, 'values', k, option],
          specMsg('spec.notInOptionsOf', { value: option, field: k }),
        );
      }
    }
  }
}

/** `variants`: the field is an `enum` of the type, the cases use its `options`, each case changes something. */
function checkCodeVariants(
  variants: z.infer<typeof codeVariantsShape>,
  fields: RawFieldMap,
  base: (string | number)[],
  add: (path: (string | number)[], message: string | SpecMsg) => void,
): void {
  const vp = [...base, 'variants'];
  const field = fields.get(variants.field);
  let options: readonly string[] | undefined;
  if (!field) {
    add([...vp, 'field'], specMsg('spec.notTypeField', { key: variants.field }));
  } else if (field.type !== 'enum') {
    add([...vp, 'field'], specMsg('spec.codeFieldNotEnum', { key: variants.field }));
  } else {
    options = field.options ?? [];
  }
  const entries = Object.entries(variants.cases);
  if (entries.length === 0) add([...vp, 'cases'], 'declare ao menos um caso');
  for (const [value, kase] of entries) {
    const cp = [...vp, 'cases', value];
    if (options !== undefined && !options.includes(value)) {
      add(cp, specMsg('spec.notInOptionsOf', { value, field: variants.field }));
    }
    if (Object.keys(kase).length === 0) {
      add(cp, 'caso vazio: declare symbol, path, params, values ou notes');
      continue;
    }
    checkCodeMaps(kase, fields, cp, add);
  }
}

/** `params`, `values` and `variants` of each `code` platform only cite the type's fields (and options). */
function checkCode(
  type: { fields: RawField[]; code?: Record<string, z.infer<typeof codeEntryShape>> },
  ctx: z.RefinementCtx,
): void {
  const fields = new Map(type.fields.map((f) => [f.key, f]));
  const add = (path: (string | number)[], message: string | SpecMsg) =>
    addSpecIssue(ctx, path, message);

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
        // The list of rows of a `table` field; the rows and cells are checked in
        // `checkExamples`, with the exact message and path.
        z.union([z.string(), z.number(), z.null(), z.array(z.unknown())], {
          error:
            'deve ser texto, número ou null (ou uma lista de linhas, num campo table)',
        }),
      )
      .optional(),
    system: nonEmpty.optional(),
    file: packagePath('.json').optional(),
  })
  .strict();

type RawExample = z.infer<typeof exampleShape>;

/** Unique names, a single mode (`values` or `system` + `file`) and values that fit the fields. */
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
    const add = (sub: (string | number)[], message: string | SpecMsg) =>
      addSpecIssue(ctx, [...p, ...sub], message);

    if (names.has(example.name)) {
      add(['name'], specMsg('spec.exampleNameRepeated', { name: example.name }));
    }
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
        add(['values', k], specMsg('spec.notTypeField', { key: k }));
      } else if (value === null) {
        continue;
      } else if (field.type === 'table') {
        if (Array.isArray(value))
          checkExampleRows(field, value, [...p, 'values', k], ctx);
        else add(['values', k], specMsg('spec.exampleTableNeedsRows'));
      } else if (field.type === 'ref') {
        add(['values', k], 'campo "ref" não aceita valor em exemplo');
      } else {
        const problem = valueProblem(field.type, field.options, value);
        if (problem !== undefined) add(['values', k], problem);
      }
    }
  });
}

/** The rows of a `table` field's example: column → value objects, each cell of the column's type. */
function checkExampleRows(
  field: RawField,
  rows: readonly unknown[],
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const columns = new Map<string, RawField>();
  for (const raw of field.columns ?? []) {
    const column = parseColumn(raw);
    if (column.success) columns.set(column.data.key, column.data);
  }
  rows.forEach((row, i) => {
    const rowPath = [...path, i];
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      addSpecIssue(ctx, rowPath, specMsg('spec.exampleRowNotObject'));
      return;
    }
    for (const [key, cell] of Object.entries(row)) {
      const cellPath = [...rowPath, key];
      const column = columns.get(key);
      if (column === undefined) {
        addSpecIssue(
          ctx,
          cellPath,
          specMsg('spec.exampleNotColumn', { key, field: field.key }),
        );
      } else if (cell === null) {
        continue;
      } else if (column.type === 'ref') {
        addSpecIssue(ctx, cellPath, specMsg('spec.exampleRefCell'));
      } else {
        const problem = valueProblem(column.type, column.options, cell);
        if (problem !== undefined)
          ctx.addIssue({ code: 'custom', path: cellPath, message: problem });
      }
    }
  });
}

/** `appliesTo`: non-empty, no repetition; an arrow-only type has no `component` or `floating`. */
function checkAppliesTo(
  type: { appliesTo?: SpecAppliesTo[]; component?: string; floating?: boolean },
  ctx: z.RefinementCtx,
): void {
  const { appliesTo } = type;
  if (appliesTo === undefined) return;
  const add = (path: (string | number)[], message: string) =>
    addSpecIssue(ctx, path, message);
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

/** Required, non-empty text (the messages of the new v11 objects). */
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

/** Re-emits on `ctx` the issues of an object read by another schema, at the same relative path. */
function forwardIssues(
  result: { success: boolean; error?: { issues: readonly z.core.$ZodIssue[] } },
  ctx: z.RefinementCtx,
): void {
  // The extra property comes out in Portuguese, in the mold of the other specialization errors.
  for (const issue of result.error?.issues ?? [])
    forwardIssue(ctx, issue, [], true, KNOWN_SPEC_MSGS);
}

/** An `allowedChildren` item: a type's id or a `{ layer, groups? }` clause. */
function checkAllowedChild(value: unknown, ctx: z.RefinementCtx): void {
  if (typeof value === 'string') {
    if (value === '') ctx.addIssue({ code: 'custom', message: 'não pode ser vazio' });
    return;
  }
  if (!isRecord(value)) {
    ctx.addIssue({ code: 'custom', message: ALLOWED_CHILD_SHAPE_MESSAGE });
    return;
  }
  const parsed = childClauseShape.safeParse(value, REPORT_INPUT);
  forwardIssues(parsed, ctx);
  if (parsed.success && parsed.data.groups?.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['groups'], message: GROUPS_EMPTY });
  }
}

const allowedChildShape = z
  .custom<SpecAllowedChild>()
  .superRefine((value: unknown, ctx) => checkAllowedChild(value, ctx));

/** Why the `path` does not work as the `.md` file of a repository; `undefined` if it works. */
function docPathProblem(path: string): SpecMsg | undefined {
  if (path.includes('#')) return specMsg('spec.docAnchor');
  if (!isValidCodePath(path)) return specMsg('spec.docPathInvalid');
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.length > '.md'.length && base.endsWith('.md')
    ? undefined
    : specMsg('spec.invalidExtension', { exts: '.md' });
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
        if (problem !== undefined) addSpecIssue(ctx, [], problem);
      }),
  })
  .strict();

const docPackageShape = packagePath('.md');

/** `doc`: a package `.md` path or, in v11, `{ repo, path }` of a `docRepos` repository. */
const docShape = z.custom<string | SpecDocRef>().superRefine((value: unknown, ctx) => {
  if (typeof value === 'string') {
    forwardIssues(docPackageShape.safeParse(value, REPORT_INPUT), ctx);
  } else if (isRecord(value)) {
    forwardIssues(docRefShape.safeParse(value, REPORT_INPUT), ctx);
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

/** `childRoles` and `childRolesLabel` (v11): non-empty, unique roles, only on a type with children. */
function checkChildRoles(
  type: {
    allowedChildren?: readonly unknown[] | undefined;
    childRoles?: readonly { id: string }[] | undefined;
    childRolesLabel?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const add = (path: (string | number)[], message: string | SpecMsg) =>
    addSpecIssue(ctx, path, message);
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
    if (seen.has(role.id)) {
      add(['childRoles', i, 'id'], specMsg('spec.idRepeated', { id: role.id }));
    }
    seen.add(role.id);
  });
}

/** `groups` of a type (v11): non-empty, no repetition; existence is checked on the layer. */
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
      addSpecIssue(ctx, ['groups', i], specMsg('spec.groupRepeated', { group }));
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
              ? specMsg('spec.appliesToInvalid', { value: issue.input }).text
              : 'deve ser "marking" ou "arrow"',
        }),
      )
      .optional(),
    notices: noticesShape.optional(),
    structural: z.boolean({ error: 'deve ser true ou false' }).optional(),
  })
  .strict()
  .superRefine((type, ctx) => {
    if (type.structural === true && type.component !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['structural'],
        message: 'um tipo estrutural não desenha: não pode ter component',
      });
    }
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
        addSpecIssue(
          ctx,
          ['labelField'],
          specMsg('spec.labelFieldNotString', { key: type.labelField }),
        );
      }
    }
  });

/** Before v15, `structural` on the type is an error at the exact path. */
function checkNoStructural(
  layers: readonly { annotationTypes: readonly { structural?: unknown }[] }[],
  ctx: z.RefinementCtx,
): void {
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      if (type.structural === undefined) return;
      addSpecIssue(
        ctx,
        ['layers', li, 'annotationTypes', ti, 'structural'],
        onlyFormat(15),
      );
    });
  });
}

/** Before v10, `notices` (on the type, field and column) is an error at the exact path. */
function checkNoNotices(
  layers: readonly { annotationTypes: readonly RawNoticeHolder[] }[],
  ctx: z.RefinementCtx,
): void {
  const only10 = (path: (string | number)[]) =>
    addSpecIssue(ctx, [...path, 'notices'], onlyFormat(10));
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

/** The message with a code for zod's `refine`: the text and the `messageCode` in `params`. */
const refineMsg = (msg: SpecMsg) => ({
  message: msg.text,
  params: { messageCode: msg.code, ...msg.params },
});

const URL_TEMPLATE_NEEDS_PATH = specMsg('spec.urlTemplateNeedsPath', { path: '{path}' });

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
        refineMsg(URL_TEMPLATE_NEEDS_PATH),
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

// Ready-made messages that zod receives, with constant values: `issueCoding` finds them by the
// exact text (`KNOWN_SPEC_MSGS`), with no regex pattern. Parameters as text, as the regex gave them.
const FORMAT_INVALID = specMsg('spec.formatInvalid', { format: SPEC_FORMAT });
const FORMAT_VERSION_INVALID = specMsg('spec.formatVersionInvalid', {
  versions: SPEC_FORMAT_VERSIONS.slice(0, -1).join(', '),
  last: String(SPEC_FORMAT_VERSIONS.at(-1)),
});
const CONTAINER_SIDE_MAX = specMsg('spec.containerSideMax', {
  max: String(MAX_CONTAINER_SIZE),
});
const WEIGHT_MIN = 100;
const WEIGHT_MAX = 1000;
const FONT_WEIGHT_INVALID = specMsg('spec.fontWeightInvalid', {
  min: String(WEIGHT_MIN),
  max: String(WEIGHT_MAX),
});
const KNOWN_SPEC_MSGS: readonly SpecMsg[] = [
  FORMAT_INVALID,
  FORMAT_VERSION_INVALID,
  CONTAINER_SIDE_MAX,
  FONT_WEIGHT_INVALID,
];

const containerSide = z
  .number({ error: 'deve ser um número' })
  .int('deve ser inteiro')
  .min(1, 'deve ser >= 1')
  .max(MAX_CONTAINER_SIZE, CONTAINER_SIDE_MAX.text);

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
const WEIGHT_RANGE_RE = /^(\d+) (\d+)$/;
const WEIGHT_MESSAGE = FONT_WEIGHT_INVALID.text;

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
    // Role steps of the link (`formatVersion` 12 only); `type` is the owner's type.
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

/** `sources` only exists in `formatVersion` 3: points at each use in an earlier version. */
function checkNoSources(
  layers: readonly {
    annotationTypes: readonly { sources?: unknown; fields: readonly RawField[] }[];
  }[],
  ctx: z.RefinementCtx,
): void {
  const add = (path: (string | number)[]) => addSpecIssue(ctx, path, onlyFormat(3));
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

/** Keys of `formatVersion` 4 on types (`component`, `doc`, `examples`) in an earlier version. */
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
          addSpecIssue(ctx, ['layers', li, 'annotationTypes', ti, k], onlyFormat(4));
        }
      }
    });
  });
}

/**
 * `path` of a field origin (`a.b[0].c`): valid syntax and no `[*]`. `undefined` if it works.
 */
function fieldPathProblem(path: string): SpecMsg | undefined {
  const parsed = parsePath(path);
  if (!parsed.ok) return pathErrorMsg(path, parsed.error);
  if (parsed.segments.includes(null)) return specMsg('spec.fieldPathWildcard', { path });
  return undefined;
}

/**
 * Cross rules of the `sources` of a field or column (v3 onward) that depend on whether the
 * `system` is in `origins`: an executable system requires `path` (and `name` becomes only the
 * display name); the others require `name` and do not accept `path`.
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
    const add = (key: string, message: string | SpecMsg) =>
      addSpecIssue(ctx, [...at, key], message);
    const isExecutable = version >= 4 && executable.has(source.system);
    if (source.path !== undefined) {
      if (version < 4) add('path', onlyFormat(4));
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

/** `slot` and `ignore` of a type's `sources`: only in a system declared in `origins`. */
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
        addSpecIssue(ctx, [...at, key], onlyFormat(4));
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
        addSpecIssue(
          ctx,
          [...at, 'ignore', pi],
          specMsg('spec.ignoreRepeated', { prop }),
        );
      }
      seen.add(prop);
    });
  });
}

/** Applies `checkTypeSources` and `checkFieldSources` (fields and columns) to all types. */
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
          const column = parseColumn(raw);
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

/** The `system` of an external-system example must be in `origins`. */
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
        addSpecIssue(
          ctx,
          ['layers', li, 'annotationTypes', ti, 'examples', ei, 'system'],
          specMsg('spec.exampleSystemUndeclared', { system: example.system }),
        );
      });
    });
  });
}

/** Repeated `family` + `weight` + `style` pair in `fonts`. */
function checkFonts(
  fonts: readonly z.infer<typeof fontShape>[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  fonts.forEach((font, i) => {
    const style = font.style ?? 'normal';
    const id = JSON.stringify([font.family, font.weight ?? null, style]);
    if (seen.has(id)) {
      const params = { family: font.family, style };
      addSpecIssue(
        ctx,
        ['fonts', i],
        font.weight === undefined
          ? specMsg('spec.fontRepeatedNoWeight', params)
          : specMsg('spec.fontRepeated', { ...params, weight: font.weight }),
      );
    }
    seen.add(id);
  });
}

/** Column `key` of a `table` field (read by the same shape as fields); `undefined` if none. */
function columnOf(table: RawField, key: string): RawField | undefined {
  for (const raw of table.columns ?? []) {
    const parsed = parseColumn(raw);
    if (parsed.success && parsed.data.key === key) return parsed.data;
  }
  return undefined;
}

/** A step's field key: `key` (top level) or `table.column`. */
type FieldRef =
  | { kind: 'field' }
  | { kind: 'column'; table: string; column: string }
  | { kind: 'invalid'; message: SpecMsg };

function parseFieldRef(ref: string): FieldRef {
  const parts = ref.split('.');
  if (parts.length === 1) return { kind: 'field' };
  if (parts.length > 2) {
    return { kind: 'invalid', message: specMsg('spec.fieldRefManyDots', { ref }) };
  }
  const [table = '', column = ''] = parts;
  if (table === '' || column === '') {
    return { kind: 'invalid', message: specMsg('spec.fieldRefEmptyPart', { ref }) };
  }
  return { kind: 'column', table, column };
}

/** Role step of the link (`formatVersion` 12 only). */
type RoleStep = Extract<
  SpecMigrationStep,
  { op: 'rename-role' | 'remove-role' | 'set-role' }
>;

/** What `checkRoleStep` reads from the specialization: this version's types and roles, and the step's `add`. */
interface RoleStepEnv {
  readonly formatVersion: number;
  /** type id → roles (`childRoles`); a type without `childRoles` has no entry. */
  readonly roles: ReadonlyMap<string, ReadonlySet<string>>;
  readonly hasType: (id: string) => boolean;
  /** Error at the path `migrations[i].steps[j].<key>`. */
  readonly add: (key: string, message: string | SpecMsg) => void;
}

/** The role exists on the type (new side). */
function roleHere(
  roles: ReadonlySet<string>,
  typeId: string,
  role: string,
  where: string,
  env: RoleStepEnv,
): void {
  if (!roles.has(role)) env.add(where, specMsg('spec.roleNotOfType', { role, typeId }));
}

/** The role no longer exists on the type (old side). */
function roleGone(
  roles: ReadonlySet<string> | undefined,
  typeId: string,
  role: string,
  where: string,
  env: RoleStepEnv,
): void {
  if (roles?.has(role)) {
    env.add(where, specMsg('spec.roleStillExists', { role, typeId }));
  }
}

/**
 * The role steps (formatVersion 12): `rename-role` and `set-role` require a type of this version
 * with `childRoles`; `remove-role` requires only the type (it may have no roles left). The
 * `childType` of `set-role` only has its format checked by zod, the type need not exist.
 */
function checkRoleStep(step: RoleStep, env: RoleStepEnv): void {
  if (env.formatVersion < 12) {
    env.add('op', onlyFormat(12));
    return;
  }
  if (!env.hasType(step.type)) {
    env.add('type', specMsg('spec.typeNotInVersion', { typeId: step.type }));
    return;
  }
  const roles = env.roles.get(step.type);
  if (step.op === 'remove-role') {
    roleGone(roles, step.type, step.role, 'role', env);
    return;
  }
  if (roles === undefined) {
    env.add('type', specMsg('spec.typeNoRoles', { typeId: step.type }));
    return;
  }
  if (step.op === 'set-role') {
    roleHere(roles, step.type, step.role, 'role', env);
    return;
  }
  roleHere(roles, step.type, step.to, 'to', env);
  roleGone(roles, step.type, step.from, 'from', env);
}

/** type id → role ids (`childRoles`); a type without `childRoles` is left out. */
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

type StepAdd = (key: string | PathKeys, message: string | SpecMsg) => void;
type FieldsByKey = ReadonlyMap<string, RawField>;

/** The type exists in this version (the step deals with one of its fields). */
function typeHere(
  types: ReadonlyMap<string, FieldsByKey>,
  id: string,
  stepAdd: StepAdd,
): FieldsByKey | undefined {
  const fields = types.get(id);
  if (!fields) stepAdd('type', specMsg('spec.typeNotInVersion', { typeId: id }));
  return fields;
}

/** The field (or the column `table.column`) exists on the type (new side). */
function fieldHere(
  fields: FieldsByKey,
  typeId: string,
  key: string,
  where: string,
  stepAdd: StepAdd,
): RawField | undefined {
  const ref = parseFieldRef(key);
  if (ref.kind === 'invalid') {
    stepAdd(where, ref.message);
    return undefined;
  }
  if (ref.kind === 'field') {
    const field = fields.get(key);
    if (!field) stepAdd(where, specMsg('spec.notFieldOfType', { key, typeId }));
    return field;
  }
  const table = fields.get(ref.table);
  if (!table) {
    stepAdd(where, specMsg('spec.notFieldOfType', { key: ref.table, typeId }));
    return undefined;
  }
  if (table.type !== 'table') {
    stepAdd(where, specMsg('spec.notTableOfType', { key: ref.table, typeId }));
    return undefined;
  }
  const column = columnOf(table, ref.column);
  if (!column) {
    stepAdd(where, specMsg('spec.notColumnOfTable', { key, table: ref.table, typeId }));
  }
  return column;
}

/** The field (or the column `table.column`) no longer exists on the type (old side). */
function fieldGone(
  fields: FieldsByKey,
  typeId: string,
  key: string,
  where: string,
  stepAdd: StepAdd,
): void {
  const ref = parseFieldRef(key);
  if (ref.kind === 'invalid') {
    stepAdd(where, ref.message);
  } else if (ref.kind === 'field') {
    if (fields.has(key)) {
      stepAdd(where, specMsg('spec.fieldStillExists', { key, typeId }));
    }
  } else {
    // Table that no longer exists: the column went with it, and that is what the step declares.
    const table = fields.get(ref.table);
    if (!table) return;
    if (table.type !== 'table') {
      stepAdd(where, specMsg('spec.notTableOfType', { key: ref.table, typeId }));
    } else if (columnOf(table, ref.column)) {
      stepAdd(
        where,
        specMsg('spec.columnStillExists', {
          column: ref.column,
          table: ref.table,
          typeId,
        }),
      );
    }
  }
}

function typeGone(
  types: ReadonlyMap<string, FieldsByKey>,
  id: string,
  where: string,
  stepAdd: StepAdd,
): void {
  if (types.has(id)) stepAdd(where, specMsg('spec.typeStillExists', { typeId: id }));
}

/**
 * Checks of the `migrations` that a single file allows: versions, unique `from` and, in each
 * step, the new side exists and the old side no longer exists in this version. A step's field
 * key is `key` (top-level field) or `table.column` (column of a `table` field, which also holds
 * data). Whether the old side existed in the previous version is a matter for `diffSpecs`, which
 * compares two versions.
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
  /** type id → fields (without the removed type) by key. */
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
    const add = (sub: PathKeys, message: string | SpecMsg) =>
      addSpecIssue(ctx, [...mp, ...sub], message);

    if (fromSeen.has(migration.from)) {
      add(['from'], specMsg('spec.migrationFromRepeated', { from: migration.from }));
    }
    fromSeen.add(migration.from);
    if (migration.to <= migration.from) {
      add(['to'], specMsg('spec.migrationToGreater', { from: migration.from }));
    }
    if (migration.to > spec.version) {
      add(['to'], specMsg('spec.migrationToMax', { version: spec.version }));
    }

    migration.steps.forEach((step, si) => {
      const sp: PathKeys = ['steps', si];
      const stepAdd: StepAdd = (key, message) =>
        add([...sp, ...(typeof key === 'string' ? [key] : key)], message);
      switch (step.op) {
        case 'rename-type':
          if (!types.has(step.to))
            stepAdd('to', specMsg('spec.typeNotInVersion', { typeId: step.to }));
          typeGone(types, step.from, 'from', stepAdd);
          break;
        case 'remove-type':
          typeGone(types, step.type, 'type', stepAdd);
          break;
        case 'rename-field': {
          const fields = typeHere(types, step.type, stepAdd);
          if (!fields) break;
          fieldHere(fields, step.type, step.to, 'to', stepAdd);
          fieldGone(fields, step.type, step.from, 'from', stepAdd);
          break;
        }
        case 'remove-field': {
          const fields = typeHere(types, step.type, stepAdd);
          if (fields) fieldGone(fields, step.type, step.field, 'field', stepAdd);
          break;
        }
        case 'map-values': {
          const fields = typeHere(types, step.type, stepAdd);
          if (!fields) break;
          const field = fieldHere(fields, step.type, step.field, 'field', stepAdd);
          if (!field) break;
          if (field.type !== 'enum') {
            stepAdd(
              'field',
              specMsg(
                step.field.includes('.')
                  ? 'spec.migrationColumnNotEnum'
                  : 'spec.codeFieldNotEnum',
                { key: step.field },
              ),
            );
            break;
          }
          for (const [from, to] of Object.entries(step.values)) {
            if (!(field.options ?? []).includes(to)) {
              stepAdd(['values', from], specMsg('spec.notInOptions', { value: to }));
            }
          }
          break;
        }
        case 'fill-field': {
          const fields = typeHere(types, step.type, stepAdd);
          if (!fields) break;
          const field = fieldHere(fields, step.type, step.field, 'field', stepAdd);
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

/** Each `parseOrigins` problem (path, message and code) becomes an issue at the exact path. */
type OriginsParse = ReturnType<typeof parseOrigins>;
let originParses = new WeakMap<object, OriginsParse>();

/** Clears the stored reads: they only hold within one validation (the JSON may change between them). */
function resetParseCaches(): void {
  columnParses = new WeakMap();
  originParses = new WeakMap();
}

/** `parseOrigins(raw)` with the default path, read once per list of origins. */
function originsOf(raw: unknown): OriginsParse {
  if (typeof raw !== 'object' || raw === null) return parseOrigins(raw);
  let hit = originParses.get(raw);
  if (hit === undefined) {
    hit = parseOrigins(raw);
    originParses.set(raw, hit);
  }
  return hit;
}

function addOriginIssues(
  raw: unknown,
  ctx: z.RefinementCtx,
  formatVersion: number,
): void {
  // `kind` (`measured` origin) is from v15; before it, the key is an error at the exact path.
  if (formatVersion < 15 && Array.isArray(raw)) {
    raw.forEach((item, index) => {
      if (isRecord(item) && item.kind !== undefined) {
        addSpecIssue(ctx, ['origins', index, 'kind'], onlyFormat(15));
      }
    });
  }
  for (const problem of originsOf(raw).problems) {
    ctx.addIssue({
      code: 'custom',
      path: parseSpecPath(problem.path),
      message: problem.message,
      ...(problem.code === undefined
        ? {}
        : { params: { messageCode: problem.code, ...problem.params } }),
    });
  }
}

/** Systems declared in `origins` (read from the raw JSON, even if an origin has a problem). */
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
 * the inverse of `formatSpecPath`, to build the path of a zod issue from a text path (those of
 * `parseOrigins`). Keys with `.`, `[` or `]` are not supported.
 */
export function parseSpecPath(text: string): (string | number)[] {
  const keys: (string | number)[] = [];
  for (const match of text.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    keys.push(match[2] !== undefined ? Number(match[2]) : (match[1] ?? ''));
  }
  return keys;
}

/** What the v11 checkers read from a type (the raw shape, read by zod). */
interface V11Type {
  readonly id: string;
  readonly requiresOwner?: boolean | undefined;
  readonly groups?: readonly string[] | undefined;
  readonly allowedChildren?: readonly SpecAllowedChild[] | undefined;
  readonly childRoles?: readonly unknown[] | undefined;
  readonly childRolesLabel?: string | undefined;
  readonly doc?: string | SpecDocRef | undefined;
  readonly fields?: readonly V14Field[] | undefined;
}

/** `ref` field or column with `accepts.annotations` (v14), in the raw shape. */
interface V14Field {
  readonly accepts?:
    { readonly annotations?: readonly unknown[] | undefined } | undefined;
  readonly columns?: readonly unknown[] | undefined;
}

interface V11Layer {
  readonly id: string;
  readonly groups?: readonly { readonly id: string }[] | undefined;
  readonly annotationTypes: readonly V11Type[];
}

type IssueAdder = (path: (string | number)[], message: string | SpecMsg) => void;

const issueAdder =
  (ctx: z.RefinementCtx): IssueAdder =>
  (path, message) =>
    addSpecIssue(ctx, path, message);

/** Path of each type: `['layers', li, 'annotationTypes', ti]`. */
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

/** Before v11, each new key (clause, groups, childRoles, docRepos, object doc) is an error. */
function checkNoV11Keys(
  spec: { formatVersion: number; docRepos?: unknown; layers: readonly V11Layer[] },
  ctx: z.RefinementCtx,
): void {
  const add = issueAdder(ctx);
  const only11 = (path: (string | number)[]) => add(path, onlyFormat(11));
  if (spec.docRepos !== undefined) only11(['docRepos']);
  spec.layers.forEach((layer, li) => {
    if (layer.groups !== undefined) only11(['layers', li, 'groups']);
  });
  eachV11Type(spec.layers, (type, _layer, path) => {
    for (const key of ['groups', 'childRoles', 'childRolesLabel'] as const) {
      if (type[key] !== undefined) only11([...path, key]);
    }
    // Before v4 the `doc` is already an error (any form); from v4 to v10 only the object.
    if (isRecord(type.doc) && spec.formatVersion >= 4) only11([...path, 'doc']);
    (type.allowedChildren ?? []).forEach((item, ci) => {
      if (isRecord(item)) only11([...path, 'allowedChildren', ci]);
    });
  });
}

/** Ids of each layer's groups (the first layer with the id counts) and its index. */
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

/** From this `formatVersion` on, `allowedChildren` accepts types of the owner's own layer. */
const SAME_LAYER_VERSION = 13;

/** An `allowedChildren` clause (v11): the layer exists, is another one and the groups are its own. */
function checkChildClause(
  clause: SpecChildClause,
  li: number,
  layers: ReadonlyMap<string, { index: number; groups: ReadonlySet<string> }>,
  path: (string | number)[],
  add: IssueAdder,
  sameLayerAllowed: boolean,
): void {
  const target = layers.get(clause.layer);
  if (target === undefined) {
    add([...path, 'layer'], specMsg('spec.layerNotFound', { layer: clause.layer }));
    return;
  }
  if (target.index === li && !sameLayerAllowed) {
    add([...path, 'layer'], specMsg('spec.layerIsOwn', { layer: clause.layer }));
    return;
  }
  // A `groups` that is not a list was already refused by the clause's shape.
  const groups: readonly unknown[] = Array.isArray(clause.groups) ? clause.groups : [];
  groups.forEach((group, gi) => {
    if (typeof group !== 'string' || target.groups.has(group)) return;
    add(
      [...path, 'groups', gi],
      specMsg('spec.groupNotInLayer', { group, layer: clause.layer }),
    );
  });
}

/** A type id of `allowedChildren`: exists and, before v13, is in another layer. */
function checkChildId(
  childId: string,
  li: number,
  typeLayer: ReadonlyMap<string, number>,
  path: (string | number)[],
  add: IssueAdder,
  sameLayerAllowed: boolean,
): void {
  const childLayer = typeLayer.get(childId);
  if (childLayer === undefined) {
    add(path, specMsg('spec.typeNotFound', { typeId: childId }));
  } else if (childLayer === li && !sameLayerAllowed) {
    add(path, specMsg('spec.typeSameLayer', { typeId: childId }));
  }
}

/** Each `allowedChildren` item (id or, in v11, clause) points at something that exists. */
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
      if (typeof item === 'string')
        checkChildId(
          item,
          li,
          typeLayer,
          itemPath,
          add,
          spec.formatVersion >= SAME_LAYER_VERSION,
        );
      else if (
        spec.formatVersion >= 11 &&
        isRecord(item) &&
        typeof item.layer === 'string'
      ) {
        checkChildClause(
          item,
          li,
          layers,
          itemPath,
          add,
          spec.formatVersion >= SAME_LAYER_VERSION,
        );
      }
    });
  });
}

/** First `formatVersion` in which `accepts.annotations` exists. */
const ACCEPTS_ANNOTATIONS_VERSION = 14;

/** Each `accepts` of a `ref` field and column of the type, with its path. */
function eachAccepts(
  type: V11Type,
  typePath: (string | number)[],
  visit: (annotations: readonly unknown[], path: (string | number)[]) => void,
): void {
  (type.fields ?? []).forEach((field, fi) => {
    const fieldPath = [...typePath, 'fields', fi];
    const own = field.accepts?.annotations;
    if (own !== undefined) visit(own, [...fieldPath, 'accepts', 'annotations']);
    (field.columns ?? []).forEach((column, ci) => {
      const inner =
        isRecord(column) && isRecord(column.accepts) ? column.accepts : undefined;
      const items = inner?.annotations;
      if (Array.isArray(items)) {
        visit(items, [...fieldPath, 'columns', ci, 'accepts', 'annotations']);
      }
    });
  });
}

/**
 * `accepts.annotations` (v14): before it, an error; after it, each item points at something
 * that exists, with the same texts as `allowedChildren`.
 */
function checkAcceptsAnnotations(
  spec: { formatVersion: number; layers: readonly V11Layer[] },
  typeLayer: ReadonlyMap<string, number>,
  ctx: z.RefinementCtx,
): void {
  const add = issueAdder(ctx);
  const layers = layerGroupIndex(spec.layers);
  const current = spec.formatVersion >= ACCEPTS_ANNOTATIONS_VERSION;
  eachV11Type(spec.layers, (type, _layer, path, li) => {
    eachAccepts(type, path, (items, itemsPath) => {
      if (!current) {
        add(itemsPath, onlyFormat(ACCEPTS_ANNOTATIONS_VERSION));
        return;
      }
      items.forEach((item, ii) => {
        const itemPath = [...itemsPath, ii];
        if (typeof item === 'string') {
          checkChildId(item, li, typeLayer, itemPath, add, true);
        } else if (isRecord(item) && typeof item.layer === 'string') {
          const clause: SpecChildClause = { ...item, layer: item.layer };
          checkChildClause(clause, li, layers, itemPath, add, true);
        }
      });
    });
  });
}

/** v11: unique group ids in the layer and the type's `groups` only with groups of its own layer. */
function checkLayerGroups(layers: readonly V11Layer[], ctx: z.RefinementCtx): void {
  const add = issueAdder(ctx);
  layers.forEach((layer, li) => {
    const declared = new Set<string>();
    (layer.groups ?? []).forEach((group, gi) => {
      if (declared.has(group.id)) {
        add(
          ['layers', li, 'groups', gi, 'id'],
          specMsg('spec.idRepeated', { id: group.id }),
        );
      }
      declared.add(group.id);
    });
    layer.annotationTypes.forEach((type, ti) => {
      (type.groups ?? []).forEach((group, gi) => {
        if (declared.has(group)) return;
        add(
          ['layers', li, 'annotationTypes', ti, 'groups', gi],
          specMsg('spec.groupNotInLayer', { group, layer: layer.id }),
        );
      });
    });
  });
}

/** v11: `docRepos` with unique ids and every object `doc` citing one of them. */
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
    if (declared.has(repo.id)) {
      add(['docRepos', ri, 'id'], specMsg('spec.idRepeated', { id: repo.id }));
    }
    declared.add(repo.id);
  });
  eachV11Type(spec.layers, (type, _layer, path) => {
    const { doc } = type;
    if (!isRecord(doc) || typeof doc.repo !== 'string' || declared.has(doc.repo)) return;
    add([...path, 'doc', 'repo'], specMsg('spec.docRepoUndeclared', { repo: doc.repo }));
  });
}

/**
 * `requiresOwner`: the type must be in the resolved set of children of some **other** type
 * (being its own sole owner does not satisfy it: no annotation could be the owner).
 */
function checkRequiresOwner(
  spec: { layers: readonly V11Layer[] },
  ctx: z.RefinementCtx,
): void {
  const owners = childSets(spec).owners;
  const add = issueAdder(ctx);
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      if (!type.requiresOwner) return;
      const list = owners.get(type.id);
      const path = ['layers', li, 'annotationTypes', ti, 'requiresOwner'];
      if (list === undefined) {
        add(path, specMsg('spec.ownerNoneLists', { typeId: type.id }));
      } else if (list.every((id) => id === type.id)) {
        add(path, specMsg('spec.ownerOnlySelf', { typeId: type.id }));
      }
    });
  });
}

const TOKEN_MODE_RE = /^[a-z0-9][a-z0-9-]*$/;

/** `tokens.modes`: non-empty list of distinct names. Returns the valid modes (or `null`). */
function tokenModes(
  tokens: Record<string, unknown>,
  add: IssueAdder,
): readonly string[] | null {
  const modes = tokens.modes;
  if (!Array.isArray(modes) || modes.length === 0) {
    add(['tokens', 'modes'], 'deve ser uma lista com ao menos um modo');
    return null;
  }
  const seen = new Set<string>();
  let ok = true;
  modes.forEach((mode: unknown, i) => {
    if (typeof mode !== 'string' || !TOKEN_MODE_RE.test(mode)) {
      add(['tokens', 'modes', i], 'modo inválido; use [a-z0-9][a-z0-9-]*');
      ok = false;
    } else if (seen.has(mode)) {
      add(['tokens', 'modes', i], specMsg('spec.tokenModeRepeated', { mode }));
      ok = false;
    }
    if (typeof mode === 'string') seen.add(mode);
  });
  return ok ? (modes as string[]) : null;
}

const isTokenLiteral = (v: unknown): v is string | number =>
  (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));

/** A token: a literal (applies in all modes) or one literal per mode, all of the same type. */
function checkTokenValue(
  name: string,
  value: unknown,
  modes: readonly string[],
  add: IssueAdder,
): void {
  const path = ['tokens', 'values', name];
  if (isTokenLiteral(value)) return;
  if (!isRecord(value)) {
    add(path, 'deve ser texto, número ou um valor por modo');
    return;
  }
  const given = Object.keys(value);
  const missing = modes.filter((m) => !given.includes(m));
  const extra = given.filter((m) => !modes.includes(m));
  if (missing.length > 0) {
    add(path, specMsg('spec.tokenModeMissing', { modes: missing.join(', ') }));
  }
  if (extra.length > 0) {
    add(path, specMsg('spec.tokenModeExtra', { modes: extra.join(', ') }));
  }
  const literals = given.map((m) => value[m]);
  if (!literals.every(isTokenLiteral)) {
    add(path, 'cada modo deve ter texto ou número');
  } else if (new Set(literals.map((l) => typeof l)).size > 1) {
    add(path, 'os modos de um token devem ter o mesmo tipo (texto ou número)');
  }
}

/** Only `modes` and `values` are valid in `tokens`: the rest is an unknown key. */
function checkTokenKeys(tokens: Record<string, unknown>, add: IssueAdder): void {
  for (const key of Object.keys(tokens)) {
    if (key !== 'modes' && key !== 'values') {
      add(['tokens', key], specMsg('spec.tokenKeyUnknown', { key }));
    }
  }
}

/** `tokens` (`formatVersion` 15 only): `modes` and `values` by name `^[a-z0-9][a-z0-9-]*$`. */
function checkTokens(
  spec: { formatVersion: number; tokens?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (spec.tokens === undefined) return;
  const add = issueAdder(ctx);
  if (spec.formatVersion < 15) {
    add(['tokens'], onlyFormat(15));
    return;
  }
  if (!isRecord(spec.tokens))
    return add(['tokens'], 'deve ser um objeto com modes e values');
  checkTokenKeys(spec.tokens, add);
  const modes = tokenModes(spec.tokens, add);
  const values = spec.tokens.values;
  if (!isRecord(values)) return add(['tokens', 'values'], 'deve ser um objeto');
  for (const [name, value] of Object.entries(values)) {
    if (!TOKEN_NAME_PATTERN.test(name)) {
      add(['tokens', 'values', name], 'nome inválido; use [a-z0-9][a-z0-9-]*');
    } else if (modes !== null) {
      checkTokenValue(name, value, modes, add);
    }
  }
}

/** `icons` (`formatVersion` 15 only): the path of a package `.json`. */
function checkIcons(
  spec: { formatVersion: number; icons?: unknown },
  ctx: z.RefinementCtx,
): void {
  if (spec.icons === undefined) return;
  const add = issueAdder(ctx);
  if (spec.formatVersion < 15) return add(['icons'], onlyFormat(15));
  if (typeof spec.icons !== 'string') {
    return add(['icons'], 'deve ser o caminho de um arquivo .json do pacote');
  }
  const error = packagePathError(spec.icons, '.json');
  if (error !== undefined) add(['icons'], packagePathMsg(error));
}

export const specSchema = z
  .object({
    format: z.union([z.literal(SPEC_FORMAT), z.literal(LEGACY_SPEC_FORMAT)], {
      error: FORMAT_INVALID.text,
    }),
    formatVersion: z.union(
      SPEC_FORMAT_VERSIONS.map((v) => z.literal(v)) as unknown as [
        z.ZodLiteral<SpecFormatVersion>,
        z.ZodLiteral<SpecFormatVersion>,
        ...z.ZodLiteral<SpecFormatVersion>[],
      ],
      {
        error: FORMAT_VERSION_INVALID.text,
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
    // Validated by `parseOrigins` (the source of truth for the origin declaration), in superRefine.
    origins: z.unknown().optional(),
    migrations: z.array(migrationShape).optional(),
    // Validated by `checkTokens` (its own paths and messages), in superRefine.
    tokens: z.unknown().optional(),
    // The path is checked by `checkIcons` (version first); the file, by the library validator.
    icons: z.unknown().optional(),
    // Validated by `checkSignatureKeys` (the version, the shapes and the cross checks), in superRefine.
    fieldModels: z.unknown().optional(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    resetParseCaches();
    if (spec.platforms !== undefined && spec.formatVersion < 2) {
      addSpecIssue(ctx, ['platforms'], onlyFormat(2));
    }
    const platformIds = new Set<string>();
    (spec.platforms ?? []).forEach((platform, pi) => {
      if (platformIds.has(platform.id)) {
        addSpecIssue(
          ctx,
          ['platforms', pi, 'id'],
          specMsg('spec.idRepeated', { id: platform.id }),
        );
      }
      platformIds.add(platform.id);
    });
    // v5: `repo` on platforms. Before it, an error at the exact path.
    if (spec.formatVersion < 5) {
      (spec.platforms ?? []).forEach((platform, pi) => {
        if (platform.repo === undefined) return;
        addSpecIssue(ctx, ['platforms', pi, 'repo'], onlyFormat(5));
      });
    }
    // v7: `floating` and `appliesTo` on the type and `ref` as a `table` column. Before it, an
    // error at the exact path.
    if (spec.formatVersion < 7) {
      spec.layers.forEach((layer, li) => {
        layer.annotationTypes.forEach((type, ti) => {
          const typePath = ['layers', li, 'annotationTypes', ti];
          const only7 = (sub: (string | number)[]) =>
            addSpecIssue(ctx, [...typePath, ...sub], onlyFormat(7));
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
    // v8: `suggestions` and `linkedRef` on `string` fields and columns. Before it, an error at the
    // exact path.
    if (spec.formatVersion < 8) {
      spec.layers.forEach((layer, li) => {
        layer.annotationTypes.forEach((type, ti) => {
          type.fields.forEach((field, fi) => {
            const fieldPath = ['layers', li, 'annotationTypes', ti, 'fields', fi];
            const only8 = (sub: (string | number)[]) =>
              addSpecIssue(ctx, [...fieldPath, ...sub], onlyFormat(8));
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
    // v9: `variants` on the `code` entry. Before it, an error at the exact path.
    if (spec.formatVersion < 9) {
      spec.layers.forEach((layer, li) => {
        layer.annotationTypes.forEach((type, ti) => {
          for (const [platform, entry] of Object.entries(type.code ?? {})) {
            if (entry.variants === undefined) continue;
            addSpecIssue(
              ctx,
              ['layers', li, 'annotationTypes', ti, 'code', platform, 'variants'],
              onlyFormat(9),
            );
          }
        });
      });
    }
    // v10: `notices` on the type, field and column. Before it, an error at the exact path.
    if (spec.formatVersion < 10) checkNoNotices(spec.layers, ctx);
    // v15: `structural` on the type. Before it, an error at the exact path.
    if (spec.formatVersion < 15) checkNoStructural(spec.layers, ctx);
    // v11: clauses, `groups`, roles and external document. Before it, an error at the exact path.
    if (spec.formatVersion < 11) checkNoV11Keys(spec, ctx);
    // v6: `containers`. Before it, an error at the exact path.
    if (spec.containers !== undefined && spec.formatVersion < 6) {
      addSpecIssue(ctx, ['containers'], onlyFormat(6));
    }
    const containerIds = new Set<string>();
    (spec.containers ?? []).forEach((container, ci) => {
      if (containerIds.has(container.id)) {
        addSpecIssue(
          ctx,
          ['containers', ci, 'id'],
          specMsg('spec.idRepeated', { id: container.id }),
        );
      }
      containerIds.add(container.id);
    });
    const hasPlatforms = platformIds.size > 0;
    if (spec.formatVersion < 3) checkNoSources(spec.layers, ctx);

    // v4: library. Before it, each new key is an error at the exact path.
    const v4 = spec.formatVersion >= 4;
    const executable = v4 ? declaredSystems(spec.origins) : new Set<string>();
    if (!v4) {
      for (const key of ['fonts', 'origins', 'migrations'] as const) {
        if (spec[key] !== undefined) {
          addSpecIssue(ctx, [key], onlyFormat(4));
        }
      }
      checkNoLibraryKeys(spec.layers, ctx);
    } else if (spec.origins !== undefined) {
      addOriginIssues(spec.origins, ctx, spec.formatVersion);
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
    /** type id → index of the layer where it is defined. */
    const typeLayer = new Map<string, number>();

    spec.layers.forEach((layer, li) => {
      if (layerIds.has(layer.id)) {
        addSpecIssue(
          ctx,
          ['layers', li, 'id'],
          specMsg('spec.idRepeated', { id: layer.id }),
        );
      }
      layerIds.add(layer.id);
      layer.annotationTypes.forEach((type, ti) => {
        if (typeLayer.has(type.id)) {
          addSpecIssue(
            ctx,
            ['layers', li, 'annotationTypes', ti, 'id'],
            specMsg('spec.typeIdRepeated', { id: type.id }),
          );
        } else {
          typeLayer.set(type.id, li);
        }
      });
    });

    checkAllowedChildren(spec, typeLayer, ctx);
    checkAcceptsAnnotations(spec, typeLayer, ctx);
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
              addSpecIssue(
                ctx,
                [...tp, 'code', id],
                specMsg('spec.platformUndeclared', { id }),
              );
            }
          }
        }
      });
    });

    checkRequiresOwner(spec, ctx);
    checkTokens(spec, ctx);
    checkIcons(spec, ctx);
    checkSignatureKeys(spec, ctx);
  });

/**
 * Problem of the specialization: the `message` in Portuguese (what the MCP and the tests read)
 * and, when there is one, the `code` and `params` of the model's message catalog
 * (`src/model/messages/spec.ts`), which the interface translates.
 */
export type SpecIssue = {
  path: string;
  message: string;
  code?: ModelMessageTemplateCode;
  params?: MessageParams;
};

/** `layers[1].annotationTypes[0].fields[2].type` from a zod path. */
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

/** Without the keys of `removed`; `undefined` if none is left. */
function withoutKeys(
  record: Record<string, string> | undefined,
  removed: ReadonlySet<string>,
): Record<string, string> | undefined {
  if (record === undefined) return undefined;
  const kept = Object.entries(record).filter(([k]) => !removed.has(k));
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** `variants` without the removed fields' `params` in each case (a `params`-only case empties). */
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
 * Removes from the types the fields of the removed type (`REMOVED_FIELD_TYPE`) and the `code`
 * `params` that cite them; returns what was ignored, with the path in the original file.
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
  // `origins` was validated by `parseOrigins` in the schema; the shape read is its own.
  const { origins: rawOrigins, ...rest } = parsed;
  const origins =
    rawOrigins === undefined
      ? {}
      : { origins: originsOf(rawOrigins).origins.map(toSpecOrigin) };
  return { spec: { ...rest, ...origins, layers } as Spec, ignored };
}

/**
 * Keys of the removed type's fields (`REMOVED_FIELD_TYPE`) by type id, read from the raw JSON
 * of a specialization (without validating): the project's v8 → v9 migration uses them to
 * discard those fields' values. Empty if the JSON does not have the expected shape.
 */
export function removedFieldKeys(data: unknown): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  if (!isRecord(data)) return result;
  for (const layer of list(data.layers)) {
    if (!isRecord(layer)) continue;
    for (const type of list(layer.annotationTypes)) {
      if (!isRecord(type) || typeof type.id !== 'string') continue;
      for (const field of list(type.fields)) {
        if (!isRecord(field) || field.type !== REMOVED_FIELD_TYPE) continue;
        if (typeof field.key !== 'string') continue;
        const keys = result.get(type.id) ?? new Set<string>();
        keys.add(field.key);
        result.set(type.id, keys);
      }
    }
  }
  return result;
}

/** The zod issue as a `SpecIssue`, with the catalog code and parameters (without the `input`). */
function toSpecIssue(issue: z.core.$ZodIssue): SpecIssue {
  const base = { path: formatSpecPath(issue.path), message: issue.message };
  const coding = issueCoding(issue, KNOWN_SPEC_MSGS);
  if (coding === undefined) return base;
  return coding.params === undefined
    ? { ...base, code: coding.code }
    : { ...base, code: coding.code, params: coding.params };
}

/** Validates an already-read JSON; errors in the format `path: message`. */
export function parseSpec(data: unknown): SpecParseResult {
  const result = specSchema.safeParse(data, REPORT_INPUT);
  if (result.success) return { ok: true, ...dropRemovedFields(result.data) };
  const issues = result.error.issues.map(toSpecIssue);
  return {
    ok: false,
    issues,
    errors: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
  };
}

/** Reads the JSON text of a specialization file. */
export function parseSpecText(text: string): SpecParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      issues: [
        {
          path: '',
          message: `JSON inválido: ${message}`,
          code: 'library.invalidJson',
          params: { detail: message },
        },
      ],
      errors: [`JSON inválido: ${message}`],
    };
  }
  return parseSpec(data);
}
