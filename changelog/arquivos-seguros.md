# Arquivos seguros — [Não lançado] (épico `epic/arquivos-seguros`, PR #1141, MCP 0.28.7, schema v18)

## Corrigido

- Importar ou substituir uma imagem na app escolhe, de verdade, um nome livre em `images/`: o nome não cai mais em cima de um arquivo que está na pasta mas o projeto não cita, de uma imagem que a lixeira ainda guarda para o desfazer, nem de outra importação em andamento (colar duas imagens seguidas). Antes, apagar uma imagem, importar outra com o mesmo nome e desfazer a remoção perdia os bytes originais.
- Os nomes de imagem e de especialização não diferenciam mais maiúsculas e minúsculas, nem a forma composta ou decomposta dos acentos: importar `foto.jpg` com `Foto.jpg` no projeto vira `foto-2.jpg`, e `add_container`/`replaceContainer` recusam um arquivo que só difere na caixa (`duplicate-file`); as especializações `Material` e `material` não gravam mais `specs/Material.json` por cima de `specs/material.json`. Projetos que já tinham dois nomes assim continuam abrindo.
- Aceitar uma proposta cuja imagem tem destino ocupado (arquivo solto em `images/`, imagem na lixeira do desfazer ou nome que só difere na caixa) é recusado como "a imagem já existe", sem gravar nada, em vez de sobrescrever.
