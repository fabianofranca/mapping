# Mapeador de Imagens — Plano de desenvolvimento

> Nome provisório. Este documento é a fonte de verdade do desenvolvimento.
> Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.
>
> **Etapa 1 concluída.** As melhorias de usabilidade (Etapa 1.1, fases 8 a 12) estão na **seção 12**. Onde a seção 12 contradiz as anteriores, **a seção 12 prevalece**.
>
> **Etapa 2 (especialização)**: **seção 13**, fases 13 a 17. Onde a seção 13 contradiz as anteriores, **a seção 13 prevalece**.

---

## 1. Objetivo

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações chave-valor**. Tudo é salvo num `mapping.json` ao lado das imagens, num formato pensado para ser lido por um **agente de IA no futuro**: o agente deve conseguir recortar, na imagem original, a área exata de cada marcação.

Exemplo de uso: fotos de um carro (frente, lateral, topo) posicionadas no mesmo canvas. A camada "Lataria" registra amassados, a camada "Vidros" registra trincas, sobre as mesmas marcações.

A **Etapa 2** (especialização: arquivo JSON que pré-define camadas e tipos de anotação) **não faz parte deste plano**, mas o modelo já se prepara para ela (`schemaVersion`, camadas globais, validação por schema).

---

## 2. Conceitos

| Conceito | Definição |
|---|---|
| Projeto | Uma pasta (ou um zip) com `mapping.json` e `images/`. Tem exatamente **um** canvas. |
| Canvas | Área infinita com pan e zoom onde as imagens são posicionadas. |
| Imagem | Arquivo em `images/`, posicionado no canvas. **Sem rotação. Não pode sobrepor outra imagem.** |
| Marcação | Retângulo alinhado aos eixos, **sempre dentro de uma única imagem**. Coordenadas em pixels da imagem original. Pode ter uma marcação pai (hierarquia **ilimitada**). Existe em todas as camadas. |
| Camada | **Global** do projeto. Tem nome e cor. |
| Anotação | Pertence ao par **(camada, marcação)**. Nome opcional + lista de pares chave-valor (valores só texto). Uma marcação pode ter várias anotações na mesma camada. |
| Camadas visíveis | Seleção múltipla. Filtra o que aparece no canvas, no painel e na lista. |
| Camada ativa | Uma só. É o destino padrão de novas anotações. Está sempre visível. |

---

## 3. Decisões já tomadas

- Stack: **Vite + TypeScript (strict) + Preact + @preact/signals + Konva.js + JSZip + zod + idb**.
- Entrega: **um único `index.html`** com tudo embutido (`vite-plugin-singlefile`). Funciona:
  - com **duplo clique no Chrome/Edge desktop** (`file://`), sem instalar nada;
  - hospedado no **GitHub Pages**, para uso no celular, como **PWA** instalável e offline.
- Uso **completo** no celular (desenhar, camadas, anotações). Interface pensada primeiro para o celular.
- Idiomas: **pt-BR e en-US**. Temas: **claro, escuro e seguir o sistema**.
- Desfazer/refazer na etapa 1.
- Transferência entre dispositivos é **manual**: a app só abre e salva arquivos.

---

## 4. Modelo de dados (`mapping.json`, schema v1)

> Substituído pelo **schema v3** na seção 12.1 (`name` e `markingColor` nas imagens; `inherit` e `parentAnnotationId` nas anotações).

```json
{
  "schemaVersion": 1,
  "app": "mapeador-imagens",
  "coordinateSystem": "image-pixels-exif-oriented",
  "project": {
    "name": "Vistoria Carro A",
    "createdAt": "2026-09-30T12:00:00.000Z",
    "updatedAt": "2026-09-30T12:30:00.000Z"
  },
  "layers": [
    { "id": "L1", "name": "Lataria", "color": "#E53935" },
    { "id": "L2", "name": "Vidros", "color": "#1E88E5" }
  ],
  "images": [
    {
      "id": "I1",
      "file": "images/lateral.jpg",
      "width": 4032,
      "height": 3024,
      "placement": { "x": 0, "y": 0, "scale": 0.25 }
    }
  ],
  "markings": [
    {
      "id": "M1",
      "imageId": "I1",
      "parentId": null,
      "name": "Porta dianteira esquerda",
      "rect": { "x": 1200, "y": 900, "width": 800, "height": 1100 },
      "needsReview": false
    },
    {
      "id": "M2",
      "imageId": "I1",
      "parentId": "M1",
      "name": "Maçaneta",
      "rect": { "x": 1650, "y": 1300, "width": 180, "height": 90 },
      "needsReview": false
    }
  ],
  "annotations": [
    {
      "id": "A1",
      "markingId": "M1",
      "layerId": "L1",
      "name": "Amassado",
      "entries": [
        { "key": "tipo", "value": "amassado" },
        { "key": "gravidade", "value": "média" }
      ]
    },
    {
      "id": "A2",
      "markingId": "M1",
      "layerId": "L2",
      "name": null,
      "entries": [
        { "key": "tipo", "value": "trinca" },
        { "key": "local", "value": "canto superior" }
      ]
    }
  ]
}
```

### Regras do modelo

- **IDs**: `crypto.randomUUID()` (os do exemplo estão abreviados).
- **Coleções planas com referências** (`imageId`, `parentId`, `markingId`, `layerId`). Nada aninhado: fica mais fácil para o agente e para as migrações.
- **Ordem dos arrays = ordem de exibição** (camadas no seletor, anotações dentro de cada par camada/marcação, entradas dentro da anotação).
- `name` de marcação e de anotação: sempre presente, `null` quando vazio.
- **`rect`**: inteiros, em pixels da imagem original. `0 ≤ x`, `x + width ≤ image.width` (idem para y/height). Tamanho mínimo: 8 px em cada lado.
- **Hierarquia**: o pai precisa estar na mesma imagem, e o `rect` da filha precisa estar totalmente contido no do pai. Sem ciclos.
- **`entries`**: chaves não vazias (após trim) e únicas dentro da anotação. Valores são string (podem ser vazios).
- **`placement`**: `x`, `y` em unidades do canvas. `scale` = unidades do canvas por pixel da imagem. Os retângulos das imagens no canvas **não podem se sobrepor**.
- **`needsReview`**: `true` quando a marcação foi reescalada por uma troca de imagem com proporção diferente (ver 7.3).
- **`coordinateSystem`**: as coordenadas se referem à imagem **com a orientação EXIF aplicada** (como o navegador exibe). Imagens adicionadas pela app são normalizadas na importação (ver 5.3), então para elas os pixels do arquivo já coincidem com as coordenadas.
- JSON salvo com indentação de 2 espaços, UTF-8.
- Na leitura: validar com **zod** e checar os invariantes (integridade referencial, contenção, não sobreposição, chaves únicas). Se `schemaVersion` for maior que o suportado, avisar e abrir em modo somente leitura. Se for menor, rodar as migrações registradas.

---

## 5. Armazenamento

### 5.1 Estrutura em disco (pasta e zip são idênticos)

```
meu-projeto/
├── mapping.json
└── images/
    ├── frente.jpg
    └── lateral.jpg
```

Colisão de nome ao adicionar uma imagem: sufixo `-2`, `-3`…

### 5.2 Modos

Interface comum `ProjectStorage` (carregar projeto, salvar mapping, ler/gravar/remover imagem). Os recursos são detectados em runtime e a tela inicial mostra só as opções disponíveis.

**Modo Pasta** (desktop Chrome/Edge, inclusive em `file://`)
- File System Access API (`showDirectoryPicker`, `readwrite`).
- **Salvamento automático**: debounce de ~800 ms após cada alteração grava o `mapping.json`. As imagens são gravadas ao serem adicionadas e removidas ao serem excluídas.
- Indicador de status: "Salvo" / "Salvando…" / "Erro ao salvar" (com opção de tentar de novo).
- Pasta sem `mapping.json`: oferecer criar um projeto nela, importando e posicionando automaticamente as imagens que já existirem em `images/` (ou na raiz, movendo-as para `images/`).

**Modo Local + Zip** (celular e qualquer navegador na versão hospedada)
- Projeto guardado no **IndexedDB** (lib `idb`), com salvamento automático.
- **Abrir zip**: importa para o IndexedDB.
- **Exportar**: gera o zip. Usa a Web Share API (`navigator.canShare({ files })`); se não houver suporte, faz download.
- A tela inicial lista os "Projetos neste dispositivo" (abrir / excluir).
- Indicador "Alterações não exportadas" quando houver mudanças desde a última exportação.
- Chamar `navigator.storage.persist()`.
- Aviso no iOS: o Safari pode apagar dados de sites não instalados após alguns dias sem uso. Recomendar instalar a app na tela inicial e exportar com frequência.
- Em `file://` o IndexedDB pode não ser confiável: detectar e, nesse caso, esconder o modo ou avisar.

### 5.3 Importação de imagens

- Input `type="file" accept="image/*" multiple` (no celular oferece galeria e câmera).
- **Normalização EXIF**: se a orientação for diferente de 1, recodificar com a orientação aplicada (JPEG, qualidade 0.92) antes de gravar.
- `width` e `height` gravados já com a orientação aplicada.
- **Bitmap de exibição reduzido** (lado maior de até ~2048 px, via `createImageBitmap`) para o canvas. Fotos de 12 MP pesam demais no celular. As coordenadas continuam sempre em pixels da imagem original.

---

## 6. Arquitetura

