# 1Password

Resolve `op://` references only for an explicit process. Application secrets never enter shell environment or files.

Enable `1password` in `docker-dev setup`. Setup installs 1Password CLI in development image but never asks for credentials. First interactive `docker-dev secrets` configures account with `op account add` and authenticates with `op signin`. Later calls reuse session; expired session prompts for sign-in again.

1Password CLI account and session state persists at `/home/dev` in docker-dev's `dev_home` volume. `docker-dev reset` removes volume, so next secrets command requires sign-in again. Existing `.docker-dev/plugins/1password/service-account.json` files are obsolete and can be deleted.

Use env file inside project:

```sh
docker-dev secrets --env-file ./.env -- npm start
docker-dev secrets --env-file apps/api/.env -- go run .
```

`docker-dev run` does not load secrets. `op run` resolves references per invocation and passes them only to target command and child processes. If authentication is needed, run `docker-dev secrets` from an interactive terminal.
