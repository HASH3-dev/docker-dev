# trivy

Este é o plugin pai de segurança. Use `docker-dev trivy:scan [path]` para
escanear vulnerabilidades de dependências, `docker-dev trivy:scan-iac [path]`
para escanear Infrastructure as Code, e `docker-dev trivy:scan-images [path]`
para escanear vulnerabilidades nas imagens de registry referenciadas por
Dockerfiles e Docker Compose. Os comandos geram JSON em
`.docker-dev/reports/trivy.json`, `.docker-dev/reports/trivy-iac.json` e
`.docker-dev/reports/trivy-images.json`. O scan de imagens não monta nem acessa
o socket Docker.

Ele instala o Trivy e fornece a interface estável para seus adaptadores:

```bash
docker-dev-trivy-gate scan-lock <lockfile>
docker-dev-trivy-gate scan-path <path> <output>
docker-dev-trivy-gate scan-iac <path> <output>
docker-dev-trivy-gate scan-image <image> <output>
```

`scan-lock` é o contrato interno chamado pelo adaptador depois de gerar uma resolução
temporária, completa e sem scripts de pacote. Se o gate retornar código diferente
de zero, o adaptador não pode executar a instalação real.

Os subplugins habilitados ficam em `plugins.enabled`. Os adaptadores Bun, npm,
pnpm, Yarn e uv usam esse contrato sem precisar conhecer instalação ou opções do
Trivy.

Todos os níveis usam o mesmo schema de plugin e podem declarar novos plugins
filhos recursivamente.
