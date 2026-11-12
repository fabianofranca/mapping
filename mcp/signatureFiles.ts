import { parseSignatureText, type Signature } from '../src/model';
import type { Refs } from './items';
import { packageOfProject, type PackageSource } from './library';
import type { Roots } from './paths';

// A ficha `mapping-signature` que o pacote de uma especialização aplicada traz (`signatures/…`): o
// servidor lê só esse JSON, nunca o código. Serve ao `unmapped` do `code` (`get_code_hints`,
// `get_marking`, `get_annotation`, `get_component`, `find_by_code`). Ficha ausente ou inválida vale
// como sem ficha (quem a valida é o `validate_library`).

/** A ficha citada (`code.<plataforma>.signature`) da especialização `specId`; `null` se não dá para ler. */
export type SignatureReader = (specId: string, ref: string) => Promise<Signature | null>;

/** Lê as fichas do pacote aplicado ao projeto (`specs/<pasta>/…`), cada uma uma vez por chamada. */
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

/** Lê as fichas de um pacote (`get_component`, aplicado ou por `path`). */
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
