#!/usr/bin/env bash
set -euo pipefail

readonly plugin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly arch="$(dpkg --print-architecture)"

case "$arch" in
  amd64 | arm64) ;;
  *)
    echo "Unsupported architecture for 1password-cli: $arch" >&2
    exit 1
    ;;
esac

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://downloads.1password.com/linux/keys/1password.asc \
  | gpg --dearmor -o /etc/apt/keyrings/1password-archive-keyring.gpg
echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/${arch} stable main" \
  > /etc/apt/sources.list.d/1password.list
apt-get update
apt-get install -y --no-install-recommends 1password-cli
rm -rf /var/lib/apt/lists/*

chmod 0755 "$plugin_dir/bin/docker-dev-secrets"
ln -sfn "$plugin_dir/bin/docker-dev-secrets" /usr/local/bin/docker-dev-secrets
