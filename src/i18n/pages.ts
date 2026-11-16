// Texts of the pages (stage #883, PG2), kept apart from the general dictionaries; they enter them
// through `...pagesEnUS` / `...pagesPtBR`. en-US is the base (it defines the keys), pt-BR is typed
// against it, and both have the same {parameters}. "Item" = a root container or a root marking
// (the interface never says "root" to anyone). The default name of the first page is `page.defaultName`.

export const pagesEnUS = {
  // Counts (page menu, Manage pages)
  'page.count.items': '{count} items',
  'page.count.itemsOne': '1 item',
  'page.count.empty': 'empty',

  // Canvas bar menu
  'page.picker.label': 'Page: {name}',
  'page.picker.list': 'Pages',
  'page.picker.new': 'New page…',
  'page.picker.manage': 'Manage pages…',

  // Perspective picker: what each perspective shows on the open page
  'page.perspectiveCount.many': '{count} items on this page',
  'page.perspectiveCount.one': '1 item on this page',
  'page.perspectiveCount.none': 'nothing on this page',

  // Manage pages
  'page.manage.title': 'Manage pages',
  'page.manage.table': 'Pages',
  'page.manage.colName': 'Name',
  'page.manage.colContent': 'Content',
  'page.manage.colActions': 'Actions',
  'page.manage.open': 'open',
  'page.manage.createField': 'Name of the new page',
  'page.manage.create': 'Create page',
  'page.manage.rename': 'Rename {name}',
  'page.manage.renameField': 'New name for {name}',
  'page.manage.renameSave': 'Save name',
  'page.manage.renameCancel': 'Cancel renaming',
  'page.manage.moveUp': 'Move {name} up',
  'page.manage.moveDown': 'Move {name} down',
  'page.manage.delete': 'Delete {name}',
  'page.manage.deleteLast': 'The last page cannot be deleted.',
  'page.manage.note':
    'Each page is a canvas of its own: its items, positions and arrows stay on it. Perspectives cut each page.',

  // Errors of a name or of an operation
  'page.error.nameEmpty': 'Give the page a name.',
  'page.error.nameTaken': 'A page named “{name}” already exists.',
  'page.error.last': 'The project needs at least one page.',
  'page.error.generic': 'The page operation could not be completed.',

  // Delete page
  'page.delete.title': 'Delete the page {name}?',
  'page.delete.empty':
    'The page is empty, so nothing else goes away. You can undo with Ctrl+Z.',
  'page.delete.confirmEmpty': 'Delete page',
  'page.delete.hasContent': 'The page has content:',
  'page.delete.roots': 'Top-level items: {count}',
  'page.delete.markings': 'Markings: {count}',
  'page.delete.arrows': 'Arrows: {count}',
  'page.delete.annotations': 'Annotations: {count}',
  'page.delete.moveTo': 'Move the content to…',
  'page.delete.moveHint':
    'What moves keeps its relative positions and enters at the right of the destination content.',
  'page.delete.moveConfirm': 'Move the content and delete the page',
  'page.delete.discard': 'Delete the page and everything in it',
  'page.delete.discardWarning':
    'Deleting the page and everything in it loses all of this content: containers, markings, arrows and annotations. You can undo with Ctrl+Z.',

  // Move to page (right-click menu and Details)
  'page.move.menu': 'Move to page',
  'page.move.menuEmpty': 'There is no other page',
  'page.move.done': 'Moved to {name}',
  'page.move.open': 'Open the page',
  'page.move.refusedTitle': 'The move would cut arrows',
  'page.move.refusedText':
    'An arrow cannot join markings of different pages. Nothing was moved. These arrows cross between the group and the rest of the page:',
  'page.move.refusedArrow': '{from} → {to}',
  'page.move.goToArrow': 'Go to the arrow',

  // Notices
  'page.notice.removed': 'The page {name} no longer exists. The first page is open.',
  'page.notice.undone': 'Undone on {name}',
  'page.notice.redone': 'Redone on {name}',
  'page.notice.outside':
    'The perspective {name} does not show this item. The Full one is open.',
  'page.notice.emptyPerspective': 'Nothing from this perspective on this page',

  // Status bar
  'page.status.name': 'Page {name}',

  // Comments on an empty canvas spot (the anchor has no page of its own yet)
  'page.comment.canvasFirstPageOnly':
    'Comments on empty canvas are only on the first page for now',
} as const;

