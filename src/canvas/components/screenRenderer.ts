/**
 * Desenha UMA tela dentro de um `Konva.Group` fornecido pelo chamador (o
 * visualizador usa um por Stage; o editor do laboratório, um por tela do quadro). Cada instância
 * vira um `Konva.Group` filho, na posição do retângulo (coordenadas da tela), com o atributo
 * `instanceId`, o componente instanciado (`instantiate` → `renderScene`) e um retângulo "hit"
 * transparente para o clique. Tipo sem componente (ou desconhecido) vira a caixa tracejada
 * reservada, com um aviso.
 *
 * `update` faz o diff por instância: compara por identidade (`===`) a biblioteca e o objeto de
 * cada instância; só as instâncias novas ou com objeto novo são (re)instanciadas, as que sumiram
 * são destruídas. O renderer não conhece "quadro", "artboard" nem "tela ativa": só o grupo que
 * recebe. Não tem eventos de arrasto (o editor liga os dele em `onInstanceCreated`).
 */
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { type RemoteImageResult, renderScene } from './renderScene';
import { DEFAULT_PALETTE, type RenderPalette } from './palette';
import type { RenderWarning } from './renderWarnings';
import { clippedSlotBox } from '../../model/components/arrange';
import { type Box, intersectClips } from '../../model/components/box';
import type { Direction, FieldValues } from '../../model/components/componentFormat';
import { type TextMeasurer, instantiate } from '../../model/components/instantiate';
import {
  type Library,
  type TypeDef,
  instanceLabel,
} from '../../model/components/library';
import {
  NO_PROVIDED,
  extendProvided,
  pickProvided,
  sameProvided,
  type ProvidedValues,
} from '../../model/components/provided';
import { type Instance, type Screen, renderOrder } from '../../model/components/screen';
import { konvaMeasurer } from './konvaMeasurer';

/** Área clicável da instância: transparente, mas que recebe o ponteiro. */
const HIT_FILL = 'transparent';

/** Avisos da instanciação por instância (só as que têm aviso). */
export type InstanceWarnings = ReadonlyMap<string, readonly string[]>;

/**
 * Os textos que o renderer desenha ou devolve (a caixa de tipo ausente e os avisos): quem chama
 * os fornece, no idioma dele. O renderer não tem texto de interface próprio.
 */
export interface ScreenRendererLabels {
  /** Texto da caixa de uma instância cujo tipo não tem componente. */
  typeWithoutComponent(typeName: string): string;
  /** Texto da caixa de uma instância cujo tipo a biblioteca não tem. */
  unknownType(typeId: string): string;
  /** Aviso da instância de tipo sem componente. */
  readonly warningTypeWithoutComponent: string;
  /** Aviso da instância de tipo que a biblioteca não tem. */
  readonly warningUnknownType: string;
  /** Texto de um aviso do desenho da cena (`renderScene`). */
  drawWarning(warning: RenderWarning): string;
}

export interface ScreenRendererOptions {
  /** Textos do renderer, no idioma de quem chama. */
  readonly labels: ScreenRendererLabels;
  /** Cores e medidas do reservado e da caixa de tipo ausente (padrão: `DEFAULT_PALETTE`). */
  readonly palette?: Partial<RenderPalette>;
  /** Medidor de texto (padrão: `konvaMeasurer`). */
  readonly measure?: TextMeasurer;
  /** Chamado uma vez por instância, quando o grupo dela é criado (o editor liga o arrasto aqui). */
  readonly onInstanceCreated?: (id: string, node: Konva.Group) => void;
  /**
   * Resolve a URL do nó `image` dos componentes (ver `RenderOptions.remoteImage`). Sem ela,
   * toda imagem remota é o reservado.
   */
  readonly remoteImage?: (url: string) => RemoteImageResult;
  /** O resultado será lido de volta (`toDataURL`): imagem `opaque` vira reservado. */
  readonly pixelSafe?: boolean;
}

export interface ScreenRendererUpdateOptions {
  /** Re-instancia tudo (fontes carregadas, por exemplo). */
  readonly force?: boolean;
  /** Índice, no grupo, da primeira instância (o chamador pode ter outros filhos antes). Padrão 0. */
  readonly zBase?: number;
  /**
   * Direção de leitura do interior dos componentes (padrão `ltr`; o editor ainda não a muda).
   * Trocá-la re-instancia tudo.
   */
  readonly direction?: Direction;
}

