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

Para publicar uma versão, use `bun run release`. O script exige uma árvore Git
limpa e um remoto `origin`, pergunta a nova versão SemVer e só então cria o
commit, a tag anotada e o push. Não atualize a versão manualmente ao preparar
uma release regular.

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
import { prunePlugins } from "@internal/plugins";
```

## Comandos

Cada comando fica em `src/commands/<nome>/command.json`. O schema aceita:

- `name`, `summary` e `help`;
- `args` para a sintaxe de argumentos exibida na ajuda;
- `options` para opções do Commander;
- `steps` declarando chamadas registradas no `ActionRegistry`.

Mantenha o texto de `help` orientado ao usuário e descreva efeitos relevantes,
especialmente alterações no host, volumes e remoção de recursos.

## Assets e atualização

Os arquivos em `src/assets` são incorporados ao executável por
`scripts/generate-embedded-assets.ts`. Rode `bun run assets:generate` quando
precisar inspecionar a saída; `check` e `build` já a executam automaticamente.

`materializeAssets` protege alterações locais em arquivos gerenciados usando
`.docker-dev-state.json`. Não altere esse estado manualmente nem o use como
configuração do projeto.

`ports.env`, os arquivos `plugins.enabled` e `custom-compose.yml` são
configuração do projeto: a materialização os preserva durante atualizações. O
template de `custom-compose.yml` é aplicado após a base, plugins e portas; um
`--merge-file` explícito tem precedência ainda maior.

## Plugins

Um plugin é uma pasta em `src/plugins` com `plugin.json`. Seus manifests são
validados pelo JSON Schema em `src/schemas/plugin.schema.json`; atualize também
o tipo em `src/schemas/manifest.ts` sempre que expandir o schema.

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
- Use `plugins.directory` para habilitar subplugins de forma recursiva.
- Mantenha código de comandos no executável; os assets copiados para o projeto
  devem conter somente o necessário para executar o plugin no host ou imagem.

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
