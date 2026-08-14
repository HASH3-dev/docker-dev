#!/usr/bin/env bash
set -euo pipefail

readonly plugin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://downloads.1password.com/linux/keys/1password.asc \
  | gpg --dearmor -o /etc/apt/keyrings/1password-archive-keyring.gpg
echo 'deb [arch=amd64,arm64 signed-by=/etc/apt/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' \
  > /etc/apt/sources.list.d/1password.list
apt-get update
apt-get install -y --no-install-recommends 1password-cli
rm -rf /var/lib/apt/lists/*

chmod 0755 "$plugin_dir/bin/docker-dev-secrets"
ln -sfn "$plugin_dir/bin/docker-dev-secrets" /usr/local/bin/docker-dev-secrets
