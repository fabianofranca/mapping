/**
 * Direção de leitura no motor dos componentes (etapa #1096, R1; formatVersion 4): resolve a direção
 * efetiva de cada nó do template antes de o motor medir e posicionar. Funções puras, sem DOM.
 *
 * - A raiz segue a direção da instância (`options.direction`, padrão `ltr`); `direction` num nó
 *   (literal `ltr`/`rtl`) a fixa para ele e para a subárvore.
 * - Todo nó sai com `direction` já escrito (a efetiva), e a condição `{ "$direction": "rtl" }` vira
 *   o literal (`{ "$and": [] }` verdadeiro, `{ "$or": [] }` falso) pela direção do nó em que está.
 * - Sem `rtl` na instância e sem `direction`/`$direction` no template nada se reescreve: o motor lê
 *   `ltr` de todo nó e o desenho de hoje não muda.
 */
import type { Direction, TemplateNode } from './componentFormat';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A direção que o próprio nó fixa (`direction` literal), se fixa. O `repeat` não conta: nele
 * `direction` continua sendo o empilhamento das linhas (`row`/`column`).
 */
export function ownDirection(node: TemplateNode): Direction | undefined {
  if (node.type === 'repeat') return undefined;
  return node.direction === 'ltr' || node.direction === 'rtl'
    ? node.direction
    : undefined;
}

/** Algum par chave/valor da árvore (em qualquer profundidade) passa por `hit`? */
function someEntry(
  tree: unknown,
  hit: (key: string, value: unknown) => boolean,
): boolean {
  if (Array.isArray(tree)) return tree.some((item) => someEntry(item, hit));
  if (!isRecord(tree)) return false;
  return Object.entries(tree).some(
    ([key, value]) => hit(key, value) || someEntry(value, hit),
  );
}

/** `direction` literal num nó (no `repeat` o valor é `row`/`column`, que não entra) ou `$direction`. */
const directionEntry = (key: string, value: unknown): boolean =>
  key === '$direction' || (key === 'direction' && (value === 'ltr' || value === 'rtl'));

/** O template cita `direction` num nó ou `$direction` numa condição? */
export function usesDirection(tree: unknown): boolean {
  return someEntry(tree, directionEntry);
}

/**
 * A árvore pede uma passada em `rtl`? Sim quando ela fala de direção (`usesDirection`) ou espelha
 * (`mirror: true`). Fora isso o `rtl` é o espelho exato do `ltr` — os mesmos tamanhos, porque a
 * medida do texto não olha a direção —, então nenhum resultado muda e a passada se dispensa.
 */
export function isDirectionSensitive(tree: unknown): boolean {
  return someEntry(
    tree,
    (key, value) => directionEntry(key, value) || (key === 'mirror' && value === true),
  );
}

/** Troca cada `{ "$direction": x }` do valor pelo literal da direção `dir`. */
function fixConditions(value: unknown, dir: Direction): unknown {
  if (Array.isArray(value)) return value.map((item) => fixConditions(item, dir));
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$direction')
    return value.$direction === dir ? { $and: [] } : { $or: [] };
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) out[key] = fixConditions(inner, dir);
  return out;
}

/** O nó com a direção efetiva escrita, as condições `$direction` resolvidas e os filhos também. */
function resolveNode(node: TemplateNode, inherited: Direction): TemplateNode {
  const dir: Direction = ownDirection(node) ?? inherited;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'children' && Array.isArray(value))
      out[key] = value.map((child: TemplateNode) => resolveNode(child, dir));
    else out[key] = fixConditions(value, dir);
  }
  out.direction = dir;
  return out as unknown as TemplateNode;
}

/**
 * A árvore com a direção efetiva em todo nó (ver o comentário do topo). Devolve o próprio `template`
 * quando nada o pede (`root` `ltr` e nenhum `direction`/`$direction` nele).
 */
export function resolveDirections<T extends TemplateNode>(
  template: T,
  root: Direction,
): T {
  if (root === 'ltr' && !usesDirection(template)) return template;
  return resolveNode(template, root) as T;
}
