import { serialize, type Project } from '../../src/model';

/**
 * Turns a current mapping.json (schema v12) into the format up to v11: the `containers` collection
 * goes back to `images` and the marking goes back to pointing by `imageId`. Keeps the key order.
 * The migration tests use this to build old files from a project of today.
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

/** The serialized project, already in the format up to v11 (`images`, `imageId`). */
export function legacyJson(p: Project): Record<string, unknown> {
  return toLegacyShape(JSON.parse(serialize(p)) as Record<string, unknown>);
}
