# docker-dev

`docker-dev` cria um ambiente de desenvolvimento reproduzível em Docker, sem
acoplar o projeto a uma linguagem específica. Ele instala os runtimes definidos
em `.tool-versions` com asdf, permite habilitar plugins recursivamente e mantém
o código-fonte montado em `/workspace`.

## Requisitos

- Docker com o plugin Docker Compose (`docker compose`)
- Um executável `docker-dev` no `PATH` ou disponível por caminho absoluto

O `setup` configura o direnv no host quando necessário. Ele pede confirmação
antes de instalar o pacote, alterar o arquivo de inicialização do shell ou
criar o `.envrc` do projeto.

## Instalação

Baixe o binário correspondente ao seu sistema na pasta `dist/` de uma release
ou gere-o a partir do código-fonte:

```bash
bun install
bun run build
```

Depois, disponibilize `dist/docker-dev` no seu `PATH` ou execute-o diretamente.
Os binários multiplataforma podem ser gerados com `bun run build:all`.

## Publicar uma versão

Com a árvore Git limpa e o remoto `origin` configurado, execute:

```bash
bun run release
```

O comando mostra a versão atual, solicita a nova versão SemVer, atualiza
`package.json`, cria o commit de release, cria a tag anotada `v<versão>` e envia
o commit e a tag ao GitHub. A tag aciona o workflow de release, que anexa os
binários à GitHub Release.

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
como `npm`, `pnpm`, `yarn` e `uv` também podem ser encaminhados pelo
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
