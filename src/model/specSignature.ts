import type { z } from 'zod';
import { interpretsParamTargets, paramTarget, FORMAT_PLACEHOLDER } from './codeParams';
import { addSpecIssue, specMsg } from './specIssueCode';

// Validação da `formatVersion` 16 (etapa #1079): `fieldModels` na raiz e, no `code` de cada
// plataforma (e em cada caso de `variants`), `signature`, `ignore`, `calls` e `formats`, com `params`
// por caminho ou posicional, e `signature` nas `sources` do tipo. O formato das chaves (texto,
// caminho `.json` do pacote) é do zod em `spec.ts`; aqui ficam a versão e os cruzamentos. O que
// depende do conteúdo da ficha (símbolo, arquivo e parâmetros) é do pacote (`librarySignature.ts`).

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

/** Cada entrada de `code` e cada caso de `variants`, com o caminho e a entrada que o contém (a base). */
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

/** Antes da 16: cada chave nova é erro no caminho exato. */
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

/** `like`: `<tipo>.<campo>` de um campo que existe na especialização. */
function checkLike(
  like: unknown,
  path: Path,
  fields: ReadonlyMap<string, ReadonlySet<string>>,
  add: Add,
): void {
  if (typeof like !== 'string' || like === '') return add(path, 'deve ser texto');
  const dot = like.indexOf('.');
  const found =
    dot > 0 && (fields.get(like.slice(0, dot))?.has(like.slice(dot + 1)) ?? false);
  if (!found) add(path, `"${like}" não é um campo de um tipo da especialização`);
}

function checkFormat(format: unknown, path: Path, add: Add): void {
  if (typeof format !== 'string' || !format.includes(FORMAT_PLACEHOLDER)) {
    add(path, `o molde precisa conter ${FORMAT_PLACEHOLDER}`);
  }
}

function checkTypeForm(model: Record<string, unknown>, path: Path, add: Add): void {
  const type = model.type;
  if (!(MODEL_TYPES as readonly unknown[]).includes(type)) {
    add(
      [...path, 'type'],
      `${quoted([String(type)])} inválido; use "number", "string" ou "enum"`,
    );
  }
  const options = model.options;
  if (options !== undefined) {
    if (
      !Array.isArray(options) ||
      options.length === 0 ||
      options.some((o) => typeof o !== 'string' || o === '')
    ) {
      add([...path, 'options'], 'deve ser uma lista de textos não vazios');
    } else if (type !== 'enum') add([...path, 'options'], 'só é permitido em enum');
  } else if (type === 'enum') add([...path, 'options'], 'obrigatório em enum');
  if (model.format !== undefined) checkFormat(model.format, [...path, 'format'], add);
}

function checkExpand(expand: unknown, path: Path, add: Add): void {
  if (!isRecord(expand)) return add(path, 'deve ser um objeto');
  const extra = Object.keys(expand).filter((k) => k !== 'call' && k !== 'params');
  if (extra.length > 0) add(path, specMsg('spec.unknownKeys', { keys: quoted(extra) }));
  if (expand.call !== undefined) checkNonEmptyText(expand.call, [...path, 'call'], add);
  const params = expand.params;
  if (!isRecord(params) || Object.keys(params).length === 0) {
    return add(
      [...path, 'params'],
      'declare ao menos um parâmetro (nome → tipo na fonte)',
    );
  }
  for (const [name, type] of Object.entries(params)) {
    checkNonEmptyText(type, [...path, 'params', name], add);
  }
}

function checkNonEmptyText(value: unknown, path: Path, add: Add): void {
  if (typeof value !== 'string' || value === '') add(path, 'deve ser texto não vazio');
}

/** As formas que o modelo declara (`like`, `type`, `expand`, `ignore`); `type` conta com `options` e `format` soltos. */
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
  if (!isRecord(model)) return add(path, 'deve ser um objeto');
  const extra = Object.keys(model).filter(
    (k) => !(MODEL_KEYS as readonly string[]).includes(k),
  );
  if (extra.length > 0) add(path, specMsg('spec.unknownKeys', { keys: quoted(extra) }));
  const forms = declaredForms(model);
  if (forms.length === 0) {
    return add(path, 'declare uma forma: "like", "type", "expand" ou "ignore"');
  }
  if (forms.length > 1) return add(path, `use só uma forma: ${quoted(forms)}`);
  switch (forms[0]) {
    case 'like':
      return checkLike(model.like, [...path, 'like'], fields, add);
    case 'expand':
      return checkExpand(model.expand, [...path, 'expand'], add);
    case 'ignore':
      if (model.ignore !== true) add([...path, 'ignore'], 'deve ser true');
      return;
    default:
      return checkTypeForm(model, path, add);
  }
}

function checkFieldModels(spec: RawSpec, add: Add): void {
  const models = spec.fieldModels;
  if (models === undefined) return;
  if (!isRecord(models)) return add(['fieldModels'], 'deve ser um objeto');
  const fields = new Map<string, ReadonlySet<string>>();
  for (const layer of spec.layers) {
    for (const type of layer.annotationTypes) {
      fields.set(type.id, new Set(type.fields.map((f) => f.key)));
    }
  }
  for (const [target, byType] of Object.entries(models)) {
    if (!isRecord(byType)) {
      add(['fieldModels', target], 'deve ser um objeto');
      continue;
    }
    for (const [sourceType, model] of Object.entries(byType)) {
      checkModel(model, ['fieldModels', target, sourceType], fields, add);
    }
  }
}

/** `ignore`, `formats` e os caminhos de `params` de uma entrada de `code` (ou de um caso). */
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
      add([...path, 'params', key], `"${target.call}" não está em calls`);
    }
  }
}

/** A `formatVersion` 16: a versão das chaves novas e os cruzamentos delas. */
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
