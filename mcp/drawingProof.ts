import {
  createDrawingCache,
  effectiveDrawingMode,
  projectIndex,
  SLOT_OVERFLOW,
  type ComponentDrawing,
  type Project,
} from '../src/model';
import { builtinFontBook, measurerFor } from './image/textMeasurer';
import type { Refs } from './items';

// Prova de desenho por instância (etapa Componentes fiéis, CF10, decisão 27): o componente de
// cada marcação criada ou alterada pelo lote é instanciado no retângulo e com os valores reais,
// no modo efetivo do container, e o "não cabe" do motor vira um item `component-overflow` em
// `issues.new`. É aviso: não bloqueia o lote. Os avisos e as contas são os do modelo
// (`ComponentDrawing.shortfalls`); aqui só se escolhe o que provar e como mostrar.

export const COMPONENT_OVERFLOW = 'component-overflow';

export interface OverflowItem {
  readonly code: typeof COMPONENT_OVERFLOW;
  /** `text` (texto que não cabe na altura), `content` (filhos que passam do quadro) ou `slot`. */
  readonly kind: 'text' | 'content' | 'slot';
  /** O nó do componente que não cabe (o nome no molde). */
  readonly node: string;
  /** Quanto falta, em px (uma casa). */
  readonly missing: number;
  /** Medido sem fonte da biblioteca: a embutida no lugar, só um sinal para olhar. */
  readonly approximate?: true;
  readonly message: string;
}

const KIND_OF_PREFIX: readonly [string, OverflowItem['kind']][] = [
  ['texto maior que a caixa', 'text'],
  ['conteúdo maior que a caixa', 'content'],
];

const json = (value: unknown) => JSON.stringify(value);

/** Marcações que o lote criou ou alterou (retângulo, anotação, modo do desenho) e as donas delas. */
function touchedMarkings(before: Project, after: Project): Set<string> {
  const old = projectIndex(before);
  const next = projectIndex(after);
  const touched = new Set<string>();
  for (const marking of after.markings) {
    const previous = old.markings.get(marking.id);
    const changed =
      previous === undefined ||
      json(previous) !== json(marking) ||
      effectiveDrawingMode(before, marking.containerId) !==
        effectiveDrawingMode(after, marking.containerId) ||
      annotationsChanged(old.annotations, next.annotations, after, marking.id);
    if (changed) touched.add(marking.id);
  }
  // A filha que muda pode deixar de caber no slot da dona: a dona também entra na prova.
  for (const id of [...touched]) {
    const parent = next.markings.get(id)?.parentId;
    if (parent != null) touched.add(parent);
  }
  return touched;
}

type Annotations = ReturnType<typeof projectIndex>['annotations'];

function annotationsChanged(
  old: Annotations,
  next: Annotations,
  after: Project,
  markingId: string,
): boolean {
  return after.annotations.some(
    (a) => a.markingId === markingId && json(old.get(a.id)) !== json(next.get(a.id)),
  );
}

function itemOf(message: string, missing: number, approximate: boolean): OverflowItem {
  const rounded = Math.round(missing * 10) / 10;
  const kind =
    message === SLOT_OVERFLOW
      ? 'slot'
      : (KIND_OF_PREFIX.find(([prefix]) => message.startsWith(prefix))?.[1] ?? 'content');
  const node = message.includes(': ')
    ? message.slice(message.indexOf(': ') + 2)
    : message;
  const base = `${message} — falta ${rounded} px`;
  return {
    code: COMPONENT_OVERFLOW,
    kind,
    node,
    missing: rounded,
    ...(approximate ? { approximate: true as const } : {}),
    message: approximate ? `${base} (aproximado)` : base,
  };
}

function itemsOf(drawing: ComponentDrawing, approximate: boolean): OverflowItem[] {
  return Object.entries(drawing.shortfalls).map(([message, missing]) =>
    itemOf(message, missing, approximate),
  );
}

/** Os itens `component-overflow` por anotação, das marcações que o lote criou ou alterou. */
export function overflowProof(
  refs: Refs,
  before: Project,
): Map<string, readonly OverflowItem[]> {
  const after = refs.project;
  const found = new Map<string, readonly OverflowItem[]>();
  const touched = touchedMarkings(before, after);
  if (touched.size === 0) return found;
  const fonts = refs.loaded.fonts ?? builtinFontBook();
  const approximate = !fonts.hasLibraryFonts;
  const drawings = createDrawingCache()(
    after,
    refs.loaded.catalog,
    measurerFor(fonts),
    0,
  );
  for (const drawing of drawings.values()) {
    if (!drawing.overflow || !touched.has(drawing.markingId)) continue;
    found.set(drawing.annotationId, itemsOf(drawing, approximate));
  }
  return found;
}

interface IssueEntry {
  readonly annotation: string;
  readonly issues: readonly object[];
}

/** `issues` do lote com o "não cabe" das marcações provadas somado a `issues.new`. */
export function withOverflow(
  issues: Record<string, unknown>,
  refs: Refs,
  before: Project,
): Record<string, unknown> {
  const proof = overflowProof(refs, before);
  if (proof.size === 0) return issues;
  const entries = [...((issues.new as IssueEntry[] | undefined) ?? [])];
  for (const [annotationId, items] of proof) {
    const ref = refs.ref('a', annotationId);
    const at = entries.findIndex((e) => e.annotation === ref);
    if (at < 0) entries.push({ annotation: ref, issues: [...items] });
    else entries[at] = { ...entries[at]!, issues: [...entries[at]!.issues, ...items] };
  }
  return { ...issues, new: entries };
}
