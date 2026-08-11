# trivy/yarn

Fornece wrappers Yarn no container e no host via direnv. Antes de `yarn install`,
`yarn add`, `yarn up` ou `yarn upgrade`, cria uma resolução temporária com
scripts desabilitados e passa o `yarn.lock` resultante para o gate genérico do
Trivy. A instalação real é bloqueada se o scan falhar.

Use normalmente no container ou, com direnv ativo, no host:

```bash
yarn add pacote
```

Também é possível chamar o wrapper explicitamente:

```bash
./.docker-dev/dev.sh yarn . add pacote
```

## Config

`.docker-dev/plugins/trivy/plugins/yarn/yarn.config.json` nasce no `setup` com:

```json
{
  "ignoreScripts": false,
  "blockOnAuditSeverity": ""
}
```

- `ignoreScripts`: quando `true`, desabilita scripts também na instalação real.
- `blockOnAuditSeverity`: quando definido, roda `yarn audit` (Classic) ou
  `yarn npm audit` (Berry) antes da instalação real. Falha bloqueia instalação.
