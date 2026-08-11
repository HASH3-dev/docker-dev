#!/usr/bin/env bash
set -euo pipefail

# The bind mount must be written using the host user's numeric identity; this
# avoids root-owned files when tools inside the container generate artifacts.
readonly APP_UID="${LOCAL_UID:-1000}"
readonly APP_GID="${LOCAL_GID:-1000}"
readonly WRITABLE_DIRECTORIES="${DOCKER_DEV_WRITABLE_DIRECTORIES:-}"

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

mkdir -p /home/dev /asdf
chown -R "${APP_UID}:${APP_GID}" /home/dev /asdf

# Named volumes are initialized by Docker as root. The generated Compose
# override lists only writable destinations contributed by enabled plugins.
if [[ -n "$WRITABLE_DIRECTORIES" ]]; then
  IFS=':' read -r -a writable_directories <<< "$WRITABLE_DIRECTORIES"

  for directory in "${writable_directories[@]}"; do
    [[ "$directory" == /* ]] || {
      echo "docker-dev received an invalid writable directory: $directory" >&2
      exit 1
    }

    mkdir -p "$directory"
    chown -R "${APP_UID}:${APP_GID}" "$directory"
  done
fi

export HOME=/home/dev
exec gosu "${APP_UID}:${APP_GID}" "$@"