```
src/
  main.tsx
  app/        # shell, navegação simples (Home ↔ Editor)
  model/      # tipos, schema zod, operações puras, invariantes, migrações
  store/      # signals do projeto e da UI, undo/redo
  storage/    # ProjectStorage, FolderStorage, LocalStorage (IndexedDB), zip
  canvas/     # CanvasController (Konva), renderização, gestos, hit-test
  ui/         # componentes Preact (barras, painéis, lista, diálogos)
  i18n/       # pt-BR.ts, en-US.ts, t()
  theme/      # tokens CSS light/dark
  utils/
tests/
```

Princípios:
- **`model/` é puro**: funções `(projeto, args) → novo projeto`, imutáveis, sem DOM. Tudo testado.
- **Toda mutação passa por uma action do store**, que aplica a operação pura e registra no histórico.
- **Estado do projeto** (vai para o JSON e entra no undo) separado do **estado da UI** (seleção, camadas visíveis, camada ativa, modo, viewport, aba), que não entra no JSON nem no undo.
- **Undo/redo**: pilha de snapshots imutáveis (limite de 100). **Um gesto = uma entrada** (arrastar ou redimensionar faz commit no fim do gesto).
- **Konva fica isolado** num `CanvasController` imperativo, montado por um `<CanvasHost/>`. Ele observa os signals e dispara actions. Não usar `react-konva`.
- **i18n**: nenhuma string de UI hardcoded. Dicionário tipado, e o TypeScript garante que en-US tenha as mesmas chaves de pt-BR.
- **Tema**: cores em variáveis CSS. O canvas lê os tokens via `getComputedStyle` e redesenha quando o tema muda.

---

## 7. Comportamento

### 7.1 Layout

**Celular (< 900 px)**
- Barra superior compacta: chip da camada ativa (cor + nome), que abre a folha de camadas; status de salvamento/exportação; menu.
- Barra inferior: modo **Navegar/Desenhar**, adicionar imagem, desfazer/refazer, abas **Canvas | Lista**.
- **Gaveta inferior** (bottom sheet) com os detalhes da seleção: estado recolhido e expandido.

**Desktop (≥ 900 px)**
- Barra superior com todas as ações.
- Canvas ao centro. Painel lateral direito com as abas **Detalhes** e **Árvore de marcações**.
- A lista pode ser aberta lado a lado com o canvas.
- Atalhos: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z e Ctrl+Y, Delete, Esc (cancelar/desselecionar), espaço + arrastar para pan.

### 7.2 Canvas

> Gestos de toque no modo Navegar revisados na seção 12.2.

- Pan (arrastar em área vazia), zoom (roda do mouse e pinça), botão "enquadrar tudo".
- **Modo Navegar**: toque ou clique seleciona. Arrastar um item já selecionado move o item. Arrastar em outro lugar faz pan.
- **Modo Desenhar**: arrastar cria um retângulo na imagem sob o ponto inicial, limitado às bordas dela. Continua no modo até o usuário trocar.
- Alças de redimensionamento com área de toque de pelo menos 24 px de tela.

### 7.3 Imagens

> Nome da imagem, colar, arrastar e otimização: seções 12.1 e 12.6.

- **Adicionar**: posicionada automaticamente à direita da imagem mais à direita, com espaçamento. Escala inicial: lado maior = 1000 unidades do canvas.
- **Mover e redimensionar** (proporcional, pelos cantos): se a nova posição sobrepuser outra imagem, mostrar contorno vermelho durante o gesto e voltar à última posição válida ao soltar. Sem rotação.
- **Excluir**: confirmação mostrando quantas marcações e anotações serão apagadas. Exclui em cascata.
- **Trocar imagem** (mantém as marcações):
  - calcular `sx = novaLargura / largura` e `sy = novaAltura / altura`;
  - **mesma proporção** (diferença ≤ 1%): reescalar todas as marcações, sem revisão;
  - **proporção diferente**: avisar antes. Se o usuário confirmar, reescalar com `sx` e `sy` e marcar `needsReview = true` em todas as marcações da imagem;
  - manter `placement.x/y` e ajustar `scale` para preservar a largura exibida. Se a nova altura causar sobreposição, reposicionar num espaço livre.
- **Imagem ausente**: exibir um espaço vazio do tamanho gravado, com aviso e ação **"Reapontar imagem"** (usa o fluxo de troca). As marcações continuam visíveis e editáveis.
- Marcação com `needsReview`: borda tracejada e ícone de alerta. O botão "Confirmar posição" no painel limpa a flag.

### 7.4 Marcações

- **Ao criar**, se o retângulo estiver totalmente dentro de marcações existentes, a mais interna vira pai. O usuário pode trocar ou remover o pai no painel.
- **Trocar pai**: lista só os candidatos válidos (mesma imagem, contém o retângulo, não é descendente), mais a opção "Nenhum".
- A filha não pode sair dos limites do pai (limitar ao mover e redimensionar). O pai não pode encolher menos que a caixa que envolve as filhas.
- **Mover o pai move todos os descendentes.**
- **Excluir**: confirmação com a contagem de descendentes e anotações. Exclui em cascata.
- **Seleção**: o toque seleciona a marcação mais interna sob o ponto. Tocar de novo no mesmo ponto sobe para o pai e, depois do topo, volta para a mais interna. Tocar na imagem fora das marcações seleciona a imagem.
- **Árvore de marcações** (imagem → marcações aninhadas): seleciona qualquer marcação e centraliza o canvas nela.
- **Painel de detalhes**: nome, campos numéricos `x, y, largura, altura` (em pixels da imagem) para ajuste fino, pai.

### 7.5 Camadas

- Criar, renomear, mudar cor (paleta de ~10 cores + seletor livre), reordenar (botões subir/descer) e excluir.
- Excluir: confirmação com a contagem de anotações. Apaga as anotações da camada.
- Projeto novo começa com uma camada ("Camada 1" / "Layer 1").
- Folha/painel de camadas: checkbox de visibilidade em cada uma, "mostrar todas", seleção da ativa. **Tornar uma camada ativa a torna visível.**

### 7.6 Anotações

> Herança e vínculos entre anotações: seção 12.3.

- No painel da marcação selecionada: uma **seção por camada visível** (cabeçalho na cor da camada), com as anotações daquela camada.
- Cada seção tem "+ Anotação". O botão principal "+ Anotação" usa a camada ativa.
- Editor: nome opcional e lista de pares. No celular, **chave em cima e valor embaixo**; no desktop, lado a lado. Adicionar, remover e reordenar pares.
- Chave vazia ou duplicada: erro inline, e a entrada não é gravada até ser corrigida.
- Exclusões simples (anotação, par) **sem confirmação**, porque o undo cobre. Exclusões em cascata **com confirmação**.
- Anotação sem nome aparece como `chave: valor` do primeiro par.

### 7.7 Visualização

> Zoom semântico revisado na seção 12.4.

- **Borda da marcação** na cor neutra do tema, ou na cor escolhida para a imagem (`markingColor`, seção 12.1).
- **Indicadores**: bolinhas no canto superior esquerdo, uma para cada camada visível em que a marcação tem anotação, na cor da camada. Acima de 4, mostrar "+N".
- **Esmaecimento**: marcações sem anotação em nenhuma camada visível ficam com opacidade ~0.35 (a selecionada, nunca).
- **Seleção**: borda mais grossa. Hover no desktop destaca a marcação e esmaece as outras.
- **Zoom semântico** (liga/desliga nas configurações e na barra):
  - avaliado **por marcação**: o texto aparece quando o retângulo ocupa na tela pelo menos ~180 × 100 px (constantes ajustáveis);
  - marcação **folha**: mostra, dentro do retângulo e cortado nos limites, o nome e as linhas `chave: valor` de cada camada visível, na cor da camada;
  - marcação **com filhas**: mostra só uma linha de cabeçalho (nome + indicadores), para não cobrir as filhas.
- **Visão de Lista**:
  - agrupada por Imagem → Marcação (caminho completo, ex: "Porta › Maçaneta") → Camada → Anotações com seus pares;
  - respeita as camadas visíveis. Opção "mostrar marcações sem anotação";
  - tocar num item seleciona a marcação; no celular muda para a aba Canvas e centraliza nela;
  - no desktop, lado a lado com o canvas, com a seleção sincronizada nos dois sentidos.

### 7.8 Configurações (por dispositivo, em `localStorage` com try/catch)

- Tema: Sistema / Claro / Escuro.
- Idioma: pt-BR / en-US (padrão a partir de `navigator.language`).
- Texto no canvas (zoom semântico): ligado/desligado.

---

## 8. Build, PWA e deploy

- `vite-plugin-singlefile` → `dist/index.html` autocontido, com `base: './'` (funciona em `file://` e em `/<repo>/` no Pages).
- **PWA**: manifest, service worker e ícones publicados ao lado do `index.html`. **Registrar o service worker só quando `location.protocol === 'https:'`.**
  - Tentar `vite-plugin-pwa`. Se conflitar com o singlefile, escrever um `sw.js` simples em `public/` (cache-first do `index.html`, com versão).
  - Aviso "Nova versão disponível — atualizar".
- **GitHub Actions**:
  - em push na `main`: `npm ci` → `npm test` → `npm run build` → deploy no GitHub Pages;
  - `workflow_dispatch` permitindo escolher o branch, para testar um PR no celular antes do merge;
  - publicar `dist/index.html` também como artefato do workflow (versão para desktop).

---

## 9. Testes

