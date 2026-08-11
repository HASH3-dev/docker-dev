#!/usr/bin/env bash
set -euo pipefail

readonly adapter_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly destination='/usr/local/bin/pnpm'

[[ ! -e "$destination" || -L "$destination" ]] || { echo 'Trivy pnpm adapter cannot replace base pnpm.' >&2; exit 1; }
ln -sfn "$adapter_dir/bin/pnpm" "$destination"
