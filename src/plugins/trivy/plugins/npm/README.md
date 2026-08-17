# trivy/npm

Fornece a integração npm: wrapper no container, wrapper de host via direnv e
sincronização de dependências. O wrapper resolve uma instalação em diretório
temporário e chama `docker-dev-trivy-gate scan-lock` antes da instalação real.
Assim, o adaptador não depende da implementação nem das opções do Trivy.

Com direnv carregado, use `npm install pacote` normalmente; o wrapper de host
encaminha para `docker-dev trivy:npm` e aplica o scan antes da instalação real.

## Config

`.docker-dev/plugins/trivy/plugins/npm/npm.config.json` nasce no `setup` e
pode ser editado para customizar o wrapper:

```json
{
  "ignoreScripts": true,
  "blockOnAuditSeverity": "high"
}
```

- `ignoreScripts`: quando `true`, adiciona `--ignore-scripts` em `install`,
  `ci` e `update`.
- `blockOnAuditSeverity`: quando definido, roda `npm audit --audit-level=<valor>`
  após a resolução de segurança do Trivy; a instalação real só ocorre se o
  audit passar (ex.: `"high"` bloqueia em achados High ou Critical).

Sem o arquivo, o wrapper usa os defaults (nenhuma das duas flags ativa).
