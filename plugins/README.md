# Plugins controlados

Plugins são parte do próprio kit `.docker-dev`; não existe instalação dinâmica
de extensões de terceiros. Para habilitar um plugin, adicione o nome da pasta em
`../plugins.enabled` e execute `./.docker-dev/dev.sh setup` ou `rebuild`.

## Contrato de um plugin

```text
plugins/<nome>/
├── image-install.sh          # opcional; roda como root durante docker build
├── bin/<comando>             # opcional; vira /usr/local/bin/<comando>
├── host-bin/<comando>        # opcional; direnv adiciona ao PATH do host
├── plugin.yml                # manifest do plugin (schema docker-dev/plugin/v1)
├── commands/<comando>/
│   ├── command.yml           # manifest de comando
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

Um plugin pai pode declarar subplugins internos com `plugins_path`. Se não
informar `plugins_enabled_file`, o arquivo de seleção é `plugins.enabled` na
raiz do plugin pai; caso contrário, usa o caminho indicado. Os
subplugins habilitados possuem seu próprio `plugin.yml`, com schema
`docker-dev/subplugin/v1`, e podem fornecer o mesmo contrato (`bin`, `host-bin`,
`commands`, `image-install.sh` e `hooks`). Eles aparecem no help como
`[plugin/adaptador]`. Isso permite que uma ferramenta comum, como Trivy, tenha
adaptadores pequenos por gerenciador de pacotes sem acoplar o núcleo a nenhum
ecossistema. Durante `dev.sh setup`, cada nível declarado abre uma seleção
interativa com os itens já habilitados marcados.
