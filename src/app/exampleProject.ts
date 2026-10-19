import exampleZip from '../../examples/exemplo-completo.zip?inline';

/** Prefixo do data URI que o Vite gera para `?inline` de um zip. */
const DATA_URI = /^data:([^;,]*);base64,/;

/**
 * O projeto de exemplo (`examples/exemplo-completo.zip`, gerado de `examples/exemplo-completo/`)
 * como um `Blob`, embutido no build: a app é um único `index.html` e a CSP não permite `fetch`.
 * O botão "Abrir projeto de exemplo" o entrega ao mesmo importador do "Abrir zip".
 */
export function exampleProjectBlob(): Blob {
  const match = DATA_URI.exec(exampleZip);
  if (!match) throw new Error('o zip do exemplo não veio como data URI');
  const binary = atob(exampleZip.slice(match[0].length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/zip' });
}
