# Changelog

## [0.8.2](https://github.com/HASH3-dev/docker-dev/compare/v0.8.1...v0.8.2) (2026-08-18)


### Bug Fixes

* write release changelog content ([31671ae](https://github.com/HASH3-dev/docker-dev/commit/31671aeb0ed7e8adff49961009cc96e2c577deb8))

## [0.7.0](https://github.com/HASH3-dev/docker-dev/compare/v0.6.0...v0.7.0) (2026-08-17)


### 🚀 Features

* add 1password secrets plugin ([5fb9931](https://github.com/HASH3-dev/docker-dev/commit/5fb9931406488b80c7f5b8bdbfbe24f4ec8d6200))
* add 1password secrets plugin ([36da246](https://github.com/HASH3-dev/docker-dev/commit/36da246d30f50c16767994d76738ec4a516f09e9))
* add 1password secrets plugin ([6584638](https://github.com/HASH3-dev/docker-dev/commit/6584638e957ae82589986def0d7f18df087ccc0a))
* add 1password secrets plugin ([3dcbb3c](https://github.com/HASH3-dev/docker-dev/commit/3dcbb3c2366137e42f5e8c5de60aace1846d6a0a))
* add forced setup reconfiguration ([683480b](https://github.com/HASH3-dev/docker-dev/commit/683480b70e190ad83d5b900d1331ef27722884b1))
* add forced setup reconfiguration ([a8c792f](https://github.com/HASH3-dev/docker-dev/commit/a8c792f279e360c5ad82393022b7a3d359601ef1))
* add plugin output manifest property with read/write helpers ([b4b3e2d](https://github.com/HASH3-dev/docker-dev/commit/b4b3e2dceb4b57ff904f61daa4f470c3f97742ec))
* add plugin output manifest property with read/write helpers ([d3b3fc7](https://github.com/HASH3-dev/docker-dev/commit/d3b3fc70123faf0c750e032a994f8dd41a854c86))
* add plugin output manifest property with read/write helpers ([e38b25a](https://github.com/HASH3-dev/docker-dev/commit/e38b25af139c0aae8f8aeb2c2fba3e3a9a7dba08))
* add plugin output manifest property with read/write helpers ([6d671ff](https://github.com/HASH3-dev/docker-dev/commit/6d671ffdae472f1d364510b819e374137de6f8c4))
* add project version updater ([042fccb](https://github.com/HASH3-dev/docker-dev/commit/042fccb23609a5c7d48f931db2ed2fe909405f18))
* add project version updater ([cfdbccb](https://github.com/HASH3-dev/docker-dev/commit/cfdbccb31709ecbfb2be00931377c56ae0b142dc))
* add reports dashboard ([ba1459d](https://github.com/HASH3-dev/docker-dev/commit/ba1459d4c0cce8f11d31a9e26311dcc5b2e9d5ba))
* namespace plugin commands ([cc6fc4d](https://github.com/HASH3-dev/docker-dev/commit/cc6fc4d1bb8e9974087d40f82476765005f00702))
* **plugins:** add Bearer scanner ([d23aa7a](https://github.com/HASH3-dev/docker-dev/commit/d23aa7a9c024bbbbed34b1bab7bda7c781439855))
* **plugins:** add Bearer scanner ([66d0599](https://github.com/HASH3-dev/docker-dev/commit/66d05994181b86e1d42fee9834aac832aaa2a407))
* **plugins:** add Gitleaks scanner ([3487e5b](https://github.com/HASH3-dev/docker-dev/commit/3487e5b1ec9e3b98863c3f4520325a8558f2fb28))
* **plugins:** add Gitleaks scanner ([e54b1ef](https://github.com/HASH3-dev/docker-dev/commit/e54b1efa0944cad72569a5ce22b05c23e8257915))
* **plugins:** add Semgrep scanner ([9eb2456](https://github.com/HASH3-dev/docker-dev/commit/9eb2456b99e4341311e9b3a8fee8acd3e18a77a6))
* **plugins:** add Semgrep scanner ([293ab86](https://github.com/HASH3-dev/docker-dev/commit/293ab86d9741b120d00a335cd7d5ed86de4266e2))


### 🐛 Bug Fixes

* adopt tracked docker-dev assets ([62dcf4a](https://github.com/HASH3-dev/docker-dev/commit/62dcf4a62694727288659d9b1526b298f1da10b8))
* adopt tracked docker-dev assets ([6b94e98](https://github.com/HASH3-dev/docker-dev/commit/6b94e98ed32f4f45abc2a18a00ea35c02bd165b6))
* guard 1password wrapper login ([374d8f7](https://github.com/HASH3-dev/docker-dev/commit/374d8f73f30a25073e3d32d524cd6aea37e1913b))
* guard 1password wrapper login ([6728d21](https://github.com/HASH3-dev/docker-dev/commit/6728d21889d06d37623863950128e07f371accc7))
* match release-please tag format to publish-release workflow ([c45b05b](https://github.com/HASH3-dev/docker-dev/commit/c45b05b75a38bde1021e87326a7e01ee44827212))
* preserve ports.env when refreshing assets outside setup ([7f86a58](https://github.com/HASH3-dev/docker-dev/commit/7f86a584932b8d49cfb77a13cbb389391979aecd))
* reject unknown options for fixed commands ([0344580](https://github.com/HASH3-dev/docker-dev/commit/03445806f2beff93faadb4ed1dd05bb30a642cae))
* repair plugin namespace merge ([bf196e2](https://github.com/HASH3-dev/docker-dev/commit/bf196e2e4904108e7a683dd549ed39c177b959ba))
* restore bun trivy config accidentally reverted in previous commit ([d2bad3e](https://github.com/HASH3-dev/docker-dev/commit/d2bad3e5782ae1c99c55815cf24bf07269cf3764))

## [0.6.0](https://github.com/HASH3-dev/docker-dev/compare/docker-dev-v0.5.0...docker-dev-v0.6.0) (2026-08-12)


### 🚀 Features

* add bun trivy plugin ([#5](https://github.com/HASH3-dev/docker-dev/issues/5)) ([42e791e](https://github.com/HASH3-dev/docker-dev/commit/42e791e5e441980198b423353f1a6bf87e1fb15f))


### 🐛 Bug Fixes

* always run compose up so --merge-compose applies on subsequent up ([89d9aa2](https://github.com/HASH3-dev/docker-dev/commit/89d9aa2f793662d6bb89c3f425976811848e2367))
* avoid nested setup shells ([a51e61b](https://github.com/HASH3-dev/docker-dev/commit/a51e61ba977f6feaf7867bb7f1b9f284dc30e636))

## [0.5.0](https://github.com/HASH3-dev/docker-dev/compare/docker-dev-v0.4.0...docker-dev-v0.5.0) (2026-08-12)


### 🚀 Features

* add bun trivy plugin ([#5](https://github.com/HASH3-dev/docker-dev/issues/5)) ([42e791e](https://github.com/HASH3-dev/docker-dev/commit/42e791e5e441980198b423353f1a6bf87e1fb15f))


### 🐛 Bug Fixes

* avoid nested setup shells ([a51e61b](https://github.com/HASH3-dev/docker-dev/commit/a51e61ba977f6feaf7867bb7f1b9f284dc30e636))

## [0.4.0](https://github.com/HASH3-dev/docker-dev/compare/docker-dev-v0.3.1...docker-dev-v0.4.0) (2026-08-12)


### 🚀 Features

* add bun trivy plugin ([#5](https://github.com/HASH3-dev/docker-dev/issues/5)) ([42e791e](https://github.com/HASH3-dev/docker-dev/commit/42e791e5e441980198b423353f1a6bf87e1fb15f))


### 🐛 Bug Fixes

* avoid nested setup shells ([a51e61b](https://github.com/HASH3-dev/docker-dev/commit/a51e61ba977f6feaf7867bb7f1b9f284dc30e636))

## [0.3.1](https://github.com/HASH3-dev/docker-dev/compare/docker-dev-v0.3.0...docker-dev-v0.3.1) (2026-08-12)


### 🐛 Bug Fixes

* avoid nested setup shells ([a51e61b](https://github.com/HASH3-dev/docker-dev/commit/a51e61ba977f6feaf7867bb7f1b9f284dc30e636))

## [0.3.0](https://github.com/HASH3-dev/docker-dev/compare/docker-dev-v0.2.0...docker-dev-v0.3.0) (2026-08-12)


### 🚀 Features

* add bun trivy plugin ([#5](https://github.com/HASH3-dev/docker-dev/issues/5)) ([42e791e](https://github.com/HASH3-dev/docker-dev/commit/42e791e5e441980198b423353f1a6bf87e1fb15f))
