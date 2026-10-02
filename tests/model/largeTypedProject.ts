import type { Annotation, JsonValue, Project } from '../../src/model';
import { buildLargeProject } from './largeProject';
import { layerOf, specProject } from './specFixtures';

/**
 * Projeto grande com tipadas e referências, para os orçamentos por quadro (PLAN.md
 * 14.3): as 20 imagens e 500 marcações de `buildLargeProject`, com as duas
 * especializações de exemplo e 1.500 anotações — metade tipadas — e 500 referências.
 *
 * Por marcação `i`:
 * - uma livre (camada L1; nas marcações pai, herdada pelas filhas);
 * - par: uma Classe com 2 linhas em `atributos` e um Text com `dado` → tupla da
 *   livre da marcação seguinte; ímpar: um Input com `dado` → linha da Classe da
 *   marcação anterior e mais uma livre (camada LM).
 *
 * Algumas pendências de propósito: a cada 10 Texts, um sem `id`; a cada 50
 * Inputs, um apontando para uma linha que não existe.
 */
export function buildLargeTypedProject(): Project {
  const spec = specProject();
  const { images, markings } = buildLargeProject();
  const layer = {
    classe: layerOf(spec, 'modelo-dados', 'classes'),
    componentes: layerOf(spec, 'sdui', 'componentes'),
  };
  const annotations: Annotation[] = [];
  const free = (id: string, markingId: string, layerId: string, inherit: boolean) =>
    annotations.push({
      id,
      markingId,
      layerId,
      name: null,
      inherit,
      parentAnnotationId: null,
      type: null,
      values: null,
      entries: [
        { id: `${id}-e1`, key: 'campo', value: 'string' },
        { id: `${id}-e2`, key: 'obs', value: id },
      ],
    });
  const typed = (
    id: string,
    markingId: string,
    layerId: string,
    specId: string,
    typeId: string,
    values: Record<string, JsonValue>,
  ) =>
    annotations.push({
      id,
      markingId,
      layerId,
      name: null,
      inherit: false,
      parentAnnotationId: null,
      type: { specId, typeId },
      values,
      entries: [],
    });

  markings.forEach((marking, i) => {
    free(`F${i}`, marking.id, 'L1', marking.parentId === null);
    if (i % 2 === 0) {
      typed(`C${i}`, marking.id, layer.classe, 'modelo-dados', 'classe', {
        nome: `Classe${i}`,
        atributos: [
          { _id: `C${i}-r1`, nome: 'id', tipo: 'Long', obrigatorio: 'sim' },
          { _id: `C${i}-r2`, nome: 'nome', tipo: 'String', obrigatorio: 'não' },
        ],
      });
      const target = `F${(i + 1) % markings.length}`;
      typed(`T${i}`, marking.id, layer.componentes, 'sdui', 'text', {
        id: i % 20 === 0 ? '' : `text_${i}`,
        conteudo: `Texto ${i}`,
        dado: { annotationId: target, entryId: `${target}-e1` },
      });
    } else {
      const rowId = i % 100 === 1 ? 'nao-existe' : `C${i - 1}-r${i % 4 === 1 ? 1 : 2}`;
      typed(`N${i}`, marking.id, layer.componentes, 'sdui', 'input', {
        id: `input_${i}`,
        tipo: 'text',
        dado: { annotationId: `C${i - 1}`, key: 'atributos', rowId },
      });
      free(`G${i}`, marking.id, 'LM', false);
    }
  });
  return { ...spec, images, markings, annotations };
}
