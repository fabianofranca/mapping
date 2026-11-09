# Arquivos seguros — [Não lançado] (épico `epic/arquivos-seguros`, PR #1141, MCP 0.28.7, schema v18)

## Corrigido

- Importar ou substituir uma imagem na app escolhe, de verdade, um nome livre em `images/`: o nome não cai mais em cima de um arquivo que está na pasta mas o projeto não cita, de uma imagem que a lixeira ainda guarda para o desfazer, nem de outra importação em andamento (colar duas imagens seguidas). Antes, apagar uma imagem, importar outra com o mesmo nome e desfazer a remoção perdia os bytes originais.
- Os nomes de imagem e de especialização não diferenciam mais maiúsculas e minúsculas, nem a forma composta ou decomposta dos acentos: importar `foto.jpg` com `Foto.jpg` no projeto vira `foto-2.jpg`, e `add_container`/`replaceContainer` recusam um arquivo que só difere na caixa (`duplicate-file`); as especializações `Material` e `material` não gravam mais `specs/Material.json` por cima de `specs/material.json`. Projetos que já tinham dois nomes assim continuam abrindo.
- Aceitar uma proposta cuja imagem tem destino ocupado (arquivo solto em `images/`, imagem na lixeira do desfazer ou nome que só difere na caixa) é recusado como "a imagem já existe", sem gravar nada, em vez de sobrescrever.
- No MCP, o nome de imagem escolhido no lote (`add_container`, `replace_container`) também ignora maiúsculas e minúsculas: `Tela.png` não escolhe o nome de um `tela.webp` que já está em `images/`, e duas imagens do mesmo lote que só mudam na caixa ficam com arquivos diferentes.
- `revise_proposal` não segue mais link simbólico em `proposals/<id>/images` ou `specs` para fora das raízes: a pasta é recusada (`outside-roots`) e nada é listado, apagado nem gravado no destino do link.
- `list_proposals`, `propose_changes` e `list_threads` não falham mais por causa de um `proposal.json` ou `comments/*.json` grande demais ou sem permissão de leitura: o item vai para `broken`, com o código do erro, e os demais são listados.
- Um número solto depois do `Z` de um caminho SVG de componente (`M0 0 L10 0 L10 10 Z 5`) não trava mais o servidor MCP em `render_*` e `get_marking_image`: o caminho termina ali.
- `list_markings` aceita em `container` a referência completa que `get_project` devolve em `containers[].ref` (`mapping://projeto/i/código`); a referência de outro projeto continua dando `not-found`.
- `get_code_hints` não falha mais com `RangeError` quando um `ref` de anotação inteira fecha ciclo pela hierarquia (filha que aponta para a dona) ou pelo vínculo dona/filha: o ciclo é cortado e o alvo vem como `repeated`.
