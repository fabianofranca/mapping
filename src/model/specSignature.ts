import type { z } from 'zod';
import { interpretsParamTargets, paramTarget, FORMAT_PLACEHOLDER } from './codeParams';
import { addSpecIssue, specMsg } from './specIssueCode';

// Validation of `formatVersion` 16 (stage #1079): `fieldModels` at the root and, in the `code` of each
// platform (and of each case of `variants`), `signature`, `ignore`, `calls` and `formats`, with `params`
// by path or positional, and `signature` in the type's `sources`. The format of the keys (text,
// `.json` path in the package) belongs to zod in `spec.ts`; here live the version and the cross-checks. What
// depends on the content of the signature sheet (symbol, file and parameters) belongs to the package (`librarySignature.ts`).

type Path = (string | number)[];
type Add = (path: Path, message: string | ReturnType<typeof specMsg>) => void;

interface RawCode {
  signature?: string | undefined;
  ignore?: string[] | undefined;
  calls?: Record<string, string> | undefined;
  formats?: Record<string, string> | undefined;
  params?: Record<string, string> | undefined;
  variants?: { cases: Record<string, RawCode> } | undefined;
}

interface RawType {
  id: string;
  fields: readonly { key: string }[];
  code?: Record<string, RawCode> | undefined;
  sources?: readonly { signature?: string | undefined }[] | undefined;
}

interface RawSpec {
  formatVersion: number;
  fieldModels?: unknown;
  layers: readonly { annotationTypes: readonly RawType[] }[];
}

const NEW_CODE_KEYS = ['signature', 'ignore', 'calls', 'formats'] as const;
const MODEL_FORMS = ['like', 'type', 'expand', 'ignore'] as const;
const MODEL_KEYS = ['like', 'type', 'options', 'format', 'expand', 'ignore'] as const;
const MODEL_TYPES = ['number', 'string', 'enum'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const quoted = (keys: readonly string[]): string => keys.map((k) => `"${k}"`).join(', ');

/** Each entry of `code` and each case of `variants`, with the path and the entry that contains it (the base). */
function eachCode(
  type: RawType,
  tp: Path,
  visit: (code: RawCode, path: Path, base: RawCode | null) => void,
): void {
  for (const [platform, entry] of Object.entries(type.code ?? {})) {
    const at = [...tp, 'code', platform];
    visit(entry, at, null);
    for (const [value, kase] of Object.entries(entry.variants?.cases ?? {})) {
      visit(kase, [...at, 'variants', 'cases', value], entry);
    }
  }
}

/** Before 16: each new key is an error at the exact path. */
function gateOlder(spec: RawSpec, add: Add): void {
  const only16 = (path: Path) => add(path, specMsg('spec.onlyFormat', { version: '16' }));
  if (spec.fieldModels !== undefined) only16(['fieldModels']);
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const tp: Path = ['layers', li, 'annotationTypes', ti];
      eachCode(type, tp, (code, path) => {
        for (const key of NEW_CODE_KEYS)
          if (code[key] !== undefined) only16([...path, key]);
      });
      (type.sources ?? []).forEach((source, si) => {
        if (source.signature !== undefined) only16([...tp, 'sources', si, 'signature']);
      });
    });
  });
}

/** `like`: `<type>.<field>` of a field that exists in the specialization. */
function checkLike(
  like: unknown,
  path: Path,
  fields: ReadonlyMap<string, ReadonlySet<string>>,
  add: Add,
): void {
  if (typeof like !== 'string' || like === '')
    return add(path, specMsg('spec.mustBeText'));
  const dot = like.indexOf('.');
  const found =
    dot > 0 && (fields.get(like.slice(0, dot))?.has(like.slice(dot + 1)) ?? false);
  if (!found) add(path, specMsg('spec.likeNotField', { like }));
}

function checkFormat(format: unknown, path: Path, add: Add): void {
  if (typeof format !== 'string' || !format.includes(FORMAT_PLACEHOLDER)) {
    add(
      path,
      specMsg('spec.formatNeedsPlaceholder', { placeholder: FORMAT_PLACEHOLDER }),
    );
  }
}

function checkTypeForm(model: Record<string, unknown>, path: Path, add: Add): void {
  const type = model.type;
  if (!(MODEL_TYPES as readonly unknown[]).includes(type)) {
    add([...path, 'type'], specMsg('spec.modelTypeInvalid', { value: String(type) }));
  }
  const options = model.options;
  if (options !== undefined) {
    if (
      !Array.isArray(options) ||
      options.length === 0 ||
      options.some((o) => typeof o !== 'string' || o === '')
    ) {
      add([...path, 'options'], specMsg('spec.optionsNotTextList'));
    } else if (type !== 'enum')
      add([...path, 'options'], specMsg('spec.optionsOnlyEnum'));
  } else if (type === 'enum')
    add([...path, 'options'], specMsg('spec.optionsRequiredInEnum'));
  if (model.format !== undefined) checkFormat(model.format, [...path, 'format'], add);
}

