# Workspace de dogfooding

Projetos Mapping sobre a própria app (telas, painéis, diálogos), para achar e anotar ajustes na ferramenta e servir de massa de teste real. Tudo é versionado no repositório. Segue o molde de `examples/workspace/`, com três diferenças: o servidor é o build do branch em uso (não uma release baixada), o agente é aberto na raiz do repositório e não há `setup.sh` nem `tools/`.

## Como usar

1. Abra o agente na **raiz do repositório** e aprove o servidor `mapping`. Ele vem do `.mcp.json` da raiz, que roda `workspace/mcp.sh`: a cada início gera `dist-mcp/mapping-mcp.js` do branch em uso e o inicia com as raízes `workspace/projetos` e `workspace/especializacoes`.
2. Precisa de `npm install` feito (nas sessões na nuvem o hook de início faz). Depois de mudar código de `mcp/` ou `src/model/`, reinicie o servidor (`/mcp` no Claude Code) para o build novo valer.
3. Abra os projetos na app (`npm run dev`, o preview ou o `dist/index.html`) como **pasta**, dentro de `workspace/projetos/<nome>/`. A app grava o `mapping.json`; commite junto as imagens.

O código mapeado é este repositório, então `get_code_hints` e `find_by_code` conferem `src/` de verdade.

## Cliente de teste

O `scripts/testing/mcp-stdio-client.mjs` só aceita `.mcp.json` com `command: "node"`. Aqui, passe os argumentos (depois de `npm run build:mcp`):

```bash
MAPPING_MCP_ARGS='["dist-mcp/mapping-mcp.js","--root","workspace/projetos","--root","workspace/especializacoes"]'
```

## Estrutura

| Caminho                      | O que é                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `workspace/projetos/`        | Projetos Mapping (`<nome>/mapping.json`, `images/`, ...). |
| `workspace/especializacoes/` | Fontes das especializações (por ora vazia).               |
| `workspace/mcp.sh`           | Gera o build do branch em uso e inicia o servidor MCP.    |
| `workspace/AGENTS.md`        | Regras para o agente.                                     |

## Regras para o agente

Ver `workspace/AGENTS.md`.
