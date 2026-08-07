#!/usr/bin/env bash
set -euo pipefail

readonly adapter_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly destination='/usr/local/bin/yarn'

[[ ! -e "$destination" || -L "$destination" ]] || { echo 'Trivy yarn adapter cannot replace base yarn.' >&2; exit 1; }
ln -sfn "$adapter_dir/bin/yarn" "$destination"
