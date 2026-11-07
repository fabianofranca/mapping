// Textos das perspectivas (etapa #659, PE3), separados dos dicionários gerais; entram neles por
// `...perspectivesPtBR` / `...perspectivesEnUS`. Mesmas chaves e mesmos {parâmetros} nos dois
// idiomas. "Item" = container-raiz ou marcação-raiz (a interface não diz "raiz" a ninguém).

export const perspectivesPtBR = {
  // Comuns
  'perspective.principal': 'Principal',
  'perspective.principalNote': 'tudo · onde as propostas são aceitas',
  'perspective.whoAll': 'tudo',
  'perspective.whoShared': 'para todos',
  'perspective.whoMine': 'só eu',
  'perspective.count.containers': '{count} containers',
  'perspective.count.markings': '{count} marcações',
  'perspective.count.empty': 'vazia',
  'perspective.noteMine': 'só você vê · {content}',
  'perspective.principalOnly': 'só na Principal',
  'perspective.error': 'Não foi possível concluir a operação com a perspectiva.',

  // Seletor da barra principal
  'perspective.picker.label': 'Perspectiva: {name}, {who}',
  'perspective.picker.list': 'Perspectivas',
  'perspective.picker.shared': 'Para todos',
  'perspective.picker.mine': 'Só minhas',
  'perspective.picker.new': 'Nova perspectiva…',
  'perspective.picker.manage': 'Gerenciar perspectivas…',
  'perspective.picker.locked': 'A revisão mostra a Principal. Saia dela para trocar.',

  // Nova perspectiva
  'perspective.new.title': 'Nova perspectiva',
  'perspective.new.intro':
    'Um recorte do projeto: quais itens aparecem, onde ficam e quais camadas se veem.',
  'perspective.new.name': 'Nome',
  'perspective.new.nameEmpty': 'Dê um nome à perspectiva.',
  'perspective.new.nameTaken': 'Já existe uma perspectiva chamada “{name}”.',
  'perspective.new.startFrom': 'Começar de',
  'perspective.new.startEmpty': 'Vazia',
  'perspective.new.startHint':
    'Copia os itens, as posições e as camadas escondidas dela. Depois cada uma segue sozinha.',
  'perspective.new.who': 'Quem vê',
  'perspective.new.whoAll': 'Todos do projeto',
  'perspective.new.whoMine': 'Só eu',
  'perspective.new.localUnavailable':
    'Este navegador não guarda dados locais, então “Só eu” não está disponível.',
  'perspective.new.layers': 'Camadas',
  'perspective.new.layersHint': 'Aparecem nos Detalhes e na Lista desta perspectiva.',
  'perspective.new.create': 'Criar perspectiva',

  // Gerenciar perspectivas
  'perspective.manage.title': 'Gerenciar perspectivas',
  'perspective.manage.table': 'Perspectivas',
  'perspective.manage.colName': 'Nome',
  'perspective.manage.colWho': 'Quem vê',
  'perspective.manage.colContent': 'Conteúdo',
  'perspective.manage.colActions': 'Ações',
  'perspective.manage.fixed': 'todos, sempre',
  'perspective.manage.new': 'Nova perspectiva…',
  'perspective.manage.who': 'Quem vê {name}',
  'perspective.manage.rename': 'Renomear {name}',
  'perspective.manage.renameField': 'Novo nome de {name}',
  'perspective.manage.renameSave': 'Salvar nome',
  'perspective.manage.renameCancel': 'Cancelar renomeação',
  'perspective.manage.duplicate': 'Duplicar {name}',
  'perspective.manage.copyName': '{name} (cópia)',
  'perspective.manage.delete': 'Apagar {name}',
  'perspective.manage.note':
    'Apagar uma perspectiva não apaga nada do projeto: tudo continua na Principal. A Principal não se apaga.',

  // Apagar perspectiva
  'perspective.delete.title': 'Apagar a perspectiva {name}?',
  'perspective.delete.stays': 'Continua no projeto, na Principal',
  'perspective.delete.staysBody': '{content}, com as anotações e as setas.',
  'perspective.delete.goes': 'Some',
  'perspective.delete.goesBody':
    'O que aparece nesta perspectiva, as posições dela e as camadas escolhidas.',
  'perspective.delete.note':
    'Quem estiver nela volta para a Principal. Dá para desfazer com Ctrl+Z.',
  'perspective.delete.confirm': 'Apagar perspectiva',

  // Avisos de troca forçada para a Principal
  'perspective.notice.removed': 'A perspectiva {name} foi apagada.',
  'perspective.notice.review': 'A revisão mostra a Principal.',

  // Menu do botão direito
  'perspective.menu.send': 'Enviar para perspectiva',
  'perspective.menu.sendHeading': 'Mostrar também em',
  'perspective.menu.always': 'sempre',
  'perspective.menu.current': 'esta',
  'perspective.menu.mine': 'só eu',
  'perspective.menu.remove': 'Tirar desta perspectiva',

  // Detalhes: seção Perspectivas
  'perspective.section': 'Perspectivas',
  'perspective.section.shownIn': 'Aparece em',
  'perspective.section.send': 'Enviar para perspectiva…',

  // Detalhes: aviso da marca "Veio de…"
  'perspective.arrival.cameFrom': 'Veio de {name}.',
  'perspective.arrival.near': 'Ficou perto de {reference}, na mesma distância.',
  'perspective.arrival.occupied':
    'Ao lado de {reference} estava ocupado; ficou no espaço livre mais próximo.',
  'perspective.arrival.area': 'Sem referência; foi para a área de chegada.',
  'perspective.arrival.dismiss': 'Dispensar',
  'perspective.arrival.next': 'Próximo que veio ({count})',

  // Detalhes: Ligado por seta
  'perspective.arrow.outside': 'fora desta perspectiva',

  // Canvas
  'perspective.canvas.cameFrom': 'Veio de {name}',
  'perspective.canvas.arrivalArea': 'Área de chegada',
  'perspective.canvas.arrivalAreaHint':
    'o que veio de outras perspectivas sem referência',

  // Barra de status
  'perspective.status.name': 'Perspectiva {name}',
  'perspective.status.arrivals': 'Chegadas: {count}',
  'perspective.status.arrivalsOne': '1 item veio de outra perspectiva',
  'perspective.status.arrivalsMany': '{count} itens vieram de outras perspectivas',
} as const;

