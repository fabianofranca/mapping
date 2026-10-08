import * as model from '../model';
import type {
  AnnotationTypeRef,
  CodeRefEntryInput,
  EntryInput,
  JsonValue,
  LabelTexts,
  Layer,
  Placement,
  PlatformRepoInput,
  Project,
  Rect,
  Spec,
  SpecRemovalMode,
} from '../model';
import type { ActionResult, ProjectStore } from './history';

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
    newProject(name: string, now: string, firstLayer: Omit<Layer, 'id' | 'spec'>): void {
      store.load(
        model.createProject({ name, now, firstLayer: { ...firstLayer, id: newId() } }),
      );
    },
    renameProject: (name: string) => store.apply((p) => model.renameProject(p, name)),
    setImageMarkingColor: (imageId: string, color: string | null) =>
      store.apply((p) => model.setImageMarkingColor(p, imageId, color)),
    renameImage: (imageId: string, name: string | null) =>
      store.apply((p) => model.renameImage(p, imageId, name)),

    // Trava (etapa 2.5): cada chamada é uma entrada no histórico, inclusive "trancar todas".
    setMarkingLocked: (markingId: string, locked: boolean) =>
      store.apply((p) => model.setMarkingLocked(p, markingId, locked)),
    setImageLocked: (imageId: string, locked: boolean) =>
      store.apply((p) => model.setImageLocked(p, imageId, locked)),
    setImageMarkingsLocked: (imageId: string, locked: boolean) =>
      store.apply((p) => model.setImageMarkingsLocked(p, imageId, locked)),

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
    addImage: (
      file: model.ImageFile,
      center?: { readonly x: number; readonly y: number },
    ) => create((id) => (p) => model.addImage(p, { ...file, id, center })),
    setImagePlacement: (imageId: string, placement: Placement) =>
      store.apply((p) => model.setImagePlacement(p, imageId, placement)),
    replaceImage: (
      imageId: string,
      file: model.ImageFile,
      options?: model.ReplaceImageOptions,
    ) => store.apply((p) => model.replaceImage(p, imageId, file, options)),
    removeImage: (imageId: string) => store.apply((p) => model.removeImage(p, imageId)),

    // Gestos: prévias sem histórico e uma única entrada no fim (ver `ProjectStore`).
    beginGesture: () => store.beginGesture(),
    /** Prévia de mover/redimensionar. Se sobrepuser, fica na última posição válida. */
    previewImagePlacement: (imageId: string, placement: Placement) =>
      store.updateGesture((p) => model.setImagePlacement(p, imageId, placement)),
    /** Prévia de mover a marcação (com os descendentes), limitada ao pai ou à imagem. */
    previewMarkingMove: (markingId: string, dx: number, dy: number) =>
      store.updateGesture((p) => {
        const d = model.clampMarkingDelta(p, markingId, dx, dy);
        return model.moveMarking(p, markingId, d.dx, d.dy);
      }),
    /** Prévia de redimensionar a marcação. */
    previewMarkingRect: (markingId: string, rect: Rect) =>
      store.updateGesture((p) => model.setMarkingRect(p, markingId, rect)),
    commitGesture: () => store.commitGesture(),
    cancelGesture: () => store.cancelGesture(),

    // Marcações
    createMarking: (imageId: string, rect: Rect, name?: string | null) =>
      create((id) => (p) => model.createMarking(p, { id, imageId, rect, name })),
    renameMarking: (markingId: string, name: string | null) =>
      store.apply((p) => model.renameMarking(p, markingId, name)),
    setMarkingRect: (markingId: string, rect: Rect) =>
      store.apply((p) => model.setMarkingRect(p, markingId, rect)),
    /** Ajuste fino pelo painel: o valor é limitado às regras (ver `adjustMarkingRect`). */
    adjustMarkingRect: (markingId: string, field: keyof Rect, value: number) =>
      store.apply((p) => model.adjustMarkingRect(p, markingId, field, value)),
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
      entries?: readonly EntryInput[],
    ) =>
      create(
        (id) => (p) =>
          model.addAnnotation(p, {
            id,
            markingId,
            layerId,
            name,
            entries: entries?.map((e) => ({ ...e, id: e.id ?? newId() })),
          }),
      ),
    renameAnnotation: (annotationId: string, name: string | null) =>
      store.apply((p) => model.renameAnnotation(p, annotationId, name)),
    removeAnnotation: (annotationId: string) =>
      store.apply((p) => model.removeAnnotation(p, annotationId)),
    setAnnotationInherit: (annotationId: string, inherit: boolean) =>
      store.apply((p) => model.setAnnotationInherit(p, annotationId, inherit)),
    setAnnotationParent: (annotationId: string, ownerId: string | null) =>
      store.apply((p) => model.setAnnotationParent(p, annotationId, ownerId)),
    setEntries: (annotationId: string, entries: readonly EntryInput[]) =>
      store.apply((p) =>
        model.setEntries(
          p,
          annotationId,
          entries.map((e) => ({ ...e, id: e.id ?? newId() })),
        ),
      ),
    addEntry: (annotationId: string, entry: { key: string; value: string }) =>
      create((id) => (p) => model.addEntry(p, annotationId, { ...entry, id })),
    updateEntry: (
      annotationId: string,
      entryId: string,
      entry: { key: string; value: string },
    ) => store.apply((p) => model.updateEntry(p, annotationId, entryId, entry)),
    removeEntry: (annotationId: string, entryId: string) =>
      store.apply((p) => model.removeEntry(p, annotationId, entryId)),
    moveEntry: (annotationId: string, entryId: string, to: number) =>
      store.apply((p) => model.moveEntry(p, annotationId, entryId, to)),

    // Especializações (docs/history/PLAN-etapas-1-2.md 13.4): cada operação é uma entrada no histórico.
    applySpecialization: (spec: Spec) =>
      store.apply((p) => model.applySpecialization(p, spec, { newId })),
    updateSpecialization: (spec: Spec, texts?: LabelTexts) =>
      store.apply((p) => model.updateSpecialization(p, spec, { newId, texts })),
    removeSpecialization: (specId: string, mode: SpecRemovalMode, texts?: LabelTexts) =>
      store.apply((p) => model.removeSpecialization(p, specId, mode, { newId, texts })),

    // Anotações tipadas
    addTypedAnnotation: (
      markingId: string,
      layerId: string,
      type: AnnotationTypeRef,
      parentAnnotationId?: string | null,
    ) =>
      create(
        (id) => (p) =>
          model.addTypedAnnotation(p, {
            id,
            markingId,
            layerId,
            type,
            parentAnnotationId,
          }),
      ),
    /** No `codeRef`, `value` é a lista inteira; entradas sem `_id` ganham um id novo. */
    setFieldValue: (annotationId: string, key: string, value: JsonValue) =>
      store.apply((p) => model.setFieldValue(p, annotationId, key, value, { newId })),
    addTableRow: (annotationId: string, key: string) =>
      create((rowId) => (p) => model.addTableRow(p, annotationId, key, rowId)),
    setTableCell: (
      annotationId: string,
      key: string,
      rowId: string,
      column: string,
      value: JsonValue,
    ) =>
      store.apply((p) => model.setTableCell(p, annotationId, key, rowId, column, value)),
    removeTableRow: (annotationId: string, key: string, rowId: string) =>
      store.apply((p) => model.removeTableRow(p, annotationId, key, rowId)),
    moveTableRow: (annotationId: string, key: string, rowId: string, toIndex: number) =>
      store.apply((p) => model.moveTableRow(p, annotationId, key, rowId, toIndex)),
    convertAnnotationToFree: (annotationId: string, texts?: LabelTexts) =>
      store.apply((p) =>
        model.convertAnnotationToFree(p, annotationId, { newId, texts }),
      ),

    // Referências de código (etapa 3b): cada chamada é uma entrada no histórico.
    /** Devolve o `_id` da entrada nova. */
    addCodeRefEntry: (annotationId: string, key: string, input: CodeRefEntryInput) =>
      create(
        (entryId) => (p) => model.addCodeRefEntry(p, annotationId, key, entryId, input),
      ),
    updateCodeRefEntry: (
      annotationId: string,
      key: string,
      entryId: string,
      changes: Partial<CodeRefEntryInput>,
    ) =>
      store.apply((p) =>
        model.updateCodeRefEntry(p, annotationId, key, entryId, changes),
      ),
    removeCodeRefEntry: (annotationId: string, key: string, entryId: string) =>
      store.apply((p) => model.removeCodeRefEntry(p, annotationId, key, entryId)),
    moveCodeRefEntry: (
      annotationId: string,
      key: string,
      entryId: string,
      toIndex: number,
    ) =>
      store.apply((p) => model.moveCodeRefEntry(p, annotationId, key, entryId, toIndex)),
    setPlatformRepo: (platformId: string, repo: PlatformRepoInput) =>
      store.apply((p) => model.setPlatformRepo(p, platformId, repo)),
    removePlatformRepo: (platformId: string) =>
      store.apply((p) => model.removePlatformRepo(p, platformId)),
  };
}

export type ProjectActions = ReturnType<typeof createProjectActions>;
