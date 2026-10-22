import { serialize, type Project } from '../../src/model';

/**
 * Passa um mapping.json atual (schema v12) para o formato até a v11: a coleção `containers`
 * volta a ser `images` e a marcação volta a apontar por `imageId`. Mantém a ordem das chaves.
 * Os testes de migração usam isto para montar arquivos antigos a partir de um projeto de hoje.
 */
export function toLegacyShape(data: Record<string, unknown>): Record<string, unknown> {
  const renamed = Object.entries(data).map(([key, value]): [string, unknown] => {
    if (key === 'containers') return ['images', value];
    if (key === 'markings' && Array.isArray(value)) {
      return [key, value.map(legacyMarking)];
    }
    return [key, value];
  });
  return Object.fromEntries(renamed);
}

function legacyMarking(marking: unknown): unknown {
  if (typeof marking !== 'object' || marking === null) return marking;
  return Object.fromEntries(
    Object.entries(marking).map(([key, value]) => [
      key === 'containerId' ? 'imageId' : key,
      value,
    ]),
  );
}

/** O projeto serializado, já no formato até a v11 (`images`, `imageId`). */
export function legacyJson(p: Project): Record<string, unknown> {
  return toLegacyShape(JSON.parse(serialize(p)) as Record<string, unknown>);
}
