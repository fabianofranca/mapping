/**
 * Motor dos componentes (etapa Biblioteca): a tela sem imagem. Uma tela é um retângulo em branco com
 * instâncias; cada instância é um retângulo (como uma marcação) com o tipo da especialização
 * e os valores dos campos (como uma anotação). Funções puras e imutáveis.
 */
import type { FieldValue, FieldValues } from './componentFormat';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Instance {
  readonly id: string;
  /** Id do tipo de anotação na especialização (que aponta para o componente). */
  readonly typeId: string;
  /** Retângulo absoluto na tela (também para filhos de containers). */
  readonly box: Box;
  readonly values: FieldValues;
  /** Container (instância) a que pertence; ausente = nível da tela. A ordem entre irmãos é a ordem na lista. */
  readonly parentId?: string;
}

export interface Screen {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Cor de fundo da tela (CSS). */
  readonly background: string;
  readonly instances: readonly Instance[];
}

export const SCREEN_FORMAT = 'mapping-lab-screen';

export function newScreen(name: string, width: number, height: number): Screen {
  return {
    id: crypto.randomUUID(),
    name,
    width,
    height,
    background: '#FFFFFF',
    instances: [],
  };
}

export function addInstance(screen: Screen, instance: Omit<Instance, 'id'>): Screen {
  return {
    ...screen,
    instances: [...screen.instances, { ...instance, id: crypto.randomUUID() }],
  };
}

/** Remove só a instância; os filhos sobem para o pai dela. */
export function removeInstance(screen: Screen, id: string): Screen {
  const removed = screen.instances.find((i) => i.id === id);
  if (!removed) return screen;
  const instances = screen.instances
    .filter((i) => i.id !== id)
    .map((i) =>
      i.parentId === id
        ? removed.parentId
          ? { ...i, parentId: removed.parentId }
          : withoutParent(i)
        : i,
    );
  return { ...screen, instances };
}

/** Muda o retângulo; mover (x/y) leva os descendentes junto, como as marcações da app. */
export function updateBox(screen: Screen, id: string, box: Box): Screen {
  const current = screen.instances.find((i) => i.id === id);
  if (!current) return screen;
  const next = roundBox(box);
  const dx = next.x - current.box.x;
  const dy = next.y - current.box.y;
  const moved = new Set(descendantsOf(screen, id));
  const instances = screen.instances.map((i) => {
    if (i.id === id) return { ...i, box: next };
    if ((dx !== 0 || dy !== 0) && moved.has(i.id))
      return { ...i, box: { ...i.box, x: i.box.x + dx, y: i.box.y + dy } };
    return i;
  });
  return { ...screen, instances };
}

/** Remove a instância e os descendentes. */
export function removeSubtree(screen: Screen, id: string): Screen {
  const gone = new Set([id, ...descendantsOf(screen, id)]);
  return { ...screen, instances: screen.instances.filter((i) => !gone.has(i.id)) };
}

export function childrenOf(screen: Screen, parentId: string | undefined): Instance[] {
  return screen.instances.filter((i) => (i.parentId ?? undefined) === parentId);
}

/** Ids dos descendentes, em pré-ordem. */
export function descendantsOf(screen: Screen, id: string): string[] {
  const out: string[] = [];
  const visit = (parent: string) => {
    for (const child of childrenOf(screen, parent)) {
      out.push(child.id);
      visit(child.id);
    }
  };
  visit(id);
  return out;
}

export function ancestorsOf(screen: Screen, id: string): string[] {
  const out: string[] = [];
  let current = screen.instances.find((i) => i.id === id);
  while (current?.parentId) {
    const parentId: string = current.parentId;
    if (out.includes(parentId)) break;
    out.push(parentId);
    current = screen.instances.find((i) => i.id === parentId);
  }
  return out;
}

/** Ordem de desenho: pai antes dos filhos (pré-ordem a partir do nível da tela). */
export function renderOrder(screen: Screen): Instance[] {
  const out: Instance[] = [];
  const known = new Set(screen.instances.map((i) => i.id));
  const visit = (parentId: string | undefined) => {
    for (const child of screen.instances) {
      const parent =
        child.parentId && known.has(child.parentId) ? child.parentId : undefined;
      if (parent !== parentId) continue;
      out.push(child);
      visit(child.id);
    }
  };
  visit(undefined);
  return out;
}

/**
 * Põe a instância dentro de um container (ou no nível da tela, com `undefined`) numa
 * posição entre os irmãos. Recusa ciclos (um ancestral não pode virar filho do descendente).
 */
