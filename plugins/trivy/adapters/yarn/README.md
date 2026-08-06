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