interface Mounted {
  instance: Instance;
  readonly node: Konva.Group;
  label: string | undefined;
  /** URLs remotas que o último desenho da instância pediu. */
  imageUrls: readonly string[];
  /** Cor herdada: os valores oferecidos pelos ancestrais que o último desenho leu. */
  provided: ProvidedValues;
  /** O que o slot da instância oferece às filhas no último desenho (`provide`). */
  offers: ProvidedValues | undefined;
  /** Caixa do slot (na tela) quando ele tem `clip`: as filhas só aparecem dentro dela. */
  slotClip: Box | undefined;
  /** O recorte (na tela) que as filhas recebem: o `slotClip` dentro do recorte da própria instância. */
  childClip: Box | undefined;
}

export class ScreenRenderer {
  private readonly measure: TextMeasurer;
  private readonly palette: RenderPalette;
  private readonly mounted = new Map<string, Mounted>();
  private readonly warningsById = new Map<string, readonly string[]>();
  private order: string[] = [];
  private direction: Direction = 'ltr';
  private library: Library | undefined;
  private typesById: ReadonlyMap<string, TypeDef> = new Map();

  constructor(
    private readonly group: Konva.Group,
    private readonly options: ScreenRendererOptions,
  ) {
    this.measure = options.measure ?? konvaMeasurer;
    this.palette = { ...DEFAULT_PALETTE, ...options.palette };
  }

  /**
   * Diff: cria, atualiza (só as instâncias cujo objeto mudou) e remove; o z-order segue
   * `renderOrder(screen)` a partir de `zBase`. Biblioteca nova (outro objeto) equivale a `force`.
   * Devolve true se algo foi criado, redesenhado, removido ou reordenado.
   */
  update(
    library: Library | undefined,
    screen: Screen,
    options: ScreenRendererUpdateOptions = {},
  ): boolean {
    const zBase = options.zBase ?? 0;
    let force = options.force === true;
    const direction = options.direction ?? 'ltr';
    if (direction !== this.direction) {
      this.direction = direction;
      force = true;
    }
    if (library !== this.library) {
      this.library = library;
      this.typesById = new Map((library?.types ?? []).map((type) => [type.id, type]));
      force = true;
    }
    let changed = false;
    const seen = new Set<string>();
    const order: string[] = [];
    // Cor herdada: o que as filhas de cada instância herdam (o que o pai herdou, com o que ele
    // oferece por cima), de cima para baixo na ordem de desenho; quem não oferece é atravessado.
    const scopes = new Map<string, ProvidedValues>();
    renderOrder(screen).forEach((instance, index) => {
      seen.add(instance.id);
      order.push(instance.id);
      if (this.syncInstance(instance, zBase + index, force, scopes)) changed = true;
    });
    for (const [id, entry] of this.mounted) {
      if (seen.has(id)) continue;
      entry.node.destroy();
      this.mounted.delete(id);
      this.warningsById.delete(id);
      changed = true;
    }
    this.order = order;
    return changed;
  }

  /**
   * Cria, redesenha ou só reordena uma instância (o diff por identidade, mais a cor herdada: ela
   * também é redesenhada quando muda o valor oferecido que o componente lê). Devolve true se algo mudou.
   */
  private syncInstance(
    instance: Instance,
    z: number,
    force: boolean,
    scopes: Map<string, ProvidedValues>,
  ): boolean {
    const current = this.mounted.get(instance.id);
    const inherited = scopes.get(instance.parentId ?? '') ?? NO_PROVIDED;
    const provided = this.readProvided(instance, inherited);
    if (current && !force && isUpToDate(current, instance, provided)) {
      scopes.set(instance.id, extendProvided(inherited, current.offers));
      const clipped = this.clipByParent(current);
      return this.setZ(current.node, z) || clipped;
    }
    const entry = current ?? this.mount(instance);
    this.renderInto(entry, instance, provided);
    if (!current) this.options.onInstanceCreated?.(instance.id, entry.node);
    scopes.set(instance.id, extendProvided(inherited, entry.offers));
    this.clipByParent(entry);
    this.setZ(entry.node, z);
    return true;
  }

