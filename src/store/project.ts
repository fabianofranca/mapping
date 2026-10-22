import * as model from '../model';
import type {
  AnnotationTypeRef,
  ComponentCatalog,
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
  TextMeasurer,
} from '../model';
import type { ActionResult, ProjectStore } from './history';
import { textMeasurer } from './textMeasure';

/** Ponto em pixels (da imagem ou do canvas, conforme a action). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ActionDeps {
  readonly newId?: () => string;
  /** Catálogo de componentes de agora (padrão: vazio). Dele vêm o tamanho mínimo e o desenho das instâncias. */
  readonly components?: () => ComponentCatalog;
  /** Medidor de texto de agora (padrão: o de `textMeasurer`, que o canvas troca pelo real). */
  readonly measure?: () => TextMeasurer;
}

/**
 * Prende o retângulo pedido ao tamanho mínimo do componente, em vez de recusar: o gesto de
 * redimensionar não trava no meio. A borda que o gesto não mexe (a oposta à alça) fica onde
 * estava no início do gesto (`base`); se nenhuma borda ficou, ancora em x e y.
 */
export function clampToMinSize(
  rect: Rect,
  base: Rect,
  min: { readonly width: number; readonly height: number },
): Rect {
  const fit = (
    start: number,
    size: number,
    minimum: number,
    baseStart: number,
    baseSize: number,
  ): [number, number] => {
    // Um eixo que o gesto não mexeu fica como está, mesmo abaixo do mínimo (marcação antiga).
    if (size >= minimum || (start === baseStart && size === baseSize))
      return [start, size];
    // Só a borda de baixo/direita ficou onde estava: a alça é a de cima/esquerda.
    const anchorFar = start + size === baseStart + baseSize && start !== baseStart;
    return [anchorFar ? start + size - minimum : start, minimum];
  };
  const [x, width] = fit(rect.x, rect.width, min.width, base.x, base.width);
  const [y, height] = fit(rect.y, rect.height, min.height, base.y, base.height);
  return { x, y, width, height };
}

/**
 * Arquivos do pacote de uma biblioteca: caminho relativo à pasta do pacote
 * (`components/button.json`) → texto (`.json`, `.md`) ou bytes (fontes).
 */
export type SpecPackageFiles = ReadonlyMap<string, string | Blob>;

