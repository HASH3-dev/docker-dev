#!/usr/bin/env bash
set -euo pipefail

readonly plugins_root='/opt/docker-dev/plugins'

plugin_ids() {
  local selected_plugins="$1"
  local plugin_id
  local -a ids=()
  [[ -n "$selected_plugins" ]] || return 0
  IFS=',' read -r -a ids <<< "$selected_plugins"
  for plugin_id in "${ids[@]}"; do
    [[ "$plugin_id" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "Invalid plugin id: $plugin_id" >&2; return 1; }
    [[ -d "$plugins_root/$plugin_id" ]] || { echo "Plugin not found in image: $plugin_id" >&2; return 1; }
    printf '%s\n' "$plugin_id"
  done
}

install_wrappers() {
  local plugin_id wrapper wrapper_name destination
  while IFS= read -r plugin_id; do
    [[ -d "$plugins_root/$plugin_id/bin" ]] || continue
    for wrapper in "$plugins_root/$plugin_id/bin"/*; do
      [[ -f "$wrapper" ]] || continue
      wrapper_name="$(basename "$wrapper")"
      destination="/usr/local/bin/$wrapper_name"
      if [[ -e "$destination" && ! -L "$destination" ]]; then
        echo "Plugin $plugin_id cannot replace base executable: $wrapper_name" >&2
        return 1
      fi
      if [[ -L "$destination" && "$(readlink "$destination")" != "$wrapper" ]]; then
        echo "Plugin $plugin_id has a wrapper collision: $wrapper_name" >&2
        return 1
      fi
      chmod 0755 "$wrapper"
      ln -sfn "$wrapper" "$destination"
    done
  done < <(plugin_ids "$1")
}

run_image_installs() {
  local plugin_id installer
  while IFS= read -r plugin_id; do
    installer="$plugins_root/$plugin_id/image-install.sh"
    [[ -f "$installer" ]] || continue
    chmod 0755 "$installer"
    "$installer"
  done < <(plugin_ids "$1")
}

run_hook() {
  local hook_name="$1"
  local selected_plugins="$2"
  local plugin_id hook
  [[ "$hook_name" =~ ^[a-z0-9-]+$ ]] || { echo "Invalid hook name: $hook_name" >&2; return 1; }
  while IFS= read -r plugin_id; do
    hook="$plugins_root/$plugin_id/hooks/$hook_name.sh"
    [[ -f "$hook" ]] || continue
    # Hooks run as the development user after asdf installation. Plugin files
    # under /opt are root-owned, so execute through Bash without chmod.
    bash "$hook"
  done < <(plugin_ids "$selected_plugins")
}

case "${1:-}" in
  image-install)
    [[ $# -eq 2 ]] || { echo 'Usage: docker-dev-plugin-runner image-install <plugins-csv>' >&2; exit 2; }
    run_image_installs "$2"
    install_wrappers "$2"
    ;;
  run-hook)
    [[ $# -eq 3 ]] || { echo 'Usage: docker-dev-plugin-runner run-hook <hook-name> <plugins-csv>' >&2; exit 2; }
    run_hook "$2" "$3"
    ;;
  *)
    echo 'Usage: docker-dev-plugin-runner <image-install|run-hook> ...' >&2
    exit 2
    ;;
esac
