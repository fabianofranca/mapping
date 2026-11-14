import { parseSignatureText, type Signature } from '../src/model';
import type { Refs } from './items';
import { packageOfProject, type PackageSource } from './library';
import type { Roots } from './paths';

// The `mapping-signature` sheet that the package of an applied specialization carries (`signatures/…`):
// the server reads only that JSON, never the code. It serves the `unmapped` of `code` (`get_code_hints`,
// `get_marking`, `get_annotation`, `get_component`, `find_by_code`). A missing or invalid sheet counts
// as no sheet (`validate_library` is what validates it).

/** The cited sheet (`code.<platform>.signature`) of the specialization `specId`; `null` if it cannot be read. */
export type SignatureReader = (specId: string, ref: string) => Promise<Signature | null>;

/** Reads the sheets of the package applied to the project (`specs/<folder>/…`), each one once per call. */
export function projectSignatureReader(roots: Roots, refs: Refs): SignatureReader {
  const cache = new Map<string, Promise<Signature | null>>();
  return (specId, ref) => {
    const key = `${specId}\n${ref}`;
    let hit = cache.get(key);
    if (hit === undefined) {
      hit = readOne(roots, refs, specId, ref);
      cache.set(key, hit);
    }
    return hit;
  };
}

async function readOne(
  roots: Roots,
  refs: Refs,
  specId: string,
  ref: string,
): Promise<Signature | null> {
  const applied = refs.project.specializations.find((s) => s.id === specId);
  if (applied?.spec == null) return null;
  const source = packageOfProject(
    roots,
    refs.loaded.location.dir,
    applied.file,
    applied.spec,
  );
  return parse(await source.read(source.resolve(ref)));
}

/** Reads the sheets of a package (`get_component`, applied or by `path`). */
export function packageSignatureReader(
  source: Pick<PackageSource, 'read' | 'resolve'>,
): (ref: string) => Promise<Signature | null> {
  return async (ref) => parse(await source.read(source.resolve(ref)));
}

function parse(text: string | null): Signature | null {
  if (text === null) return null;
  const parsed = parseSignatureText(text);
  return parsed.ok ? parsed.signature : null;
}
