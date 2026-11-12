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

// Leitor Figma (`mapping-signature/figma@1`): a ficha de um `COMPONENT_SET` ou `COMPONENT` a partir
// das `componentPropertyDefinitions` dele, no JSON que o agente salvou (a resposta de
// `GET /v1/files/:key/nodes`, a do arquivo inteiro ou o nó solto). Não lê a rede: só o arquivo.

export const FIGMA_EXTRACTOR = 'mapping-signature/figma@1';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** O id como a API o escreve (`12:34`); a URL do Figma usa `12-34`. */
const normalizeId = (id: string): string => id.replace(/-/g, ':');

/** O primeiro objeto, em ordem de documento, com este `id` e um `type` (o nó; as tabelas `components` não têm `id`). */
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

/** O texto do padrão que a ficha guarda: texto, número e booleano; o resto (ids de instância) não. */
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

/** O `value` de uma propriedade `VARIANT`, `BOOLEAN` ou `TEXT`. */
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
    throw new CliError(`a propriedade "${name}" não tem type`);
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
    throw new CliError(`${request.file.name}: JSON inválido: ${reason}`);
  }
}

/** O nó pedido, conferido: um `COMPONENT_SET` ou `COMPONENT` com as definições de propriedade. */
function componentNode(request: DesignRequest): { node: Json; definitions: Json } {
  const node = findNode(parseJson(request), normalizeId(request.node));
  if (node === undefined) {
    throw new CliError(`nó ${request.node} não encontrado em ${request.file.name}`);
  }
  const label = `o nó ${request.node} ("${String(node.name)}")`;
  if (node.type !== 'COMPONENT_SET' && node.type !== 'COMPONENT') {
    throw new CliError(
      `${label} é do tipo ${String(node.type)}; esperado COMPONENT_SET ou COMPONENT`,
    );
  }
  const definitions = node.componentPropertyDefinitions;
  if (!isRecord(definitions)) {
    throw new CliError(
      `${label} não tem componentPropertyDefinitions; se é uma variante de um component set, use o id do COMPONENT_SET`,
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
