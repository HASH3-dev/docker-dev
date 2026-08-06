#!/usr/bin/env bash
set -euo pipefail

# Keep uv outside /usr/local/bin because that path is reserved for the mandatory
# docker-dev wrapper. The version is fixed so rebuilds are reproducible.
readonly uv_version='0.11.16'
readonly uv_install_dir='/opt/docker-dev/uv/bin'
readonly installer_file='/tmp/uv-installer.sh'

curl --fail --location --silent --show-error \
  "https://releases.astral.sh/github/uv/releases/download/${uv_version}/uv-installer.sh" \
  --output "$installer_file"
UV_INSTALL_DIR="$uv_install_dir" UV_NO_MODIFY_PATH=1 sh "$installer_file"
rm -f "$installer_file"
"$uv_install_dir/uv" --version
