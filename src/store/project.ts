import * as model from '../model';
import type {
  AnnotationTypeRef,
  ArrowEnd,
  ArrowPoint,
  ArrowSide,
  ArrowStyle,
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
  /** Mínimo do componente de cada marcação de `p`: vale ao converter o `rect` para outro espaço. */
  const minSizeOf = (p: Project) => (id: string) =>
    model.componentMinSize(p, catalog(), id);
  /** Opções do assentar das operações de geometria que não são prévia de gesto. */
  const settleOptions = (p: Project): model.SettleOptions => ({
    settle: true,
    minSizeOf: minSizeOf(p),
  });
  /**
   * Opções das operações que mudam o retângulo da marcação: o tamanho mínimo do componente que
   * a desenha (nada para uma marcação comum) e o mínimo das demais, para a troca de espaço.
   */
  const rectOptions = (p: Project, markingId: string): model.RectOptions => {
    const minSize = model.componentMinSize(p, catalog(), markingId);
    return minSize === null
      ? { minSizeOf: minSizeOf(p) }
      : { minSize, minSizeOf: minSizeOf(p) };
  };
  /** O retângulo pedido preso ao tamanho mínimo do componente (o gesto não trava no meio). */
  const wantedRect = (p: Project, markingId: string, rect: Rect): Rect => {
    const min = model.componentMinSize(p, catalog(), markingId);
    const base = p.markings.find((m) => m.id === markingId);
    return min && base ? clampToMinSize(rect, base.rect, min) : rect;
  };
  /**
   * Operação final de um gesto: repete a operação com os valores finais e `settle: true` sobre o
   * projeto do início do gesto (`updateGesture` sempre parte dele). A final nunca pode falhar:
   * se falhar, o `commitGesture` gravaria a prévia sem assentar; então assenta a última prévia
   * válida. `op` recebe o projeto do início e a última prévia.
   */
  const finishGesture = (op: (base: Project, last: Project) => Project): ActionResult => {
    const last = store.project.peek();
    if (!last) return { ok: false, error: 'no-project' };
    const result = store.updateGesture((base) => op(base, last));
    if (result.ok) return result;
    store.updateGesture((base) => model.settleHierarchy(last, settleOptions(base)));
    return result;
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
    ) =>
      create(
        (id) => (p) => model.addContainer(p, { ...file, id, center }, settleOptions(p)),
      ),
    setContainerPlacement: (containerId: string, placement: Placement) =>
      store.apply((p) =>
        model.setContainerPlacement(p, containerId, placement, settleOptions(p)),
      ),
    replaceContainer: (
      containerId: string,
      file: model.ImageFile,
      options?: model.ReplaceContainerOptions,
    ) =>
      store.apply((p) =>
        model.replaceContainer(p, containerId, file, { ...options, ...settleOptions(p) }),
      ),
    removeContainer: (containerId: string) =>
      store.apply((p) => model.removeContainer(p, containerId, settleOptions(p))),
    /** Container sem arquivo: imagem sem arquivo, com tamanho e cor de fundo. */
    addBackgroundContainer: (args: {
      readonly name: string | null;
      readonly width: number;
      readonly height: number;
      readonly background: string;
      readonly center?: Point;
    }) =>
      create(
        (id) => (p) => model.addBackgroundContainer(p, { ...args, id }, settleOptions(p)),
      ),
    setBackgroundContainer: (
      containerId: string,
      patch: model.BackgroundContainerChanges,
    ) =>
      store.apply((p) =>
        model.setBackgroundContainer(p, containerId, patch, settleOptions(p)),
      ),

    // Gestos: prévias sem histórico e uma única entrada no fim (ver `ProjectStore`).
    // As prévias rodam com `settle: false` (pertencimento congelado enquanto o ponteiro se
    // move); ao soltar, o canvas chama a ação `finish…` da mesma operação, com os valores
    // finais (encaixe e absorção já aplicados) e `settle: true`, dentro do MESMO gesto, e só
    // então `commitGesture`: uma entrada de desfazer com geometria, espaço e pertencimento.
    beginGesture: () => store.beginGesture(),
    /** Prévia de mover/redimensionar. Se sobrepuser, fica na última posição válida. */
    previewImagePlacement: (containerId: string, placement: Placement) =>
      store.updateGesture((p) =>
        model.setContainerPlacement(p, containerId, placement, { settle: false }),
      ),
    /**
     * Final de mover/redimensionar o container: repete a operação com a posição da última
     * prévia válida e assenta (ele entra ou sai de uma marcação do canvas). Nunca falha.
     */
    finishImagePlacement: (containerId: string): ActionResult =>
      finishGesture((base, last) => {
        const placement = last.containers.find((c) => c.id === containerId)?.placement;
        return placement === undefined
          ? last
          : model.setContainerPlacement(
              base,
              containerId,
              placement,
              settleOptions(base),
            );
      }),
    /**
     * Prévia de mover a marcação pelo deslocamento `dx`, `dy` (inteiros, no espaço da marcação).
     * Nada prende a marcação ao container: ela pode sair dele; o espaço novo é decidido ao soltar.
     */
    previewMarkingMove: (markingId: string, dx: number, dy: number) =>
      store.updateGesture((p) =>
        model.moveMarking(p, markingId, Math.round(dx), Math.round(dy), {
          settle: false,
        }),
      ),
    /**
     * Final de mover a marcação: `dx`, `dy` são o deslocamento final no espaço de origem da
     * marcação (o do ponteiro, mais o encaixe que o canvas calculou). Assenta o espaço (converte o
     * `rect` dela e o das descendentes, com o `minSize` dos componentes) e o pertencimento.
     */
    finishMarkingMove: (markingId: string, dx: number, dy: number): ActionResult =>
      finishGesture((base) =>
        model.moveMarking(
          base,
          markingId,
          Math.round(dx),
          Math.round(dy),
          rectOptions(base, markingId),
        ),
      ),
    /** Prévia de redimensionar a marcação. */
    previewMarkingRect: (markingId: string, rect: Rect) =>
      store.updateGesture((p) =>
        model.setMarkingRect(p, markingId, wantedRect(p, markingId, rect), {
          ...rectOptions(p, markingId),
          settle: false,
        }),
      ),
    /**
     * Final de redimensionar a marcação: `rect` é o retângulo final (com a absorção que o canvas
     * calculou). Assenta o pertencimento: o que deixou de caber sai do pai, o que passou a caber
     * entra.
     */
    finishMarkingRect: (markingId: string, rect: Rect): ActionResult =>
      finishGesture((base) =>
        model.setMarkingRect(
          base,
          markingId,
          wantedRect(base, markingId, rect),
          rectOptions(base, markingId),
        ),
      ),
    /**
     * Prévia do arrasto conjunto: todos os itens pelo deslocamento `dx`, `dy` em unidades do
     * canvas, cada um no próprio espaço (`moveItems`). Tudo ou nada: se algum item não pode ir
     * (container sobrepondo um que não se move, marcação saindo do container, item travado), a
     * prévia inteira fica na última posição válida.
     */
    previewItemsMove: (items: readonly model.ItemRef[], dx: number, dy: number) =>
      store.updateGesture((p) => model.moveItems(p, items, dx, dy, { settle: false })),
    /**
     * Final do arrasto conjunto: repete a operação com o último deslocamento válido (`dx`, `dy`,
     * guardado pelo canvas) e assenta uma vez sobre o resultado inteiro. Nunca falha.
     */
    finishItemsMove: (
      items: readonly model.ItemRef[],
      dx: number,
      dy: number,
    ): ActionResult =>
      finishGesture((base) => model.moveItems(base, items, dx, dy, settleOptions(base))),
    commitGesture: () => store.commitGesture(),
    cancelGesture: () => store.cancelGesture(),

    // Marcações
    /**
     * Cria a marcação. `containerId` nulo = marcação do canvas (`rect` em unidades do canvas);
     * senão, `rect` em pixels do container. O espaço e o pai saem do assentar (a marcação do
     * canvas que cabe inteira num container passa a ser dele).
     */
    createMarking: (containerId: string | null, rect: Rect, name?: string | null) =>
      create(
        (id) => (p) =>
          model.createMarking(p, { id, containerId, rect, name }, rectOptions(p, id)),
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
      store.apply((p) =>
        model.moveMarking(p, markingId, dx, dy, rectOptions(p, markingId)),
      ),
    /**
     * Liga ou desliga a marcação flutuante (comentário sobre o canvas, fora do pertencimento).
     * Ligar a tira do container e a leva ao canvas, convertida; desligar a devolve ao container
     * que a contém inteira, se houver. É geometria: a trava impede nos dois sentidos.
     */
    setMarkingFloating: (markingId: string, floating: boolean) =>
      store.apply((p) =>
        model.setMarkingFloating(p, markingId, floating, rectOptions(p, markingId)),
      ),
    confirmMarkingReview: (markingId: string) =>
      store.apply((p) => model.confirmMarkingReview(p, markingId)),
    removeMarking: (markingId: string) =>
      store.apply((p) => model.removeMarking(p, markingId, settleOptions(p))),
    /** Posição entre as irmãs (0 = por baixo). Não é geometria: a trava não impede. */
    reorderMarking: (markingId: string, index: number) =>
      store.apply((p) => model.reorderMarking(p, markingId, index)),

    // Setas (ME4, decisão 14): cada action é uma entrada de desfazer. A rota e a ponta também
    // têm prévia de gesto (`preview…`, dentro de `beginGesture`/`commitGesture`): um gesto de
    // arrastar um ponto ou uma ponta é uma entrada só. Seta não tem pertencimento: sem assentar.
    /** Liga duas marcações; devolve o id da seta. A rota nasce no padrão (`points` vazio). */
    addArrow: (
      from: string,
      to: string,
      options: Omit<model.NewArrowArgs, 'id' | 'from' | 'to'> = {},
    ) => create((id) => (p) => model.createArrow(p, { ...options, id, from, to })),
    /** Exclui a seta e as anotações dela. */
    removeArrow: (arrowId: string) => store.apply((p) => model.removeArrow(p, arrowId)),
    /** Troca a marcação de uma ponta e/ou o lado (`null` = automático). */
    setArrowEndpoint: (
      arrowId: string,
      end: ArrowEnd,
      markingId: string,
      side: ArrowSide | null,
    ) => store.apply((p) => model.setArrowEndpoint(p, arrowId, end, markingId, side)),
    /** Pontos de passagem (no espaço das pontas, `arrowPointsSpace`); `[]` volta à rota padrão. */
    setArrowRoute: (arrowId: string, points: readonly ArrowPoint[]) =>
      store.apply((p) => model.setArrowRoute(p, arrowId, points)),
    setArrowStyle: (arrowId: string, style: ArrowStyle) =>
      store.apply((p) => model.setArrowStyle(p, arrowId, style)),
    setArrowName: (arrowId: string, name: string | null) =>
      store.apply((p) => model.setArrowName(p, arrowId, name)),
    setArrowLocked: (arrowId: string, locked: boolean) =>
      store.apply((p) => model.setArrowLocked(p, arrowId, locked)),
    /** Prévia do gesto de arrastar pontos de passagem; se falhar, fica na última prévia válida. */
    previewArrowRoute: (arrowId: string, points: readonly ArrowPoint[]) =>
      store.updateGesture((p) => model.setArrowRoute(p, arrowId, points)),
    /** Prévia do gesto de arrastar uma ponta até outra marcação ou outro lado. */
    previewArrowEndpoint: (
      arrowId: string,
      end: ArrowEnd,
      markingId: string,
      side: ArrowSide | null,
    ) =>
      store.updateGesture((p) =>
        model.setArrowEndpoint(p, arrowId, end, markingId, side),
      ),

    // Seleção múltipla (ME2): a seleção inteira numa operação, uma entrada de desfazer.
    /** Exclui os itens (marcações com o que cobrem, containers com as marcações). */
    removeItems: (items: readonly model.ItemRef[]) =>
      store.apply((p) => model.removeItems(p, items, settleOptions(p))),
    /** Tranca ou destranca todos os itens. */
    setItemsLocked: (items: readonly model.ItemRef[], locked: boolean) =>
      store.apply((p) => model.setItemsLocked(p, items, locked)),

    /** Cria a marcação pai que envolve a seleção; devolve o id dela (uma entrada de desfazer). */
    wrapItems: (items: readonly model.ItemRef[]) =>
      create((id) => (p) => model.wrapItems(p, { id, items }, settleOptions(p))),

    // Componentes (etapa Biblioteca, B3): cada action é uma entrada de desfazer.
    /** Cria a marcação e a anotação tipada que a desenha; devolve o id da marcação. */
    addComponent: (args: {
      /** Container da instância; `null` = o canvas (`center` em unidades do canvas). */
      readonly containerId: string | null;
      readonly parentId: string | null;
      readonly specId: string;
      readonly typeId: string;
      readonly center?: Point;
      /** Só tipo flutuante: perto deste alvo (`placeFloatingNear`), no lugar de `center`. */
      readonly near?: model.FloatingNearTarget;
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
        const arranged = model.arrangeMarking(
          p,
          catalog(),
          markingId,
          measure(),
          settleOptions(p),
        );
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