  /**
   * Recorta a instância pelo recorte que a mãe passa às filhas (a caixa do slot com `clip`,
   * dentro do recorte que a mãe recebeu; a mãe é sempre desenhada antes) e guarda o que esta
   * passa às dela. Devolve true se o recorte mudou.
   */
  private clipByParent(entry: Mounted): boolean {
    const { parentId } = entry.instance;
    const clip =
      parentId === undefined ? undefined : this.mounted.get(parentId)?.childClip;
    entry.childClip = intersectClips(entry.slotClip, clip);
    return applyClip(entry.node, localClip(clip, entry.instance.box));
  }

  /** Dos valores herdados, os que o componente da instância lê (nenhum se ele não lê nada). */
  private readProvided(instance: Instance, inherited: ProvidedValues): ProvidedValues {
    const component = this.typesById.get(instance.typeId)?.component;
    return component === undefined ? NO_PROVIDED : pickProvided(inherited, component);
  }

  /** Cria o grupo da instância e o registra (o desenho vem de `renderInto`). */
  private mount(instance: Instance): Mounted {
    const node = new Konva.Group();
    node.setAttr('instanceId', instance.id);
    const entry: Mounted = {
      instance,
      node,
      label: undefined,
      imageUrls: [],
      provided: NO_PROVIDED,
      offers: undefined,
      slotClip: undefined,
      childClip: undefined,
    };
    this.group.add(node);
    this.mounted.set(instance.id, entry);
    return entry;
  }

  private setZ(node: Konva.Group, z: number): boolean {
    if (node.zIndex() === z) return false;
    node.zIndex(z);
    return true;
  }

  /**
   * Re-instancia UMA instância com dados temporários (redimensionar ao vivo no editor), sem
   * mexer na tela: o próximo `update` com o objeto original da tela desfaz o temporário.
   */
  render(instance: Instance): void {
    const entry = this.mounted.get(instance.id);
    if (entry) this.renderInto(entry, instance);
  }

  /** O grupo da instância (posição = `box.x/y`). */
  nodeOf(id: string): Konva.Group | undefined {
    return this.mounted.get(id)?.node;
  }

  /** O último objeto desenhado (inclui o temporário de `render`). */
  instanceOf(id: string): Instance | undefined {
    return this.mounted.get(id)?.instance;
  }

  /** `instanceLabel(tipo, valores)` da instância; sem tipo, o id do tipo. */
  labelOf(id: string): string | undefined {
    return this.mounted.get(id)?.label;
  }

  /** Ids na ordem de desenho. */
  ids(): readonly string[] {
    return this.order;
  }

  /** Avisos por instância; só as que têm aviso. */
  warnings(): InstanceWarnings {
    return new Map(this.warningsById);
  }

  /**
   * A instância (deste renderer) dona de um nó Konva: sobe pelos pais procurando o atributo
   * `instanceId` cujo grupo é um dos nossos.
   */
  instanceIdOf(target: Konva.Node | null | undefined): string | undefined {
    let node: Konva.Node | null | undefined = target;
    while (node) {
      const id: unknown = node.getAttr('instanceId');
      if (typeof id === 'string' && this.mounted.get(id)?.node === node) return id;
      node = node.getParent();
    }
    return undefined;
  }

