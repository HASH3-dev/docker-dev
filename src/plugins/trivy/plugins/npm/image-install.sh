#!/usr/bin/env bash
set -euo pipefail

readonly adapter_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly destination='/usr/local/bin/npm'
readonly bootstrap_destination='/usr/local/bin/bootstrap-deps'

[[ ! -e "$destination" || -L "$destination" ]] || { echo 'Trivy npm adapter cannot replace base npm.' >&2; exit 1; }
[[ ! -e "$bootstrap_destination" || -L "$bootstrap_destination" ]] || { echo 'Trivy npm adapter cannot replace base bootstrap-deps.' >&2; exit 1; }
ln -sfn "$adapter_dir/bin/npm" "$destination"
ln -sfn "$adapter_dir/bin/bootstrap-deps" "$bootstrap_destination"
