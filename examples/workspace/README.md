# Pasta de mapeamentos (exemplo)

Esqueleto de uma pasta que centraliza projetos Mapping e já vem pronta para qualquer agente de IA que fale MCP: o servidor, as raízes, a skill `spec-author` e a explicação para o agente (`AGENTS.md`) moram dentro da pasta, por caminho relativo. Cada ferramenta só ganha um arquivinho de configuração apontando para o mesmo comando.

## Como usar

1. Copie esta pasta para onde quiser (ex: `~/mapeamentos`) e inicie um repositório Git nela.
2. Rode `./setup.sh` (precisa de Node ≥ 20 e `curl`). Ele baixa `tools/mapping-mcp.js` da última release `mcp-v*` do Mapping, confere o `sha256`, traz a skill `spec-author` para `.agents/skills/` e cria o link `.claude/skills/spec-author`. Para uma versão específica: `./setup.sh mcp-v0.3.4`. Para atualizar, rode de novo.
3. Preencha a seção "Para que servem estes mapeamentos" do `AGENTS.md`: é o que o agente não descobre sozinho.
4. Abra a pasta no agente e aprove o servidor `mapping`. Abra os projetos na app do Mapping como **pasta**, dentro de `projetos/`.
5. Versione `tools/mapping-mcp.js` e `.sha256` junto: quem clonar tem o servidor funcionando sem instalar nada.

No Windows sem WSL, faça os passos do `setup.sh` à mão (baixar os dois arquivos da release para `tools/`, o `SKILL.md` para `.agents/skills/spec-author/`, e copiar essa pasta para `.claude/skills/spec-author/`).

## Onde cada ferramenta lê a configuração

Todas apontam para o mesmo comando: `node tools/mapping-mcp.js --root projetos --root especializacoes`. Os nomes mudam entre versões; se uma ferramenta não encontrar o servidor, confira a doc dela e ajuste só o arquivo correspondente.

| Ferramenta        | Servidor MCP            | Instruções                          | Skill                    |
| ----------------- | ----------------------- | ----------------------------------- | ------------------------ |
| Claude Code       | `.mcp.json`             | `CLAUDE.md` (importa o `AGENTS.md`) | `.claude/skills/` (link) |
| Cursor            | `.cursor/mcp.json`      | `AGENTS.md`                         | `.agents/skills/`        |
| Gemini CLI        | `.gemini/settings.json` | `AGENTS.md`                         | `.agents/skills/`        |
| Copilot (VS Code) | `.vscode/mcp.json`      | `AGENTS.md`                         | `.agents/skills/`        |
| Codex CLI         | `.codex/config.toml`    | `AGENTS.md`                         | `.agents/skills/`        |

## Duas raízes, não a pasta inteira

`projetos/` é onde o servidor procura `mapping.json` (em qualquer profundidade). `especializacoes/` guarda as fontes das especializações, que precisam estar dentro de uma raiz para `validate_specialization({ path })` e `apply_specialization` as lerem. `.git/` e `tools/` ficam de fora.

## Ligar marcações a código

A conferência de existência de arquivos de código fica confinada ao diretório onde o cliente foi aberto. Para esse trabalho (`get_code_hints`, `find_by_code`, `codeRef`), abra o agente no repositório do código e registre lá o servidor com esta pasta como raiz por caminho absoluto:

```json
{
  "mcpServers": {
    "mapping": {
      "command": "node",
      "args": [
        "/caminho/mapeamentos/tools/mapping-mcp.js",
        "--root",
        "/caminho/mapeamentos/projetos"
      ]
    }
  }
}
```

Para mapear, revisar propostas e escrever especializações, abra o agente nesta pasta.

## Referência

Servidor e tools: `docs/MCP.md` e `docs/AGENT-GUIDE.md` do Mapping. Formato da especialização: `docs/SPEC-FORMAT.md`. Skill: `.claude/skills/spec-author/SKILL.md` no repositório do Mapping (a fonte da cópia que o `setup.sh` traz).
