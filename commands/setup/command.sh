prepare_setup() {
  [[ "${docker_dev_setup_prepared:-0}" == '1' ]] && return 0
  confirm_host_setup
  ensure_yq
  configure_plugins
  enabled_plugins >/dev/null
  validate_command_collisions
  docker_dev_setup_prepared=1
}

available_plugin_ids() {
  local directory="$1" candidate
  [[ -d "$directory" ]] || return 0
  for candidate in "$directory"/*; do
    [[ -f "$candidate/plugin.yml" ]] || continue
    basename "$candidate"
  done | sort
}

selected_plugin_ids() {
  local enabled_file="$1" plugin_id
  [[ -f "$enabled_file" ]] || return 0
  while IFS= read -r plugin_id || [[ -n "$plugin_id" ]]; do
    plugin_id="${plugin_id#"${plugin_id%%[![:space:]]*}"}"
    plugin_id="${plugin_id%"${plugin_id##*[![:space:]]}"}"
    [[ -z "$plugin_id" || "$plugin_id" == \#* ]] && continue
    valid_plugin_id "$plugin_id" && printf '%s\n' "$plugin_id"
  done < "$enabled_file"
}

plugin_is_selected() {
  local id="$1" selected_id
  for selected_id in "${selected_plugin_choices[@]}"; do
    [[ "$selected_id" == "$id" ]] && return 0
  done
  return 1
}

write_selected_plugins() {
  local enabled_file="$1" label="$2" choice
  mkdir -p "$(dirname "$enabled_file")"
  {
    printf '# Plugins selected by docker-dev setup for %s.\n' "$label"
    for choice in "${selected_plugin_choices[@]}"; do
      printf '%s\n' "$choice"
    done
  } > "$enabled_file"
}

select_plugins_interactively() {
  local enabled_file="$1" directory="$2" label="$3"
  local key next_key index=0 choice line
  local -a available_plugins=() selected_plugin_choices=()

  while IFS= read -r choice; do available_plugins+=("$choice"); done < <(available_plugin_ids "$directory")
  ((${#available_plugins[@]})) || return 0
  while IFS= read -r choice; do selected_plugin_choices+=("$choice"); done < <(selected_plugin_ids "$enabled_file")

  # configure_plugins iterates enabled plugins through stdin. Read keystrokes
  # from the controlling terminal instead, otherwise nested selectors would
  # incorrectly fall back to non-interactive mode.
  if [[ ! -t 1 || ! -r /dev/tty ]]; then
    echo "Keeping existing selection for $label (no interactive terminal)."
    return 0
  fi

  while true; do
    printf '\033[2J\033[H'
    printf 'Select plugins for %s\n\n' "$label"
    for ((line = 0; line < ${#available_plugins[@]}; line++)); do
      choice="${available_plugins[$line]}"
      [[ "$line" -eq "$index" ]] && printf ' > ' || printf '   '
      plugin_is_selected "$choice" && printf '[x] %s\n' "$choice" || printf '[ ] %s\n' "$choice"
    done
    printf '\n↑/↓ navigate · Space toggle · Enter confirm\n'
    IFS= read -r -s -n 1 key < /dev/tty || return 1
    if [[ "$key" == $'\x1b' ]]; then
      IFS= read -r -s -n 1 next_key < /dev/tty || true
      [[ "$next_key" == '[' ]] || continue
      IFS= read -r -s -n 1 key < /dev/tty || true
      case "$key" in A) index=$(( (index + ${#available_plugins[@]} - 1) % ${#available_plugins[@]} )) ;; B) index=$(( (index + 1) % ${#available_plugins[@]} )) ;; esac
    elif [[ "$key" == ' ' ]]; then
      choice="${available_plugins[$index]}"
      if plugin_is_selected "$choice"; then
        local -a remaining=()
        for line in "${selected_plugin_choices[@]}"; do [[ "$line" != "$choice" ]] && remaining+=("$line"); done
        selected_plugin_choices=("${remaining[@]}")
      else
        selected_plugin_choices+=("$choice")
      fi
    elif [[ -z "$key" || "$key" == $'\n' || "$key" == $'\r' ]]; then
      write_selected_plugins "$enabled_file" "$label"
      return 0
    fi
  done
}

configure_plugins() {
  local plugin_id subplugins_path subplugins_file
  select_plugins_interactively "$plugins_file" "$plugins_dir" 'docker-dev'
  while IFS= read -r plugin_id; do
    subplugins_path="$(plugin_subplugins_path "$plugin_id")" || return 1
    [[ -n "$subplugins_path" ]] || continue
    subplugins_file="$(plugin_subplugins_enabled_file "$plugin_id")" || return 1
    select_plugins_interactively "$subplugins_file" "$plugins_dir/$plugin_id/$subplugins_path" "$plugin_id"
  done < <(enabled_plugins)
}

ensure_managed_envrc() {
  if [[ -e "$project_root/.envrc" || -L "$project_root/.envrc" ]]; then
    if [[ ! -L "$project_root/.envrc" ]] || [[ "$(readlink "$project_root/.envrc")" != '.docker-dev/direnv.envrc' ]]; then
      echo "Refusing to replace the existing $project_root/.envrc." >&2
      echo 'Add this line to it, then run direnv allow:' >&2
      echo '  source_env .docker-dev/direnv.envrc' >&2
      return 1
    fi
  else
    ln -s .docker-dev/direnv.envrc "$project_root/.envrc"
  fi
}

require_docker_compose() {
  command -v docker >/dev/null 2>&1 || { echo 'Docker is required but was not found in PATH.' >&2; return 1; }
  docker compose version >/dev/null 2>&1 || { echo 'Docker Compose v2 is required but is not available.' >&2; return 1; }
}

show_setup_complete() {
  cat <<'EOF'

Docker development environment is ready. The runtimes declared in .tool-versions
and all enabled plugins are installed. Open a new terminal and use `npm` normally.
EOF
}

restart_shell_after_setup() {
  local shell_path="${SHELL:-/bin/bash}"
  [[ -t 0 && -t 1 ]] || return 0
  [[ -x "$shell_path" ]] || { echo "Cannot restart the configured shell: $shell_path" >&2; return 1; }
  printf '\nPress any key to start a fresh shell with the docker-dev environment enabled...'
  IFS= read -r -n 1 _ || true
  printf '\n'
  exec "$shell_path" -l
}
