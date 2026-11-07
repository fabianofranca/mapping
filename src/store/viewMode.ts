import { z } from 'zod';
import { readSetting, writeSetting } from '../utils/safeStorage';
import type { EditorUi } from './ui';

// O que o modo visualização mostra no canvas (decisões 8, 9 e 13 da etapa #656). A escolha é
// estado da UI: não vai para o `mapping.json` nem entra no desfazer. Fica por cópia do projeto,
// neste navegador (`ProjectStorage.copyId`), no molde da retomada da revisão (`review.ts`): um
// blob versionado no `localStorage`, validado com zod, as cópias mais recentes. Sem `copyId`,
// vale só para a sessão. O modo em si (ligado ou não) nunca é guardado: nasce desligado.

export interface ViewShow {
  /** O nome acima do container e o contorno do container sem arquivo (o fundo continua). */
  readonly containers: boolean;
  /** O bitmap das fotos. */
  readonly images: boolean;
  /** A borda e o halo das marcações. */
  readonly outline: boolean;
  /** O cabeçalho com o nome dentro da marcação. */
  readonly names: boolean;
  /** As setas. */
  readonly arrows: boolean;
  /**
   * Camadas com desenho desmarcadas. Guardar as desmarcadas (e não as marcadas) faz a camada
   * nova nascer marcada; ids que já não existem não fazem efeito.
   */
  readonly hiddenDrawingLayers: ReadonlySet<string>;
}

type ViewFlag = 'containers' | 'images' | 'outline' | 'names' | 'arrows';

const NO_LAYERS: ReadonlySet<string> = new Set();

/** O começo: tudo marcado, menos o contorno das marcações. */
export const VIEW_SHOW_START: ViewShow = {
  containers: true,
  images: true,
  outline: false,
  names: true,
  arrows: true,
  hiddenDrawingLayers: NO_LAYERS,
};

/** Muda os itens dados; o resto fica. */
export function setViewShow(
  ui: EditorUi,
  patch: Partial<Pick<ViewShow, ViewFlag>>,
): void {
  ui.viewShow.value = { ...ui.viewShow.peek(), ...patch };
}

/** Desmarca a camada com desenho se estava marcada, e marca se estava desmarcada. */
export function toggleViewDrawingLayer(ui: EditorUi, layerId: string): void {
  const current = ui.viewShow.peek();
  const hidden = new Set(current.hiddenDrawingLayers);
  if (!hidden.delete(layerId)) hidden.add(layerId);
  ui.viewShow.value = { ...current, hiddenDrawingLayers: hidden };
}

/** Desmarca a camada com desenho (sem efeito se já estava). */
export function hideViewDrawingLayer(ui: EditorUi, layerId: string): void {
  const current = ui.viewShow.peek();
  if (current.hiddenDrawingLayers.has(layerId)) return;
  ui.viewShow.value = {
    ...current,
    hiddenDrawingLayers: new Set(current.hiddenDrawingLayers).add(layerId),
  };
}

/** Mostrar tudo: marca tudo, inclusive o contorno e todas as camadas com desenho. */
export function showEverything(ui: EditorUi): void {
  ui.viewShow.value = {
    containers: true,
    images: true,
    outline: true,
    names: true,
    arrows: true,
    hiddenDrawingLayers: NO_LAYERS,
  };
}

/**
 * Só as telas: containers, imagens e todas as camadas com desenho marcados; contorno, nome e
 * setas desmarcados (o canvas do antigo Ver limpo).
 */
export function onlyScreens(ui: EditorUi): void {
  ui.viewShow.value = {
    containers: true,
    images: true,
    outline: false,
    names: false,
    arrows: false,
    hiddenDrawingLayers: NO_LAYERS,
  };
}

// ---------------------------------------------------------------------------
// Persistência por cópia do projeto

const KEY = 'mapping.viewShow';
const VERSION = 1;
/** Cópias do projeto com escolha guardada (as mais recentes). */
const MAX_COPIES = 20;

const copySchema = z.object({
  containers: z.boolean(),
  images: z.boolean(),
  outline: z.boolean(),
  names: z.boolean(),
  arrows: z.boolean(),
  hiddenLayers: z.array(z.string()),
});
type StoredCopy = z.infer<typeof copySchema>;

type Blob = Readonly<Record<string, StoredCopy>>;

/** Lê as cópias do `localStorage`; texto corrompido, outra versão ou cópia inválida somem. */
function readCopies(): Blob {
  const text = readSetting(KEY);
  if (text === null) return {};
  try {
    const parsed = z
      .object({ v: z.literal(VERSION), copies: z.record(z.string(), z.unknown()) })
      .safeParse(JSON.parse(text));
    if (!parsed.success) return {};
    const copies: Record<string, StoredCopy> = {};
    for (const [scope, value] of Object.entries(parsed.data.copies)) {
      const copy = copySchema.safeParse(value);
      if (copy.success) copies[scope] = copy.data;
    }
    return copies;
  } catch {
    return {};
  }
}

function toStored(show: ViewShow): StoredCopy {
  return {
    containers: show.containers,
    images: show.images,
    outline: show.outline,
    names: show.names,
    arrows: show.arrows,
    hiddenLayers: [...show.hiddenDrawingLayers],
  };
}

function fromStored(copy: StoredCopy): ViewShow {
  return {
    containers: copy.containers,
    images: copy.images,
    outline: copy.outline,
    names: copy.names,
    arrows: copy.arrows,
    hiddenDrawingLayers: new Set(copy.hiddenLayers),
  };
}

/** O blob com a escolha desta cópia por último (a mais recente) e só as mais recentes. */
function withCopy(copies: Blob, scope: string, copy: StoredCopy): Blob {
  const others = Object.entries(copies).filter(([key]) => key !== scope);
  return Object.fromEntries([...others, [scope, copy]].slice(-MAX_COPIES));
}

/**
 * Aplica a escolha guardada desta cópia do projeto e passa a guardar cada mudança. Sem
 * `copyId` (`undefined` ou vazio), nada é lido nem gravado: a escolha vale só para a sessão.
 * Devolve quem para de guardar.
 */
export function attachViewShowPersistence(
  ui: EditorUi,
  copyId: string | undefined,
): () => void {
  if (copyId === undefined || copyId === '') return () => undefined;
  const saved = readCopies()[copyId];
  if (saved !== undefined) ui.viewShow.value = fromStored(saved);
  let first = true;
  return ui.viewShow.subscribe((show) => {
    // A primeira chamada é o valor de agora (já guardado ou o começo): só mudanças gravam.
    if (first) {
      first = false;
      return;
    }
    const blob = withCopy(readCopies(), copyId, toStored(show));
    writeSetting(KEY, JSON.stringify({ v: VERSION, copies: blob }));
  });
}
