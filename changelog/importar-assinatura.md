# Importar os parâmetros de um componente pela assinatura — [Não lançado] (épico `epic/importar-assinatura`, PR #0, MCP 0.39.0, schema v19)

## Adicionado

- **Ficha de assinatura (`mapping-signature`, formatVersion 1):** um formato neutro para a assinatura de um componente (os parâmetros de uma função `@Composable`, o `init` de uma view SwiftUI ou as propriedades de um componente do Figma), com `docs/SIGNATURE-FORMAT.md`, `docs/signature.schema.json` e o recurso `mapping-docs://SIGNATURE-FORMAT.md` no MCP.
- **Especialização `formatVersion` 16:** `fieldModels` na raiz (como um tipo da fonte vira campo) e, no `code` de cada plataforma e em cada caso de `variants`, `signature` (a ficha no pacote), `ignore`, `calls` (fábrica de um argumento aninhado) e `formats` (molde do valor, como `{value}.dp`); o valor de `params` também pode ser um caminho (`colors.containerColor`) ou posicional (`#0`); `signature` nas `sources` do tipo. As chaves novas ficam fora do contrato de versão. A `formatVersion` 15 continua aceita.
- **`validate_library` e a app conferem a ficha citada:** ela existe, é uma `mapping-signature` válida e tem o mesmo símbolo e arquivo do `code`; parâmetro mapeado que a ficha não tem vira o aviso "parâmetro fora da ficha".
- **`code` no MCP:** o `get_code_hints` monta os `args` aninhados de uma fábrica (`colors = ButtonDefaults.buttonColors(containerColor = …)`, só com os campos preenchidos), os valores formatados (`16.dp`) e os posicionais; o `code` das vistas (`get_code_hints`, `get_marking`, `get_annotation`, `get_component`, `find_by_code`) traz `unmapped`, a lista dos parâmetros da ficha que não viraram campo (nome, papel, tipo, se é obrigatório e o padrão). Sem as chaves novas, a saída é a de hoje.

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 2.113.536 para 2.129.920 bytes, por decisão do dono (exceção ao limite de 64 KiB de subidas desde a revisão): a ficha, a `formatVersion` 16 e a Ajuda dela fecharam o `dist/index.html` em 2.126.076 bytes.
