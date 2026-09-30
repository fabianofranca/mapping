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
  'editor.images': 'Imagens',
  'editor.noImages': 'Nenhuma imagem ainda. Toque em "Adicionar imagens".',
  'editor.imageMissing': 'Imagem ausente',
  'editor.imageError': 'Não foi possível exibir',
  'editor.dimensions': '{width} × {height} px',
  'editor.provisional': 'Editor provisório: o canvas chega na próxima fase.',
  'editor.readOnlyNotice':
    'Este arquivo foi feito por uma versão mais nova da app e está aberto só para leitura.',
  'editor.closeUnsavedTitle': 'Fechar sem salvar?',
  'editor.closeUnsavedMessage':
    'As últimas alterações não foram salvas. Se fechar agora, elas serão perdidas.',
  'editor.closeAnyway': 'Fechar mesmo assim',

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
