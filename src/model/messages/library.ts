// Mensagens do validador da biblioteca (`library.ts`, `libraryDrawing.ts`, `libraryIcons.ts`):
// código → modelo do texto pt-BR de hoje, com `{parâmetros}`. O código é a chave sem o prefixo
// `model.` que a interface usa. Frase que varia por concordância ou por caso vira um código por
// variante, com o texto inteiro (nunca montada por pedaços).

export const libraryMessages = {
  // Arquivos do pacote
  'library.notReferenced': 'arquivo não referenciado pela especialização',
  'library.emptyDoc': 'documento vazio',
  'library.fileNotFound': 'arquivo não encontrado: {path}',
  'library.notRead': 'o conteúdo do arquivo não foi lido (esperava o texto)',
  'library.invalidJson': 'JSON inválido: {detail}',
  'library.specFileNotFound': 'arquivo da especialização não encontrado: {path}',
  'library.specNotFound':
    'nenhuma especialização encontrada: o pacote precisa de um arquivo .json com "format": "mapping-spec"',
  'library.specAmbiguous':
    'há {count} especializações no pacote ({files}): indique qual validar',
  // Componente e especialização
  'library.componentAlreadyUsed': 'o arquivo {path} já é o componente do tipo "{typeId}"',
  'library.noSlot': 'o componente {path} não tem slot',
  'library.slotMismatch': 'o slot do componente {path} é "{slot}", não "{expected}"',
  'library.fieldUndeclared':
    'o desenho usa o campo "{key}", que o tipo "{typeId}" não declara',
  'library.fieldUnused':
    'o campo "{key}" do tipo "{typeId}" não é usado pelo desenho do componente {path}',
  'library.previewNoField': 'o tipo "{typeId}" não tem o campo "{key}"',
  'library.previewNotTable':
    '"{key}" não é uma table do tipo "{typeId}"; o preview dele deve ser um valor simples',
  'library.previewTableNotList':
    '"{key}" é uma table do tipo "{typeId}"; o preview dele deve ser uma lista de linhas',
  'library.previewColumnUnknown':
    '"{column}" não é coluna da table "{key}" do tipo "{typeId}"',
  'library.repeatNotTable':
    'o repeat repete as linhas de "{key}", que é um campo {fieldType} do tipo "{typeId}", não uma table',
  'library.repeatRowUnknownColumn':
    'o desenho da linha usa "{name}", que não é coluna da table "{key}" nem campo do tipo "{typeId}"',
  'library.repeatRowUnknown':
    'o desenho da linha usa "{name}", que o tipo "{typeId}" não declara',
  'library.rowsNotTable':
    '$rows conta as linhas de "{key}", que é um campo {fieldType} do tipo "{typeId}", não uma table',
  'library.imageColumnNotString':
    'o src da imagem lê a coluna "{key}" da table "{table}" do tipo "{typeId}", que é {fieldType}, não string',
  'library.imageFieldNotString':
    'o src da imagem lê "{key}", que é um campo {fieldType} do tipo "{typeId}", não string',
  'library.fontMissing':
    'arquivo da fonte "{family}" não encontrado: {path}; o desenho usa a fonte do sistema',
  'library.scrimMissing': 'o tipo "{typeId}" não existe na especialização',
  // Tokens: um código por par (tipo do token, tipo esperado; `TOKEN_KIND_NAMES`)
  'library.tokenMissing': 'o token "{name}" não existe nos tokens da especialização',
  'library.tokenWrongKind.color.number':
    'o token "{name}" é cor, mas aqui se espera número',
  'library.tokenWrongKind.color.family':
    'o token "{name}" é cor, mas aqui se espera família de fonte',
  'library.tokenWrongKind.number.color':
    'o token "{name}" é número, mas aqui se espera cor',
  'library.tokenWrongKind.number.family':
    'o token "{name}" é número, mas aqui se espera família de fonte',
  'library.tokenWrongKind.family.color':
    'o token "{name}" é família de fonte, mas aqui se espera cor',
  'library.tokenWrongKind.family.number':
    'o token "{name}" é família de fonte, mas aqui se espera número',
  // Contrato de versão
  'library.versionOtherSpec':
    'a versão anterior é da especialização "{previous}", não "{id}"',
  'library.versionNotGrown':
    'a versão não cresceu: a anterior é {previous} e esta é {version}',
  'library.typeNotInVersion': 'o tipo "{typeId}" não existia na versão {version}',
  'library.roleNotInVersion':
    'o papel "{role}" do tipo "{typeId}" não existia na versão {version}',
  'library.fieldNotInVersion':
    'o campo "{key}" do tipo "{typeId}" não existia na versão {version}',
  'library.optionNotInVersion':
    '"{value}" não era opção do campo "{field}" na versão {version}',
  // Ícones
  'library.iconMissing': 'o ícone "{name}" não existe no conjunto de ícones ({path})',
  'library.iconUnverifiable':
    'o ícone "{name}" não pode ser conferido: a especialização não declara icons',
  'library.iconOptionMissing':
    'a opção "{option}" do campo "{key}" não está no conjunto de ícones; o desenho cai no reservado',
  // Prova de desenho: um código por caso (valores padrão, preview, exemplo), com e sem modo.
  // O aviso do motor (com código) entra em `{detail}`.
  'library.draw.defaults':
    'tipo "{typeId}", os valores padrão, tamanho inicial {size}: {detail}',
  'library.draw.defaultsMode':
    'tipo "{typeId}", os valores padrão, modo {mode}, tamanho inicial {size}: {detail}',
  'library.draw.preview': 'tipo "{typeId}", o preview, tamanho inicial {size}: {detail}',
  'library.draw.previewMode':
    'tipo "{typeId}", o preview, modo {mode}, tamanho inicial {size}: {detail}',
  'library.draw.example':
    'tipo "{typeId}", o exemplo "{name}", tamanho inicial {size}: {detail}',
  'library.draw.exampleMode':
    'tipo "{typeId}", o exemplo "{name}", modo {mode}, tamanho inicial {size}: {detail}',
  'library.drawFailed': 'falha ao desenhar: {error}',
  'library.buildFailed':
    'não foi possível montar a biblioteca para provar os exemplos de sistema externo: {reason}',
  'library.buildFailedUnknown':
    'não foi possível montar a biblioteca para provar os exemplos de sistema externo: motivo desconhecido',
  'library.systemExample': 'exemplo "{name}" do sistema "{system}": {detail}',
  'library.systemExampleType':
    'exemplo "{name}" do sistema "{system}": o nó corresponde ao tipo "{found}", não a "{typeId}"',
  'library.originScreen': 'tela de exemplo "{name}" do sistema "{system}": {detail}',
} as const;
