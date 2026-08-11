#!/usr/bin/env bash
set -euo pipefail

readonly plugin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key \
  | gpg --dearmor -o /usr/share/keyrings/trivy.gpg
echo 'deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main' \
  > /etc/apt/sources.list.d/trivy.list
apt-get update
apt-get install -y --no-install-recommends trivy
rm -rf /var/lib/apt/lists/*

# This is the Trivy plugin's stable adapter contract. Adapters invoke it during
# dependency installation, so the plugin owns exposing it on the image PATH.
chmod 0755 "$plugin_dir/bin/docker-dev-trivy-gate"
ln -sfn "$plugin_dir/bin/docker-dev-trivy-gate" /usr/local/bin/docker-dev-trivy-gate
