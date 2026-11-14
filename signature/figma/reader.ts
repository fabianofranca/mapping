import {
  SIGNATURE_FORMAT,
  SIGNATURE_FORMAT_VERSION,
  type DesignSignatureSource,
  type Signature,
  type SignatureParam,
  type SignatureValue,
} from '../../src/model/signatures';
import { CliError } from '../errors';
import type { DesignRequest } from '../request';

// Figma reader (`mapping-signature/figma@1`): the sheet of a `COMPONENT_SET` or `COMPONENT` from
// its `componentPropertyDefinitions`, in the JSON the agent saved (the response of
// `GET /v1/files/:key/nodes`, the whole-file one or the bare node). It does not read the network: only the file.

export const FIGMA_EXTRACTOR = 'mapping-signature/figma@1';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The id as the API writes it (`12:34`); the Figma URL uses `12-34`. */
const normalizeId = (id: string): string => id.replace(/-/g, ':');

/** The first object, in document order, with this `id` and a `type` (the node; the `components` tables have no `id`). */
function findNode(root: unknown, wanted: string): Json | undefined {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push(value[i]);
    } else if (isRecord(value)) {
      if (
        typeof value.id === 'string' &&
        typeof value.type === 'string' &&
        normalizeId(value.id) === wanted
      )
        return value;
      const children = Object.values(value);
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }
  return undefined;
}

const SUFFIX = /^(.+)#(\d+:\d+)$/;

/** The default text the sheet keeps: text, number and boolean; the rest (instance ids) is not kept. */
function defaultText(value: unknown): string | undefined {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : undefined;
}

function variantValue(definition: Json, text: string | undefined): SignatureValue {
  const options = definition.variantOptions;
  const valid =
    Array.isArray(options) &&
    options.length > 0 &&
    options.every((o) => typeof o === 'string');
  if (!valid) return { kind: 'opaque' };
  const list = options as string[];
  return text !== undefined && list.includes(text)
    ? { kind: 'enum', default: text, options: list }
    : { kind: 'enum', options: list };
}

/** The `value` of a `VARIANT`, `BOOLEAN` or `TEXT` property. */
function valueOf(
  type: string,
  definition: Json,
  text: string | undefined,
): SignatureValue {
  if (type === 'VARIANT') return variantValue(definition, text);
  if (type === 'BOOLEAN') {
    return typeof definition.defaultValue === 'boolean'
      ? { kind: 'boolean', default: definition.defaultValue }
      : { kind: 'boolean' };
  }
  return typeof definition.defaultValue === 'string'
    ? { kind: 'text', default: definition.defaultValue }
    : { kind: 'text' };
}

const VALUE_TYPES = new Set(['VARIANT', 'BOOLEAN', 'TEXT']);

function readParam(key: string, definition: unknown): SignatureParam {
  const suffix = SUFFIX.exec(key);
  const name = suffix === null ? key : suffix[1]!;
  if (!isRecord(definition) || typeof definition.type !== 'string') {
    throw new CliError(`the property "${name}" has no type`);
  }
  const type = definition.type;
  const text = defaultText(definition.defaultValue);
  const head = { name, ...(suffix === null ? {} : { id: suffix[2]! }) };
  if (type === 'INSTANCE_SWAP') return { ...head, role: 'slot', type };
  const rest = text === undefined ? { required: true } : { default: text };
  if (!VALUE_TYPES.has(type)) return { ...head, role: 'other', type, ...rest };
  return {
    ...head,
    role: 'value',
    type,
    ...rest,
    value: valueOf(type, definition, text),
  };
}

function readDoc(
  definitions: Json,
  params: readonly SignatureParam[],
): Record<string, string> {
  const doc: Record<string, string> = {};
  for (const key of Object.keys(definitions)) {
    const description = (definitions[key] as Json).description;
    const name = SUFFIX.exec(key)?.[1] ?? key;
    if (
      typeof description === 'string' &&
      description.trim() !== '' &&
      params.some((p) => p.name === name)
    )
      doc[name] = description.trim();
  }
  return doc;
}

function parseJson(request: DesignRequest): unknown {
  try {
    return JSON.parse(request.file.text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`${request.file.name}: invalid JSON: ${reason}`);
  }
}

/** The requested node, checked: a `COMPONENT_SET` or `COMPONENT` with the property definitions. */
function componentNode(request: DesignRequest): { node: Json; definitions: Json } {
  const node = findNode(parseJson(request), normalizeId(request.node));
  if (node === undefined) {
    throw new CliError(`node ${request.node} not found in ${request.file.name}`);
  }
  const label = `the node ${request.node} ("${String(node.name)}")`;
  if (node.type !== 'COMPONENT_SET' && node.type !== 'COMPONENT') {
    throw new CliError(
      `${label} is of type ${String(node.type)}; expected COMPONENT_SET or COMPONENT`,
    );
  }
  const definitions = node.componentPropertyDefinitions;
  if (!isRecord(definitions)) {
    throw new CliError(
      `${label} has no componentPropertyDefinitions; if it is a variant of a component set, use the id of the COMPONENT_SET`,
    );
  }
  return { node, definitions };
}

export function extractFigma(request: DesignRequest): Signature {
  const { node, definitions } = componentNode(request);
  const params = Object.entries(definitions).map(([key, value]) => readParam(key, value));
  const doc = readDoc(definitions, params);
  const id = String(node.id);
  const source: DesignSignatureSource = {
    kind: 'design',
    system: 'figma',
    id,
    name: typeof node.name === 'string' && node.name !== '' ? node.name : id,
    extractor: FIGMA_EXTRACTOR,
  };
  return {
    format: SIGNATURE_FORMAT,
    formatVersion: SIGNATURE_FORMAT_VERSION,
    source,
    params,
    ...(Object.keys(doc).length === 0 ? {} : { doc }),
  };
}
