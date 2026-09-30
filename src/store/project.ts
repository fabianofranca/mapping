import * as model from '../model';
import type { Entry, Layer, Placement, Project, Rect } from '../model';
import { createProjectStore, type ActionResult, type ProjectStore } from './history';

export interface ActionDeps {
  readonly newId?: () => string;
}

/**
 * Actions do projeto: toda mutação passa por aqui. Cada action aplica uma
 * operação pura do modelo e gera uma entrada no histórico. As que criam itens
 * devolvem o id gerado.
 *
 * Gestos (arrastar/redimensionar) usam `store.beginGesture/updateGesture/commitGesture`
 * com as mesmas operações, para gerar uma única entrada no histórico.
 */
export function createProjectActions(store: ProjectStore, deps: ActionDeps = {}) {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const create = (op: (id: string) => (p: Project) => Project): ActionResult<string> => {
    const id = newId();
    const result = store.apply(op(id));
    return result.ok ? { ok: true, value: id } : result;
  };

  return {
    newProject(name: string, now: string, firstLayer: Omit<Layer, 'id'>): void {
      store.load(
        model.createProject({ name, now, firstLayer: { ...firstLayer, id: newId() } }),
      );
    },
    renameProject: (name: string) => store.apply((p) => model.renameProject(p, name)),

    // Camadas
    addLayer: (name: string, color: string) =>
      create((id) => (p) => model.addLayer(p, { id, name, color })),
    renameLayer: (layerId: string, name: string) =>
      store.apply((p) => model.renameLayer(p, layerId, name)),
    setLayerColor: (layerId: string, color: string) =>
      store.apply((p) => model.setLayerColor(p, layerId, color)),
    moveLayer: (layerId: string, toIndex: number) =>
      store.apply((p) => model.moveLayer(p, layerId, toIndex)),
    removeLayer: (layerId: string) => store.apply((p) => model.removeLayer(p, layerId)),

    // Imagens
    addImage: (file: model.ImageFile) =>
      create((id) => (p) => model.addImage(p, { ...file, id })),
    setImagePlacement: (imageId: string, placement: Placement) =>
      store.apply((p) => model.setImagePlacement(p, imageId, placement)),
    replaceImage: (
      imageId: string,
      file: model.ImageFile,
      options?: model.ReplaceImageOptions,
    ) => store.apply((p) => model.replaceImage(p, imageId, file, options)),
    removeImage: (imageId: string) => store.apply((p) => model.removeImage(p, imageId)),

    // Marcações
    createMarking: (imageId: string, rect: Rect, name?: string | null) =>
      create((id) => (p) => model.createMarking(p, { id, imageId, rect, name })),
    renameMarking: (markingId: string, name: string | null) =>
      store.apply((p) => model.renameMarking(p, markingId, name)),
    setMarkingRect: (markingId: string, rect: Rect) =>
      store.apply((p) => model.setMarkingRect(p, markingId, rect)),
    moveMarking: (markingId: string, dx: number, dy: number) =>
      store.apply((p) => model.moveMarking(p, markingId, dx, dy)),
    setMarkingParent: (markingId: string, parentId: string | null) =>
      store.apply((p) => model.setMarkingParent(p, markingId, parentId)),
    confirmMarkingReview: (markingId: string) =>
      store.apply((p) => model.confirmMarkingReview(p, markingId)),
    removeMarking: (markingId: string) =>
      store.apply((p) => model.removeMarking(p, markingId)),

    // Anotações e pares
    addAnnotation: (
      markingId: string,
      layerId: string,
      name?: string | null,
      entries?: readonly Entry[],
    ) =>
      create(
        (id) => (p) => model.addAnnotation(p, { id, markingId, layerId, name, entries }),
      ),
    renameAnnotation: (annotationId: string, name: string | null) =>
      store.apply((p) => model.renameAnnotation(p, annotationId, name)),
    removeAnnotation: (annotationId: string) =>
      store.apply((p) => model.removeAnnotation(p, annotationId)),
    setEntries: (annotationId: string, entries: readonly Entry[]) =>
      store.apply((p) => model.setEntries(p, annotationId, entries)),
    addEntry: (annotationId: string, entry: Entry) =>
      store.apply((p) => model.addEntry(p, annotationId, entry)),
    updateEntry: (annotationId: string, index: number, entry: Entry) =>
      store.apply((p) => model.updateEntry(p, annotationId, index, entry)),
    removeEntry: (annotationId: string, index: number) =>
      store.apply((p) => model.removeEntry(p, annotationId, index)),
    moveEntry: (annotationId: string, from: number, to: number) =>
      store.apply((p) => model.moveEntry(p, annotationId, from, to)),
  };
}

export type ProjectActions = ReturnType<typeof createProjectActions>;

/** Instâncias usadas pela app. Os testes criam as suas com `createProjectStore`. */
export const projectStore = createProjectStore();
export const projectActions = createProjectActions(projectStore);
