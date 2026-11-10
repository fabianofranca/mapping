# Barra de status estreita — 2026-11-08 (épico `epic/barra-status-estreita`)

## Pendências

- **StatusBar:** prioridade dos itens (nunca encolhem: estado de gravação, destino, Somente leitura, cursor, zoom e versão; encolhem com reticências e dica, nesta ordem: perspectiva e "aguardando aplicação", depois não exportadas, avisos, conversas e chegadas, e por último o nome da seleção, com largura mínima de 96 px). Todo texto fica em `.status-item-text`. Abaixo de 1100 px de barra (container query), schema e canal somem com os separadores.
- **Barra do canvas (`.canvas-bar`):** é container (`container-type: inline-size`); na revisão com a barra abaixo de 470 px, Conversas, Enquadrar tudo, Visualizar e Mostrar no canvas (`.canvas-bar-low`) somem e os trechos do caminho antes do último recolhem, para o caminho (`Breadcrumbs`, inclusive "Nada selecionado") mostrar a seleção com reticências, e o zoom e Atual/Proposto ficarem inteiros.
- **Breadcrumbs:** dica (`title`) no nome cortado do caminho, que encolhe com reticências antes dos controles da revisão.

## Sincronização

Nenhuma gravação feita pelo agente: artefato curado à mão.

## Ficou sem gravar

- Passou para o registro do épico `epic/sincronia-ds-2`: guia `StatusBar` (prioridade dos itens, container query de 1100 px) e guia `Breadcrumbs` (barra do canvas como container de 470 px; o `title` do nome cortado já estava gravado), com as classes no `bundle.css` (DS3).
