# trivy/bun

Fornece wrappers Bun no container e no host via direnv. Antes de `bun install`,
`bun add` ou `bun update`, gera lockfile temporário com
`--lockfile-only --ignore-scripts` e o envia ao gate do Trivy. Instalação real é
bloqueada se scan falhar.

```bash
bun add pacote
./.docker-dev/dev.sh bun . add pacote
```

## Config

`.docker-dev/plugins/trivy/plugins/bun/bun.config.json` nasce no `setup` com:

```json
{
  "ignoreScripts": false,
  "blockOnAuditSeverity": ""
}
```

- `ignoreScripts`: quando `true`, adiciona `--ignore-scripts` à instalação real.
- `blockOnAuditSeverity`: quando definido, roda
  `bun audit --audit-level=<valor>` antes da instalação real. Falha bloqueia
  instalação.