- **Vitest** obrigatório para `model/`, `store/` (undo/redo, agrupamento de gestos) e `storage/` (com `fake-indexeddb` e mocks da FSA), incluindo o round-trip do zip.
- Casos obrigatórios: cascatas, contenção pai/filha, mover o pai com os descendentes, reescala na troca de imagem (mesma proporção e proporção diferente), não sobreposição de imagens, chaves duplicadas, migração, round-trip do JSON sem perdas.
- E2E com Playwright é opcional, se o ambiente permitir baixar os navegadores.
- Todo PR traz, na descrição, um roteiro **"Como testar no celular"** com passos manuais.

---

## 10. Fases

Cada fase = um branch + um PR, terminando com build verde e deploy funcional.

### Fase 0 — Fundação
- [x] Vite + TS strict + Preact + @preact/signals; ESLint + Prettier; Vitest
- [x] Build singlefile com `base: './'`
- [x] Workflow de deploy no Pages (+ `workflow_dispatch` + artefato)
- [x] Infra de i18n (pt-BR, en-US) e de tema (sistema/claro/escuro)
- [x] Tela inicial vazia com troca de idioma e tema

**Aceite**: `dist/index.html` abre com duplo clique no Chrome desktop; a URL do Pages abre no celular; tema e idioma trocam e persistem.

### Fase 1 — Modelo e estado
- [x] Tipos + schema zod v1 + registro de migrações
- [x] Operações puras: camadas, imagens (adicionar/mover/redimensionar/trocar/remover), marcações (criar/alterar/mover com descendentes/trocar pai/remover), anotações e pares
- [x] Validador de invariantes
- [x] Store com undo/redo e agrupamento por gesto
- [x] Serialização/desserialização

**Aceite**: testes cobrindo todas as operações e invariantes; round-trip do JSON idêntico.

### Fase 2 — Armazenamento e tela inicial
- [x] Interface `ProjectStorage`
- [x] FolderStorage com salvamento automático e indicador de status
- [x] LocalStorage (IndexedDB), abrir zip, exportar zip (Web Share / download), lista de projetos locais, `persist()`, indicador de não exportado
- [x] Importação de imagens com normalização EXIF e bitmap de exibição
- [x] Tela inicial: Novo projeto, Abrir pasta, Abrir zip, Projetos neste dispositivo (conforme os recursos detectados)
- [x] Pasta sem `mapping.json` → criar o projeto a partir das imagens existentes
- [x] Editor provisório listando as imagens do projeto (o canvas vem na fase 3)

**Aceite**: desktop — criar projeto numa pasta, adicionar imagens, fechar, reabrir e ver o mesmo estado. Celular — abrir um zip, adicionar imagem, fechar o navegador, reabrir, exportar; o zip exportado abre no desktop com o mesmo estado.

### Fase 3 — Canvas e imagens
- [x] Layout responsivo (barras, gaveta inferior no celular, painel lateral no desktop)
- [x] CanvasHost + CanvasController: pan, zoom, pinça, enquadrar tudo
- [x] Renderizar imagens e o espaço vazio de imagem ausente
- [x] Adicionar com posicionamento automático; selecionar, mover e redimensionar sem sobreposição
- [x] Excluir em cascata; trocar imagem com reescala e `needsReview`; reapontar imagem ausente
- [x] Desfazer/refazer na interface + atalhos

**Aceite**: montar o "carro" com 4 fotos no celular, reorganizar sem conseguir sobrepor, trocar uma foto, desfazer tudo.

### Fase 4 — Marcações
- [x] Modos Navegar/Desenhar; criar retângulo limitado à imagem
- [x] Alças de redimensionamento, mover, tamanho mínimo
- [x] Hierarquia: pai automático, trocar pai, limites pai/filha, mover o pai com os descendentes
- [x] Seleção da mais interna com ciclo para o pai; árvore de marcações
- [x] Painel de detalhes (nome, x/y/largura/altura, pai, confirmar revisão)
- [x] Excluir em cascata com confirmação

**Aceite**: criar Porta › Maçaneta › Fechadura no celular; mover a Porta arrasta as filhas; a Fechadura não sai da Maçaneta; selecionar cada nível pelo toque e pela árvore.

### Fase 5 — Camadas e anotações
- [x] Gestão de camadas (criar/renomear/cor/reordenar/excluir)
- [x] Camadas visíveis (múltiplas) × camada ativa
- [x] Painel de anotações agrupado por camada visível; editor de nome e pares; validação de chaves
- [x] Indicadores coloridos e esmaecimento no canvas

**Aceite**: com as camadas Lataria e Vidros, anotar a Porta nas duas; ligar e desligar camadas altera os indicadores e o painel; excluir Vidros apaga só as anotações dela.

### Fase 6 — Visualização
- [x] Zoom semântico por marcação (folha × com filhas) + liga/desliga
- [x] Visão de Lista com filtros e navegação para o canvas
- [x] Lista lado a lado no desktop com seleção sincronizada

**Aceite**: aproximando o zoom, os pares aparecem sem cobrir as filhas; pela lista, tocar numa anotação leva à marcação no canvas.

### Fase 7 — PWA e acabamento
- [x] Manifest, ícones, service worker, aviso de nova versão
- [x] Orientação para instalar no iOS/Android e aviso de retenção no iOS
- [x] Estados vazios, mensagens de erro, acessibilidade básica (foco, rótulos, contraste nos dois temas)
- [x] Teste de desempenho: 20 imagens e 500 marcações no celular (medido em Chromium com CPU 4× mais lenta; conferir no aparelho real)
- [x] Revisão de todas as strings nos dois idiomas

**Aceite**: instalar no celular, usar em modo avião, exportar e reabrir no desktop.

---

## 11. Fora do escopo da etapa 1

- Especialização / templates (etapa 2 — **ver seção 13**)
- Valores tipados (número, data, opções fixas) — **etapa 2, seção 13**
- Vários canvas por projeto; rotação de imagens; marcações que não sejam retângulos
- Colaboração, sincronização em nuvem, contas de usuário
- Valores aninhados (lista de tabelas dentro de um valor): **descartados** em anotações livres; o caso de uso é atendido pelos vínculos entre anotações (12.3). Nas anotações tipadas da etapa 2 existe o tipo `table`, só com colunas simples (13.2)

---

## 12. Etapa 1.1 — Melhorias de usabilidade

Levantadas no uso real no celular. Esta seção prevalece sobre as anteriores.

### 12.1 Schema v2 e v3

**Imagens** ganham **`name`** (string ou `null`, padrão `null`):

```json
{ "id": "I1", "name": "Tela Home", "file": "images/img-20260930-122915.webp", "width": 1182, "height": 2560, "placement": { "x": 0, "y": 0, "scale": 0.4 } }
```

- Editável no painel de detalhes da imagem. Exibido como rótulo acima da imagem no canvas, na árvore e na lista. Sem nome, a app mostra o nome do arquivo.
- O `id` continua um UUID automático e não editável.
- Mudar o `name` **não renomeia o arquivo**.

**Anotações** ganham duas propriedades:

```json
{
  "id": "A2",
  "markingId": "M1",
  "layerId": "L-eventos",
  "name": "onClick",
  "inherit": false,
  "parentAnnotationId": "A1",
  "entries": [{ "key": "ação", "value": "navigate" }]
}
```

- **`inherit`** (boolean, padrão `false`): quando `true`, a anotação também vale para **todos os descendentes** da marcação, em qualquer profundidade.
- **`parentAnnotationId`** (string ou `null`, padrão `null`): vincula a anotação a uma anotação "dona". Ex: o evento `onClick` (camada Eventos) pertence ao componente `Button` (camada Componentes). Para quem lê, as anotações vinculadas numa camada formam uma propriedade da dona, com o nome da camada: `Button.Eventos = [onClick, …]`.
- **Invariantes do vínculo**:
  - a dona está na **mesma marcação**;
  - a dona está em **outra camada** (diferente da camada da anotação vinculada);
  - **sem ciclos** (a cadeia pode seguir por várias camadas, ex: Componentes ← Eventos ← Parâmetros).
- **Herança e vínculo são independentes**: se a dona tem `inherit: true`, as vinculadas só descem para as filhas se também tiverem `inherit: true`.
- **A herança não é materializada no JSON.** As anotações herdadas por uma marcação M são as anotações com `inherit: true` de todos os ancestrais de M (seguindo `parentId`). Mudar o pai de uma marcação muda o que ela herda.
- **Schema v3**: a imagem ganha `markingColor` (`#RRGGBB` ou `null`), a cor da borda das marcações dela; `null` = cor neutra do tema. Migração v2 → v3: toda imagem recebe `markingColor: null`. Editável no painel de detalhes da imagem (paleta, cor livre ou "Cor do tema"). Substitui a borda "sempre neutra" da seção 7.7 quando definida.
- **Migração v1 → v2**: toda imagem recebe `name: null`; toda anotação recebe `inherit: false` e `parentAnnotationId: null`. `schemaVersion` passa a ser 2.
- **Exclusões em cascata** (sempre com confirmação e contagens):
  - excluir uma anotação exclui as vinculadas a ela, recursivamente;
  - excluir uma camada exclui as anotações da camada **e as vinculadas a elas**, mesmo em outras camadas (a confirmação lista as contagens por camada);
  - excluir uma marcação já exclui todas as anotações dela (sem mudança).
- **`src/model/`**: funções puras para resolver herdadas (`getInheritedAnnotations(project, markingId)`) e vinculadas (`getLinkedAnnotations(project, annotationId)`), reutilizáveis pelo servidor MCP da etapa 3.

#### Como um agente lê o `mapping.json` (documentar também num `docs/FORMAT.md`)

