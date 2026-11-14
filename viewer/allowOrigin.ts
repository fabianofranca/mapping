/**
 * The host decides by origin (`https://cdn.example.com`); throwing is the same as refusing.
 * It stands alone, with no imports, so the package declarations do not pull in the image loader
 * (and, with it, `@preact/signals`).
 */
export type AllowOrigin = (origin: string) => boolean;
