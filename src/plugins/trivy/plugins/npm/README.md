# trivy/npm

Fornece a integração npm: wrapper no container, wrapper de host via direnv e
sincronização de dependências. O wrapper resolve uma instalação em diretório
temporário e chama `docker-dev-trivy-gate scan-lock` antes da instalação real.
Assim, o adaptador não depende da implementação nem das opções do Trivy.

Também fornece:

```bash
./.docker-dev/dev.sh npm . install pacote
./.docker-dev/dev.sh install
```
