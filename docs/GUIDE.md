# Guia interativo e projeto de exemplo

A app traz um **guia interativo** (uma página à parte, `guia/`) e um **projeto de exemplo** (o botão **Abrir projeto de exemplo** da tela inicial). Os dois saem do mesmo projeto, `examples/exemplo-completo/`, a fonte única: o guia nunca fica diferente do exemplo.

## O que é cada coisa

| Peça                         | Onde                                      | Como entra na app                                                                                                                                                             |
| ---------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projeto de exemplo (a fonte) | `examples/exemplo-completo/`              | Uma pasta de projeto comum: `mapping.json` (schema v12), `images/`, `specs/` (SDUI, Modelo de dados e o pacote Material 3) e `proposals/` com uma proposta aberta.            |
| Zip do exemplo               | `examples/exemplo-completo.zip`           | Gerado da pasta (`npm run build:example`). A app o embute como data URI (`src/app/exampleProject.ts`, `?inline`) e o entrega ao mesmo `importZip` do **Abrir zip**.           |
| Guia                         | `public/guia/index.html`                  | Gerado do template `scripts/guia/template.html` e do `mapping.json` do exemplo (`npm run build:guia`). O Vite o copia para `dist/guia/`, ao lado do `dist/index.html` único.  |
| Pontos de entrada            | Tela inicial, **Ajuda**, botão do exemplo | Link **Guia interativo** na lateral da tela inicial e primeira seção da **Ajuda** (os dois abrem outra aba, `rel="noopener noreferrer"`); botão **Abrir projeto de exemplo**. |

## Como o guia é gerado

`scripts/buildGuia.mjs` empacota `scripts/guia.ts` com o esbuild e roda `guiaHtml()`, que:

1. lê `examples/exemplo-completo/mapping.json` com o `deserialize` da app (o arquivo precisa ser um projeto válido do schema atual) e as imagens de `images/` (viram data URIs);
2. troca no template o marcador `/*__TOKENS_CSS__*/` pelos **tokens da app** (`renderTokensCss()`: o tema claro e o escuro, os mesmos nomes `--color-*`, `--space-*`, `--t-*`) e o marcador `/*__DATA__*/ null` pelo subconjunto do projeto que a página desenha;
3. aplica a **CSP** do `index.html` (`applyCsp`, `pwa/csp.ts`): sem `style=""`, sem handler inline, sem fonte nem script de fora, sem rede. A cor da camada entra pelo CSSOM (`el.style.setProperty`), nunca por atributo.

O desenho dos componentes Material 3 nos containers sem foto usa os **valores da própria anotação** (título, rótulos, variante, selecionado…): se o exemplo muda, o guia muda junto. Os termos do roteiro seguem a interface (Árvore, Camadas, Detalhes, Incompletas, Diagnóstico, Propostas, Catálogo, "trancada", "posição a revisar"); os atalhos citados saem de `SHORTCUT_LABELS` e `WINDOW_NUMBER`, e `tests/examples/guia.test.ts` falha se algum deixar de existir na app.

O guia segue o **tema da app**: lê `mapping.theme` do `localStorage` (mesma origem; `light` ou `dark`, senão o tema do sistema).

## Como regenerar

```bash
npm run build:example   # examples/exemplo-completo.zip, a partir da pasta
npm run build:guia      # public/guia/index.html, do template e do exemplo
```

- `npm run build` já roda `build:guia` antes do Vite. O zip **não** é regenerado no build: ele é conferido por teste (`tests/examples/exampleProject.test.ts`).
- O repositório guarda os dois arquivos gerados (como `examples/libraries/material3/`). Se a pasta do exemplo ou o template mudar sem regerar, os testes `tests/examples/*.test.ts` apontam o comando a rodar.
- Para mudar o exemplo: edite a pasta (de preferência abrindo-a na app com **Abrir pasta** e deixando a app gravar, para o `mapping.json` sair canônico), rode os dois comandos e, se as contagens mudarem (4 imagens, 31 marcações, 41 anotações, 8 camadas, 3 especializações), ajuste `tests/examples/*.test.ts`, os passos do guia (`const S` no template, que cita telas e marcações por nome) e o R11 do `docs/TESTING.md`.
- **Quando o pacote Material 3 ou uma especialização mudar** (`npm run build:examples`, ou edição de `examples/specs/sdui.json` / `modelo-de-dados.json`): `examples/exemplo-completo/specs/` guarda cópias (`material3/` do pacote `examples/libraries/material3/`; `sdui.json` e `modelo-dados.json` de `examples/specs/`) e a `version` de cada uma em `specializations[]` do `mapping.json`. Copie a fonte nova para a pasta do exemplo, ajuste a `version` no `mapping.json` e rode `npm run build:example` e `npm run build:guia`. O teste "cópias do exemplo × fontes" (`tests/examples/exampleProject.test.ts`) falha com essa instrução se algo ficar velho: compara a lista de arquivos, os `.json` por igualdade profunda (a ordem das chaves não conta), os demais byte a byte e a `version`.
- O exemplo não leva dados reais: nomes, e-mails (`exemplo.com`) e repositórios (`github.com/org/…`) são inventados.

## Service worker e publicação

- `pwa/sw.js` põe `./guia/index.html` no precache e serve a navegação para `guia/` (e `guia/index.html`) do cache: o guia funciona sem internet. O carimbo do `sw.js` (`vite.config.ts`) leva o conteúdo do guia, então mudar só o guia também dispara o aviso de nova versão.
- O `deploy.yml` copia `dist/` inteiro: a versão principal fica em `/guia/` e o preview em `/preview/guia/`, sem mudança no workflow.
- Aberto como arquivo (`file://`), o `index.html` costuma estar sozinho (é o artefato avulso do deploy): a app não mostra o link do guia (`src/utils/guideLink.ts`).
- O zip do exemplo soma cerca de 80 KB ao `dist/index.html` (data URI em base64), dentro do orçamento do CI.

## O que abrir o exemplo grava

O mesmo que o **Abrir zip** (é o mesmo `importZip`): uma cópia nova do projeto no IndexedDB (**Neste dispositivo**), que passa a aparecer em **Projetos recentes**, e o pedido de armazenamento persistente do navegador. Não grava nada em pasta nem em **pastas recentes**. Cada clique cria **outra cópia** (nome **exemplo-completo**); **Excluir**, na lista, apaga a cópia. Teste: `tests/app/controller.test.ts` ("o projeto de exemplo embutido abre pelo mesmo importZip").

## Testes

- `tests/examples/exampleProject.test.ts`: o zip tem o conteúdo da pasta; abre pelo leitor de zip da app; schema v12 sem migração; 4 imagens, 31 marcações, 41 anotações, 8 camadas e 3 especializações; toda anotação tipada usa um tipo declarado; o pacote Material 3 valida; as cópias de `specs/` batem com as fontes; a proposta é válida e aceitar tudo dá um projeto válido.
- `tests/examples/guia.test.ts`: `public/guia/index.html` em dia, CSP, nada de fora, CSS só com tokens, atalhos da app, dados do exemplo.
- `tests/app/serviceWorker.test.ts`, `tests/e2e/cspServiceWorker.spec.ts`: o guia no cache e offline (principal e preview).
- `tests/e2e/guia.spec.ts`: a página carrega sem erro de console nem violação da CSP, o **Próximo** percorre os 12 passos, os links da tela inicial e da Ajuda, o exemplo abre com a proposta para revisar.
- Roteiro manual: R11 do [`TESTING.md`](TESTING.md).