1. Recorte da marcação: `rect` em pixels da imagem em `images[].file` (orientação EXIF aplicada).
2. Anotações próprias: `annotations` com o `markingId` da marcação, agrupadas por `layerId`.
3. Herdadas: subir por `parentId` e pegar as anotações dos ancestrais com `inherit: true`.
4. Estrutura: anotações com `parentAnnotationId` formam uma árvore; o nome da camada da vinculada é o nome da propriedade na dona.

### 12.2 Gestos no celular (modo Navegar)

Problema: ao tentar fazer pan, o usuário movia sem querer a marcação ou imagem que estava selecionada.

- **Toque**: seleciona (sem mudança, incluindo o toque repetido que sobe para o pai).
- **Arrastar**: **sempre faz pan**, mesmo começando sobre o item selecionado.
- **Segurar ~400 ms e arrastar**: move o item sob o dedo (**marcações e imagens**).
  - Se o dedo se mover mais de ~8 px antes dos 400 ms, o gesto vira pan.
  - Ao completar o tempo: sinal visual de "item pego" (sombra/escala leve) e `navigator.vibrate` quando existir (Android; no iOS só o visual).
  - Segurar e soltar sem arrastar não faz nada.
  - Continuam valendo as regras de limites, não sobreposição e mover o pai com os descendentes.
- **Alças de redimensionamento**: arrasto direto, sem segurar.
- **Desktop (mouse)**: sem mudança — clicar seleciona, arrastar move.
- **Modo Desenhar**: sem mudança.
- A classificação do gesto (toque / pan / segurar-e-mover / pinça) fica numa **máquina de estados pura** em `src/canvas/`, testada com Vitest.

### 12.3 Herança e vínculos na interface

**Editor da anotação**
- Interruptor **"Aplicar às marcações filhas"** (`inherit`).
- Campo **"Pertence a"**: lista as anotações da mesma marcação em outras camadas (mostrando camada + nome ou primeiro par) e "Nenhuma". Só oferece opções válidas (sem ciclo).
- Na anotação dona: resumo clicável das vinculadas, agrupado por camada (ex: "Eventos: onClick, onLongPress"). Tocar leva à anotação; se a camada dela estiver oculta, oferecer torná-la visível.

**Painel de detalhes da marcação**
- Depois das anotações próprias de cada camada visível, uma seção **"Herdadas"** com as anotações herdadas daquela camada: estilo discreto, itálico, **somente leitura**, com "herdado de Porta" e ação "ir para Porta".

**Lista**
- Anotações herdadas aparecem sob a marcação com a mesma identificação ("herdado de …").
- Anotações vinculadas mostram "↳ de Button".

**Indicadores no canvas**
- Camada que chega à marcação **só por herança**: bolinha **vazada** (contorno). Com anotação própria: bolinha cheia.
- Herdadas contam para **não esmaecer** a marcação (na camada ativa, ver abaixo).

**Modos de exibição das marcações** (no painel/folha de camadas; preferência por dispositivo, fora do JSON)
- **Mostrar todas** / **Esmaecer sem anotação** (padrão, comportamento atual) / **Ocultar sem anotação**.
- "Sem anotação" = sem anotação própria **nem herdada** na **camada ativa** (decisão revista após o uso no celular; as demais camadas visíveis só acrescentam indicadores e texto).
- Só a **camada ativa** decide quem é "sem anotação". As outras camadas visíveis continuam mostrando indicadores e texto, mas só nas marcações que a camada ativa mantém visíveis.
- No modo Ocultar:
  - **ancestrais** de uma marcação visível continuam aparecendo, só com a borda esmaecida (sem texto, nome nem indicadores), para manter o contexto da hierarquia; marcações sem anotação que não são pai de nenhuma visível somem;
  - a **marcação selecionada sempre aparece**, mesmo sem anotação (ex: selecionada pela árvore para receber a primeira anotação);
  - a **árvore de marcações** continua mostrando todas;
  - não interfere no modo Desenhar: a detecção de pai automático considera todas as marcações, visíveis ou não.
- Caso de uso: na camada Eventos, só aparecem os componentes que têm eventos.

### 12.4 Zoom semântico — novo visual

Problema: o texto solto sobre a foto, com a mesma cor e peso para nomes e pares, não deixa distinguir camadas, anotações e a origem do texto. Além disso, as anotações próprias de um pai com filhas nunca aparecem.

**Cartão**
- O texto fica num **cartão com fundo semiopaco** (cor de superfície do tema, ~85–90% de opacidade), com cantos arredondados e padding. Nada de contorno escuro no texto.
- **Uma seção por camada visível**: barra vertical na cor da camada à esquerda + nome da camada em letra pequena. A cor não é mais a única pista (daltonismo).
- **Nome da anotação em negrito.** Anotação sem nome: título neutro em itálico ("Anotação 1", "Anotação 2" dentro da camada).
- **Pares** abaixo do nome, com recuo, na cor de texto normal do tema.
- **Linha fina** separando anotações dentro da mesma camada.
- **Herdadas**: itálico e esmaecidas, com "↳ herdado de Porta".
- **Vinculadas**: linha pequena "↳ de Button" abaixo do nome.
- O cartão é cortado aos limites da área; se não couber tudo, termina com "…" (o detalhe completo fica no painel).

**Onde o texto é desenhado**
- **Marcação sem filhas**: dentro do próprio retângulo (sem mudança).
- **Marcação com filhas**: na **maior área retangular livre** dentro do retângulo dela, ou seja, não coberta por nenhuma filha direta. Algoritmo simples com as bordas das filhas como grade de candidatos (poucas filhas por marcação; testar em `src/canvas/` ou num util puro).
- A regra de tamanho vale para a **área onde o texto vai**: o texto só aparece se ela ocupar na tela pelo menos ~180 × 100 px. Senão, só a linha de cabeçalho (nome + indicadores) com "…".

### 12.5 Ajustes de interface

- **Painel de detalhes** da imagem e da marcação mostra o **`id`** em modo somente leitura, com botão de copiar (útil para referenciar o item ao conversar com um agente).
- **Nome da imagem**: campo no painel de detalhes e rótulo no canvas (12.1).
- O botão de liga/desliga do texto no canvas ("T") **não pode cobrir a aba Lista**: reposicionar para não sobrepor as abas nem a barra inferior (ex: dentro da barra de ferramentas ou flutuando sobre o canvas, acima da gaveta).
- **Gaveta inferior**: recolhe automaticamente quando nada está selecionado (sem ocupar espaço com a dica) e abre no estado recolhido/intermediário ao selecionar algo. O usuário ainda pode expandir ou recolher manualmente.

### 12.6 Entrada e otimização de imagens

**Colar da área de transferência**
- **Desktop**: Ctrl/Cmd+V com o foco no canvas (fora de campos de texto) adiciona a imagem copiada. Em campo de texto, o colar continua sendo de texto.
- **Celular**: opção **"Colar imagem"** no botão de adicionar, via `navigator.clipboard.read()`. Detectar em runtime; ocultar a opção onde a API não existir.
- Posição: **centro da área visível**; se sobrepuser outra imagem, o espaço livre mais próximo.
- Nome do arquivo gerado: **`img-AAAAMMDD-HHMMSS.<ext>`** (ex: `img-20260930-122915.webp`), com a regra de colisão (`-2`, `-3`…).

**Arrastar e soltar** (foco no desktop; no celular só onde o sistema permitir)
- Soltar arquivo(s) de imagem **em área vazia**: adiciona no ponto de soltura; se sobrepuser, vai para o espaço livre mais próximo.
- Soltar **um único arquivo sobre uma imagem existente**: **troca a imagem**, usando o fluxo de troca de 7.3 (mesma proporção: direto, coberto pelo desfazer; proporção diferente: aviso e `needsReview`).
- Soltar **vários arquivos**: sempre adiciona todos como novos, mesmo sobre uma imagem.
- Arquivos que não são imagem: ignorados, com aviso.
- Destacar visualmente o alvo durante o arrasto (área vazia × imagem que será trocada).

**Otimização** (vale para toda imagem que entra pela app: arquivo, câmera, colar, arrastar e troca)
- Acontece **na importação, antes de existir qualquer marcação**: a imagem otimizada passa a ser a "original", e as coordenadas nascem nela.
- **Lado maior limitado a 2560 px** (constante no código, sem opção na interface). Imagens menores não são ampliadas.
- **Formato WebP**:
  - fotos (origem JPEG/HEIC/etc.): WebP com perdas, qualidade ~0,85;
  - origem PNG (prints, imagens com texto): WebP **sem perdas**;
  - se o navegador não gerar WebP (testar em runtime, ex: `canvas.toBlob` devolvendo outro tipo), usar **JPEG ~0,85** para fotos e manter **PNG** para origem PNG.
- **Só substitui se ficar menor**: se a imagem **não** precisou ser reduzida, usa o recodificado apenas se ele for menor que o arquivo original; se foi reduzida, usa sempre a versão reduzida.
- A recodificação **remove os metadados** (inclusive GPS). A normalização EXIF da seção 5.3 acontece antes.
- No **zip**, as imagens entram **sem compressão** (`STORE`), porque já estão comprimidas.
- **Fora do escopo**: otimizar imagens de projetos anteriores e as imagens existentes numa pasta ao criar o projeto a partir dela (os arquivos do usuário ficam intocados).
- A lógica de decisão (dimensões finais, formato de saída, "ficou menor?") fica em função pura testável; a recodificação em si fica em `src/storage/`.

### 12.7 Fases

