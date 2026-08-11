# docker-dev

[![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FHASH3-dev%2Fdocker-dev%2Fmain%2Fpackage.json&query=%24.version&prefix=v&label=version)](https://github.com/HASH3-dev/docker-dev/blob/main/package.json)
[![latest release](https://img.shields.io/github/v/release/HASH3-dev/docker-dev?label=release)](https://github.com/HASH3-dev/docker-dev/releases)
[![platform](https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20wsl2-blue)](#requisitos)
[![license](https://img.shields.io/github/license/HASH3-dev/docker-dev)](./LICENSE)

`docker-dev` cria um ambiente de desenvolvimento reproduzível em Docker, sem
acoplar o projeto a uma linguagem específica. Ele instala os runtimes definidos
em `.tool-versions` com asdf, permite habilitar plugins recursivamente e mantém
o código-fonte montado em `/workspace`.

## Requisitos

- Linux ou macOS. No Windows, o suporte é somente via **WSL 2**
- Docker com o plugin Docker Compose (`docker compose`)
- Um executável `docker-dev` no `PATH` ou disponível por caminho absoluto

O `setup` configura o direnv no host quando necessário. Ele pede confirmação
antes de instalar o pacote, alterar o arquivo de inicialização do shell ou
criar o `.envrc` do projeto.

## Instalação

Na raiz do projeto que vai usar o `docker-dev`, execute:

```bash
curl -fsSL https://raw.githubusercontent.com/HASH3-dev/docker-dev/main/scripts/install.sh | bash
```

O script detecta o sistema operacional (Linux ou macOS) e a arquitetura,
baixa o binário da versão correta e o salva como `./docker-dev` no diretório
atual, adicionando-o ao `.gitignore`.

A versão baixada segue esta ordem de prioridade:

1. versão passada como argumento ao script;
2. versão já fixada em `.docker-dev-version`, se o arquivo existir;
3. versão mais recente publicada em `package.json` no repositório.

Ao usar um argumento ou ao resolver a versão a partir do repositório, o
script grava/atualiza `.docker-dev-version` no diretório atual — **versione
esse arquivo** para que todo o time instale sempre a mesma versão:

```bash
curl -fsSL https://raw.githubusercontent.com/HASH3-dev/docker-dev/main/scripts/install.sh | bash -s -- 0.2.0
```

No Windows, execute o comando acima dentro do WSL 2.

## Primeiro uso

No diretório raiz do projeto que receberá o ambiente:

```bash
docker-dev setup
```

O assistente:

1. cria/atualiza `.docker-dev`;
2. solicita as portas que serão expostas somente em `localhost`;
3. lê ou cria `.tool-versions` para os runtimes asdf;
4. oferece plugins e subplugins compatíveis com os runtimes e arquivos do projeto;
5. prepara o direnv, inicia o container e instala os runtimes selecionados.

Ao final, abra um novo terminal — ou aceite o terminal novo oferecido pelo
assistente — para carregar o direnv.

## Uso diário

```bash
# Abre uma shell no container de desenvolvimento.
docker-dev up

# Executa um comando no container.
docker-dev run git status

# Para o ambiente, preservando volumes.
docker-dev down

# Acompanha os logs.
docker-dev logs

# Recria a imagem e o container.
docker-dev rebuild

# Para o ambiente e remove os volumes do docker-dev.
docker-dev reset

# Remove a configuração e os recursos gerenciados pelo docker-dev.
docker-dev teardown
```

`shell` é um alias de `up`. Para iniciar também a infraestrutura Compose do
projeto, use:

```bash
docker-dev up --merge-compose
docker-dev up --merge-compose --merge-file compose.dev.yml
```

Quando os adaptadores de segurança do Trivy estiverem habilitados, comandos
como `bun`, `npm`, `pnpm`, `yarn` e `uv` também podem ser encaminhados pelo
`docker-dev` e executados no ambiente protegido.

## Configuração versionada

O diretório `.docker-dev` contém a configuração do ambiente. Em especial,
versione estes arquivos para que todos os desenvolvedores usem a mesma
composição:

- `ports.env` — portas publicadas;
- `plugins/plugins.enabled` e os `plugins.enabled` aninhados — plugins ativos;
- `.ports.generated.yml` e `.plugins.generated.yml` — composição efetiva
  produzida pela configuração selecionada.
- `custom-compose.yml` — sobrescritas e extensões Compose do projeto.

`custom-compose.yml` é aplicado por último e permite sobrescrever ou acrescentar
configurações ao serviço `dev` e aos demais recursos Compose. Ele começa com:

```yaml
services:
  dev: {}
```

Ao usar `--merge-compose --merge-file <arquivo>`, o arquivo informado é aplicado
depois de `custom-compose.yml` e, portanto, tem a maior precedência.

O link local `docker-dev` e `.docker-dev-state.json` são específicos da
instalação e permanecem no `.gitignore` criado pelo setup.

## Plugins

Plugins são declarados em `plugin.json` e podem conter subplugins. Um
adaptador pode declarar os runtimes que requer, arquivos usados para detecção e
recursos de container, como variáveis de ambiente e volumes nomeados. Assim,
por exemplo, o volume `node_modules` só existe quando um adaptador Node está
habilitado — a base continua independente de linguagem.

## Ajuda

Use a ajuda integrada para consultar argumentos e opções de cada comando:

```bash
docker-dev --help
docker-dev setup --help
docker-dev up --help
```

## Contribuindo

Para arquitetura, fluxo de desenvolvimento, testes e como criar ou alterar
plugins, consulte o [guia de contribuição](./CONTRIBUTING.md).
