# Ambiente de desenvolvimento em Docker

Use este kit para trabalhar em um container Docker sem abrir o projeto como
Dev Container no VS Code. O editor, extensões, autenticações e históricos de IA
continuam no host; somente o terminal e as ferramentas de desenvolvimento rodam
no container.

> Compatível com Linux, macOS (Intel e Apple Silicon) e Windows via WSL 2.
> No Windows, execute os comandos dentro da distribuição WSL, com a integração
> do Docker Desktop habilitada — não no PowerShell nativo.

O diretório `.docker-dev` é portátil: copie-o para a raiz de outro projeto e
execute os mesmos comandos.

## Começo rápido

Na raiz do projeto, execute:

```bash
./.docker-dev/dev.sh setup
```

O setup pede confirmação antes de alterar o host. Ele pode:

- instalar e configurar o `direnv`;
- perguntar as portas usadas pela aplicação;
- criar `.tool-versions` se ele ainda não existir;
- baixar ferramentas internas verificadas;
- construir o ambiente Docker.

No fim, pressione qualquer tecla. O terminal é substituído por uma shell nova,
com direnv e os wrappers do ambiente carregados.

Depois, abra ou reutilize o ambiente com:

```bash
./.docker-dev/dev.sh up
```

O comando abre um terminal dentro do container. A aplicação não é iniciada
automaticamente: execute nela o comando apropriado, por exemplo `npm run dev`,
`python -m ...`, testes ou migrations.

## Requisitos

- Docker Engine ou Docker Desktop;
- Docker Compose v2;
- Linux, macOS Intel/Apple Silicon, ou Windows com WSL 2 e integração do Docker
  Desktop com a distribuição WSL;
- no macOS, Homebrew caso o setup precise instalar direnv.

No Windows, execute os comandos no terminal WSL ou VS Code Remote - WSL, não no
PowerShell nativo.

## Comandos do dia a dia

```bash
./.docker-dev/dev.sh help                 # lista os comandos disponíveis
./.docker-dev/dev.sh up                   # abre uma shell no container
./.docker-dev/dev.sh shell                # alias de up
./.docker-dev/dev.sh run <comando>        # executa um comando no container
./.docker-dev/dev.sh down                 # para o ambiente, preservando caches
./.docker-dev/dev.sh rebuild              # recria imagem e container
./.docker-dev/dev.sh logs                 # acompanha logs do container
```

Para ver a ajuda detalhada de qualquer comando:

```bash
./.docker-dev/dev.sh help up
```

Se `up` encontrar o container já em execução, ele só anexa um novo terminal.

## Portas da aplicação

Durante o setup, informe as portas que deseja acessar no host. O padrão é
`3000,3001`; separe portas adicionais por vírgula:

```text
3000,3001,5173
```

Para publicar uma porta interna em outra porta do host, edite
`.docker-dev/ports.env`:

```dotenv
DOCKER_DEV_PORTS=3000,3002:3001,5173
```

Depois execute:

```bash
./.docker-dev/dev.sh rebuild
```

## Linguagens e runtimes

O ambiente usa asdf e não fixa uma linguagem na imagem. Se a raiz do projeto já
tiver `.tool-versions`, o setup instala as versões declaradas. Caso contrário,
ele pergunta quais linguagens e versões o projeto usa e cria o arquivo.

Para adicionar uma linguagem depois, entre no container e use asdf normalmente:

```bash
asdf plugin add python
asdf install python 3.13.1
asdf set python 3.13.1
```

Runtimes e caches sobrevivem a `down`, `up` e `rebuild`.

## Dependências com verificação de segurança

Quando o plugin Trivy e os adaptadores npm, Yarn, pnpm e uv estão habilitados,
instalações de dependências são verificadas antes de ocorrerem. Uma
vulnerabilidade na severidade configurada bloqueia a instalação.

No terminal do container, use npm, Yarn, pnpm ou uv normalmente:

```bash
npm install pacote
yarn add pacote
pnpm add pacote
uv add pacote
```

No terminal do host, após o setup e com direnv ativo, o wrapper também funciona:

```bash
npm install pacote
yarn add pacote
pnpm add pacote
uv add pacote
```

Também é possível chamar o wrapper explicitamente:

```bash
./.docker-dev/dev.sh npm . install pacote
./.docker-dev/dev.sh install
./.docker-dev/dev.sh yarn . add pacote
./.docker-dev/dev.sh pnpm . add pacote
./.docker-dev/dev.sh uv . add fastapi
```

O gate trata vulnerabilidades conhecidas; ele não substitui revisão de código ou
uma análise de malware/comportamento de scripts de pacote.

## Usar a infraestrutura do projeto

`up` inicia somente o ambiente de desenvolvimento. Se o projeto possuir banco,
cache, fila ou outros serviços em Docker Compose, una-os explicitamente:

```bash
./.docker-dev/dev.sh up --merge-compose
```

Sem `--file`, o kit procura um Compose convencional na raiz do projeto. Para
informar outro arquivo:

```bash
./.docker-dev/dev.sh up --merge-compose --file caminho/compose.yml
```

## Limpar ou remover o ambiente

```bash
./.docker-dev/dev.sh reset       # remove volumes, runtimes e caches do ambiente
./.docker-dev/dev.sh teardown    # desfaz a configuração gerenciada do projeto
```

`reset` remove os volumes do ambiente, mas mantém a configuração do projeto.
`teardown` faz tudo que o reset faz para o kit — para/remove o container, imagem,
rede, volumes, runtimes e caches — e também remove o symlink `.envrc`, a regra
gerenciada no `.gitignore`, o `yq` cacheado e, quando aplicável, o
`.tool-versions` criado pelo setup. Ele preserva somente a pasta `.docker-dev`,
o direnv instalado no host e serviços externos iniciados pelo Compose do projeto.

## Problemas comuns

### Porta já em uso

Altere o mapeamento em `.docker-dev/ports.env`, por exemplo `3002:3001`, e rode
`./.docker-dev/dev.sh rebuild`.

### O wrapper do npm não apareceu no host

Abra um terminal novo no projeto ou execute `direnv reload`. Confirme também que
o direnv está instalado e autorizado pelo setup.

### Runtime não foi encontrado

Confira `.tool-versions` na raiz do projeto e execute `./.docker-dev/dev.sh
rebuild`. Dentro do container, `asdf install` também instala manualmente as
versões declaradas.

### Mudou Dockerfile, plugins ou portas

Execute:

```bash
./.docker-dev/dev.sh rebuild
```

## Para manter ou estender o kit

Este README é um guia de uso. Para criar comandos, plugins, adaptadores, schemas
ou alterar o funcionamento interno, consulte [CONTRIBUTE.md](CONTRIBUTE.md).
