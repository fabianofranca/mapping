/**
 * Laboratório "Componentes": a tela sem imagem. Uma tela é um retângulo em branco com
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
  readonly box: Box;
  readonly values: FieldValues;
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

export function removeInstance(screen: Screen, id: string): Screen {
  return { ...screen, instances: screen.instances.filter((i) => i.id !== id) };
}

export function updateBox(screen: Screen, id: string, box: Box): Screen {
  return patch(screen, id, (i) => ({ ...i, box: roundBox(box) }));
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
