// Escrita na área de transferência (API assíncrona). Funciona em `file://` e em `https:`: o
// Chrome trata os dois como contexto seguro. Chamar a partir de um gesto do usuário (tecla,
// clique); sem a API ou sem permissão, devolve `false`.
//
// Regra de permissão (Chrome): gravar texto (`writeText`) e PNG é sempre permitido, sem pedido.
// Gravar um formato web personalizado (`web <mime>`) exige a permissão `clipboard-read`, que o
// navegador não concede sozinho: sem ela o `write` abre um pedido de permissão e, se negado,
// rejeita. Por isso o texto vai sempre primeiro e o formato personalizado só é acrescentado
// quando a permissão já está concedida: copiar nunca abre um pedido de permissão.

import { reportError } from './report';

/** O navegador aceita formatos web personalizados (`web <mime>`) no `ClipboardItem`? */
function supportsCustomFormat(mime: string): boolean {
  if (typeof ClipboardItem === 'undefined') return false;
  const supports: unknown = Reflect.get(ClipboardItem, 'supports');
  return typeof supports === 'function' && supports.call(ClipboardItem, `web ${mime}`);
}

/** A permissão `clipboard-read` já está concedida? Nunca abre pedido; qualquer erro é "não". */
async function clipboardReadGranted(): Promise<boolean> {
  try {
    // `clipboard-read` não consta no tipo `PermissionName` do TypeScript.
    const name = 'clipboard-read' as unknown as PermissionName;
    const status = await navigator.permissions.query({ name });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Grava `text` (`text/plain`) com `writeText`, chamado de forma síncrona dentro do gesto do
 * usuário. Depois, só se `custom` foi passado, o navegador suporta o formato e a permissão
 * `clipboard-read` já está concedida, grava por cima texto e `data` juntos num formato web
 * personalizado (outros programas só enxergam o texto). Falha nessa segunda gravação é
 * ignorada: o texto já está na área de transferência. Erro ao gravar o texto vai ao
 * Diagnóstico e devolve `false`.
 */
export async function writeClipboardText(
  text: string,
  custom?: { readonly mime: string; readonly data: string },
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    reportError('clipboard.write', e);
    return false;
  }
  if (custom && supportsCustomFormat(custom.mime) && (await clipboardReadGranted())) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          [`web ${custom.mime}`]: new Blob([custom.data], { type: custom.mime }),
        }),
      ]);
    } catch {
      // O texto já foi gravado; o formato personalizado é um extra.
    }
  }
  return true;
}

/**
 * Grava uma imagem PNG. Recebe a promessa do blob (e não o blob) para o `write` começar
 * dentro do gesto do usuário, antes de o recorte ficar pronto (exigência do Safari).
 */
export async function writeClipboardPng(png: Promise<Blob>): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch (e) {
    reportError('clipboard.write', e);
    return false;
  }
}
