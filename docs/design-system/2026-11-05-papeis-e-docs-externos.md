# Papéis e documentos externos — 2026-11-05 (épico `epic/papeis-e-docs-externos`)

## Pendências

PD1 e PD2: nenhuma (formato v11 e schema v14 não mudam tamanho, token, ícone nem anatomia de componente).

PD6 e PD7: nenhuma (MCP, exemplos, guia e documentação; nenhuma tela nova). As capturas das telas de PD3, PD4 e PD5 entram na passada visual do testador.

PD3:

- **Lista de tipos com busca e grupos** (`src/ui/TypePicker.tsx`, CSS em `src/theme/forms.css`): campo de busca no topo (`TextField` com o texto "Buscar entre N tipos"), cabeçalhos de grupo (`h3`) na ordem da camada, bloco "Outros" no fim e o estado "Nenhum tipo com \"<texto>\"". Os itens (`.type-option` com `NoticeBadge`) não mudam. Nenhum ícone novo.
- **Passo do dono com papel** (`src/ui/AnnotationsPanel.tsx`): uma opção por dono e papel ("Button Continuar › Clique") no diálogo "Dono do <tipo>", quando o dono tem `childRoles`; sem papéis, o botão por dono de hoje.

PD4:

- **Diálogo "Vincular"** (`src/ui/LinkDialog.tsx`): `Dialog` com o `TypePicker` (busca e grupos) restrito ao conjunto de filhos do dono; título "Vincular a <dono>" ou "Vincular a <dono> › <papel>". Abre sempre, também com um tipo só. Nenhum ícone novo.
- **"Vinculadas" por papel** (`src/ui/AnnotationEditor.tsx`, `LinkedRow`): dono com papéis tem uma linha por papel (nome, filhos, "+ Vincular…"), "nenhuma" no papel vazio e a linha "Sem <rótulo>" com a marca de pendência; dono sem papéis agrupa por camada com um "+ Vincular…". Os botões diretos "+ <tipo>" saem.
- **`Select` do papel no cartão do filho** (`src/ui/AnnotationEditor.tsx`): rótulo do `childRolesLabel` (ou "Papel"), "Escolha…" e a pendência (`missing-role`/`unknown-role`) quando falta; só aparece quando o dono tem papéis.
- **Textos na Lista e na revisão** (`src/ui/ListView.tsx`, `src/ui/review/changeText.ts`): "↳ de Button Continuar (Clique)" na Lista; a mudança de `parentRole` (de → para, com o rótulo do papel) e a entidade `docRepo` na revisão de propostas.

PD5:

- **Seção Documento da página do componente, em cinco estados** (`src/ui/catalog/CatalogPage.tsx`, `src/ui/catalog/ExternalDoc.tsx`, estilos em `src/theme/`): (1) o documento renderizado com o link discreto "Abrir no repositório"; (2) o botão "Permitir acesso a <repo>"; (3) a mensagem "<path> não está em <repo>" com o botão "Trocar pasta…"; (4) o botão "Conectar a pasta de <repo>…"; (5) sem seletor de pasta ou sem `urlTemplate`, só o link ou o texto `<repo>: <path>`. Os botões são `Button` e o link é um `<a>` com o estilo de link da app (`.external-doc-link`, `.external-doc-path` em `src/theme/catalog.css`), sem variante nova. Nenhum ícone novo.
- **Diálogo "Repositórios" com a seção Documentos** (`src/ui/PlatformRepos.tsx`, CSS em `src/theme/layout.css`): o título passa de "Repositórios de código" a "Repositórios", com as subseções "Código" e "Documentos"; em Documentos, um `TextField` "Caminho local da raiz" por repositório de `docRepos`. Nenhum ícone novo.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-05: versão 39 (conteúdo, 9 arquivos) e versão 40 (índice, só com o `lastChange`).

- **PD3:** `LayerGroup/README.md` descreve a escolha do tipo (`TypePicker`: busca "Buscar entre N tipos", cabeçalhos de grupo, bloco "Outros", estado `Nenhum tipo com "<texto>"`) e o passo do dono com papel ("Button Continuar › Clique").
- **PD4:** `LayerGroup/README.md` descreve o "Vinculadas" por papel, o diálogo "Vincular a <dono> [› <papel>]" e o `Select` do papel no cartão do filho; `Dialog/README.md` cita o `LinkDialog`; `DataGrid/README.md` traz o texto da Lista ("↳ de Button Continuar (Clique)"); `ChangePopover/README.md` e `OtherChanges/README.md` trazem a mudança de `parentRole` e os repositórios de documentos na revisão.
- **PD5:** `CatalogPage/README.md` e a prévia ganharam a seção Documento nos cinco estados (altura 2300 para 3300, estimada); `SettingsDialog/README.md` e a prévia ganharam o diálogo "Repositórios" com as subseções Código e Documentos (altura 6000 para 6400, estimada).
- Tokens e ícones: só os existentes. `tokens.json` e `bundle.css` não mudaram. Os previews declaram no próprio `<style>` as classes `.external-doc*`, `.repos-group` e `.repos-subtitle`.
- **Contraste:** sem cor nova; conferência visual pendente (abaixo).

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: Componente próprio para `TypePicker`, `LinkDialog`, `AnnotationEditor`/`LinkedRow`/`OwnerRoleField` e `PlatformRepos`: decisão do dono, para a lista "Com forma visível e sem componente no DS" (`PlatformRepos` e `AnnotationEditor` já estão nela).
- Passou para o registro do épico `epic/sincronia-ds-2`: Prévia do `LayerGroup` sem os estados de PD3 e PD4 (busca com grupos, linhas por papel, `Select` do papel), e sem prévia do `LinkDialog` (esta, decisão do dono).
- Passou para o registro do épico `epic/sincronia-ds-2`: Conferência visual das prévias de `CatalogPage` (cinco cartões "Documento externo") e de `SettingsDialog` (cartão "No editor"): contraste, alturas e o link no tema escuro.
- Passou para o registro do épico `epic/sincronia-ds-2`: Classes que faltam no `bundle.css` (`.external-doc*`, `.repos-group`, `.repos-subtitle`, `.type-search`, `.type-section`, `.type-group-title`, `.linked-role-*`, `.annotation-linked-roles`) e os previews que as declaram à parte.
