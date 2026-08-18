#!/usr/bin/env bash
set -euo pipefail

# Semgrep ships no standalone Linux binary release; pipx keeps it isolated
# from any Python runtime the project may install later via asdf.
readonly semgrep_version='1.173.0'
readonly pipx_home='/opt/docker-dev/pipx'

apt-get update
apt-get install -y --no-install-recommends pipx
rm -rf /var/lib/apt/lists/*

PIPX_HOME="$pipx_home" PIPX_BIN_DIR=/usr/local/bin pipx install "semgrep==${semgrep_version}"
mkdir -p /home/dev/.semgrep
chown -R 1000:1000 /home/dev/.semgrep
semgrep --version
