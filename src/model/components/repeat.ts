/**
 * Motor dos componentes (ME4): expansão do nó `repeat` (a tabela desenhada, `formatVersion` 2).
 *
 * `expandRepeats` roda antes do motor (`instantiate` e `measureComponent`): troca cada `repeat`
 * por um quadro com uma cópia do `template` por linha do campo `table`, e entrega os valores
 * das colunas como campos extras com nome próprio de cada linha (`$r0_1:chave`). Nas cópias, as
 * expressões que citam uma coluna (`$field`, `$has`, `$eq`, `$switch`) passam a citar esse campo
 * extra, o que faz a coluna **sombrear** o campo do tipo de mesmo nome sem o motor saber de
 * escopo. Função pura: o resultado só tem nós que o motor já conhece.
 */
import type {
  ComponentFile,
  FieldRow,
  FieldValue,
  FieldValues,
  FrameTemplate,
  RepeatTemplate,
  TemplateNode,
} from './componentFormat';

/** O template tem algum nó `repeat`? */
export function hasRepeat(node: TemplateNode): boolean {
  if (node.type === 'repeat') return true;
  return node.type === 'frame' && (node.children ?? []).some(hasRepeat);
}

/** As linhas do campo `table` como o motor as recebe (itens que não são objeto ficam de fora). */
export function rowsOf(value: FieldValue): readonly FieldRow[] {
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).filter(
    (row): row is FieldRow =>
      typeof row === 'object' && row !== null && !Array.isArray(row),
  );
}

/** Colunas vistas nas linhas (a união das chaves, sem o `_id`), na ordem em que aparecem. */
export function columnsOf(rows: readonly FieldRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) if (key !== '_id') columns.add(key);
  }
  return [...columns];
}

/** Copia o JSON trocando as chaves de campo que são colunas pelo campo extra da linha. */
function scoped(value: unknown, columns: ReadonlySet<string>, scope: string): unknown {
  if (Array.isArray(value)) return value.map((item) => scoped(item, columns, scope));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  const rename = (key: string): string => (columns.has(key) ? `${scope}:${key}` : key);
  for (const [key, item] of Object.entries(value)) {
    if (
      (key === '$field' || key === '$has' || key === '$switch') &&
      typeof item === 'string'
    ) {
      out[key] = rename(item);
    } else if (key === '$eq' && Array.isArray(item) && typeof item[0] === 'string') {
      out[key] = [rename(item[0]), ...item.slice(1)];
    } else {
      out[key] = scoped(item, columns, scope);
    }
  }
  return out;
}

export interface ExpandedComponent {
  readonly component: ComponentFile;
  readonly values: FieldValues;
  /** Avisos da expansão (o campo `table` do `repeat` não foi informado). */
  readonly warnings: readonly string[];
}

/**
 * O componente sem `repeat` e os valores com os campos extras das linhas. Sem `repeat` no
 * template devolve os mesmos objetos. O `template` de cada linha é `hug` no eixo das linhas
 * quando não diz o contrário; o nó vira um quadro `hug` nesse eixo e `fill` no outro.
 */
export function expandRepeats(
  component: ComponentFile,
  values: FieldValues,
): ExpandedComponent {
  if (!hasRepeat(component.template)) return { component, values, warnings: [] };

  const extra: Record<string, FieldValue> = {};
  const warnings: string[] = [];
  let counter = 0;

  const expandRepeat = (node: RepeatTemplate): FrameTemplate => {
    const n = counter++;
    if (!(node.field in values)) warnings.push(`campo não informado: ${node.field}`);
    const rows = rowsOf(values[node.field]);
    const columns = new Set(columnsOf(rows));
    const column = (node.direction ?? 'column') === 'column';
    const children = rows.map((row, i): FrameTemplate => {
      const scope = `$r${n}_${i}`;
      for (const name of columns) extra[`${scope}:${name}`] = row[name] ?? null;
      const copy = scoped(node.template, columns, scope) as FrameTemplate;
      const hugged = column
        ? { height: copy.height ?? 'hug' }
        : { width: copy.width ?? 'hug' };
      return { ...copy, ...hugged };
    });
    return {
      type: 'frame',
      name: node.name ?? 'repeat',
      ...(node.visible === undefined ? {} : { visible: node.visible }),
      ...(node.opacity === undefined ? {} : { opacity: node.opacity }),
      ...(node.anchors === undefined ? {} : { anchors: node.anchors }),
      width: node.width ?? (column ? 'fill' : 'hug'),
      height: node.height ?? (column ? 'hug' : 'fill'),
      layout: { type: node.direction ?? 'column', gap: node.gap ?? 0 },
      children,
    };
  };

  const expand = (node: TemplateNode): TemplateNode => {
    if (node.type === 'repeat') return expandRepeat(node);
    if (node.type !== 'frame' || node.children === undefined) return node;
    return { ...node, children: node.children.map(expand) };
  };

  const template = expand(component.template) as FrameTemplate;
  return {
    component: { ...component, template },
    values: { ...values, ...extra },
    warnings,
  };
}
