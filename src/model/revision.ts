// Revisão do `mapping.json` (schema v6): quem grava (app ou MCP) confere se o arquivo em
// disco ainda tem a revisão que carregou e grava `revision + 1`. Funções puras, sem DOM nem Node.

/**
 * Revisão escrita no texto de um `mapping.json`: o `revision` do arquivo, `0` num arquivo
 * sem o campo (schema anterior ao v6, que a migração também carrega como `0`) e `null`
 * se o texto não for um objeto JSON (ilegível, ou escrito pela metade por outro programa).
 */
export function readRevision(text: string): number | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const revision: unknown = Reflect.get(raw, 'revision');
    if (revision === undefined) return 0;
    return typeof revision === 'number' && Number.isInteger(revision) && revision >= 0
      ? revision
      : null;
  } catch {
    // Texto que não é JSON: quem chama trata `null` como "alterado por fora".
    return null;
  }
}
