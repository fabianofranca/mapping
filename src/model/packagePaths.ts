import { isValidCodePath } from './codeLocations';

// Caminhos de arquivos de um pacote (a pasta de uma especialização, formatVersion 4): relativos
// ao arquivo da especialização, com `/`, sem `.` nem `..`, sem `/` no começo e sem unidade de
// disco (a regra do `path` do `code`), mais a extensão esperada (em minúsculas). Fica fora de `spec.ts` para o
// `components/origin.ts` poder usá-lo sem ciclo de importação; `spec.ts` o reexporta.

/** Por que o caminho não vale como arquivo do pacote com uma destas extensões; `undefined` se vale. */
export function packagePathProblem(
  path: string,
  ext: string | readonly string[],
): string | undefined {
  const exts = typeof ext === 'string' ? [ext] : ext;
  if (!isValidCodePath(path)) {
    return 'caminho inválido: use um caminho relativo à pasta da especialização, com "/", sem "." nem ".." e sem unidade (ex: components/button.json)';
  }
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (!exts.some((e) => base.length > e.length && base.endsWith(e))) {
    return `extensão inválida: esperava ${exts.join(', ')}`;
  }
  return undefined;
}

/** `true` para um caminho de arquivo do pacote com a extensão (ou uma das extensões) dada. */
export function isPackagePath(path: string, ext: string | readonly string[]): boolean {
  return packagePathProblem(path, ext) === undefined;
}
