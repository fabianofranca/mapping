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
import type { FieldValues } from '../../model/components/componentFormat';
import { type TextMeasurer, instantiate } from '../../model/components/instantiate';
import {
  type Library,
  type TypeDef,
  instanceLabel,
} from '../../model/components/library';
import { type Instance, type Screen, renderOrder } from '../../model/components/screen';
import { konvaMeasurer } from './konvaMeasurer';

const MISSING_COLOR = '#D81B60';
const MISSING_FILL = 'rgba(216, 27, 96, 0.06)';

/** Avisos da instanciação por instância (só as que têm aviso). */
export type InstanceWarnings = ReadonlyMap<string, readonly string[]>;

export interface ScreenRendererOptions {
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
}

interface Mounted {
  instance: Instance;
  readonly node: Konva.Group;
  label: string | undefined;
  /** URLs remotas que o último desenho da instância pediu. */
  imageUrls: readonly string[];
}

export class ScreenRenderer {
  private readonly measure: TextMeasurer;
  private readonly mounted = new Map<string, Mounted>();
  private readonly warningsById = new Map<string, readonly string[]>();
  private order: string[] = [];
  private library: Library | undefined;
  private typesById: ReadonlyMap<string, TypeDef> = new Map();

  constructor(
    private readonly group: Konva.Group,
    private readonly options: ScreenRendererOptions = {},
  ) {
    this.measure = options.measure ?? konvaMeasurer;
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
    if (library !== this.library) {
      this.library = library;
      this.typesById = new Map((library?.types ?? []).map((type) => [type.id, type]));
      force = true;
    }
    let changed = false;
    const seen = new Set<string>();
    const order: string[] = [];
    renderOrder(screen).forEach((instance, index) => {
      seen.add(instance.id);
      order.push(instance.id);
      const z = zBase + index;
      const current = this.mounted.get(instance.id);
      if (current && current.instance === instance && !force) {
        if (current.node.zIndex() !== z) {
          current.node.zIndex(z);
          changed = true;
        }
        return;
      }
      changed = true;
      if (current) {
        this.renderInto(current, instance);
      } else {
        const node = new Konva.Group();
        node.setAttr('instanceId', instance.id);
        const entry: Mounted = { instance, node, label: undefined, imageUrls: [] };
        this.group.add(node);
        this.mounted.set(instance.id, entry);
        this.renderInto(entry, instance);
        this.options.onInstanceCreated?.(instance.id, node);
      }
      const node = this.mounted.get(instance.id)?.node;
      if (node && node.zIndex() !== z) node.zIndex(z);
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

  private renderInto(entry: Mounted, instance: Instance): void {
    const { node } = entry;
    entry.instance = instance;
    entry.imageUrls = [];
    node.destroyChildren();
    node.position({ x: instance.box.x, y: instance.box.y });
    node.scale({ x: 1, y: 1 });
    node.setAttr('boxSize', { width: instance.box.width, height: instance.box.height });
    const type = this.typesById.get(instance.typeId);
    const local = { x: 0, y: 0, width: instance.box.width, height: instance.box.height };
    if (!type?.component) {
      // Tipo sem componente (ou biblioteca sem o tipo): a caixa tracejada com o nome.
      node.add(
        new KonvaRect({
          ...local,
          stroke: MISSING_COLOR,
          strokeWidth: 1,
          dash: [6, 4],
          strokeScaleEnabled: false,
          fill: MISSING_FILL,
        }),
        new KonvaText({
          ...local,
          text: type
            ? `${type.name}\n(sem componente)`
            : `${instance.typeId}\n(tipo desconhecido)`,
          fontSize: 12,
          fontFamily: 'system-ui, sans-serif',
          fill: MISSING_COLOR,
          align: 'center',
          verticalAlign: 'middle',
          listening: false,
        }),
      );
      this.warningsById.set(instance.id, [
        type
          ? 'tipo sem componente na especialização'
          : 'tipo não existe na especialização',
      ]);
      entry.label = type ? instanceLabel(type, instance.values) : instance.typeId;
      node.setAttr('label', entry.label);
      return;
    }
    const result = instantiate(type.component, instance.values as FieldValues, local, {
      measure: this.measure,
      idPrefix: instance.id,
    });
    const rendered = renderScene(
      { root: result.root, warnings: [] },
      { remoteImage: this.options.remoteImage, pixelSafe: this.options.pixelSafe },
    );
    entry.imageUrls = rendered.imageUrls;
    rendered.root.listening(true);
    node.add(rendered.root);
    // Área de clique inteira (mesmo com fundo transparente).
    node.add(
      new KonvaRect({ ...local, fill: 'rgba(0,0,0,0)', name: 'hit', listening: true }),
    );
    const all = [...result.warnings, ...rendered.warnings];
    if (all.length > 0) this.warningsById.set(instance.id, all);
    else this.warningsById.delete(instance.id);
    entry.label = instanceLabel(type, instance.values);
    node.setAttr('label', entry.label);
  }
}