  /** A instância mais acima (a última na ordem de desenho) cujo retângulo contém o ponto. */
  instanceAt(point: { x: number; y: number }): string | undefined {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const id = this.order[i];
      const box = id === undefined ? undefined : this.mounted.get(id)?.instance.box;
      if (
        id !== undefined &&
        box &&
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height
      ) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Redesenha as instâncias que usam a URL remota (a imagem terminou de carregar, ou mudou de
   * estado). Devolve true se alguma foi redesenhada.
   */
  refreshImage(url: string): boolean {
    let changed = false;
    for (const entry of this.mounted.values()) {
      if (!entry.imageUrls.includes(url)) continue;
      this.renderInto(entry, entry.instance);
      changed = true;
    }
    return changed;
  }

  /** Destrói os grupos das instâncias (o grupo recebido fica a cargo do chamador). */
  dispose(): void {
    for (const { node } of this.mounted.values()) node.destroy();
    this.mounted.clear();
    this.warningsById.clear();
    this.order = [];
  }

  private renderInto(
    entry: Mounted,
    instance: Instance,
    provided: ProvidedValues = entry.provided,
  ): void {
    const { node } = entry;
    entry.instance = instance;
    entry.imageUrls = [];
    entry.provided = provided;
    entry.offers = undefined;
    entry.slotClip = undefined;
    node.destroyChildren();
    node.position({ x: instance.box.x, y: instance.box.y });
    node.scale({ x: 1, y: 1 });
    node.setAttr('boxSize', { width: instance.box.width, height: instance.box.height });
    const type = this.typesById.get(instance.typeId);
    const local = { x: 0, y: 0, width: instance.box.width, height: instance.box.height };
    if (!type?.component) {
      // Tipo sem componente (ou biblioteca sem o tipo): a caixa tracejada com o nome.
      const { labels } = this.options;
      const { palette } = this;
      node.add(
        new KonvaRect({
          ...local,
          stroke: palette.unknownLine,
          strokeWidth: 1,
          dash: [6, 4],
          strokeScaleEnabled: false,
          fill: palette.unknownFill,
        }),
        new KonvaText({
          ...local,
          text: type
            ? labels.typeWithoutComponent(type.name)
            : labels.unknownType(instance.typeId),
          fontSize: palette.labelFontSize,
          fontFamily: palette.labelFontFamily,
          fill: palette.unknownLine,
          align: 'center',
          verticalAlign: 'middle',
          listening: false,
        }),
      );
      this.warningsById.set(instance.id, [
        type ? labels.warningTypeWithoutComponent : labels.warningUnknownType,
      ]);
      entry.label = type ? instanceLabel(type, instance.values) : instance.typeId;
      node.setAttr('label', entry.label);
      return;
    }
    const result = instantiate(type.component, instance.values as FieldValues, local, {
      measure: this.measure,
      idPrefix: instance.id,
      ...(this.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
      ...(provided === NO_PROVIDED ? {} : { provided }),
    });
    entry.offers = result.provides;
    entry.slotClip = offsetBox(clippedSlotBox(result.root), instance.box);
    const rendered = renderScene(
      { root: result.root, warnings: [] },
      {
        remoteImage: this.options.remoteImage,
        pixelSafe: this.options.pixelSafe,
        palette: this.palette,
      },
    );
    entry.imageUrls = rendered.imageUrls;
    rendered.root.listening(true);
    node.add(rendered.root);
    // Área de clique inteira (mesmo com fundo transparente).
    node.add(new KonvaRect({ ...local, fill: HIT_FILL, name: 'hit', listening: true }));
    const all = [
      ...result.warnings,
      ...rendered.warnings.map((w) => this.options.labels.drawWarning(w)),
    ];
    if (all.length > 0) this.warningsById.set(instance.id, all);
    else this.warningsById.delete(instance.id);
    entry.label = instanceLabel(type, instance.values);
    node.setAttr('label', entry.label);
  }
}

/** A caixa deslocada para a posição da instância (a cena parte de 0,0); nenhuma fica nenhuma. */
function offsetBox(box: Box | undefined, origin: Box): Box | undefined {
  return box && { ...box, x: box.x + origin.x, y: box.y + origin.y };
}

/** O recorte da mãe nas coordenadas locais do grupo da filha (cuja origem é `box`). */
function localClip(clip: Box | undefined, box: Box): Box | undefined {
  return (
    clip && {
      x: clip.x - box.x,
      y: clip.y - box.y,
      width: clip.width,
      height: clip.height,
    }
  );
}

/** Aplica (ou tira) o recorte do grupo; devolve true se ele mudou. */
function applyClip(node: Konva.Group, next: Box | undefined): boolean {
  // Largura 0 (slot que colapsou) também é recorte: o Konva recorta com qualquer número (tudo).
  const before =
    typeof node.clipWidth() === 'number'
      ? [node.clipX(), node.clipY(), node.clipWidth(), node.clipHeight()]
      : undefined;
  const after = next && [next.x, next.y, next.width, next.height];
  if (before?.join() === after?.join()) return false;
  node.clipX(next?.x);
  node.clipY(next?.y);
  node.clipWidth(next?.width);
  node.clipHeight(next?.height);
  return true;
}

/** O desenho montado já é o da instância e dos valores herdados (nada a redesenhar). */
function isUpToDate(
  entry: Mounted,
  instance: Instance,
  provided: ProvidedValues,
): boolean {
  return entry.instance === instance && sameProvided(entry.provided, provided);
}
