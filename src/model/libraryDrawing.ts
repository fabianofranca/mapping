import type { ComponentFile, FieldValues } from './components/componentFormat';
import { type Box, approximateMeasurer, instantiate } from './components/instantiate';
import { type Library, type TextFile, loadLibrary } from './components/library';
import { type Origin, screenFromSource } from './components/origin';
import type { LibraryIssue } from './library';
import type { Spec, SpecAnnotationType } from './spec';

// Nível 3 do validador da biblioteca: a prova de desenho. Instancia cada componente com os
// valores do `preview` e de cada exemplo de valores, no tamanho inicial e no mínimo, e passa
// cada exemplo de sistema externo pela declaração (`origins`). Puro: recebe tudo já lido
// (`library.ts` monta o contexto) e nunca lê disco nem rede.
//
// Ordem das issues (fixa, os testes dependem dela): tipos na ordem da especialização (camadas e
// tipos em ordem); em cada tipo com componente válido, primeiro o `preview` (ou os valores
// padrão, quando o componente não tem `preview`), depois cada exemplo de valores, em cada caso
// primeiro o `size` e depois o `minSize`; depois os exemplos de sistema externo do tipo; por
// fim as telas de exemplo de cada origem, na ordem de `origins`.
//
// A medida do texto é a aproximada (`approximateMeasurer`): quem desenha de verdade usa a do
// navegador, por isso os avisos do motor de desenho levam `(aproximado)` no fim.

/** Tamanho do quadro que recebe o nó de um exemplo de sistema externo (um componente, não uma tela). */
const NODE_SCREEN = 1000;

/** Sufixo dos avisos que dependem da medida do texto. */
export const APPROXIMATE_SUFFIX = ' (aproximado)';

