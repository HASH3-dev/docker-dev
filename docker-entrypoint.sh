#!/usr/bin/env bash
set -euo pipefail

# The bind mount must be written using the host user's numeric identity; this
# avoids root-owned files when tools inside the container generate artifacts.
readonly APP_UID="${LOCAL_UID:-1000}"
readonly APP_GID="${LOCAL_GID:-1000}"

if ! getent group "${APP_GID}" >/dev/null; then
  groupadd --gid "${APP_GID}" docker-dev
fi

if ! getent passwd "${APP_UID}" >/dev/null; then
  useradd \
    --uid "${APP_UID}" \
    --gid "${APP_GID}" \
    --home-dir /home/dev \
    --shell /bin/bash \
    --no-create-home \
    docker-dev
fi

mkdir -p /workspace/node_modules /npm-cache /home/dev /asdf
chown -R "${APP_UID}:${APP_GID}" /workspace/node_modules /npm-cache /home/dev /asdf

export HOME=/home/dev
exec gosu "${APP_UID}:${APP_GID}" "$@"
