# trivy/uv

Fornece `uv` no container e um wrapper no host via direnv. Antes de `uv add`,
`uv lock` e `uv sync`, ele gera uma resolução temporária e escaneia `uv.lock`
com Trivy. Instalações diretas simples com `uv pip install` e `uv tool install`
também são resolvidas em um projeto temporário antes da instalação real.

Use normalmente:

```bash
uv add fastapi
uv sync
```

Ou chame explicitamente pelo host:

```bash
./.docker-dev/dev.sh uv . add fastapi
```

Instalações diretas com opções (por exemplo, `uv pip install -r requirements.txt`)
não são aceitas pelo wrapper, pois não produzem uma resolução segura e inequívoca.
Use `uv add` para dependências de projeto.
