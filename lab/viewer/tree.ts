/**
 * Visualizador embutível: a árvore das instâncias de uma tela, pronta para o hospedeiro
 * desenhar numa lista ou num painel (a seleção e o hover voltam ao viewer por `setSelection`
 * e `setHover`). Puro, sem DOM.
 *
 * A ordem é a de `renderOrder` (pai antes dos filhos, irmãos na ordem da lista) e o critério
 * de raiz também: um `parentId` que não existe na tela vale como nível da tela.
 */
import type { Library } from '../components/library';
import { instanceLabel } from '../components/library';
import type { Instance, Screen } from '../components/screen';

export interface TreeNode {
  readonly id: string;
  /** Ausente nas raízes (inclusive quando o `parentId` da instância não existe na tela). */
  readonly parentId?: string;
  /** 0 nas raízes. */
  readonly depth: number;
  /** `instanceLabel(tipo, valores)`; tipo desconhecido (ou sem biblioteca): o `typeId`. */
  readonly label: string;
  readonly typeId: string;
  /** Ausente quando o tipo não existe na biblioteca. */
  readonly typeName?: string;
  readonly instance: Instance;
  readonly children: readonly TreeNode[];
}

/** As raízes da tela, na ordem de desenho, com os filhos aninhados. */
export function screenTree(
  screen: Screen,
  library: Library | undefined,
): readonly TreeNode[] {
  const types = new Map((library?.types ?? []).map((t) => [t.id, t]));
  const known = new Set(screen.instances.map((i) => i.id));
  // Filhos por pai (`undefined` = raízes), na ordem da lista: uma passada só.
  const byParent = new Map<string | undefined, Instance[]>();
  for (const instance of screen.instances) {
    const parent =
      instance.parentId !== undefined && known.has(instance.parentId)
        ? instance.parentId
        : undefined;
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(instance);
    else byParent.set(parent, [instance]);
  }
  const build = (parent: string | undefined, depth: number): TreeNode[] =>
    (byParent.get(parent) ?? []).map((instance) => {
      const type = types.get(instance.typeId);
      return {
        id: instance.id,
        ...(parent === undefined ? {} : { parentId: parent }),
        depth,
        label: type ? instanceLabel(type, instance.values) : instance.typeId,
        typeId: instance.typeId,
        ...(type ? { typeName: type.name } : {}),
        instance,
        children: build(instance.id, depth + 1),
      };
    });
  return build(undefined, 0);
}

/** A árvore em lista, em pré-ordem (a mesma ordem de `renderOrder`). */
export function flattenTree(nodes: readonly TreeNode[]): readonly TreeNode[] {
  const out: TreeNode[] = [];
  const visit = (list: readonly TreeNode[]): void => {
    for (const node of list) {
      out.push(node);
      visit(node.children);
    }
  };
  visit(nodes);
  return out;
}