#### Fase 8 — Schema v2 (modelo)
- [x] Tipos e schema zod v2 (`name` na imagem; `inherit` e `parentAnnotationId` na anotação) + migração v1 → v2
- [x] Invariantes do vínculo (mesma marcação, outra camada, sem ciclo)
- [x] Operações: definir/remover `inherit`, definir/remover dona; cascatas de exclusão (anotação, camada)
- [x] `getInheritedAnnotations` e `getLinkedAnnotations` em `src/model/`
- [x] `docs/FORMAT.md` com a seção "Como um agente lê o mapping.json"

**Aceite**: testes da migração (um v1 real abre como v2 sem perdas), da herança em cascata (Porta › Maçaneta › Fechadura), dos invariantes e das cascatas; o zip de teste v1 abre e salva como v2.

#### Fase 9 — Gestos e ajustes de interface
- [x] Máquina de estados de gestos com segurar-e-mover (12.2) + testes
- [x] Integração no CanvasController para marcações e imagens, com sinal visual e vibração
- [x] Botão "T" reposicionado; gaveta recolhe sem seleção (12.5)
- [x] Nome da imagem (painel + rótulo no canvas, árvore e lista) e `id` copiável nos detalhes (12.1, 12.5)

**Aceite** (no celular): fazer pan por cima de uma marcação selecionada sem movê-la; segurar e mover uma marcação e uma imagem; redimensionar pelas alças sem segurar; a aba Lista fica 100% tocável; sem seleção, a gaveta não ocupa a tela; dar nome a uma imagem e vê-lo no canvas; copiar o `id` de uma marcação.

#### Fase 10 — Herança e vínculos na interface
- [x] Editor: "Aplicar às marcações filhas" e "Pertence a"
- [x] Resumo das vinculadas na anotação dona, com navegação
- [x] Seção "Herdadas" no painel; identificação na Lista
- [x] Indicadores: bolinha vazada para camada só herdada
- [x] Modos de exibição Mostrar todas / Esmaecer / Ocultar sem anotação (12.3)
- [x] Extra, pedido no uso: cor da borda das marcações por imagem (`markingColor`, schema v3; 12.1)

**Aceite**: criar a marcação "Botão" com a anotação `Button` na camada Componentes e os eventos `onClick` e `onLongPress` na camada Eventos vinculados a ela; ocultar e mostrar cada camada; na Porta › Maçaneta, ligar a herança numa anotação da Porta e vê-la como herdada na Maçaneta; excluir a camada Componentes mostra as contagens e apaga também os eventos; com a camada Eventos ativa e o modo Ocultar, aparecem apenas os componentes com eventos (e a borda esmaecida dos ancestrais).

#### Fase 11 — Zoom semântico

> Regras vindas da Fase 10 que o cartão precisa respeitar (implementadas em `src/model/display.ts` e no `CanvasController`):
> - marcação `hidden` (modo Ocultar): nem borda nem cartão; `outline` (pai de marcação visível): só a borda esmaecida, **sem cartão, nome nem indicadores**; `dim`: cartão esmaecido junto com o resto;
> - as anotações **herdadas** e **vinculadas** ("↳ herdado de", "↳ de") entram no cartão como em 12.4; o texto mostra as camadas visíveis, mesmo que a camada ativa seja a única que decide a visibilidade;
> - a cor da borda vem de `images[].markingColor` (schema v3): o cartão usa a cor de superfície do tema e não deve depender dela.
- [x] Cartão com seções por camada, nomes em destaque, pares com recuo, separadores (12.4)
- [x] Identificação de herdadas e vinculadas no cartão
- [x] Texto do pai na maior área livre + testes do algoritmo
- [x] Conferir legibilidade nos temas claro e escuro, sobre fotos claras e escuras

**Aceite**: com o projeto de teste (Header › Back), aproximar o zoom e ver o texto da Header na área livre e o da Back dentro dela, sem sobreposição; distinguir anotação sem nome, anotação nomeada e seus pares; distinguir as camadas sem depender da cor.

#### Fase 12 — Entrada e otimização de imagens
- [x] Otimização na importação (2560 px, WebP com/sem perdas, fallback, só se menor, sem metadados) + testes da lógica de decisão
- [x] Zip com imagens em `STORE`
- [x] Colar: Ctrl/Cmd+V no desktop; "Colar imagem" no celular (com detecção)
- [x] Arrastar e soltar: adicionar no ponto, trocar ao soltar sobre imagem, vários arquivos, aviso para não-imagens, destaque do alvo
- [x] Nome de arquivo `img-AAAAMMDD-HHMMSS` para imagens coladas

**Aceite**: adicionar uma foto de 12 MP pela câmera e conferir que o arquivo salvo tem lado maior 2560 px, é WebP (ou JPEG no fallback) e ficou menor; colar um print no desktop e no celular; arrastar uma imagem para área vazia e outra sobre uma imagem existente (troca mantendo as marcações); exportar o zip e conferir o tamanho.

> A Fase 12 não depende das fases 9 a 11 e pode ser feita logo depois da Fase 8, se for mais conveniente.

---

## 13. Etapa 2 — Especialização

> Esta seção prevalece sobre as anteriores onde houver conflito (ex: o tipo `table` da 13.2 substitui o descarte de valores aninhados da seção 11, com colunas só de tipos simples).

### 13.1 Conceito

Uma **especialização** é um arquivo JSON que define **camadas obrigatórias** e os **tipos de anotação** que podem ser criados nelas. Ex: a especialização **SDUI** traz as camadas Componentes (tipos Button, Input…) e Eventos (onClick, onHold…). Ao criar um Button, as chaves já vêm definidas e o usuário só preenche os valores.

- Um projeto pode aplicar **várias especializações** (ex: SDUI + Modelo de dados), **a qualquer momento**.
- Uma especialização **não cita outra pelo nome**. Ligações entre elas são feitas por **referências fortes entre tuplas** (tipo `ref`, 13.3), que escolhem seus alvos por **etiquetas** (ex: o `dado` do Input da SDUI aceita qualquer tupla com a etiqueta `data-field`, que a especialização Modelo de dados coloca nos atributos das classes).
- **Camadas da especialização** só aceitam anotações **tipadas**, sem chaves extras. **Camadas criadas pelo usuário** continuam livres, como hoje.
- Fora do escopo desta etapa: **editor de especializações** dentro da app (etapa 4, depois do MCP).

### 13.2 Formato do arquivo de especialização (`formatVersion` 1)

```json
{
  "format": "mapeador-spec",
  "formatVersion": 1,
  "id": "sdui",
  "name": "SDUI",
  "version": 1,
  "description": "opcional",
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "input",
          "name": "Input",
          "description": "opcional",
          "labelField": null,
          "requiresOwner": false,
          "allowedChildren": ["onChange"],
          "fields": [
            { "key": "id", "type": "string", "required": true },
            { "key": "tipo", "type": "enum", "options": ["text", "email"], "default": "text" },
            { "key": "dado", "type": "ref", "accepts": { "tags": ["data-field"], "free": true } }
          ]
        }
      ]
    }
  ]
}
```

**Tipo de anotação** (`annotationTypes[]`):

| Propriedade | Obrigatória | Descrição |
|---|---|---|
| `id` | sim | Único **na especialização inteira** (não só na camada). |
| `name` | sim | Nome exibido (ex: "Button"). |
| `description` | não | Texto de ajuda. |
| `labelField` | não | Chave de um campo `string` cujo valor é o **rótulo da instância** quando o `name` da anotação está vazio (ex: a Classe usa `nome`, então aparece como "Usuario"). |
| `requiresOwner` | não | Padrão `false`. Ver "Relações". |
| `allowedChildren` | não | Ver "Relações". |
| `fields` | sim | Lista de campos (pode ser vazia). |

**Campos** (`fields[]`):

| Propriedade | Obrigatória | Descrição |
|---|---|---|
| `key` | sim | Chave gravada no JSON. ASCII sem espaços (`[A-Za-z0-9_]`), **não pode começar com `_`** (reservado). Única dentro do tipo. |
| `label` | não | Rótulo exibido na interface (pode ter acentos). Padrão: `key`. |
| `type` | sim | `string`, `number`, `date`, `enum`, `table` ou `ref`. |
| `required` | não | Padrão `false`. Vazio permitido ao salvar, mas a anotação fica **incompleta** (13.5). |
| `default` | não | Valor inicial ao criar a anotação. Precisa ser válido para o tipo. Não existe para `ref`. |
| `options` | só `enum` | Lista não vazia de strings únicas. |
| `columns` | só `table` | Lista de campos com a mesma estrutura, **apenas tipos simples** (`string`, `number`, `date`, `enum`): sem `table` nem `ref` dentro de tabela. |
| `tags` | não | Etiquetas que tornam o campo **alvo de referências** (13.3). Formato `[a-z0-9-]+`. Em `table`, cada **linha** vira um alvo. |
| `rowLabel` | `table` com `tags` | Chave de uma coluna `string` que nomeia cada linha como alvo (ex: `nome`). |
| `accepts` | só `ref` | Alvos aceitos: `{ "tags": [...], "free": true\|false }`. Precisa de pelo menos uma etiqueta ou `free: true`. |
| `description` | não | Texto de ajuda exibido no editor. |

**Tipos de valor**:
- `string`: texto.
- `number`: número (inteiro ou decimal).
- `date`: data no formato ISO `AAAA-MM-DD`.
- `enum`: uma das `options`. Booleanos são representados como `enum` (ex: `["sim", "não"]`).
- `table`: lista de linhas; cada linha é um objeto com as chaves das `columns` (mais o id interno `_id`, 13.3).
- `ref`: **referência forte** a uma tupla de outra anotação (13.3). O valor do campo **é** a referência.

