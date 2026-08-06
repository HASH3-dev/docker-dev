# Contribuindo com `.docker-dev`

Este documento é o guia de implementação do kit `.docker-dev`. O kit é
portátil: pode ser copiado para a raiz de outro projeto, sem VS Code Dev
Containers e sem dependência da linguagem daquele projeto.

## Princípios

- O VS Code continua no host; o container é somente o ambiente de terminal,
  runtimes, dependências e ferramentas de desenvolvimento.
- O container nunca inicia a aplicação automaticamente.
- O núcleo não conhece npm, Node.js, Trivy ou outra linguagem/ferramenta.
  Integrações pertencem a plugins e adaptadores.
- Mudanças no host só acontecem por `setup`, após confirmação explícita.
- `teardown` remove apenas o que o kit gerencia. Nunca apaga `.docker-dev`,
  direnv do host ou infraestrutura externa.
- YAML declara fluxo; Shell implementa lógica. Nunca crie uma ação YAML que
  execute uma string Shell arbitrária.

## Estrutura

```text
.docker-dev/
├── dev.sh                    # dispatcher e help consolidado
├── commands/<nome>/
│   ├── command.yml           # manifesto, help e fluxo
│   └── command.sh            # opcional: lógica exclusiva
├── internal/
│   ├── command-runner.sh     # executa manifests com yq
│   ├── plugin-runner.sh      # runner dentro do container
│   └── tools.lock.env        # versões e SHA-256 de ferramentas do host
├── lib/                      # funções genéricas reutilizáveis
├── plugins/                  # plugins e adaptadores controlados
├── schemas/                  # JSON Schemas dos manifests
├── Dockerfile
├── compose.yml
└── direnv.envrc
```

## Ciclo de vida

```text
setup → up/shell/run → down/rebuild/reset → teardown
```

- `setup`: configura host, direnv, portas, runtimes, plugins e imagem.
- `up`/`shell`: sobe ou reutiliza o container persistente e abre uma shell.
- `run`: executa um comando no container.
- `down`: para o ambiente, preservando volumes.
- `rebuild`: recria imagem/container, preservando volumes.
- `reset`: remove volumes do ambiente.
- `teardown`: desfaz configuração do repositório, recursos Docker e `yq`
  cacheado, mas preserva a pasta do kit.

## Criar ou alterar um comando

Crie `.docker-dev/commands/<nome>/command.yml`.

```yaml
# yaml-language-server: $schema=../../schemas/command.schema.json
schema: docker-dev/command/v1
name: exemplo
usage: "exemplo [opção]"
summary: "Descrição curta para o help consolidado."
help: |
  Usage: ./.docker-dev/dev.sh exemplo [opção]

  Explicação detalhada do comando.
steps:
  - call:
      function: require_no_arguments
  - call:
      function: minha_funcao
      args: [valor]
```

O nome deve ser igual ao nome da pasta. Os campos `name` e `summary` precisam
ser escalares simples de uma linha e `help` precisa ser um bloco literal `|`.
Isso permite que `dev.sh help` funcione mesmo antes de o `yq` existir.

### Orquestrar funções

Cada etapa aceita somente `call` e chama uma função disponível nos arquivos de
`.docker-dev/lib/` ou no `command.sh` da própria pasta:

```yaml
steps:
  - call:
      function: start
  - call:
      function: exec_in_dev
      args: [dev, bash]
```

Os argumentos são valores, não código Shell. O literal `"$@"` expande os
argumentos recebidos pelo comando, sem `eval`:

```yaml
- call:
    function: exec_in_dev
    args: [dev, "$@"]
```

### Quando usar `command.sh`

Use `command.sh` apenas para regras específicas de um único comando. Exemplo:

```bash
minha_funcao() {
  local value="${command_args[0]:-}"
  [[ -n "$value" ]] || { echo 'Um valor é obrigatório.' >&2; return 2; }
}
```

Não crie `command.sh` apenas para chamar uma função existente. Funções usadas
por mais de um comando pertencem a `lib/`. Em especial:

| Assunto | Local |
| --- | --- |
| Compose | `lib/compose.sh` |
| Ciclo de vida do container | `lib/lifecycle.sh` |
| Host, direnv e `.envrc` | `lib/host.sh` |
| asdf e `.tool-versions` | `lib/asdf.sh` |
| Download de ferramenta do host | `lib/tools.sh` |
| Apenas um comando | `commands/<nome>/command.sh` |

O `setup` é a exceção de bootstrap: se não houver `yq`, o runner carrega seu
`command.sh`, chama `prepare_setup`, pede confirmação e baixa/verifica o `yq`.
Depois disso, interpreta o manifesto normalmente.

## Schemas e IDE

