# Plugins controlados

Plugins são parte do próprio kit `.docker-dev`; não existe instalação dinâmica
de extensões de terceiros. A seleção da raiz fica em `plugins.enabled` nesta
própria pasta e já habilita o Trivy por padrão. Para alterar a seleção, rode
`docker-dev setup`: o seletor mostra os plugins ativos como marcados.

## Contrato de um plugin

```text
plugins/<nome>/
├── image-install.sh          # opcional; roda como root durante docker build
├── bin/<comando>             # opcional; vira /usr/local/bin/<comando>
├── host-bin/<comando>        # opcional; direnv adiciona ao PATH do host
├── plugin.json               # manifest do plugin (schema docker-dev/plugin/v2)
├── commands/<comando>/
│   ├── command.json          # manifest de comando
│   └── command.sh            # implementação opcional
└── hooks/post-asdf.sh        # opcional; roda como docker-dev após asdf install
```

Os nomes devem usar somente letras minúsculas, números e hífens. Comandos são
globais; não crie um nome que já exista em `commands/` ou em outro plugin
habilitado. Scripts de imagem devem ser idempotentes e não devem depender do
checkout do projeto, pois são executados antes do bind mount existir.

Não há hooks de host: um plugin nunca deve alterar configuração, pacotes ou
credenciais da máquina do desenvolvedor. Mudanças no host continuam concentradas
no comando `setup` do núcleo e exigem confirmação explícita.

## Subplugins

Um plugin pai pode declarar plugins internos com `plugins.directory`. Se não
informar `plugins.enabledFile`, o arquivo de seleção é `plugins.enabled` na
raiz do plugin pai; caso contrário, usa o caminho indicado. Os plugins filhos
possuem seu próprio `plugin.json`, com o mesmo schema, e podem fornecer o mesmo contrato (`bin`, `host-bin`,
`commands`, `image-install.sh` e `hooks`). Eles aparecem no help como
`[plugin/adaptador]`. Isso permite que uma ferramenta comum, como Trivy, tenha
adaptadores pequenos por gerenciador de pacotes sem acoplar o núcleo a nenhum
ecossistema. Durante `docker-dev setup`, cada nível declarado abre uma seleção
interativa com os itens já habilitados marcados.
