import type { Annotation, JsonValue, Marking, Project } from '../../src/model';
import { buildLargeProject } from './largeProject';
import { layerOf, specProject } from './specFixtures';

/**
 * Large project with typed annotations and references, for the per-frame budgets (docs/ARCHITECTURE.md,
 * "Performance"): the 20 images and 500 markings of `buildLargeProject`, with the two
 * sample specializations and 1,500 annotations — half of them typed — and 500 references.
 *
 * Per marking `i`:
 * - one free annotation (layer L1);
 * - even: a Class with 2 rows in `atributos` and a Text with `dado` → pair of the
 *   free annotation of the next marking; odd: an Input with `dado` → row of the Class of the
 *   previous marking and one more free annotation (layer LM).
 *
 * Some deliberate pending items: every 10 Texts, one without `id`; every 50
 * Inputs, one pointing to a row that does not exist.
 */
export function buildLargeTypedProject(): Project {
  const spec = specProject();
  const { containers: images, markings } = buildLargeProject();
  return {
    ...spec,
    containers: images,
    markings,
    annotations: typedAnnotations(spec, markings),
  };
}

/**
 * The annotations of the typed project for any list of markings (the rule above, by index):
 * `spec` is the `specProject()`, where the layers come from. Also used by the scale fixture.
 */
export function typedAnnotations(
  spec: Project,
  markings: readonly Marking[],
): Annotation[] {
  const layer = {
    classe: layerOf(spec, 'modelo-dados', 'classes'),
    componentes: layerOf(spec, 'sdui', 'componentes'),
  };
  const annotations: Annotation[] = [];
  const free = (id: string, markingId: string, layerId: string) =>
    annotations.push({
      id,
      markingId,
      layerId,
      name: null,
      parentAnnotationId: null,
      parentRole: null,
      type: null,
      values: null,
      entries: [
        { id: `${id}-e1`, key: 'field', value: 'string' },
        { id: `${id}-e2`, key: 'notes', value: id },
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
      parentAnnotationId: null,
      parentRole: null,
      type: { specId, typeId },
      values,
      entries: [],
    });

  markings.forEach((marking, i) => {
    free(`F${i}`, marking.id, 'L1');
    if (i % 2 === 0) {
      typed(`C${i}`, marking.id, layer.classe, 'modelo-dados', 'classe', {
        nome: `Classe${i}`,
        atributos: [
          { _id: `C${i}-r1`, nome: 'id', tipo: 'Long', obrigatorio: 'sim' },
          // pt-BR kept: enum value of the specFixtures sample specialization (outside this batch)
          { _id: `C${i}-r2`, nome: 'nome', tipo: 'String', obrigatorio: 'não' },
        ],
      });
      const target = `F${(i + 1) % markings.length}`;
      typed(`T${i}`, marking.id, layer.componentes, 'sdui', 'text', {
        id: i % 20 === 0 ? '' : `text_${i}`,
        conteudo: `Text ${i}`,
        dado: { annotationId: target, entryId: `${target}-e1` },
      });
    } else {
      const rowId = i % 100 === 1 ? 'does-not-exist' : `C${i - 1}-r${i % 4 === 1 ? 1 : 2}`;
      typed(`N${i}`, marking.id, layer.componentes, 'sdui', 'input', {
        id: `input_${i}`,
        tipo: 'text',
        dado: { annotationId: `C${i - 1}`, key: 'atributos', rowId },
      });
      free(`G${i}`, marking.id, 'LM');
    }
  });
  return annotations;
}
