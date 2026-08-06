ARG ASDF_VERSION=v0.20.0

# Build the official asdf CLI from source so the image works on both AMD64 and
# ARM64 (Linux, WSL and Docker Desktop on Apple Silicon).
FROM golang:1.26.3-bookworm AS asdf-builder
ARG ASDF_VERSION
RUN go install github.com/asdf-vm/asdf/cmd/asdf@${ASDF_VERSION}

FROM debian:bookworm-slim

COPY --from=asdf-builder /go/bin/asdf /usr/local/bin/asdf

RUN apt-get update \
    && apt-get install -y --no-install-recommends apt-transport-https bash ca-certificates curl dirmngr gawk git gnupg gosu lsb-release tini wget \
    && rm -rf /var/lib/apt/lists/*

ARG DOCKER_DEV_PLUGINS=""
COPY plugins/ /opt/docker-dev/plugins/
COPY internal/plugin-runner.sh /usr/local/bin/docker-dev-plugin-runner
RUN chmod 0755 /usr/local/bin/docker-dev-plugin-runner \
    && docker-dev-plugin-runner image-install "$DOCKER_DEV_PLUGINS"

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint
RUN chmod 0755 /usr/local/bin/docker-entrypoint \
    && mkdir -p /workspace/node_modules /npm-cache /home/dev /asdf \
    && chown -R 1000:1000 /workspace/node_modules /npm-cache /home/dev /asdf

# /asdf is a named volume. Plugins, installed runtimes and shims therefore
# survive container recreation; /home/dev persists global asdf configuration.
ENV ASDF_DATA_DIR=/asdf
ENV PATH=/usr/local/bin:/asdf/shims:${PATH}

WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint"]
CMD ["sleep", "infinity"]