export interface DrawingContext {
  readonly spec: Spec;
  readonly specPath: string;
  /** Caminho de um arquivo citado pela especialização, relativo à raiz do pacote. */
  readonly resolve: (ref: string) => string;
  /** Componentes válidos, pelo caminho resolvido. */
  readonly components: ReadonlyMap<string, ComponentFile>;
  /** JSON já lido de um arquivo (exemplo externo), pelo caminho resolvido; ausente ou inválido = `undefined`. */
  readonly jsonOf: (path: string) => unknown;
  /** Os `.json` do pacote com texto, a especialização primeiro (alimenta `loadLibrary`). */
  readonly textFiles: readonly TextFile[];
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** `"campo não informado: x"` do motor para um campo que o tipo nem declara: o nível 2 já deu o erro. */
const NOT_INFORMED = /^campo não informado: (.+)$/;

export function defaultValues(
  type: SpecAnnotationType,
): Record<string, string | number | null> {
  const values: Record<string, string | number | null> = {};
  for (const field of type.fields) {
    values[field.key] =
      field.type === 'table' || field.type === 'ref' ? null : (field.default ?? null);
  }
  return values;
}

interface DrawCase {
  readonly label: string;
  readonly values: FieldValues;
  readonly file: string;
  readonly path: string;
}

function drawCases(
  type: SpecAnnotationType,
  component: ComponentFile,
  componentPath: string,
  specPath: string,
  basePath: string,
): DrawCase[] {
  const defaults = defaultValues(type);
  const cases: DrawCase[] = [
    component.preview === undefined
      ? { label: 'os valores padrão', values: defaults, file: componentPath, path: '' }
      : {
          label: 'o preview',
          values: { ...defaults, ...component.preview },
          file: componentPath,
          path: 'preview',
        },
  ];
  (type.examples ?? []).forEach((example, index) => {
    if (example.values === undefined) return;
    cases.push({
      label: `o exemplo "${example.name}"`,
      values: { ...defaults, ...example.values },
      file: specPath,
      path: `${basePath}.examples[${index}]`,
    });
  });
  return cases;
}

function typeDrawing(
  type: SpecAnnotationType,
  component: ComponentFile,
  componentPath: string,
  specPath: string,
  basePath: string,
  out: LibraryIssue[],
): void {
  const keys = new Set(type.fields.map((f) => f.key));
  const sizes: { label: string; box: Box }[] = [
    { label: 'tamanho inicial', box: { x: 0, y: 0, ...component.size } },
  ];
  if (component.minSize !== undefined) {
    sizes.push({ label: 'tamanho mínimo', box: { x: 0, y: 0, ...component.minSize } });
  }
  for (const drawCase of drawCases(type, component, componentPath, specPath, basePath)) {
    for (const size of sizes) {
      const where = `tipo "${type.id}", ${drawCase.label}, ${size.label} ${size.box.width}×${size.box.height}`;
      try {
        const { warnings } = instantiate(component, drawCase.values, size.box, {
          measure: approximateMeasurer,
        });
        for (const warning of warnings) {
          const missing = NOT_INFORMED.exec(warning);
          if (missing !== null && !keys.has(missing[1] ?? '')) continue;
          out.push({
            file: drawCase.file,
            path: drawCase.path,
            message: `${where}: ${warning}${APPROXIMATE_SUFFIX}`,
            severity: 'warning',
          });
        }
      } catch (error) {
        out.push({
          file: drawCase.file,
          path: drawCase.path,
          message: `${where}: falha ao desenhar: ${messageOf(error)}`,
          severity: 'error',
        });
      }
    }
  }
}

/** Biblioteca do motor para provar os exemplos externos; `undefined` (e o motivo) se não monta. */
function buildLibrary(ctx: DrawingContext): { library?: Library; reason?: string } {
  try {
    return { library: loadLibrary(ctx.textFiles) };
  } catch (error) {
    return { reason: messageOf(error) };
  }
}

/**
 * Biblioteca com a origem trocada por uma sintética que lê o JSON `{ node }` como a única raiz
 * de um quadro grande: só o desenho do nó importa, não a tela (`screen`) da origem declarada.
 */
export function nodeProbeLibrary(lib: Library, origin: Origin): Library {
  return {
    ...lib,
    origins: [
      {
        ...origin,
        screen: { width: NODE_SCREEN, height: NODE_SCREEN, roots: [{ path: 'node' }] },
      },
    ],
  };
}

/** Tira o `node.` que o quadro sintético põe na frente do caminho de um aviso da origem. */
export const withoutNodePrefix = (message: string): string =>
  message.replace(/^node\.?/, '');

export function drawingIssues(ctx: DrawingContext): LibraryIssue[] {
  const { spec, specPath } = ctx;
  const out: LibraryIssue[] = [];
  let built: { library?: Library; reason?: string } | undefined;
  const library = (): { library?: Library; reason?: string } => {
    built ??= buildLibrary(ctx);
    return built;
  };
  let warnedLibrary = false;
  const libraryOrWarn = (path: string): Library | undefined => {
    const { library: lib, reason } = library();
    if (lib === undefined && !warnedLibrary) {
      warnedLibrary = true;
      out.push({
        file: specPath,
        path,
        message: `não foi possível montar a biblioteca para provar os exemplos de sistema externo: ${reason ?? 'motivo desconhecido'}`,
        severity: 'warning',
      });
    }
    return lib;
  };

  spec.layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      const basePath = `layers[${li}].annotationTypes[${ti}]`;
      if (type.component === undefined) return;
      const componentPath = ctx.resolve(type.component);
      const component = ctx.components.get(componentPath);
      if (component === undefined) return;
      typeDrawing(type, component, componentPath, specPath, basePath, out);

      (type.examples ?? []).forEach((example, index) => {
        if (example.system === undefined || example.file === undefined) return;
        const at = `${basePath}.examples[${index}].file`;
        const json = ctx.jsonOf(ctx.resolve(example.file));
        if (json === undefined) return;
        const lib = libraryOrWarn(at);
        const origin = lib?.origins.find((o) => o.system === example.system);
        if (lib === undefined || origin === undefined) return;
        // O nó do exemplo vai para uma origem sintética que o lê como a única raiz de um quadro
        // grande: só o desenho do nó importa, não a tela (`screen`) da origem declarada.
        const probe = nodeProbeLibrary(lib, origin);
        const result = screenFromSource(
          probe,
          { node: json },
          { system: origin.system, measure: approximateMeasurer },
        );
        const where = `exemplo "${example.name}" do sistema "${origin.system}"`;
        if (result.error !== undefined) {
          out.push({
            file: specPath,
            path: at,
            message: `${where}: ${withoutNodePrefix(result.error)}`,
            severity: 'error',
          });
          return;
        }
        for (const warning of result.warnings) {
          out.push({
            file: specPath,
            path: at,
            message: `${where}: ${withoutNodePrefix(warning)}`,
            severity: 'warning',
          });
        }
        const root = result.screen?.instances.find((i) => i.parentId === undefined);
        if (root !== undefined && root.typeId !== type.id) {
          out.push({
            file: specPath,
            path: at,
            message: `${where}: o nó corresponde ao tipo "${root.typeId}", não a "${type.id}"`,
            severity: 'warning',
          });
        }
      });
    });
  });

  (spec.origins ?? []).forEach((origin, oi) => {
    (origin.examples ?? []).forEach((example, ei) => {
      const at = `origins[${oi}].examples[${ei}].file`;
      const json = ctx.jsonOf(ctx.resolve(example.file));
      if (json === undefined) return;
      const lib = libraryOrWarn(at);
      if (lib === undefined) return;
      const result = screenFromSource(lib, json, {
        system: origin.system,
        measure: approximateMeasurer,
      });
      const where = `tela de exemplo "${example.name}" do sistema "${origin.system}"`;
      if (result.error !== undefined) {
        out.push({
          file: specPath,
          path: at,
          message: `${where}: ${result.error}`,
          severity: 'error',
        });
        return;
      }
      for (const warning of result.warnings) {
        out.push({
          file: specPath,
          path: at,
          message: `${where}: ${warning}`,
          severity: 'warning',
        });
      }
    });
  });
  return out;
}