function packageSpecNameIn(spec: Spec, files?: SpecPackageFiles): string | undefined {
  return files === undefined ? undefined : model.packageSpecNameOf(files, spec.id);
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
  const catalog = deps.components ?? (() => model.EMPTY_CATALOG);
  const measure = deps.measure ?? (() => textMeasurer.peek());
  /** Tamanho mínimo do componente que desenha a marcação (nada para uma marcação comum). */
  const rectOptions = (p: Project, markingId: string): model.RectOptions | undefined => {
    const minSize = model.componentMinSize(p, catalog(), markingId);
    return minSize === null ? undefined : { minSize };
  };

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
    setContainerMarkingColor: (containerId: string, color: string | null) =>
      store.apply((p) => model.setContainerMarkingColor(p, containerId, color)),
    renameContainer: (containerId: string, name: string | null) =>
      store.apply((p) => model.renameContainer(p, containerId, name)),

    // Trava (etapa 2.5): cada chamada é uma entrada no histórico, inclusive "trancar todas".
    setMarkingLocked: (markingId: string, locked: boolean) =>
      store.apply((p) => model.setMarkingLocked(p, markingId, locked)),
    setImageLocked: (containerId: string, locked: boolean) =>
      store.apply((p) => model.setImageLocked(p, containerId, locked)),
    setImageMarkingsLocked: (containerId: string, locked: boolean) =>
      store.apply((p) => model.setImageMarkingsLocked(p, containerId, locked)),

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
    addContainer: (
      file: model.ImageFile,
      center?: { readonly x: number; readonly y: number },
    ) => create((id) => (p) => model.addContainer(p, { ...file, id, center })),
    setContainerPlacement: (containerId: string, placement: Placement) =>
      store.apply((p) => model.setContainerPlacement(p, containerId, placement)),
    replaceContainer: (
      containerId: string,
      file: model.ImageFile,
      options?: model.ReplaceContainerOptions,
    ) => store.apply((p) => model.replaceContainer(p, containerId, file, options)),
    removeContainer: (containerId: string) =>
      store.apply((p) => model.removeContainer(p, containerId)),
    /** Container sem arquivo: imagem sem arquivo, com tamanho e cor de fundo. */
    addBackgroundContainer: (args: {
      readonly name: string | null;
      readonly width: number;
      readonly height: number;
      readonly background: string;
      readonly center?: Point;
    }) => create((id) => (p) => model.addBackgroundContainer(p, { ...args, id })),
    setBackgroundContainer: (
      containerId: string,
      patch: model.BackgroundContainerChanges,
    ) => store.apply((p) => model.setBackgroundContainer(p, containerId, patch)),

    // Gestos: prévias sem histórico e uma única entrada no fim (ver `ProjectStore`).
    beginGesture: () => store.beginGesture(),
    /** Prévia de mover/redimensionar. Se sobrepuser, fica na última posição válida. */
    previewImagePlacement: (containerId: string, placement: Placement) =>
      store.updateGesture((p) => model.setContainerPlacement(p, containerId, placement)),
    /** Prévia de mover a marcação (com os descendentes), limitada ao pai ou à imagem. */
    previewMarkingMove: (markingId: string, dx: number, dy: number) =>
      store.updateGesture((p) => {
        const d = model.clampMarkingDelta(p, markingId, dx, dy);
        return model.moveMarking(p, markingId, d.dx, d.dy);
      }),
    /** Prévia de redimensionar a marcação. */
    previewMarkingRect: (markingId: string, rect: Rect) =>
      store.updateGesture((p) => {
        const min = model.componentMinSize(p, catalog(), markingId);
        const base = p.markings.find((m) => m.id === markingId);
        const wanted = min && base ? clampToMinSize(rect, base.rect, min) : rect;
        return model.setMarkingRect(p, markingId, wanted, rectOptions(p, markingId));
      }),
    commitGesture: () => store.commitGesture(),
    cancelGesture: () => store.cancelGesture(),

    // Marcações
    createMarking: (containerId: string, rect: Rect, name?: string | null) =>
      create(
        (id) => (p) =>
          model.createMarking(
            p,
            { id, containerId: containerId, rect, name },
            rectOptions(p, id),
          ),
      ),
    renameMarking: (markingId: string, name: string | null) =>
      store.apply((p) => model.renameMarking(p, markingId, name)),
    setMarkingRect: (markingId: string, rect: Rect) =>
      store.apply((p) =>
        model.setMarkingRect(p, markingId, rect, rectOptions(p, markingId)),
      ),
    /** Ajuste fino pelo painel: o valor é limitado às regras (ver `adjustMarkingRect`). */
    adjustMarkingRect: (markingId: string, field: keyof Rect, value: number) =>
      store.apply((p) =>
        model.adjustMarkingRect(p, markingId, field, value, rectOptions(p, markingId)),
      ),
    moveMarking: (markingId: string, dx: number, dy: number) =>
      store.apply((p) => model.moveMarking(p, markingId, dx, dy)),
    setMarkingParent: (markingId: string, parentId: string | null) =>
      store.apply((p) => model.setMarkingParent(p, markingId, parentId)),
    confirmMarkingReview: (markingId: string) =>
      store.apply((p) => model.confirmMarkingReview(p, markingId)),
    removeMarking: (markingId: string) =>
      store.apply((p) => model.removeMarking(p, markingId)),
    /** Posição entre as irmãs (0 = por baixo). Não é geometria: a trava não impede. */
    reorderMarking: (markingId: string, index: number) =>
      store.apply((p) => model.reorderMarking(p, markingId, index)),

    // Componentes (etapa Biblioteca, B3): cada action é uma entrada de desfazer.
    /** Cria a marcação e a anotação tipada que a desenha; devolve o id da marcação. */
    addComponent: (args: {
      readonly containerId: string;
      readonly parentId: string | null;
      readonly specId: string;
      readonly typeId: string;
      readonly center?: Point;
    }): ActionResult<string> => {
      const markingId = newId();
      const annotationId = newId();
      const result = store.apply((p) =>
        model.addComponentMarking(
          p,
          catalog(),
          { ...args, markingId, annotationId },
          measure(),
        ),
      );
      return result.ok ? { ok: true, value: markingId } : result;
    },
    /** Arruma as filhas do container pelo layout do slot; devolve os avisos. Sem mudança, não há entrada. */
    arrange: (markingId: string): ActionResult<readonly string[]> => {
      let warnings: readonly string[] = [];
      const result = store.apply((p) => {
        const arranged = model.arrangeMarking(p, catalog(), markingId, measure());
        warnings = arranged.warnings;
        return arranged.project;
      });
      return result.ok ? { ok: true, value: warnings } : result;
    },

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
    // `packageFiles`: o pacote da biblioteca. O store só usa o NOME do arquivo da
    // especialização dentro dele; os bytes são da sessão (grava em `specs/<id>/`), nunca do store.
    applySpecialization: (spec: Spec, packageFiles?: SpecPackageFiles) =>
      store.apply((p) =>
        model.applySpecialization(p, spec, {
          newId,
          packageSpecName: packageSpecNameIn(spec, packageFiles),
        }),
      ),
    updateSpecialization: (
      spec: Spec,
      texts?: LabelTexts,
      packageFiles?: SpecPackageFiles,
    ) =>
      store.apply((p) =>
        model.updateSpecialization(p, spec, {
          newId,
          texts,
          packageSpecName: packageSpecNameIn(spec, packageFiles),
        }),
      ),
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
    setFieldValue: (annotationId: string, key: string, value: JsonValue) =>
      store.apply((p) => model.setFieldValue(p, annotationId, key, value)),
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

    // Repositórios por plataforma (etapa 3b): cada chamada é uma entrada no histórico.
    setPlatformRepo: (platformId: string, repo: PlatformRepoInput) =>
      store.apply((p) => model.setPlatformRepo(p, platformId, repo)),
    removePlatformRepo: (platformId: string) =>
      store.apply((p) => model.removePlatformRepo(p, platformId)),
  };
}

export type ProjectActions = ReturnType<typeof createProjectActions>;