Os schemas reais estão em `.docker-dev/schemas/`:

- `command.schema.json`
- `plugin.schema.json`
- `subplugin.schema.json`

Todo manifesto deve ter a modeline do YAML Language Server no início, apontando
para o schema relativo correto. Isso oferece autocomplete e validação no VS Code
com a extensão YAML e em IDEs compatíveis, sem alterar `.vscode/` do projeto.

O campo `schema: docker-dev/.../v1` é também validado em runtime. Mudanças
incompatíveis exigem uma versão nova de schema; não altere silenciosamente `v1`.

## Criar um plugin

Habilite plugins por `.docker-dev/plugins.enabled`.

```text
plugins/<plugin>/
├── plugin.yml                # schema docker-dev/plugin/v1
├── image-install.sh          # opcional; build como root
├── bin/<nome>                # opcional; wrapper no container
├── host-bin/<nome>           # opcional; wrapper pelo direnv
├── commands/<nome>/
│   ├── command.yml
│   └── command.sh            # opcional
└── hooks/post-asdf.sh        # opcional; roda como dev
```

`plugin.yml` deve ter `name` igual ao nome da pasta e usar a modeline para
`schemas/plugin.schema.json`. Nomes de comandos são globais: colisões entre
núcleo, plugins e subplugins são recusadas. Para expor uma família de
subplugins, declare `plugins_path`; o setup usa `plugins.enabled` na raiz do
plugin pai por padrão ou `plugins_enabled_file` quando fornecido.

Regras importantes:

- `image-install.sh` roda como `root`, deve ser idempotente e não depende de
  `/workspace`, pois o bind mount ainda não existe durante o build.
- Hooks pós-asdf rodam como `dev`. Arquivos em `/opt/docker-dev/plugins` são do
  `root`; execute hooks com `bash "$hook"`, sem tentar `chmod` neles.
- Plugins não alteram o host. Mudanças de host pertencem ao setup do núcleo.

## Criar um subplugin

Subplugins ficam dentro de um plugin pai e são habilitados por
`plugins/<pai>/plugins.enabled` por padrão, ou no arquivo
declarado em `plugins_enabled_file`.

```text
plugins/trivy/adapters/<subplugin>/
├── plugin.yml                # schema docker-dev/subplugin/v1
├── bin/
├── host-bin/
└── commands/
```

Use subplugins para integrações específicas de ecossistema. Por exemplo,
`trivy/npm` implementa npm; novos suportes para pnpm, Yarn, pip ou uv devem ser
subplugins, nunca condicionais no núcleo.

## Ferramentas de host fixadas

Ferramentas usadas pelo kit no host devem ser declaradas em
`.docker-dev/internal/tools.lock.env`, com versão e SHA-256 por plataforma.
Esse arquivo é dado, não Shell: nunca faça `source` nele.

Ao adicionar uma ferramenta:

1. Fixe versão e checksums para Linux/macOS, AMD64/ARM64.
2. Implemente download e verificação em `lib/tools.sh`.
3. Guarde o binário em `internal/.cache/`, ignorado pelo Git.
4. Informe o download antes da confirmação do setup.
5. Remova o binário gerenciado em `teardown`.

`yq` é a referência atual. Ele é instalado somente após confirmação do setup e
antes de o runner interpretar fluxos YAML complexos.

## Segurança de dependências

Trivy é um plugin pai. Sua interface para adaptadores é:

```bash
docker-dev-trivy-gate scan-lock <lockfile>
docker-dev-trivy-gate scan-path <path>
```

Um adaptador de gerenciador de pacotes deve criar uma resolução temporária sem
scripts de pacote, chamar `scan-lock` e interromper a instalação real se o gate
retornar erro. Nunca instale antes de verificar.

## Portabilidade e permissões

O kit suporta Linux, macOS Intel/Apple Silicon e WSL 2. Evite comandos
exclusivos de GNU, UID/GID fixo, caminhos de host dentro da imagem e alterações
de permissões em arquivos root-owned dentro de `/opt` pelo usuário `dev`.

Volumes Docker guardam dados persistentes, incluindo asdf, home do
desenvolvedor, `node_modules` e caches. O Compose mapeia UID/GID do host para
evitar arquivos do checkout criados como `root`.

## Verificações

Antes de entregar uma alteração, execute verificações proporcionais:

```bash
find .docker-dev -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
./.docker-dev/dev.sh help
./.docker-dev/dev.sh help setup
```

Para alterar imagem, wrappers ou hooks, execute também:

```bash
./.docker-dev/dev.sh rebuild
```

Não execute `reset` ou `teardown` como teste casual: ambos removem recursos
persistentes. Verifique o alvo e tenha autorização antes de usá-los.
