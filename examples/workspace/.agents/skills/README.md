# .agents/skills/

Skills no formato Agent Skills (`<nome>/SKILL.md`), lidas pelas ferramentas que adotaram o padrão. O `setup.sh` traz para cá a `spec-author`, da mesma release do servidor (`SKILL.md`, com `sha256`), e mantém o link `.claude/skills/spec-author` para o Claude Code (ou, onde link não existe, uma cópia, que ele atualiza a cada execução). Para atualizar a skill, rode o `setup.sh` de novo.
