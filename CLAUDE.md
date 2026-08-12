# Instruções para agentes

## Commits

- Nunca entre em modo de planejamento sem um pedido explicito do usuário.
- Nunca inclua `Co-Authored-By`, nem qualquer trailer de coautoria, em commits.
- Ao receber pedido para gerar commits, agrupe arquivos por mudança semântica. Não misture tipos sem relação no mesmo commit.
- Use Conventional Commits em minúsculas: `feat`, `fix`, `refactor`, `perf`, `build`, `ci`, `chore`, `docs` e `test`.
- Faça commit somente dos arquivos pertinentes a cada tipo:
  - `feat`: comportamento novo e testes dele.
  - `fix`: correção e teste de regressão.
  - `refactor`: reorganização sem mudar comportamento; inclua testes alterados somente se necessários.
  - `perf`: otimização e medição/teste pertinente.
  - `build`: build, dependências e ferramentas de empacotamento.
  - `ci`: workflows e configuração de CI/CD.
  - `docs`: documentação apenas.
  - `test`: testes apenas.
  - `chore`: manutenção sem efeito em produto, build ou CI.
- Não acrescente arquivos gerados, formatação ampla ou mudanças incidentais a um commit semântico; se forem necessários e independentes, faça commit próprio do tipo correto.
- Antes de cada commit, revise `git diff --cached` e confirme que assunto, tipo e arquivos contam uma única mudança.
