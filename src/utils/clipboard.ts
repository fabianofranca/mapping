// Escrita na área de transferência (API assíncrona). Funciona em `file://` e em `https:`: o
// Chrome trata os dois como contexto seguro. Chamar a partir de um gesto do usuário (tecla,
// clique); sem a API ou sem permissão, devolve `false`.

/** O navegador aceita formatos web personalizados (`web <mime>`) no `ClipboardItem`? */
function supportsCustomFormat(mime: string): boolean {
  if (typeof ClipboardItem === 'undefined') return false;
  const supports: unknown = Reflect.get(ClipboardItem, 'supports');
  return typeof supports === 'function' && supports.call(ClipboardItem, `web ${mime}`);
}

/**
 * Grava `text` (`text/plain`) e, onde o navegador deixar, `data` num formato web
 * personalizado: outros programas só enxergam o texto. Cai para só o texto se a gravação
 * com os dois falhar.
 */
export async function writeClipboardText(
  text: string,
  custom?: { readonly mime: string; readonly data: string },
): Promise<boolean> {
  try {
    if (custom && supportsCustomFormat(custom.mime)) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          [`web ${custom.mime}`]: new Blob([custom.data], { type: custom.mime }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sem permissão ou formato recusado: tenta só o texto antes de desistir.
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Grava uma imagem PNG. Recebe a promessa do blob (e não o blob) para o `write` começar
 * dentro do gesto do usuário, antes de o recorte ficar pronto (exigência do Safari).
 */
export async function writeClipboardPng(png: Promise<Blob>): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}
