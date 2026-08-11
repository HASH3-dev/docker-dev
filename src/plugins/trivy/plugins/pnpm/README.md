# trivy/pnpm

Fornece wrappers pnpm no container e no host via direnv. Antes de `pnpm install`,
`pnpm add`, `pnpm update` ou `pnpm up`, gera um `pnpm-lock.yaml` temporário com
`--lockfile-only --ignore-scripts` e o envia ao gate do Trivy. A instalação real
é bloqueada se o scan falhar.

```bash
pnpm add pacote
./.docker-dev/dev.sh pnpm . add pacote
```
