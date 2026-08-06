#!/usr/bin/env bash
set -euo pipefail

readonly runner_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$runner_dir/../lib/bootstrap.sh"

readonly command_directory="${1:?A command directory is required.}"
shift
readonly runner_command_manifest="$command_directory/command.yml"
readonly runner_command_script="$command_directory/command.sh"
command_args=("$@")

[[ -f "$runner_command_manifest" ]] || { echo "Command manifest not found: $runner_command_manifest" >&2; exit 2; }
[[ -f "$runner_command_script" ]] && source "$runner_command_script"

if [[ "${command_args[0]:-}" == '--help' || "${command_args[0]:-}" == '-h' ]]; then
  [[ ${#command_args[@]} -eq 1 ]] || exit 2
  awk '
    /^help:[[:space:]]*\|[[:space:]]*$/ { showing=1; next }
    showing && /^[^[:space:]]/ { exit }
    showing { sub(/^  /, ""); print }
  ' "$runner_command_manifest"
  exit 0
fi

yq_binary="$(yq_binary_path)"
[[ -x "$yq_binary" ]] || {
  # setup is the only bootstrap exception: it asks for confirmation and then
  # downloads/verifies yq itself. Every other command requires the interpreter.
  if [[ "$(basename "$command_directory")" == 'setup' ]]; then
    require_no_arguments
    prepare_setup
    yq_binary="$(yq_binary_path)"
  else
    echo 'The pinned yq interpreter is not available. Run `./.docker-dev/dev.sh setup` first.' >&2
    exit 1
  fi
}
[[ -x "$yq_binary" ]] || { echo 'The pinned yq interpreter could not be installed.' >&2; exit 1; }

manifest_schema="$($yq_binary eval -r '.schema // ""' "$runner_command_manifest")"
manifest_name="$($yq_binary eval -r '.name // ""' "$runner_command_manifest")"
expected_name="$(basename "$command_directory")"
[[ "$manifest_schema" == 'docker-dev/command/v1' ]] || { echo "Invalid command schema: $runner_command_manifest" >&2; exit 2; }
[[ "$manifest_name" == "$expected_name" ]] || { echo "Command manifest name does not match its directory: $runner_command_manifest" >&2; exit 2; }

step_count="$($yq_binary eval -r '.steps | length' "$runner_command_manifest")"
[[ "$step_count" =~ ^[0-9]+$ ]] || { echo "Invalid command manifest: $runner_command_manifest" >&2; exit 2; }

for ((step_index = 0; step_index < step_count; step_index++)); do
  action="$($yq_binary eval -r ".steps[$step_index] | keys | .[0]" "$runner_command_manifest")"
  key_count="$($yq_binary eval -r ".steps[$step_index] | length" "$runner_command_manifest")"
  [[ "$key_count" == '1' ]] || { echo "Each command step must have exactly one action: $runner_command_manifest" >&2; exit 2; }
  case "$action" in
    call)
      call_type="$($yq_binary eval -r ".steps[$step_index].call | type" "$runner_command_manifest")"
      if [[ "$call_type" == '!!map' ]]; then
        target="$($yq_binary eval -r ".steps[$step_index].call.function" "$runner_command_manifest")"
        step_args=()
        while IFS= read -r step_arg; do
          if [[ "$step_arg" == '$@' ]]; then step_args+=("${command_args[@]}"); else step_args+=("$step_arg"); fi
        done < <("$yq_binary" eval -r ".steps[$step_index].call.args[]?" "$runner_command_manifest")
      else
        target="$($yq_binary eval -r ".steps[$step_index].call" "$runner_command_manifest")"
        step_args=()
      fi
      [[ "$target" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || { echo "Invalid command call '$target' in $runner_command_manifest" >&2; exit 2; }
      declare -F "$target" >/dev/null || { echo "Command call '$target' is not implemented by the command or core library." >&2; exit 2; }
      "$target" "${step_args[@]}"
      ;;
    *) echo "Unsupported command action '$action' in $runner_command_manifest" >&2; exit 2 ;;
  esac
done
