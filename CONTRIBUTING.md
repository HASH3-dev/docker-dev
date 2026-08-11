# Contribuindo com docker-dev

Obrigado por contribuir. O `docker-dev` é uma CLI Bun/TypeScript compilada em
um executável. O objetivo é manter o núcleo agnóstico de linguagem e transferir
comportamentos específicos para plugins declarativos.

## Ambiente de desenvolvimento

Use Bun 1.3 ou posterior:

```bash
bun install
bun run check
bun test
```

Antes de enviar uma alteração, execute:

```bash
bun run check
bun test
bun run build
```

Para verificar os artefatos de distribuição:

```bash
bun run build:all
```

O versionamento é automático via [release-please](https://github.com/googleapis/release-please):
commits `feat:`/`fix:`/etc mergeados na `main` alimentam um PR
`chore(main): release X.Y.Z` que mantém `package.json`, `CHANGELOG.md` e a
tag em dia. Basta revisar e mergear esse PR — a tag dispara o build e a
publicação da release no GitHub. Não atualize a versão manualmente.

Os binários são escritos em `dist/`; dependências, o diretório `dist/` e os
assets incorporados em `.generated/` não devem ser versionados.

## Estrutura do projeto

```text
src/
├── assets/     Arquivos materializados em .docker-dev do projeto do usuário
├── commands/   Manifests JSON e handlers específicos dos comandos centrais
├── internal/   Orquestração interna, registro de comandos e gestão de plugins
├── lib/        Serviços reutilizáveis: Compose, host, asdf, processos e portas
├── plugins/    Plugins incorporados, incluindo comandos e assets próprios
└── schemas/    JSON Schemas e validação Ajv dos manifests
```

`src/index.ts` registra os manifests e despacha os comandos. A maior parte da
orquestração deve permanecer declarativa em `command.json`; use `command.ts`
apenas quando o comando tiver comportamento próprio que não pertença a
`src/internal` ou `src/lib`.

Os aliases TypeScript disponíveis são:

```ts
import { compose } from "@lib/compose";
import { planPlugins, prunePlugins } from "@internal/plugins";
```

## Comandos

Cada comando fica em `src/commands/<nome>/command.json`. O schema aceita:

- `name`, `summary` e `help`;
- `args` para a sintaxe de argumentos exibida na ajuda;
- `options` para opções do Commander;
- `steps` declarando chamadas registradas no `ActionRegistry`.

Mantenha o texto de `help` orientado ao usuário e descreva efeitos relevantes,
especialmente alterações no host, volumes e remoção de recursos.

Comandos de núcleo e de plugins são descobertos automaticamente por
`scripts/generate-command-registry.ts`, que varre `command.json` em
`src/commands` e `src/plugins` e gera `.generated/command-registry.ts`. Não
há registro manual: basta criar a pasta `commands/<nome>/command.json` (com
`command.ts` opcional) no local correspondente.

## Assets e atualização

Os arquivos em `src/assets` são incorporados ao executável por
`scripts/generate-embedded-assets.ts`. Rode `bun run generate` quando
precisar inspecionar a saída de assets e comandos; `check` e `build` já a
executam automaticamente.

`materializeAssets` protege alterações locais em arquivos gerenciados usando
`.docker-dev-state.json`. Não altere esse estado manualmente nem o use como
configuração do projeto.

`ports.env`, os arquivos `plugins.enabled` e `custom-compose.yml` são
configuração do projeto: a materialização os preserva durante atualizações. O
template de `custom-compose.yml` é aplicado após a base, plugins e portas; um
`--merge-file` explícito tem precedência ainda maior.

## Setup: coleta em memória, aplicação atômica

`docker-dev setup` (`src/commands/setup/command.ts`) é dividido em duas fases
e essa separação deve ser preservada em qualquer mudança no fluxo:

- **Coleta** — `planPorts`, `planToolVersions` e `planVersionFile`
  (`src/commands/setup/plan.ts`) e `planPlugins`
  (`src/internal/plugins.ts`) só leem o disco e fazem prompts; nada é escrito.
  Cada uma delas é idempotente: se a configuração já existir e for válida
  (`ports.env`, `.tool-versions`, `plugins.enabled` em cada nível,
  `.docker-dev-version`), o valor existente é reaproveitado sem reabrir o
  prompt.
- **Aplicação** — de posse do plano completo, `materializeAssets` recebe um
  `AssetPlan` (`{ ports, pluginSelections }`) e escreve `.docker-dev` inteiro
  numa única troca atômica (`.docker-dev.next` → `rename`), já com portas e
  seleção de plugins aplicadas e podadas. `.tool-versions` e
  `.docker-dev-version` são gravados na sequência, também na fase de
  aplicação.

Não adicione `writeFile`/`mkdir` a uma função de "plan": se um prompt for
cancelado (Ctrl+C) durante a coleta, nenhum arquivo deve ter sido criado ou
alterado no projeto do usuário. `configurePlugins`/`configureLevel` (que
escreviam durante o prompt) não existem mais — a leitura de manifests durante
a coleta usa `embeddedPluginManifests`, que lê os plugins embutidos no
executável (`.generated/embedded-assets`) em memória, sem depender de
`.docker-dev` já materializado.

Comandos não-interativos que reaplicam assets (ex.: `rebuild`, via a ação
`refreshAssets`) continuam chamando `materializeAssets` sem `AssetPlan` — nesse
modo o comportamento é o mesmo de antes: copia `ports.env`/`plugins.enabled`
existentes e a poda é feita depois por `prunePlugins`.

## Plugins

Um plugin é uma pasta em `src/plugins` com `plugin.json`. Seus manifests são
validados pelo JSON Schema em `src/schemas/plugin.schema.json`; atualize também
o tipo em `src/schemas/manifest.ts` sempre que expandir o schema.

Durante o `setup`, a seleção de plugins (`planPlugins`) lê os manifests a
partir de `.generated/embedded-assets` em memória (`embeddedPluginManifests`),
não do `.docker-dev` do projeto de teste. Depois de criar ou alterar um
`plugin.json`, rode `bun run generate` (ou `bun run assets:generate`) antes de
testar o `setup` localmente, senão o plugin novo/alterado não aparece no
seletor.

Exemplo reduzido:

```json
{
  "$schema": "../../schemas/plugin.schema.json",
  "name": "example",
  "kind": "tool-adapter",
  "summary": "Adds an example tool.",
  "requiresRuntimes": ["python"],
  "detect": {
    "files": ["pyproject.toml"]
  },
  "container": {
    "environment": {
      "EXAMPLE_CACHE": "/example-cache"
    },
    "volumes": [
      {
        "name": "example_cache",
        "target": "/example-cache"
      }
    ]
  }
}
```

Princípios importantes:

- Declare recursos específicos de linguagem no plugin, nunca no Compose ou
  Dockerfile base.
- `requiresRuntimes` controla se o plugin aparece no seletor do setup.
- `detect.files` permite pré-selecionar plugins compatíveis com o projeto.
- `container.environment` e `container.volumes` são combinados em
  `.plugins.generated.yml`; não declare valores ou destinos conflitantes.
- Mantenha código de comandos no executável; os assets copiados para o projeto
  devem conter somente o necessário para executar o plugin no host ou imagem.

### Convenções fixas (sem configuração)

Estes nomes são convenção do ecossistema e não podem ser customizados no
manifest:

- Subplugins ficam em uma pasta `plugins/` dentro do plugin pai — sua simples
  existência habilita a recursão. A seleção correspondente fica em
  `plugins/plugins.enabled`.
- O script de instalação na imagem, se existir, sempre se chama
  `image-install.sh` na raiz do plugin.
- Comandos de um plugin ficam em `commands/<nome>/command.json` (+
  `command.ts` opcional), no mesmo padrão de `src/commands`.

Ao modificar um plugin, verifique tanto o fluxo de seleção quanto a geração do
Compose. Adicione testes para regras de seleção, conflitos ou recursos de
container novos.

## Testes

Os testes ficam em `tests/` e usam `bun:test`. Prefira testes unitários que
criam um projeto temporário em `/tmp`, sem depender de Docker. Para mudanças em
Compose, valide a composição gerada e os conflitos antes de depender de um
teste de integração com daemon Docker.

## Estilo e escopo

- Use TypeScript formatado com Prettier.
- Preserve JSON indentado e os `$schema` relativos em todos os manifests.
- Não reintroduza YAML para manifests de comandos ou plugins.
- Não adicione dependências específicas de linguagem à imagem base.
- Evite alterações não relacionadas e não modifique arquivos gerados à mão.
