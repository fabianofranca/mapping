export const ptBR = {
  'app.title': 'Mapeador de Imagens',
  'app.loading': 'Carregando…',
  'settings.title': 'Configurações',
  'settings.language': 'Idioma',
  'settings.theme': 'Tema',
  'theme.system': 'Sistema',
  'theme.light': 'Claro',
  'theme.dark': 'Escuro',
  'language.pt-BR': 'Português (Brasil)',
  'language.en-US': 'English (US)',

  'common.cancel': 'Cancelar',
  'common.create': 'Criar',
  'common.delete': 'Excluir',
  'common.open': 'Abrir',
  'common.close': 'Fechar',

  'layer.defaultName': 'Camada 1',
  'project.untitled': 'Projeto sem nome',
  'project.name': 'Nome do projeto',

  'home.start': 'Começar',
  'home.newProject': 'Novo projeto',
  'home.newProjectHint': 'Guardado neste dispositivo',
  'home.openFolder': 'Abrir pasta',
  'home.openFolderHint': 'Salva direto nos arquivos da pasta',
  'home.openZip': 'Abrir zip',
  'home.openZipHint': 'Importa um projeto exportado',
  'home.localProjects': 'Projetos neste dispositivo',
  'home.noLocalProjects': 'Nenhum projeto guardado neste dispositivo ainda.',
  'home.unsupported':
    'Este navegador não permite abrir pastas nem guardar projetos. Use o Chrome ou o Edge no computador, ou a versão hospedada no celular.',
  'home.fileProtocolWarning':
    'Aberto como arquivo: projetos "neste dispositivo" podem não ser mantidos pelo navegador. No computador, prefira Abrir pasta.',
  'home.updatedAt': 'Alterado em {date}',
  'home.deleteTitle': 'Excluir projeto?',
  'home.deleteMessage':
    '"{name}" será apagado deste dispositivo, com todas as imagens. Isso não pode ser desfeito.',
  'home.folderSetupTitle': 'Criar projeto nesta pasta?',
  'home.folderSetupEmpty': 'A pasta "{folder}" não tem um mapping.json.',
  'home.folderSetupImages':
    'A pasta "{folder}" não tem um mapping.json. {count} imagem(ns) encontrada(s) serão adicionadas ao projeto (as da raiz vão para images/).',
  'home.folderSkipped':
    '{count} imagem(ns) não puderam ser lidas e ficaram fora do projeto.',

  'status.saved': 'Salvo',
  'status.saving': 'Salvando…',
  'status.error': 'Erro ao salvar',
  'status.retry': 'Tentar de novo',
  'status.unexported': 'Alterações não exportadas',
  'status.readOnly': 'Somente leitura',

  'editor.addImages': 'Adicionar imagens',
  'editor.importing': 'Importando {current} de {total}…',
  'editor.importFailed': 'Não foi possível importar: {names}',
  'editor.export': 'Exportar',
  'editor.exporting': 'Gerando zip…',
  'editor.readOnlyNotice':
    'Este arquivo foi feito por uma versão mais nova da app e está aberto só para leitura.',
  'editor.closeUnsavedTitle': 'Fechar sem salvar?',
  'editor.closeUnsavedMessage':
    'As últimas alterações não foram salvas. Se fechar agora, elas serão perdidas.',
  'editor.closeAnyway': 'Fechar mesmo assim',

  'editor.undo': 'Desfazer',
  'editor.redo': 'Refazer',
  'editor.fitAll': 'Enquadrar tudo',
  'editor.menu': 'Menu',
  'editor.closeProject': 'Fechar projeto',
  'editor.emptyCanvas': 'Nenhuma imagem ainda. Adicione fotos para montar o canvas.',
  'editor.canvasLabel': 'Canvas do projeto',
  'editor.dismiss': 'Dispensar',

  'panel.details': 'Detalhes',
  'panel.nothingSelected': 'Nada selecionado',
  'panel.empty':
    'Toque ou clique numa imagem ou marcação do canvas para ver os detalhes.',
  'panel.expand': 'Mostrar detalhes',
  'panel.collapse': 'Esconder detalhes',

  'editor.modeNavigate': 'Navegar',
  'editor.modeDraw': 'Desenhar',
  'editor.drawHint': 'Arraste sobre uma imagem para criar uma marcação.',
  'panel.tabsLabel': 'Painel',
  'panel.tree': 'Árvore',
  'panel.treeTitle': 'Árvore de marcações',
  'panel.treeEmpty': 'Nenhuma imagem ainda.',
  'marking.unnamed': 'Marcação sem nome',
  'marking.pathSeparator': ' › ',
  'marking.inImage': 'Em {file}',
  'marking.name': 'Nome',
  'marking.namePlaceholder': 'Sem nome',
  'marking.rect': 'Posição e tamanho (pixels da imagem)',
  'marking.x': 'X',
  'marking.y': 'Y',
  'marking.width': 'Largura',
  'marking.height': 'Altura',
  'marking.parent': 'Marcação pai',
  'marking.noParent': 'Nenhuma',
  'marking.needsReview': 'Posição a revisar',
  'marking.reviewMessage':
    'A imagem foi trocada por outra com proporção diferente e esta marcação foi reescalada. Confira a posição.',
  'marking.confirmReview': 'Confirmar posição',
  'marking.delete': 'Excluir marcação',
  'marking.deleteTitle': 'Excluir marcação?',
  'marking.deleteMessage':
    '"{name}" será excluída com {descendants} marcação(ões) interna(s) e {annotations} anotação(ões). Dá para desfazer.',
  'marking.error.rect-not-integer': 'Use números inteiros.',
  'marking.error.rect-too-small': 'Cada lado precisa ter pelo menos {min} px.',
  'marking.error.rect-out-of-image': 'A marcação precisa ficar dentro da imagem.',
  'marking.error.rect-outside-parent': 'A marcação precisa ficar dentro da marcação pai.',
  'marking.error.rect-excludes-children':
    'A marcação precisa envolver as marcações internas.',
  'marking.error.invalid-parent': 'Essa marcação não pode ser a pai.',
  'marking.error.generic': 'Não foi possível alterar a marcação.',

  'image.dimensions': '{width} × {height} px',
  'image.missingTitle': 'Imagem ausente',
  'image.missingMessage':
    'O arquivo {file} não foi encontrado. As marcações continuam no lugar: reaponte a imagem para outro arquivo.',
  'image.errorMessage':
    'Não foi possível exibir esta imagem. Você pode trocá-la por outro arquivo.',
  'image.replace': 'Trocar imagem',
  'image.repoint': 'Reapontar imagem',
  'image.delete': 'Excluir imagem',
  'image.deleteTitle': 'Excluir imagem?',
  'image.deleteMessage':
    '"{file}" será removida do projeto, com {markings} marcação(ões) e {annotations} anotação(ões). Dá para desfazer.',
  'image.aspectTitle': 'Proporção diferente',
  'image.aspectMessage':
    'A imagem atual tem {from} e a nova tem {to}. As marcações serão reescaladas e marcadas para revisão.',
  'image.aspectConfirm': 'Trocar mesmo assim',
  'image.replacing': 'Trocando imagem…',
  'image.replaceFailed': 'Não foi possível trocar a imagem.',

  'canvas.imageMissing': 'Imagem ausente',
  'canvas.imageError': 'Não foi possível exibir',

  'export.title': 'Exportar projeto',
  'export.ready': '{file} está pronto.',
  'export.share': 'Compartilhar',
  'export.download': 'Baixar',
  'export.shareFailed': 'Não foi possível compartilhar. Tente baixar.',

  'error.invalid-json': 'O mapping.json não é um JSON válido.',
  'error.invalid-schema': 'O mapping.json não segue o formato esperado.',
  'error.unsupported-version': 'O projeto foi feito numa versão incompatível da app.',
  'error.missing-migration': 'Não foi possível atualizar o projeto para esta versão.',
  'error.invariant-violation': 'O mapping.json tem dados inconsistentes.',
  'error.invalid-zip': 'O arquivo não é um zip válido.',
  'error.missing-mapping': 'O zip não contém um mapping.json.',
  'error.not-found': 'Projeto não encontrado.',
  'error.storage-failed': 'Não foi possível acessar os arquivos. Tente de novo.',
} as const;

export type Dictionary = Record<keyof typeof ptBR, string>;
