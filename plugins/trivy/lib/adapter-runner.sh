#!/usr/bin/env bash
set -euo pipefail

readonly trivy_plugin_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly subplugins_path='adapters'
readonly subplugins_dir="$trivy_plugin_dir/$subplugins_path"
readonly subplugins_enabled_file="$trivy_plugin_dir/plugins.enabled"

enabled_subplugins() {
  local plugin_id seen='|'
  [[ -f "$subplugins_enabled_file" ]] || return 0
  while IFS= read -r plugin_id || [[ -n "$plugin_id" ]]; do
    plugin_id="${plugin_id#"${plugin_id%%[![:space:]]*}"}"
    plugin_id="${plugin_id%"${plugin_id##*[![:space:]]}"}"
    [[ -z "$plugin_id" || "$plugin_id" == \#* ]] && continue
    [[ "$plugin_id" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "Invalid Trivy subplugin id: $plugin_id" >&2; return 1; }
    [[ -d "$subplugins_dir/$plugin_id" ]] || { echo "Trivy subplugin not found: $plugin_id" >&2; return 1; }
    [[ "$seen" != *"|$plugin_id|"* ]] || { echo "Trivy subplugin is listed more than once: $plugin_id" >&2; return 1; }
    seen+="$plugin_id|"
    printf '%s\n' "$plugin_id"
  done < "$subplugins_enabled_file"
}

install_subplugin_wrappers() {
  local plugin_id wrapper wrapper_name destination
  while IFS= read -r plugin_id; do
    [[ -d "$subplugins_dir/$plugin_id/bin" ]] || continue
    for wrapper in "$subplugins_dir/$plugin_id/bin"/*; do
      [[ -f "$wrapper" ]] || continue
      wrapper_name="$(basename "$wrapper")"
      destination="/usr/local/bin/$wrapper_name"
      if [[ -e "$destination" && ! -L "$destination" ]]; then
        echo "Trivy subplugin $plugin_id cannot replace base executable: $wrapper_name" >&2
        return 1
      fi
      if [[ -L "$destination" && "$(readlink "$destination")" != "$wrapper" ]]; then
        echo "Trivy subplugin wrapper collision: $wrapper_name" >&2
        return 1
      fi
      chmod 0755 "$wrapper"
      ln -sfn "$wrapper" "$destination"
    done
  done < <(enabled_subplugins)
}

run_subplugin_image_installs() {
  local plugin_id installer
  while IFS= read -r plugin_id; do
    installer="$subplugins_dir/$plugin_id/image-install.sh"
    [[ -f "$installer" ]] || continue
    bash "$installer"
  done < <(enabled_subplugins)
}

run_subplugin_hooks() {
  local hook_name="$1"
  local plugin_id hook
  while IFS= read -r plugin_id; do
    hook="$subplugins_dir/$plugin_id/hooks/$hook_name.sh"
    [[ -f "$hook" ]] || continue
    bash "$hook"
  done < <(enabled_subplugins)
}

case "${1:-}" in
  image-install)
    run_subplugin_image_installs
    install_subplugin_wrappers
    ;;
  run-hook)
    [[ $# -eq 2 ]] || { echo 'Usage: adapter-runner.sh run-hook <name>' >&2; exit 2; }
    run_subplugin_hooks "$2"
    ;;
  *)
    echo 'Usage: adapter-runner.sh <image-install|run-hook>' >&2
    exit 2
    ;;
esac