// portuguese-guard:begin pt-BR part of the bilingual module (decision 2 of #741)
export const pagesPtBR: Record<keyof typeof pagesEnUS, string> = {
  'page.count.items': '{count} itens',
  'page.count.itemsOne': '1 item',
  'page.count.empty': 'vazia',

  'page.picker.label': 'Página: {name}',
  'page.picker.list': 'Páginas',
  'page.picker.new': 'Nova página…',
  'page.picker.manage': 'Gerenciar páginas…',

  'page.perspectiveCount.many': '{count} itens nesta página',
  'page.perspectiveCount.one': '1 item nesta página',
  'page.perspectiveCount.none': 'nada nesta página',

  'page.manage.title': 'Gerenciar páginas',
  'page.manage.table': 'Páginas',
  'page.manage.colName': 'Nome',
  'page.manage.colContent': 'Conteúdo',
  'page.manage.colActions': 'Ações',
  'page.manage.open': 'aberta',
  'page.manage.createField': 'Nome da nova página',
  'page.manage.create': 'Criar página',
  'page.manage.rename': 'Renomear {name}',
  'page.manage.renameField': 'Novo nome de {name}',
  'page.manage.renameSave': 'Salvar nome',
  'page.manage.renameCancel': 'Cancelar renomeação',
  'page.manage.moveUp': 'Subir {name}',
  'page.manage.moveDown': 'Descer {name}',
  'page.manage.delete': 'Apagar {name}',
  'page.manage.deleteLast': 'A última página não pode ser apagada.',
  'page.manage.note':
    'Cada página é uma tela própria: os itens, as posições e as setas ficam nela. As perspectivas recortam cada página.',

  'page.error.nameEmpty': 'Dê um nome à página.',
  'page.error.nameTaken': 'Já existe uma página chamada “{name}”.',
  'page.error.last': 'O projeto precisa de pelo menos uma página.',
  'page.error.generic': 'Não foi possível concluir a operação com a página.',

  'page.delete.title': 'Apagar a página {name}?',
  'page.delete.empty':
    'A página está vazia, então nada mais some. Dá para desfazer com Ctrl+Z.',
  'page.delete.confirmEmpty': 'Apagar página',
  'page.delete.hasContent': 'A página tem conteúdo:',
  'page.delete.roots': 'Itens de primeiro nível: {count}',
  'page.delete.markings': 'Marcações: {count}',
  'page.delete.arrows': 'Setas: {count}',
  'page.delete.annotations': 'Anotações: {count}',
  'page.delete.moveTo': 'Mover o conteúdo para…',
  'page.delete.moveHint':
    'O que for movido mantém as posições relativas e entra à direita do conteúdo do destino.',
  'page.delete.moveConfirm': 'Mover o conteúdo e apagar a página',
  'page.delete.discard': 'Apagar a página e tudo nela',
  'page.delete.discardWarning':
    'Apagar a página e tudo nela perde todo este conteúdo: containers, marcações, setas e anotações. Dá para desfazer com Ctrl+Z.',

  'page.move.menu': 'Mover para página',
  'page.move.menuEmpty': 'Não há outra página',
  'page.move.done': 'Movido para {name}',
  'page.move.open': 'Abrir a página',
  'page.move.refusedTitle': 'A mudança cortaria setas',
  'page.move.refusedText':
    'Uma seta não pode ligar marcações de páginas diferentes. Nada foi movido. Estas setas cruzam entre o grupo e o resto da página:',
  'page.move.refusedArrow': '{from} → {to}',
  'page.move.goToArrow': 'Ir para a seta',

  'page.notice.removed': 'A página {name} não existe mais. A primeira página foi aberta.',
  'page.notice.undone': 'Desfeito em {name}',
  'page.notice.redone': 'Refeito em {name}',
  'page.notice.outside':
    'A perspectiva {name} não mostra este item. A Completa foi aberta.',
  'page.notice.emptyPerspective': 'Nada desta perspectiva nesta página',

  'page.status.name': 'Página {name}',

  'page.comment.canvasFirstPageOnly':
    'Comentários no canvas vazio só existem na primeira página por enquanto',
};
// portuguese-guard:end
