# Componentes fiéis — [Não lançado] (épico `epic/componentes-fieis`)

## Pendências

- CF1: nenhuma (sem interface; o formato do componente e o desenho das bibliotecas não estão no DS).
- CF6: dois controles novos, ambos `Select` de `src/ui/controls/`.
  - **Modo do desenho do projeto** (`src/ui/SettingsDialog.tsx`): seletor em seção própria das **Configurações**, com os modos declarados pelas especializações (e "Primeiro modo de cada especialização" quando não há escolha). Fica nas Configurações, e não na barra do canvas, por decisão 17 da etapa: `SettingsBar` guarda preferências da pessoa (idioma e tema), não dados do projeto, e as Configurações já guardam os repositórios por plataforma, que também são do projeto.
  - **Modo do desenho do container** (`src/ui/DetailsSection.tsx`): campo "Modo do desenho: Seguir o projeto / <modos>" nos Detalhes do container.
- CF8: indicadores das marcações (bolinhas de camada e "+N", `src/canvas/renderers/markings.ts`, `renderers/indicatorVisibility.ts`). Token novo do canvas **`size-indicator-min-marking`** = `24px` (3× o diâmetro de 8 px da bolinha; decisão 25 propõe da ordem de 3×), em `src/theme/tokens.ts`, lido em `src/canvas/theme.ts`: abaixo dele (largura ou altura na tela) as bolinhas e o "+N" somem no modo Editar em marcação com componente; selecionada ou sob o mouse mostra tudo; ⚠ sempre. Valor proposto para o DS: 24px nos dois temas.
- CF12: bloco só de leitura **Modos, tokens e ícones** na linha da especialização (`src/ui/SpecTokensInfo.tsx`, dentro de `src/ui/SpecsDialog.tsx`): rótulos `small muted`, lista de definição `.spec-design-tokens` (`src/theme/dialogs.css`), só tokens de espaço, sem componente novo.
- CF13: campo de referência (`ref-control`, `src/theme/details.css`): em largura estreita a camada do alvo (`.ref-control-layer`) encolhe antes do nome (`flex: 0 100 auto`) e, nos Detalhes (`.ref-field` fora de `.ref-cell`), os botões ir ao alvo e limpar quebram de linha quando o controle teria menos de 14ch. Sem token nem ícone novo; só o comportamento do componente no DS.

## Sincronização

(preenchida no fechamento do épico)

## Ficou sem gravar

(preenchida no fechamento do épico)
