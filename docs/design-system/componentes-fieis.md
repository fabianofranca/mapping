# Componentes fiéis — [Não lançado] (épico `epic/componentes-fieis`)

## Pendências

- CF1: nenhuma (sem interface; o formato do componente e o desenho das bibliotecas não estão no DS).
- CF6: dois controles novos, ambos `Select` de `src/ui/controls/`.
  - **Modo do desenho do projeto** (`src/ui/SettingsDialog.tsx`): seletor em seção própria das **Configurações**, com os modos declarados pelas especializações (e "Primeiro modo de cada especialização" quando não há escolha). Fica nas Configurações, e não na barra do canvas, por decisão 17 da etapa: `SettingsBar` guarda preferências da pessoa (idioma e tema), não dados do projeto, e as Configurações já guardam os repositórios por plataforma, que também são do projeto.
  - **Modo do desenho do container** (`src/ui/DetailsSection.tsx`): campo "Modo do desenho: Seguir o projeto / <modos>" nos Detalhes do container.

## Sincronização

(preenchida no fechamento do épico)

## Ficou sem gravar

(preenchida no fechamento do épico)
