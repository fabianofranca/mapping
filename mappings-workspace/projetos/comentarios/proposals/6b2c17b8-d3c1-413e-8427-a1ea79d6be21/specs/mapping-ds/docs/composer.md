# Composer

Compositor da conversa (`src/ui/comments/Composer.tsx`).

- Com identidade: "Comentar como {autor}", o campo de texto (`texto`, fundo `color-bg`, borda de controle), a dica *Ctrl+Enter envia; Enter quebra a linha* e o botão **Enviar**.
- `semIdentidade` `sim`: o aviso *Preencha seu nome e e-mail nas Configurações para comentar.* e o botão **Preencher nas Configurações** (leva à seção Identidade).

O editor real é o `CitationEditor` (citações viram chips) e o `@` abre o `CitePicker`; nenhum dos dois é desenhado aqui.
