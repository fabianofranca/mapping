import type { HelpBlock } from '../i18n/specHelp';

/** Todo o texto de um bloco da Ajuda, para a busca. */
export function blockText(block: HelpBlock): string {
  switch (block.kind) {
    case 'p':
      return block.text;
    case 'list':
      return block.items.join(' ');
    case 'terms':
      return block.items.map((i) => `${i.term} ${i.text}`).join(' ');
    case 'code':
      return block.code;
  }
}