export function setParent(
  screen: Screen,
  id: string,
  parentId: string | undefined,
  index?: number,
): Screen {
  if (parentId === id) return screen;
  if (parentId && [id, ...descendantsOf(screen, id)].includes(parentId)) return screen;
  const instance = screen.instances.find((i) => i.id === id);
  if (!instance) return screen;
  const moved: Instance = parentId ? { ...instance, parentId } : withoutParent(instance);
  const rest = screen.instances.filter((i) => i.id !== id);
  const siblings = rest.filter((i) => (i.parentId ?? undefined) === parentId);
  const at =
    index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
  // Insere antes do irmão que ocupa a posição `at` (ou no fim da lista).
  const anchor = siblings[at];
  const position = anchor ? rest.indexOf(anchor) : rest.length;
  const instances = [...rest.slice(0, position), moved, ...rest.slice(position)];
  return { ...screen, instances };
}

/** Move a instância uma posição entre os irmãos (`-1` para trás, `+1` para a frente). */
export function moveSibling(screen: Screen, id: string, delta: -1 | 1): Screen {
  const instance = screen.instances.find((i) => i.id === id);
  if (!instance) return screen;
  const siblings = childrenOf(screen, instance.parentId ?? undefined);
  const index = siblings.findIndex((i) => i.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= siblings.length) return screen;
  return setParent(
    screen,
    id,
    instance.parentId ?? undefined,
    delta > 0 ? target + 1 : target,
  );
}

function withoutParent(instance: Instance): Instance {
  const { parentId: _parentId, ...rest } = instance;
  void _parentId;
  return rest;
}

export function setValue(
  screen: Screen,
  id: string,
  key: string,
  value: FieldValue,
): Screen {
  return patch(screen, id, (i) => ({ ...i, values: { ...i.values, [key]: value } }));
}

/** Traz a instância para a frente (fim da lista = desenhada por último). */
export function bringToFront(screen: Screen, id: string): Screen {
  const instance = screen.instances.find((i) => i.id === id);
  if (!instance) return screen;
  return {
    ...screen,
    instances: [...screen.instances.filter((i) => i.id !== id), instance],
  };
}

export function resize(screen: Screen, width: number, height: number): Screen {
  return {
    ...screen,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function patch(screen: Screen, id: string, fn: (i: Instance) => Instance): Screen {
  let changed = false;
  const instances = screen.instances.map((i) => {
    if (i.id !== id) return i;
    changed = true;
    return fn(i);
  });
  return changed ? { ...screen, instances } : screen;
}

function roundBox(box: Box): Box {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  };
}

/** Serialização da tela (arquivo `*.screen.json` do laboratório). */
export function serializeScreen(screen: Screen): string {
  return JSON.stringify({ format: SCREEN_FORMAT, formatVersion: 1, ...screen }, null, 2);
}

export function parseScreen(input: unknown): Screen {
  if (typeof input !== 'object' || input === null)
    throw new Error('Tela inválida: não é um objeto');
  const r = input as Record<string, unknown>;
  if (r.format !== SCREEN_FORMAT)
    throw new Error(`Tela inválida: format deve ser "${SCREEN_FORMAT}"`);
  const num = (v: unknown, name: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw new Error(`Tela inválida: ${name} deve ser número`);
    return v;
  };
  const str = (v: unknown, name: string): string => {
    if (typeof v !== 'string') throw new Error(`Tela inválida: ${name} deve ser texto`);
    return v;
  };
  if (!Array.isArray(r.instances))
    throw new Error('Tela inválida: instances deve ser lista');
  const instances: Instance[] = r.instances.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null)
      throw new Error(`Tela inválida: instances[${index}]`);
    const i = raw as Record<string, unknown>;
    const b = (typeof i.box === 'object' && i.box !== null ? i.box : {}) as Record<
      string,
      unknown
    >;
    const values: Record<string, FieldValue> = {};
    if (typeof i.values === 'object' && i.values !== null) {
      for (const [k, v] of Object.entries(i.values as Record<string, unknown>)) {
        if (typeof v === 'string' || typeof v === 'number' || v === null) values[k] = v;
      }
    }
    return {
      id: typeof i.id === 'string' ? i.id : crypto.randomUUID(),
      typeId: str(i.typeId, `instances[${index}].typeId`),
      ...(typeof i.parentId === 'string' ? { parentId: i.parentId } : {}),
      box: {
        x: num(b.x, `instances[${index}].box.x`),
        y: num(b.y, `instances[${index}].box.y`),
        width: num(b.width, `instances[${index}].box.width`),
        height: num(b.height, `instances[${index}].box.height`),
      },
      values,
    };
  });
  return {
    id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' ? r.name : 'Tela',
    width: num(r.width, 'width'),
    height: num(r.height, 'height'),
    background: typeof r.background === 'string' ? r.background : '#FFFFFF',
    instances,
  };
}