**Relações entre anotações** (sempre dentro da mesma especialização):
- `allowedChildren`: ids dos tipos que podem ser **vinculados** a este (via `parentAnnotationId`). Ex: um Button aceita onClick e onHold. Um dono pode ter **N** filhos, inclusive vários do mesmo tipo.
- `requiresOwner: true`: a anotação **precisa** ter exatamente um dono, de um tipo que a liste em `allowedChildren`. Ex: um evento sem componente não faz sentido.
- Os filhos ficam na camada onde o tipo deles está definido (ex: onClick na camada Eventos), o que respeita a regra existente de dono em outra camada.

**Etiquetas recomendadas** (convenção documentada na ajuda; novas especializações devem reutilizá-las):
- `data-field`: atributo de um modelo de dados (classe, entidade, DTO).

**Validação na importação** (mensagens com o caminho do erro, ex: `layers[1].annotationTypes[0].fields[2].type: "numero" inválido; use "number"`):
- `format`, `formatVersion`, `id`, `name`, `version` (inteiro ≥ 1) obrigatórios;
- ids de camada únicos; ids de tipo únicos na especialização inteira; `key` única no tipo e nas colunas; nenhuma `key` começando com `_`;
- `allowedChildren` só referencia tipos existentes **em outra camada** da mesma especialização;
- todo tipo com `requiresOwner: true` aparece no `allowedChildren` de pelo menos um tipo;
- `default` compatível com o tipo (e presente em `options` no `enum`); `ref` sem `default`;
- `columns` só com tipos simples; `rowLabel` obrigatório em `table` com `tags` e apontando para uma coluna `string`;
- `labelField` aponta para um campo `string` do tipo;
- `accepts` com pelo menos uma etiqueta ou `free: true`; etiquetas no formato `[a-z0-9-]+`;
- `color` no formato `#RRGGBB`.

### 13.3 Schema v4 do projeto

**Pasta/zip**: a especialização aplicada é **copiada** para `specs/<id>.json`. O projeto fica autocontido e o agente entende o significado das camadas e chaves.

```
meu-projeto/
├── mapping.json
├── images/
└── specs/
    ├── sdui.json
    └── modelo-dados.json
```

**`mapping.json`** ganha:

```json
{
  "schemaVersion": 4,
  "specializations": [
    { "id": "sdui", "version": 1, "file": "specs/sdui.json" },
    { "id": "modelo-dados", "version": 1, "file": "specs/modelo-dados.json" }
  ],
  "layers": [
    { "id": "L1", "name": "Componentes", "color": "#1E88E5", "spec": { "specId": "sdui", "layerId": "componentes" } },
    { "id": "L3", "name": "Classes", "color": "#43A047", "spec": { "specId": "modelo-dados", "layerId": "classes" } },
    { "id": "L9", "name": "Model", "color": "#757575", "spec": null }
  ],
  "annotations": [
    {
      "id": "A1", "markingId": "M-form", "layerId": "L9", "name": "User",
      "inherit": false, "parentAnnotationId": null, "type": null, "values": null,
      "entries": [
        { "id": "E1", "key": "name", "value": "string" },
        { "id": "E2", "key": "age", "value": "number" }
      ]
    },
    {
      "id": "A2", "markingId": "M-form", "layerId": "L3", "name": null,
      "inherit": false, "parentAnnotationId": null,
      "type": { "specId": "modelo-dados", "typeId": "classe" },
      "values": {
        "nome": "Contato",
        "atributos": [ { "_id": "R1", "nome": "email", "tipo": "String", "obrigatorio": "sim" } ]
      },
      "entries": []
    },
    {
      "id": "A3", "markingId": "M-nome", "layerId": "L1", "name": null,
      "inherit": false, "parentAnnotationId": null,
      "type": { "specId": "sdui", "typeId": "input" },
      "values": {
        "id": "input_nome", "tipo": "text",
        "dado": { "annotationId": "A1", "entryId": "E1" }
      },
      "entries": []
    },
    {
      "id": "A4", "markingId": "M-email", "layerId": "L1", "name": null,
      "inherit": false, "parentAnnotationId": null,
      "type": { "specId": "sdui", "typeId": "input" },
      "values": {
        "id": "input_email", "tipo": "email",
        "dado": { "annotationId": "A2", "key": "atributos", "rowId": "R1" }
      },
      "entries": []
    }
  ]
}
```

**Camadas e anotações**
- **Camada**: `spec` é `null` (camada livre) ou aponta para a camada de origem na especialização.
- **Anotação livre**: `type: null`, `values: null`, pares em `entries`.
- **Anotação tipada**: `type` aponta para o tipo; `values` é um objeto com **valores JSON nativos** (`number` como número, `date` como string ISO, `table` como array de objetos, `ref` como objeto de referência); `entries: []`.
  - Campo vazio: `null` (ou ausente). `table` vazia: `[]`.
  - Chaves que não existem no tipo **não são aceitas** pela interface.
- `name` continua opcional e funciona como **rótulo da instância**. Se estiver vazio e o tipo tiver `labelField`, o rótulo vem desse campo.

**Ids estáveis** (para as referências sobreviverem a renomeações)
- Toda tupla de anotação livre ganha **`id`** (`entries[].id`).
- Toda linha de `table` ganha **`_id`** (chave reservada; por isso nenhuma `key` de especialização pode começar com `_`).
- Ids gerados com `crypto.randomUUID()` (abreviados nos exemplos). Não mudam ao editar chave ou valores.

**Referências (`ref`)**

O valor de um campo `ref` é um destes três formatos:

| Alvo | Valor | Rótulo exibido |
|---|---|---|
| Tupla de anotação livre | `{ "annotationId", "entryId" }` | `User.name` (rótulo da anotação + chave da tupla) |
| Linha de `table` com etiqueta | `{ "annotationId", "key", "rowId" }` | `Contato.email` (rótulo da anotação + valor do `rowLabel`) |
| Campo simples com etiqueta | `{ "annotationId", "key" }` | `Contato.nome` (rótulo da anotação + `label` do campo) |

- **Alvos aceitos**: tuplas cujo campo tenha alguma das etiquetas de `accepts.tags` (em qualquer especialização aplicada) e, se `accepts.free` for `true`, qualquer tupla de anotação livre.
- O alvo pode estar em **qualquer marcação e imagem do projeto**.
- **Origem**: só campos `ref` de anotações tipadas. Anotações livres não têm referências fortes.
- **Rótulo da anotação** no texto da referência: `name`; se vazio, valor do `labelField`; se vazio, nome do tipo; numa anotação livre sem nome, "Anotação".
- Excluir o alvo **não apaga** a referência: ela fica **quebrada** e aparece como pendência (13.5). O desfazer restaura tudo.
- Referências de uma anotação para ela mesma não são permitidas.

**Migração v3 → v4**: `specializations: []`; toda camada recebe `spec: null`; toda anotação recebe `type: null` e `values: null`; toda tupla em `entries` recebe `id`.

**Invariantes novas**:
- camada com `spec` só tem anotações tipadas da mesma especialização e de tipos daquela camada; camada livre só tem anotações livres;
- anotação tipada com dono só se o tipo do dono a listar em `allowedChildren`;
- ids de tupla únicos no projeto; ids de linha únicos dentro da tabela.
- Violações vindas de arquivos externos, de atualização de versão ou de referências quebradas **não bloqueiam a abertura**: viram pendências (13.5).

O estado **incompleta** **não é gravado**: é calculado a partir do projeto + especializações.

`src/model/`: tipos do formato da especialização, validação (zod), resolução de referências (`resolveRef`, `findRefTargets`, `getBacklinks`), cálculo de pendências e todas as operações, sem APIs de navegador (reutilizável pelo MCP). Leitura e escrita de `specs/` ficam em `src/storage/`.

### 13.4 Ciclo de vida da especialização no projeto

**Aplicar** (menu do projeto → Especializações → Aplicar): escolher o arquivo JSON → validar (13.2) → copiar para `specs/` → criar as camadas da especialização no fim da lista.
- Se já existir no projeto uma especialização com o mesmo `id`:
  - `version` maior: oferecer **Atualizar** (abaixo);
  - mesma `version` ou menor: avisar e não fazer nada.

**Atualizar versão** (manual):
- substitui a cópia em `specs/`;
- camadas novas são criadas; camadas existentes mantêm cor e anotações; o nome segue o da nova versão;
- camadas que **sumiram** na nova versão viram **camadas livres** (mesma conversão de "Remover → Converter");
- anotações que ficaram inválidas (campo obrigatório novo, opção removida, tipo removido, relação não permitida, etiqueta removida de um alvo) **não são alteradas**: aparecem como **incompletas** com o motivo, para o usuário corrigir. Tipo removido: a anotação fica somente leitura, com a ação "Converter em anotação livre".

