#!/usr/bin/env bash
set -euo pipefail

readonly adapter_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly destination='/usr/local/bin/bun'

[[ ! -e "$destination" || -L "$destination" ]] || { echo 'Trivy Bun adapter cannot replace base Bun.' >&2; exit 1; }
ln -sfn "$adapter_dir/bin/bun" "$destination"
