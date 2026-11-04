# Guia do testador e auxiliares da nuvem — [Não lançado] (épico `epic/guia-testador`, PR #508, MCP 0.14.0, schema v13)

## Adicionado

- `connectGuide()` (`scripts/testing/cloud.mjs`): conecta no Chrome como o `connect()`, mas na aba do guia (`/guia/`), com os mesmos 5 s nas ações, 15 s nas navegações e o mesmo registro de console.

- Apêndice A do `docs/TESTING.md`, subseção "Seletores e nomes que enganam": as janelas (`data-window`), os `<dialog>` e o `alertdialog`, `button.tree-item`, as coordenadas de `page.mouse` (do viewport, não da captura) e os nomes acessíveis repetidos ou diferentes da tela ("Novo container", **Rótulo**, `⚠Idade`, X/Y/Largura, a busca do Catálogo, "Revisar: <proposta>"). Um teste confere que cada `data-window` listado existe em `src/`.
- Passo R10.7a (a variante "tela fora de vista" saiu do R10.7, que passou do limite de tamanho do passo).
- `node scripts/testing/cloud.mjs tempos <apoio>`: imprime, por nome, a duração do primeiro `start` ao último `end` do `tempos.log` e o total; marca repetida ou faltando sai como aviso e o nome sem par, como "tempo não medido". A seção 6 do guia ganha as marcas `secao6`.

## Alterado

- Rodada completa em 3 blocos: a passada visual sai do bloco 1 (a cadeia do `principal`, o mais lento) e vai para o bloco 2, que tem o que a lista padrão abre. O tempo por roteiro do relato passa a vir da saída do `tempos`, sem conta à mão.

## Corrigido

- `selectFolder` abre o seletor de leitura ("Selecione uma pasta que este site pode ver", de **Aplicar pasta…**, **Atualizar de pasta…** e **Abrir biblioteca**) e lida com pastas irmãs de nome parecido (`migracao` com `migracao10`): a lista de autocompletar do GTK passa a ser reconhecida com qualquer número de sugestões, o campo do caminho é limpo antes de digitar e o clique no **Open** muda de ponto se a lista não fechar. Se ainda assim o seletor ficar aberto, o erro diz "lista de autocompletar aberta (pastas irmãs com o mesmo começo)".
- Guia do testador (`docs/TESTING.md`): o preparo do R3.8 e do R3.8b passa a trocar também `"containers"` → `"images"` e `"containerId"` → `"imageId"`, como o v8 e o v10 de verdade (antes a app recusava o arquivo). Um teste de modelo monta os dois como o preparo manda e confere que a migração os aceita.
- Passos do guia que não batiam com a app: R1.6a (como fechar as janelas), R1.20 (o nome aparece a partir de 180 × 100 px na tela), R2.4 a R2.6 (qual `Local` é o mais antigo), R3.1 (Notas versão 3, conferida por teste), R3.8b e R3.8d (`[open.migration]` é erro esperado), R3.11 e R11.4 (nenhum erro **novo**), R3.14 (qual camada **Componentes**), R7.1 e R7.3 (a linha `remoteImages`), R9.9, R9.19, R10.7, R11.10 a R11.12 (reabrir o exemplo), R12.4 a R12.10c (clicar fora da `Bola`, alça de canto, minimapa, **Enquadrar tudo**, plurais "marcação(ões)" e "container(s)"), R12.20 (colunas `propriedade` e `valor`), R13.12 (`data-components` 6 em qualquer zoom), R15.5, R16.1 e R16.8.