export const perspectivesEnUS: Record<keyof typeof perspectivesPtBR, string> = {
  'perspective.principal': 'Main',
  'perspective.principalNote': 'everything · where proposals are accepted',
  'perspective.whoAll': 'everything',
  'perspective.whoShared': 'for everyone',
  'perspective.whoMine': 'only me',
  'perspective.count.containers': '{count} containers',
  'perspective.count.markings': '{count} markings',
  'perspective.count.empty': 'empty',
  'perspective.noteMine': 'only you see it · {content}',
  'perspective.principalOnly': 'Main only',
  'perspective.error': 'The perspective operation could not be completed.',

  'perspective.picker.label': 'Perspective: {name}, {who}',
  'perspective.picker.list': 'Perspectives',
  'perspective.picker.shared': 'For everyone',
  'perspective.picker.mine': 'Only mine',
  'perspective.picker.new': 'New perspective…',
  'perspective.picker.manage': 'Manage perspectives…',
  'perspective.picker.locked': 'The review shows Main. Leave it to switch.',

  'perspective.new.title': 'New perspective',
  'perspective.new.intro':
    'A slice of the project: which items appear, where they sit and which layers you see.',
  'perspective.new.name': 'Name',
  'perspective.new.nameEmpty': 'Give the perspective a name.',
  'perspective.new.nameTaken': 'A perspective named “{name}” already exists.',
  'perspective.new.startFrom': 'Start from',
  'perspective.new.startEmpty': 'Empty',
  'perspective.new.startHint':
    'Copies its items, positions and hidden layers. After that, each one goes its own way.',
  'perspective.new.who': 'Who sees it',
  'perspective.new.whoAll': 'Everyone on the project',
  'perspective.new.whoMine': 'Only me',
  'perspective.new.localUnavailable':
    'This browser does not keep local data, so “Only me” is not available.',
  'perspective.new.layers': 'Layers',
  'perspective.new.layersHint': 'Shown in Details and in the List of this perspective.',
  'perspective.new.create': 'Create perspective',

  'perspective.manage.title': 'Manage perspectives',
  'perspective.manage.table': 'Perspectives',
  'perspective.manage.colName': 'Name',
  'perspective.manage.colWho': 'Who sees it',
  'perspective.manage.colContent': 'Content',
  'perspective.manage.colActions': 'Actions',
  'perspective.manage.fixed': 'everyone, always',
  'perspective.manage.new': 'New perspective…',
  'perspective.manage.who': 'Who sees {name}',
  'perspective.manage.rename': 'Rename {name}',
  'perspective.manage.renameField': 'New name for {name}',
  'perspective.manage.renameSave': 'Save name',
  'perspective.manage.renameCancel': 'Cancel renaming',
  'perspective.manage.duplicate': 'Duplicate {name}',
  'perspective.manage.copyName': '{name} (copy)',
  'perspective.manage.delete': 'Delete {name}',
  'perspective.manage.note':
    'Deleting a perspective deletes nothing from the project: everything stays in Main. Main cannot be deleted.',

  'perspective.delete.title': 'Delete the perspective {name}?',
  'perspective.delete.stays': 'Stays in the project, in Main',
  'perspective.delete.staysBody': '{content}, with their annotations and arrows.',
  'perspective.delete.goes': 'Goes away',
  'perspective.delete.goesBody':
    'What this perspective shows, its positions and its chosen layers.',
  'perspective.delete.note': 'Anyone in it goes back to Main. You can undo with Ctrl+Z.',
  'perspective.delete.confirm': 'Delete perspective',

  'perspective.notice.removed': 'The perspective {name} was deleted.',
  'perspective.notice.review': 'The review shows Main.',

  'perspective.menu.send': 'Send to perspective',
  'perspective.menu.sendHeading': 'Also show in',
  'perspective.menu.always': 'always',
  'perspective.menu.current': 'this one',
  'perspective.menu.mine': 'only me',
  'perspective.menu.remove': 'Remove from this perspective',

  'perspective.section': 'Perspectives',
  'perspective.section.shownIn': 'Shown in',
  'perspective.section.send': 'Send to perspective…',

  'perspective.arrival.cameFrom': 'Came from {name}.',
  'perspective.arrival.near': 'Stayed near {reference}, at the same distance.',
  'perspective.arrival.occupied':
    'Next to {reference} was taken; it went to the nearest free space.',
  'perspective.arrival.area': 'No reference; it went to the arrival area.',
  'perspective.arrival.dismiss': 'Dismiss',
  'perspective.arrival.next': 'Next one that came ({count})',

  'perspective.arrow.outside': 'outside this perspective',

  'perspective.canvas.cameFrom': 'Came from {name}',
  'perspective.canvas.arrivalArea': 'Arrival area',
  'perspective.canvas.arrivalAreaHint':
    'what came from other perspectives with no reference',

  'perspective.status.name': 'Perspective {name}',
  'perspective.status.arrivals': 'Arrivals: {count}',
  'perspective.status.arrivalsOne': '1 item came from another perspective',
  'perspective.status.arrivalsMany': '{count} items came from other perspectives',
};