**Remover**: a app pergunta:
- **Apagar dados**: remove as camadas da especialização e todas as anotações delas, **e as vinculadas a elas em outras camadas**; confirmação com contagens por camada;
- **Converter em camadas livres**: as camadas viram livres (`spec: null`), as anotações tipadas viram livres (`type: null`, `values: null`) com os valores convertidos para texto em `entries` (na ordem dos campos; `number` e `date` como texto; campos vazios omitidos; `table` achatada como `parametros[1].nome: origem`; `ref` como o rótulo do alvo, ex: `dado: → User.name`); o nome do tipo é preservado no `name` quando este estiver vazio (ex: `Button`, ou o valor do `labelField`); vínculos (`parentAnnotationId`) e `inherit` mantidos.
- Nos dois casos, a cópia em `specs/` é removida e o desfazer cobre a operação inteira.
- **Referências de outras especializações** que apontavam para dados removidos ou convertidos ficam **quebradas** (pendências), e a confirmação informa quantas serão afetadas. Ex: remover o Modelo de dados quebra os `dado` dos Inputs que apontavam para atributos de Classe.

**Camadas da especialização**:
- **não podem ser excluídas nem renomeadas** individualmente (só removendo a especialização);
- a **cor pode ser trocada**;
- aparecem com um selo da especialização (ex: "SDUI") no seletor e na folha de camadas;
- podem ser reordenadas, ocultadas e escolhidas como ativas, como qualquer camada.

### 13.5 Anotações tipadas na interface

**Criar**
- Em camada da especialização, "+ Anotação" abre a lista dos **tipos daquela camada**.
- Tipo com `requiresOwner`: pede o **dono** primeiro (anotações da mesma marcação cujo tipo permite este filho). Sem dono possível: mensagem explicando o que criar antes.
- **A partir do dono**: no editor de uma anotação tipada aparecem botões para cada tipo de `allowedChildren` (ex: "+ onClick", "+ onHold"), que criam a anotação já vinculada, na camada do tipo filho. Se essa camada estiver oculta, criar mesmo assim e oferecer torná-la visível.
- Campos com `default` vêm preenchidos.

**Editores por tipo de campo** (mobile-first)
- `string`: campo de texto; `number`: campo numérico (`inputmode="decimal"`); `date`: seletor nativo de data; `enum`: seleção (botões segmentados se houver até 3 opções, lista se mais).
- `table`: linhas como **cartões empilhados** no celular (uma coluna por linha do cartão) e tabela no desktop; adicionar, remover e reordenar linhas.
- `ref`: mostra o alvo atual (`→ User.name`) com ações **Escolher**, **Limpar** e **Ir para o alvo**. "Escolher" abre um seletor com busca listando **só os alvos aceitos**, agrupados por anotação, com o contexto (imagem › marcação). Se não houver nenhum alvo aceito, mensagem explicando o que falta (ex: "Nenhuma tupla com a etiqueta data-field. Aplique uma especialização de modelo de dados ou crie uma anotação livre.").
- `label` e `description` exibidos; obrigatórios com `*`.
- Sem campo para chaves extras.

**Referências recebidas (backlinks)**
- No editor de uma anotação que é alvo, cada tupla ou linha referenciada mostra quem aponta para ela, ex: `name ← Input input_nome (Nome)`. Tocar leva à origem.
- Ao excluir uma anotação, tupla ou linha que é alvo, a confirmação informa quantas referências vão quebrar.

**Incompletas**
- Motivos: obrigatório vazio (inclusive coluna obrigatória numa linha de tabela), valor incompatível com o tipo, opção inexistente, tipo inexistente, dono ausente (`requiresOwner`), dono de tipo não permitido, **referência quebrada** (alvo não existe mais), **alvo não aceito** (perdeu a etiqueta ou deixou de ser livre).
- Exibição: ícone de alerta na anotação (painel e lista) com a lista de motivos; no canvas, um pequeno alerta junto aos indicadores da marcação; filtro **"Incompletas"** na Lista.
- Salvar incompleta é sempre permitido.

**Exibição** (zoom semântico, painel e lista)
- Título: nome do tipo + rótulo da instância, ex: **Button · Comprar**, **Classe · Contato** (sem rótulo: só **Button**).
- Valores na ordem dos campos, usando o `label`: `estilo: primary`. Opcionais vazios omitidos; obrigatórios vazios como `id: —` na cor de alerta.
- `table`: no zoom semântico, só o resumo (`atributos: 3 linhas`); no painel e na lista, a tabela completa.
- `ref`: `dado: → User.name`; quebrada: `dado: → (referência quebrada)` na cor de alerta.
- Filhos vinculados: "↳ de Button · Comprar", como já existe.

### 13.6 Documentação na app

- Página **"Ajuda → Especializações"** (pt-BR e en-US): conceito, formato completo (13.2), tipos de valor, relações, **referências e etiquetas** (com a lista de etiquetas recomendadas), regras de validação e o exemplo SDUI comentado.
- Botões para baixar os **dois exemplos** (13.8) e o **JSON Schema** do formato.
- `docs/SPEC-FORMAT.md` com o mesmo conteúdo, e `docs/spec.schema.json` (JSON Schema draft 2020-12). O zod em `src/model/` é a fonte da verdade: um teste garante que os exemplos passam nos dois e que um conjunto de arquivos inválidos é rejeitado pelos dois.
- `docs/FORMAT.md` atualizado para o schema v4: como ler anotações tipadas, `specs/`, ids de tupla e linha, e **como resolver uma referência** (passo a passo para agentes).

### 13.7 Fases

#### Fase 13 — Formato da especialização (modelo)
- [x] Tipos + schema zod do formato (13.2), incluindo `ref`, `accepts`, `tags`, `rowLabel` e `labelField`, com mensagens de erro por caminho
- [x] `docs/spec.schema.json` + teste de consistência com o zod
- [x] Exemplos em `examples/specs/sdui.json` e `examples/specs/modelo-de-dados.json` (13.8) + testes de validação
- [x] `docs/SPEC-FORMAT.md`

**Aceite**: os dois exemplos validam; arquivos com cada tipo de erro da 13.2 são rejeitados com o caminho correto.

#### Fase 14 — Schema v4 e operações (modelo + armazenamento)
- [x] Tipos, schema zod v4 e migração v3 → v4 (inclusive `id` nas tuplas)
- [x] Operações: aplicar, atualizar e remover especialização (apagar / converter); criar anotação tipada com defaults; editar valores; linhas de tabela com `_id`; vínculos com `allowedChildren`/`requiresOwner`; converter tipada em livre
- [x] Referências: `resolveRef`, `findRefTargets` (respeitando `accepts`), `getBacklinks`; contagem de referências afetadas por exclusões e remoções
- [x] Cálculo de pendências (`getAnnotationIssues`) com todos os motivos da 13.5
- [x] Invariantes novas da 13.3
- [x] `src/storage/`: ler/gravar `specs/` na pasta, no IndexedDB e no zip
- [x] `docs/FORMAT.md` atualizado

**Aceite**: testes cobrindo migração, aplicar/atualizar/remover (as duas opções), conversão com `table` achatada e `ref` em texto, os três formatos de referência, referência que sobrevive a renomear a chave da tupla, referência quebrada, `accepts` com etiqueta e com `free`, pendências e invariantes; um projeto com as duas especializações faz round-trip pelo zip sem perdas.

#### Fase 15 — Especializações e camadas na interface
- [ ] Menu Especializações: aplicar (com erros de validação legíveis), atualizar versão, remover (apagar / converter) com as contagens, inclusive de referências afetadas
- [ ] Camadas da especialização: selo, nome travado, cor editável, sem exclusão individual

**Aceite**: passo 1 do roteiro da 13.9; atualizar a SDUI com uma cópia de `version: 2` que tenha uma camada a mais e uma a menos (a que sumiu vira livre); remover cada especialização com as duas opções e desfazer.

#### Fase 16 — Anotações tipadas e referências na interface
- [ ] Criação tipada (lista de tipos, dono obrigatório, "+ filho" a partir do dono)
- [ ] Editores de campo, inclusive `table` em cartões no celular e o seletor de `ref`
- [ ] Backlinks no editor do alvo; aviso de referências afetadas ao excluir
- [ ] Incompletas: ícone, motivos, alerta no canvas, filtro na Lista
- [ ] Exibição tipada e de referências no zoom semântico, painel e lista

**Aceite**: passos 2 a 10 do roteiro da 13.9 no celular.

#### Fase 17 — Documentação na app
- [ ] Página Ajuda → Especializações (pt-BR e en-US), incluindo referências e etiquetas
- [ ] Downloads dos exemplos e do JSON Schema

**Aceite**: abrir a ajuda no celular, baixar o exemplo SDUI e aplicá-lo num projeto.

> Dependências: 14 depende de 13; 15 depende de 14; 16 depende de 15; 17 depende só de 13.

### 13.8 Exemplos de especialização

Usados pelos testes, pelos agentes e nos testes manuais. Criar exatamente com este conteúdo em `examples/specs/`.

#### `examples/specs/sdui.json`

Mostra: `string`, `number`, `enum`, `table` e `ref`; `required`, `default`, `label`, `description`; `allowedChildren` e `requiresOwner`; booleano como `enum`; referência forte por etiqueta aceitando também tuplas livres (`dado` no Input e no Text).