function checkExpand(expand: unknown, path: Path, add: Add): void {
  if (!isRecord(expand)) return add(path, specMsg('spec.mustBeObject'));
  const extra = Object.keys(expand).filter((k) => k !== 'call' && k !== 'params');
  if (extra.length > 0) add(path, specMsg('spec.unknownKeys', { keys: quoted(extra) }));
  if (expand.call !== undefined) checkNonEmptyText(expand.call, [...path, 'call'], add);
  const params = expand.params;
  if (!isRecord(params) || Object.keys(params).length === 0) {
    return add([...path, 'params'], specMsg('spec.expandParamsRequired'));
  }
  for (const [name, type] of Object.entries(params)) {
    checkNonEmptyText(type, [...path, 'params', name], add);
  }
}

function checkNonEmptyText(value: unknown, path: Path, add: Add): void {
  if (typeof value !== 'string' || value === '')
    add(path, specMsg('spec.mustBeNonEmptyText'));
}

/** The shapes the model declares (`like`, `type`, `expand`, `ignore`); `type` counts with loose `options` and `format`. */
function declaredForms(model: Record<string, unknown>): string[] {
  const forms: string[] = MODEL_FORMS.filter((f) => model[f] !== undefined);
  if (forms.length === 0 && (model.options !== undefined || model.format !== undefined)) {
    forms.push('type');
  }
  return forms;
}

function checkModel(
  model: unknown,
  path: Path,
  fields: ReadonlyMap<string, ReadonlySet<string>>,
  add: Add,
): void {
  if (!isRecord(model)) return add(path, specMsg('spec.mustBeObject'));
  const extra = Object.keys(model).filter(
    (k) => !(MODEL_KEYS as readonly string[]).includes(k),
  );
  if (extra.length > 0) add(path, specMsg('spec.unknownKeys', { keys: quoted(extra) }));
  const forms = declaredForms(model);
  if (forms.length === 0) {
    return add(path, specMsg('spec.modelFormRequired'));
  }
  if (forms.length > 1)
    return add(path, specMsg('spec.modelFormsConflict', { forms: quoted(forms) }));
  switch (forms[0]) {
    case 'like':
      return checkLike(model.like, [...path, 'like'], fields, add);
    case 'expand':
      return checkExpand(model.expand, [...path, 'expand'], add);
    case 'ignore':
      if (model.ignore !== true) add([...path, 'ignore'], specMsg('spec.mustBeTrue'));
      return;
    default:
      return checkTypeForm(model, path, add);
  }
}

function checkFieldModels(spec: RawSpec, add: Add): void {
  const models = spec.fieldModels;
  if (models === undefined) return;
  if (!isRecord(models)) return add(['fieldModels'], specMsg('spec.mustBeObject'));
  const fields = new Map<string, ReadonlySet<string>>();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      fields.set(type.id, new Set(type.fields.map((f) => f.key)));
    }
  }
  for (const [target, byType] of Object.entries(models)) {
    if (!isRecord(byType)) {
      add(['fieldModels', target], specMsg('spec.mustBeObject'));
      continue;
    }
    for (const [sourceType, model] of Object.entries(byType)) {
      checkModel(model, ['fieldModels', target, sourceType], fields, add);
    }
  }
}

/** `ignore`, `formats` and the `params` paths of a `code` entry (or of a case). */
function checkCodeEntry(
  code: RawCode,
  path: Path,
  base: RawCode | null,
  fieldKeys: ReadonlySet<string>,
  add: Add,
): void {
  const seen = new Set<string>();
  (code.ignore ?? []).forEach((name, i) => {
    if (seen.has(name))
      add([...path, 'ignore', i], specMsg('spec.ignoreRepeated', { prop: name }));
    seen.add(name);
  });
  for (const [key, format] of Object.entries(code.formats ?? {})) {
    if (!fieldKeys.has(key))
      add([...path, 'formats', key], specMsg('spec.notTypeField', { key }));
    else checkFormat(format, [...path, 'formats', key], add);
  }
  const calls = { ...base?.calls, ...code.calls };
  for (const [key, value] of Object.entries(code.params ?? {})) {
    const target = paramTarget(value);
    if (target.kind === 'path' && !Object.hasOwn(calls, target.call)) {
      add(
        [...path, 'params', key],
        specMsg('spec.callNotDeclared', { call: target.call }),
      );
    }
  }
}

/** `formatVersion` 16: the version of the new keys and their cross-checks. */
export function checkSignatureKeys(spec: RawSpec, ctx: z.RefinementCtx): void {
  const add: Add = (path, message) => addSpecIssue(ctx, path, message);
  if (!interpretsParamTargets(spec.formatVersion)) return gateOlder(spec, add);
  checkFieldModels(spec, add);
  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const keys = new Set(type.fields.map((f) => f.key));
      eachCode(type, ['layers', li, 'annotationTypes', ti], (code, path, base) =>
        checkCodeEntry(code, path, base, keys, add),
      );
    });
  });
}
