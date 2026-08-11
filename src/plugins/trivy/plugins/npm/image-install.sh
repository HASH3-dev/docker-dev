#!/usr/bin/env bash
set -euo pipefail

readonly adapter_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly destination='/usr/local/bin/npm'

[[ ! -e "$destination" || -L "$destination" ]] || { echo 'Trivy npm adapter cannot replace base npm.' >&2; exit 1; }
ln -sfn "$adapter_dir/bin/npm" "$destination"
