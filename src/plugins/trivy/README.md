# trivy

Este é o plugin pai de segurança de dependências. Ele instala o Trivy e fornece
a interface estável para seus adaptadores:

```bash
docker-dev-trivy-gate scan-lock <lockfile>
docker-dev-trivy-gate scan-path <path>
```

`scan-lock` é o contrato interno chamado pelo adaptador depois de gerar uma resolução
temporária, completa e sem scripts de pacote. Se o gate retornar código diferente
de zero, o adaptador não pode executar a instalação real.

Os subplugins habilitados ficam em `plugins.enabled`. Os adaptadores Bun, npm,
pnpm, Yarn e uv usam esse contrato sem precisar conhecer instalação ou opções do
Trivy.

Todos os níveis usam o mesmo schema de plugin e podem declarar novos plugins
filhos recursivamente.