```json
{
  "format": "mapeador-spec",
  "formatVersion": 1,
  "id": "sdui",
  "name": "SDUI",
  "version": 1,
  "description": "Componentes de tela e seus eventos para Server-Driven UI.",
  "layers": [
    {
      "id": "componentes",
      "name": "Componentes",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": ["onClick", "onHold"],
          "fields": [
            {"key": "id", "type": "string", "required": true},
            {"key": "texto", "type": "string", "required": true},
            {"key": "estilo", "type": "enum", "options": ["primary", "secondary", "text"], "default": "primary"},
            {"key": "habilitado", "type": "enum", "options": ["sim", "não"], "default": "sim"}
          ]
        },
        {
          "id": "input",
          "name": "Input",
          "allowedChildren": ["onChange"],
          "fields": [
            {"key": "id", "type": "string", "required": true},
            {
              "key": "tipo",
              "type": "enum",
              "options": ["text", "email", "password", "number", "phone"],
              "default": "text",
              "required": true
            },
            {"key": "placeholder", "type": "string"},
            {
              "key": "obrigatorio",
              "label": "obrigatório",
              "type": "enum",
              "options": ["sim", "não"],
              "default": "não"
            },
            {"key": "maxLength", "type": "number"},
            {
              "key": "dado",
              "type": "ref",
              "accepts": {"tags": ["data-field"], "free": true},
              "description": "Atributo do modelo de dados exibido e editado por este campo"
            }
          ]
        },
        {
          "id": "text",
          "name": "Text",
          "fields": [
            {"key": "id", "type": "string", "required": true},
            {"key": "conteudo", "label": "conteúdo", "type": "string", "required": true},
            {"key": "estilo", "type": "enum", "options": ["titulo", "corpo", "legenda"], "default": "corpo"},
            {
              "key": "dado",
              "type": "ref",
              "accepts": {"tags": ["data-field"], "free": true},
              "description": "Atributo exibido por este texto (opcional)"
            }
          ]
        },
        {
          "id": "image",
          "name": "Image",
          "allowedChildren": ["onClick"],
          "fields": [
            {"key": "id", "type": "string", "required": true},
            {"key": "descricao", "label": "descrição (acessibilidade)", "type": "string", "required": true},
            {"key": "url", "type": "string"}
          ]
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Eventos",
      "color": "#FB8C00",
      "annotationTypes": [
        {
          "id": "onClick",
          "name": "onClick",
          "requiresOwner": true,
          "fields": [
            {
              "key": "acao",
              "label": "ação",
              "type": "enum",
              "options": ["navigate", "submit", "openUrl", "showDialog", "track"],
              "required": true
            },
            {"key": "destino", "type": "string"},
            {
              "key": "parametros",
              "label": "parâmetros",
              "type": "table",
              "columns": [{"key": "nome", "type": "string", "required": true}, {"key": "valor", "type": "string"}]
            }
          ]
        },
        {
          "id": "onHold",
          "name": "onHold",
          "requiresOwner": true,
          "fields": [
            {
              "key": "acao",
              "label": "ação",
              "type": "enum",
              "options": ["showTooltip", "showMenu", "track"],
              "required": true
            },
            {"key": "duracaoMs", "label": "duração (ms)", "type": "number", "default": 500}
          ]
        },
        {
          "id": "onChange",
          "name": "onChange",
          "requiresOwner": true,
          "fields": [
            {
              "key": "acao",
              "label": "ação",
              "type": "enum",
              "options": ["validate", "mask", "track"],
              "required": true
            },
            {"key": "regra", "type": "string", "description": "Ex: email, cpf, minLength:8"}
          ]
        }
      ]
    }
  ]
}
```

#### `examples/specs/modelo-de-dados.json`

Mostra: `date`, `number` com `default`, `labelField` (a Classe é rotulada pelo `nome`), `table` com etiqueta `data-field` e `rowLabel` (cada atributo vira um alvo de referência) e, para contraste, referências **fracas** em texto (`request`/`response` do Endpoint).

```json
{
  "format": "mapeador-spec",
  "formatVersion": 1,
  "id": "modelo-dados",
  "name": "Modelo de dados",
  "version": 1,
  "description": "Classes de dados e endpoints relacionados às áreas mapeadas.",
  "layers": [
    {
      "id": "classes",
      "name": "Classes",
      "color": "#43A047",
      "annotationTypes": [
        {
          "id": "classe",
          "name": "Classe",
          "labelField": "nome",
          "fields": [
            {"key": "nome", "type": "string", "required": true},
            {"key": "descricao", "label": "descrição", "type": "string"},
            {"key": "versao", "label": "versão", "type": "number", "default": 1},
            {"key": "revisadoEm", "label": "revisado em", "type": "date"},
            {
              "key": "atributos",
              "type": "table",
              "tags": ["data-field"],
              "rowLabel": "nome",
              "columns": [
                {"key": "nome", "type": "string", "required": true},
                {
                  "key": "tipo",
                  "type": "enum",
                  "options": ["String", "Int", "Long", "Double", "Boolean", "Date", "List", "Object"],
                  "required": true
                },
                {
                  "key": "obrigatorio",
                  "label": "obrigatório",
                  "type": "enum",
                  "options": ["sim", "não"],
                  "default": "sim"
                },
                {"key": "exemplo", "type": "string"}
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "endpoints",
      "name": "Endpoints",
      "color": "#8E24AA",
      "annotationTypes": [
        {
          "id": "endpoint",
          "name": "Endpoint",
          "fields": [
            {
              "key": "metodo",
              "label": "método",
              "type": "enum",
              "options": ["GET", "POST", "PUT", "PATCH", "DELETE"],
              "required": true
            },
            {"key": "path", "type": "string", "required": true},
            {"key": "request", "type": "string", "description": "Referência fraca a uma Classe, ex: Credenciais"},
            {"key": "response", "type": "string", "description": "Referência fraca a uma Classe, ex: Sessao"},
            {"key": "timeoutMs", "label": "timeout (ms)", "type": "number", "default": 10000}
          ]
        }
      ]
    }
  ]
}
```

### 13.9 Roteiro de teste manual

Use um print de uma **tela de cadastro** com os campos **Nome**, **Idade** e **E-mail**, um botão **Cadastrar** e um título **Crie sua conta**.

1. **Especializações**: criar um projeto, adicionar o print e criar uma **camada livre "Model"**. Aplicar **SDUI** e **Modelo de dados** (menu → Especializações). Conferir as quatro camadas novas com o selo, que não dá para renomear nem excluir nenhuma delas, e que dá para trocar a cor.
2. **Marcações**: **Formulário** (envolvendo os campos e o botão) › **Nome**, **Idade**, **E-mail**, **Cadastrar**; e **Título**.
3. **Modelo**, na marcação **Formulário**:
   - camada **Model** (livre): anotação **User** com as tuplas `name: string` e `age: number`;
   - camada **Classes**: **Classe** com `nome: Contato`, `revisadoEm` com a data de hoje e `atributos`: `email | String | sim | ana@exemplo.com`. Conferir que ela aparece como **Classe · Contato** sem preencher o nome da anotação (`labelField`).
4. **Componentes** e **referências**:
   - Nome → **Input** · `id: input_nome`, `dado` → escolher **User.name**;
   - Idade → **Input** · `id: input_idade`, `tipo: number`, `dado` → **User.age**;
   - E-mail → **Input** · `id: input_email`, `tipo: email`, `obrigatorio: sim`, `dado` → **Contato.email**;
   - conferir que o seletor do `dado` lista **só** User.name, User.age e Contato.email (nada do Endpoint, do Button nem de outras camadas);
   - Cadastrar → **Button** · `id: btn_cadastrar`, `texto: Cadastrar` (conferir `estilo: primary` e `habilitado: sim` já preenchidos);
   - Título → **Text** · deixar `id` vazio → deve aparecer como **incompleta**.
5. **Backlinks**: abrir a **User** e conferir `name ← Input input_nome` e `age ← Input input_idade`; tocar num deles leva ao Input.
6. **Renomear e quebrar**:
   - renomear a tupla `name` da User para `nome` → o Input do Nome passa a mostrar `dado: → User.nome` (a referência sobreviveu);
   - excluir a linha `email` dos atributos da Contato → a confirmação avisa que 1 referência vai quebrar; o Input do E-mail vira **incompleta** com o motivo "referência quebrada"; **desfazer** e conferir que voltou.
7. **Eventos**, criados **a partir do dono**:
   - Cadastrar → **+ onClick** · `acao: submit`, `destino: /usuarios`, `parametros`: `origem = cadastro`;
   - Cadastrar → **+ onHold** (conferir `duracaoMs: 500` preenchido) · `acao: track`;
   - E-mail → **+ onChange** · `acao: validate`, `regra: email`;
   - tentar criar um onClick direto na camada Eventos na marcação **Idade** (que só tem Input) → mensagem explicando que é preciso um dono que aceite onClick (Button ou Image).
   - Camada **Endpoints**, na marcação Formulário: **Endpoint** · `metodo: POST`, `path: /v1/usuarios`, `request: User`, `response: User` (referências fracas, só texto).
8. **Visualização**:
   - só **Eventos** visível + modo **Ocultar sem anotação**: aparecem apenas E-mail e Cadastrar (e o contorno do Formulário);
   - zoom semântico no Nome: **Input** com `dado: → User.nome`; no Cadastrar, o onClick com `parâmetros: 1 linha`;
   - Lista com o filtro **Incompletas**: só o Título.
9. **Arquivo**: exportar o zip e conferir `specs/sdui.json`, `specs/modelo-dados.json`, os `values` tipados no `mapping.json` (números como número, data ISO, tabela como array com `_id`), os `id` nas tuplas da User e os `dado` como objetos de referência.
10. **Remover**:
    - remover **Modelo de dados** com **Converter em camadas livres**: a confirmação avisa que 1 referência vai quebrar (Contato.email); conferir a Classe convertida em anotação livre com `name: Contato` e `atributos[1].nome: email` achatado; o Input do E-mail fica incompleto e os do Nome e da Idade continuam válidos (apontam para a User livre). **Desfazer**;
    - remover **SDUI** com **Apagar dados** e conferir as contagens por camada na confirmação.
