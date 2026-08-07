#!/usr/bin/env bash
set -euo pipefail

readonly plugins_root='/opt/docker-dev/plugins'

manifest_value() {
  local manifest="$1" key="$2"
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$manifest" | head -n 1
}

manifest_hook() {
  local manifest="$1" hook="$2"
  sed -n "s/.*\"${hook}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$manifest" | head -n 1
}

enabled_ids() {
  local directory="$1" enabled_file="$2" id seen='|'
  [[ -f "$enabled_file" ]] || return 0
  while IFS= read -r id || [[ -n "$id" ]]; do
    id="${id#"${id%%[![:space:]]*}"}"
    id="${id%"${id##*[![:space:]]}"}"
    [[ -z "$id" || "$id" == \#* ]] && continue
    [[ "$id" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "Invalid plugin id: $id" >&2; return 1; }
    [[ -d "$directory/$id" ]] || { echo "Enabled plugin not found: $directory/$id" >&2; return 1; }
    [[ "$seen" != *"|$id|"* ]] || { echo "Plugin is listed more than once: $id" >&2; return 1; }
    seen+="$id|"
    printf '%s\n' "$id"
  done < "$enabled_file"
}

run_phase() {
  local phase="$1"
  local directory="$2"
  local manifest="$directory/plugin.json"
  local script children_path children_file child
  [[ -f "$manifest" ]] || { echo "Plugin manifest not found: $manifest" >&2; return 1; }

  case "$phase" in
    image-install)
      script="$(manifest_value "$manifest" imageInstall)"
      [[ -z "$script" ]] || bash "$directory/$script"
      ;;
    run-hook)
      script="$(manifest_hook "$manifest" "${3:-}")"
      [[ -z "$script" ]] || bash "$directory/$script"
      ;;
  esac

  children_path="$(manifest_value "$manifest" directory)"
  [[ -n "$children_path" ]] || return 0
  children_file="$directory/$(manifest_value "$manifest" enabledFile)"
  [[ "$children_file" != "$directory/" ]] || children_file="$directory/plugins.enabled"
  while IFS= read -r child; do
    run_phase "$phase" "$directory/$children_path/$child" "${3:-}"
  done < <(enabled_ids "$directory/$children_path" "$children_file")
}

run_selected() {
  local phase="$1" selected="$2" hook="${3:-}" id
  local temporary_file
  temporary_file="$(mktemp)"
  printf '%s\n' "$selected" | tr ',' '\n' > "$temporary_file"
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    run_phase "$phase" "$plugins_root/$id" "$hook"
  done < <(enabled_ids "$plugins_root" "$temporary_file")
  rm -f "$temporary_file"
}

case "${1:-}" in
  image-install)
    [[ $# -eq 2 ]] || { echo 'Usage: docker-dev-plugin-runner image-install <plugins-csv>' >&2; exit 2; }
    run_selected image-install "$2"
    ;;
  run-hook)
    [[ $# -eq 3 ]] || { echo 'Usage: docker-dev-plugin-runner run-hook <hook-name> <plugins-csv>' >&2; exit 2; }
    run_selected run-hook "$3" "$2"
    ;;
  *)
    echo 'Usage: docker-dev-plugin-runner <image-install|run-hook> ...' >&2
    exit 2
    ;;
esac
