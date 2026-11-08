/**
 * O hospedeiro decide por origem (`https://cdn.exemplo.com`); lançar equivale a recusar.
 * Fica sozinho, sem imports, para as declarações do pacote não puxarem o carregador de imagens
 * (e, com ele, `@preact/signals`).
 */
export type AllowOrigin = (origin: string) => boolean;
