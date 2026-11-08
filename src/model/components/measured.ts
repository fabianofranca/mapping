/**
 * Layout medido (etapa Componentes fiéis, CF11, decisão 29): uma árvore de retângulos de um
 * sistema externo (a página de um app web medida num navegador, o despejo da hierarquia de componentes visuais de
 * um app nativo) vira marcações, casando cada nó com um tipo de anotação pelas `sources` dele.
 *
 * Nó: `{ type, id?, classes?, rect: { x, y, width, height }, props?, children? }`. O tipo sai da
 * `source` do tipo no sistema (`origins[].kind: "measured"`): o `id` do nó contra o `id` da
 * source, depois cada classe contra o `name` e por fim o `type` contra o `name`. Cada campo vem
 * do `path` dele nas `props` (com `values` para `enum`), como na origem executável.
 *
 * O pertencimento nunca sai da árvore: o resultado é uma lista plana de marcações em pré-ordem e
 * quem as cria (o lote do MCP) deixa a geometria decidir quem contém quem (`settleHierarchy`).
 * Puro, sem API de navegador, e nunca lança: o que não deu certo vira `error` ou aviso.
 */
import type { FieldValue } from './componentFormat';
import {
  readPath,
  translateFieldValue,
  type FieldContext,
  type FieldLike,
  type FieldSource,
} from './origin';
import type { Spec, SpecAnnotationType, SpecField } from '../spec';

export interface MeasuredRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MeasuredInput {
  /** O `system` de uma origem `measured` declarada pela especialização. */
  readonly system: string;
  /** A árvore medida (JSON lido de um arquivo ou inline). */
  readonly tree: unknown;
  /** Deslocamento somado depois da escala (padrão 0, 0). */
  readonly offset?: { readonly x: number; readonly y: number };
  /** Multiplicador dos retângulos (padrão 1). */
  readonly scale?: number;
}

/** Uma marcação a criar: o tipo, o retângulo já com a escala e o deslocamento e os valores lidos. */
export interface MeasuredMarking {
  readonly specId: string;
  readonly typeId: string;
  readonly rect: MeasuredRect;
  /** Só os campos que o nó trouxe (os outros ficam com o `preview` do componente). */
  readonly values: Readonly<Record<string, FieldValue>>;
  /** Onde o nó está na árvore (`root.children[0]`), para as mensagens. */
  readonly path: string;
}

export interface MeasuredImport {
  readonly markings: readonly MeasuredMarking[];
  readonly warnings: readonly string[];
  readonly error?: string;
}

interface Candidate {
  readonly spec: Spec;
  readonly type: SpecAnnotationType;
}

interface Run {
  readonly system: string;
  readonly candidates: readonly Candidate[];
  readonly ctx: FieldContext;
  readonly scale: number;
  readonly offset: { readonly x: number; readonly y: number };
  readonly markings: MeasuredMarking[];
  readonly warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** As especializações que declaram `system` como origem `measured` e os tipos delas com `source` nele. */
function candidatesOf(
  specs: readonly Spec[],
  system: string,
): { candidates: Candidate[]; origin?: NonNullable<Spec['origins']>[number] } {
  const candidates: Candidate[] = [];
  let origin: NonNullable<Spec['origins']>[number] | undefined;
  for (const spec of specs) {
    const declared = spec.origins?.find((o) => o.system === system);
    if (declared?.kind !== 'measured') continue;
    origin ??= declared;
    for (const layer of spec.layers) {
      for (const type of layer.annotationTypes) {
        if ((type.sources ?? []).some((s) => s.system === system)) {
          candidates.push({ spec, type });
        }
      }
    }
  }
  return { candidates, ...(origin ? { origin } : {}) };
}

function sourcesOf(candidate: Candidate, system: string) {
  return (candidate.type.sources ?? []).filter((s) => s.system === system);
}

/** `id` do nó contra o `id` da source; depois cada classe contra o `name`; por fim o `type`. */
function findCandidate(run: Run, node: Record<string, unknown>): Candidate | undefined {
  const { candidates, system } = run;
  const id = typeof node.id === 'string' ? node.id : undefined;
  const classes = Array.isArray(node.classes)
    ? node.classes.filter((c): c is string => typeof c === 'string')
    : [];
  const type = typeof node.type === 'string' ? node.type : undefined;
  const named = (name: string) =>
    candidates.find((c) => sourcesOf(c, system).some((s) => s.name === name));
  if (id !== undefined) {
    const byId = candidates.find((c) => sourcesOf(c, system).some((s) => s.id === id));
    if (byId) return byId;
  }
  for (const name of classes) {
    const byClass = named(name);
    if (byClass) return byClass;
  }
  return type === undefined ? undefined : named(type);
}

function rectOf(raw: unknown, run: Run): MeasuredRect | undefined {
  if (!isRecord(raw)) return undefined;
  const { x, y, width, height } = raw;
  if (![x, y, width, height].every(isNumber)) return undefined;
  const { scale, offset } = run;
  return {
    x: Math.round((x as number) * scale + offset.x),
    y: Math.round((y as number) * scale + offset.y),
    width: Math.round((width as number) * scale),
    height: Math.round((height as number) * scale),
  };
}

function fieldLike(field: SpecField): FieldLike {
  return {
    key: field.key,
    type: field.type,
    options: field.type === 'enum' ? field.options : undefined,
    default: 'default' in field ? field.default : undefined,
    sources: (field.sources ?? []) as readonly FieldSource[],
  };
}

function valuesOf(
  type: SpecAnnotationType,
  props: Record<string, unknown>,
  path: string,
  run: Run,
): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of type.fields) {
    if (field.type === 'table' || field.type === 'ref') continue;
    const like = fieldLike(field);
    const source = like.sources.find((s) => s.system === run.system);
    if (source?.path === undefined || !readPath(props, source.path).found) continue;
    values[field.key] = translateFieldValue(like, props, path, run.ctx);
  }
  return values;
}

