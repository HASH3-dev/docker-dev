#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/lib/context.sh"
source "$script_dir/lib/tools.sh"
source "$script_dir/lib/plugins.sh"
validate_command_collisions

# Metadata is intentionally read without yq so `dev.sh help` stays available
# before setup downloads the pinned interpreter. Execution always uses yq.
command_metadata() {
  local command_file="$1" key="$2"
  sed -n "s/^${key}:[[:space:]]*//p" "$command_file" | head -n 1 | sed 's/^"//; s/"$//'
}

resolve_command_directory() {
  local command_name="$1" plugin_id subplugin_id subplugins_path command_dir
  local -a matches=()
  command_dir="$docker_dev_dir/commands/$command_name"
  [[ -f "$command_dir/command.yml" ]] && matches+=("$command_dir")
  while IFS= read -r plugin_id; do
    command_dir="$plugins_dir/$plugin_id/commands/$command_name"
    [[ -f "$command_dir/command.yml" ]] && matches+=("$command_dir")
    subplugins_path="$(plugin_subplugins_path "$plugin_id")" || return 1
    while IFS= read -r subplugin_id; do
      command_dir="$plugins_dir/$plugin_id/$subplugins_path/$subplugin_id/commands/$command_name"
      [[ -f "$command_dir/command.yml" ]] && matches+=("$command_dir")
    done < <(enabled_plugin_subplugins "$plugin_id")
  done < <(enabled_plugins)
  case "${#matches[@]}" in
    0) return 1 ;;
    1) printf '%s\n' "${matches[0]}" ;;
    *) echo "Command collision for '$command_name': ${matches[*]}" >&2; return 2 ;;
  esac
}

list_commands() {
  local command_file plugin_id subplugin_id subplugins_path command_name command_summary command_source
  for command_file in "$docker_dev_dir"/commands/*/command.yml; do
    [[ -f "$command_file" ]] || continue
    command_name="$(command_metadata "$command_file" name)"
    command_summary="$(command_metadata "$command_file" summary)"
    printf '%s\t%s\tcore\n' "$command_name" "$command_summary"
  done
  while IFS= read -r plugin_id; do
    for command_file in "$plugins_dir/$plugin_id"/commands/*/command.yml; do
      [[ -f "$command_file" ]] || continue
      command_name="$(command_metadata "$command_file" name)"
      command_summary="$(command_metadata "$command_file" summary)"
      printf '%s\t%s\t%s\n' "$command_name" "$command_summary" "$plugin_id"
    done
    subplugins_path="$(plugin_subplugins_path "$plugin_id")" || return 1
    while IFS= read -r subplugin_id; do
      for command_file in "$plugins_dir/$plugin_id/$subplugins_path/$subplugin_id"/commands/*/command.yml; do
        [[ -f "$command_file" ]] || continue
        command_name="$(command_metadata "$command_file" name)"
        command_summary="$(command_metadata "$command_file" summary)"
        command_source="$plugin_id/$subplugin_id"
        printf '%s\t%s\t%s\n' "$command_name" "$command_summary" "$command_source"
      done
    done < <(enabled_plugin_subplugins "$plugin_id")
  done < <(enabled_plugins)
}

show_help() {
  echo 'Usage: ./.docker-dev/dev.sh <command> [arguments]'
  echo
  echo 'Commands:'
  while IFS=$'\t' read -r command_name command_summary command_source; do
    [[ "$command_source" == 'core' ]] || command_summary="$command_summary [$command_source]"
    printf '  %-12s %s\n' "$command_name" "$command_summary"
  done < <(list_commands | sort -t $'\t' -k1,1)
  cat <<'EOF'

Run `./.docker-dev/dev.sh <command> --help` for command-specific usage.
Commands marked with `[plugin]` are enabled through .docker-dev/plugins.enabled.
EOF
}

run_command() {
  local command_directory="$1"
  shift
  exec bash "$docker_dev_dir/internal/command-runner.sh" "$command_directory" "$@"
}

command_name="${1:-help}"
case "$command_name" in
  help|--help|-h)
    if [[ $# -gt 1 ]]; then
      command_directory="$(resolve_command_directory "$2")" || { echo "Unknown command: $2" >&2; exit 2; }
      run_command "$command_directory" --help
    fi
    show_help
    ;;
  *)
    shift
    command_directory="$(resolve_command_directory "$command_name")" || { echo "Unknown command: $command_name" >&2; echo 'Run `./.docker-dev/dev.sh help` to list commands.' >&2; exit 2; }
    run_command "$command_directory" "$@"
    ;;
esac