function visit(raw: unknown, path: string, run: Run): void {
  if (!isRecord(raw)) {
    run.warnings.push(`${path}: nó inválido (esperava objeto)`);
    return;
  }
  const rect = rectOf(raw.rect, run);
  if (rect === undefined) {
    run.warnings.push(`${path}.rect: esperava { x, y, width, height } numéricos`);
  } else {
    place(raw, rect, path, run);
  }
  if (Array.isArray(raw.children)) {
    raw.children.forEach((child, i) => visit(child, `${path}.children[${i}]`, run));
  } else if (raw.children !== undefined && raw.children !== null) {
    run.warnings.push(`${path}.children: esperava lista`);
  }
}

function place(
  raw: Record<string, unknown>,
  rect: MeasuredRect,
  path: string,
  run: Run,
): void {
  const found = findCandidate(run, raw);
  if (found === undefined) {
    const label = describe(raw);
    run.warnings.push(`${path}: nó sem tipo de anotação (${label}); ignorado`);
    return;
  }
  if (rect.width < 1 || rect.height < 1) {
    run.warnings.push(
      `${path}: retângulo vazio (${rect.width}×${rect.height}); ignorado`,
    );
    return;
  }
  const props = isRecord(raw.props) ? raw.props : {};
  run.markings.push({
    specId: found.spec.id,
    typeId: found.type.id,
    rect,
    values: valuesOf(found.type, props, path, run),
    path,
  });
}

/** `type`, `id` e classes do nó, para a mensagem de aviso. */
function describe(node: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof node.type === 'string') parts.push(node.type);
  if (typeof node.id === 'string') parts.push(`#${node.id}`);
  if (Array.isArray(node.classes)) {
    for (const c of node.classes) if (typeof c === 'string') parts.push(`.${c}`);
  }
  return parts.join(' ') || 'sem type';
}

/** A árvore medida → as marcações (pré-ordem), pelas `sources` dos tipos das especializações. Nunca lança. */
export function importMeasured(
  specs: readonly Spec[],
  input: MeasuredInput,
): MeasuredImport {
  const { candidates, origin } = candidatesOf(specs, input.system);
  if (origin === undefined) {
    const declared = specs.some((s) => s.origins?.some((o) => o.system === input.system));
    return fail(
      declared
        ? `a origem "${input.system}" não é do tipo measured (origins[].kind)`
        : `origem "${input.system}" não declarada como measured em nenhuma especialização aplicada`,
    );
  }
  if (!isRecord(input.tree))
    return fail('a árvore medida deve ser um objeto (o nó raiz)');
  if (!isRecord(input.tree.rect)) {
    return fail('o nó raiz não tem rect: esperava { x, y, width, height }');
  }
  const warnings: string[] = [];
  const run: Run = {
    system: input.system,
    candidates,
    ctx: {
      origin: {
        system: input.system,
        booleans: origin.booleans,
        node: { props: 'props' },
      },
      warnings,
    },
    scale: input.scale ?? 1,
    offset: input.offset ?? { x: 0, y: 0 },
    markings: [],
    warnings,
  };
  visit(input.tree, 'root', run);
  return { markings: run.markings, warnings };
}

function fail(error: string): MeasuredImport {
  return { markings: [], warnings: [], error };
}
