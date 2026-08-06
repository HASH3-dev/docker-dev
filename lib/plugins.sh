#!/usr/bin/env bash

valid_plugin_id() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9-]*$ ]]
}

valid_relative_path() {
  [[ "$1" =~ ^[A-Za-z0-9._/-]+$ && "$1" != /* && "$1" != *'..'* ]]
}

manifest_value() {
  local manifest_file="$1" key="$2"
  sed -n "s/^${key}:[[:space:]]*//p" "$manifest_file" | head -n 1 | sed 's/^"//; s/"$//'
}

validate_plugin_manifest() {
  local plugin_id="$1" manifest_file="$plugins_dir/$1/plugin.yml"
  [[ -f "$manifest_file" ]] || { echo "Plugin manifest not found: $manifest_file" >&2; return 1; }
  [[ "$(manifest_value "$manifest_file" schema)" == 'docker-dev/plugin/v1' ]] || { echo "Invalid plugin schema: $manifest_file" >&2; return 1; }
  [[ "$(manifest_value "$manifest_file" name)" == "$plugin_id" ]] || { echo "Plugin manifest name does not match its directory: $manifest_file" >&2; return 1; }
}

plugin_subplugins_path() {
  local plugin_id="$1" path
  path="$(manifest_value "$plugins_dir/$plugin_id/plugin.yml" plugins_path)"
  [[ -n "$path" ]] || return 0
  valid_relative_path "$path" || { echo "Invalid plugins_path for plugin '$plugin_id'." >&2; return 1; }
  printf '%s\n' "$path"
}

plugin_subplugins_enabled_file() {
  local plugin_id="$1" path configured_file
  path="$(plugin_subplugins_path "$plugin_id")" || return 1
  [[ -n "$path" ]] || return 0
  configured_file="$(manifest_value "$plugins_dir/$plugin_id/plugin.yml" plugins_enabled_file)"
  if [[ -n "$configured_file" ]]; then
    valid_relative_path "$configured_file" || { echo "Invalid plugins_enabled_file for plugin '$plugin_id'." >&2; return 1; }
    printf '%s\n' "$plugins_dir/$plugin_id/$configured_file"
  else
    printf '%s\n' "$plugins_dir/$plugin_id/plugins.enabled"
  fi
}

validate_subplugin_manifest() {
  local plugin_id="$1" subplugin_id="$2" manifest_file="$3"
  [[ -f "$manifest_file" ]] || { echo "Subplugin manifest not found: $manifest_file" >&2; return 1; }
  [[ "$(manifest_value "$manifest_file" schema)" == 'docker-dev/subplugin/v1' ]] || { echo "Invalid subplugin schema: $manifest_file" >&2; return 1; }
  [[ "$(manifest_value "$manifest_file" name)" == "$subplugin_id" ]] || { echo "Subplugin manifest name does not match its directory: $manifest_file" >&2; return 1; }
}

enabled_plugins() {
  local plugin_id
  local seen_plugins='|'
  [[ -f "$plugins_file" ]] || return 0

  while IFS= read -r plugin_id || [[ -n "$plugin_id" ]]; do
    plugin_id="${plugin_id#"${plugin_id%%[![:space:]]*}"}"
    plugin_id="${plugin_id%"${plugin_id##*[![:space:]]}"}"
    [[ -z "$plugin_id" || "$plugin_id" == \#* ]] && continue
    valid_plugin_id "$plugin_id" || {
      echo "Invalid plugin id in $plugins_file: $plugin_id" >&2
      return 1
    }
    [[ -d "$plugins_dir/$plugin_id" ]] || {
      echo "Enabled plugin not found: $plugins_dir/$plugin_id" >&2
      return 1
    }
    validate_plugin_manifest "$plugin_id"
    [[ "$seen_plugins" != *"|$plugin_id|"* ]] || {
      echo "Plugin is listed more than once in $plugins_file: $plugin_id" >&2
      return 1
    }
    seen_plugins+="$plugin_id|"
    printf '%s\n' "$plugin_id"
  done < "$plugins_file"
}

enabled_plugin_subplugins() {
  local plugin_id="$1"
  local subplugins_path subplugins_file subplugin_id
  local seen_subplugins='|'
  subplugins_path="$(plugin_subplugins_path "$plugin_id")" || return 1
  [[ -n "$subplugins_path" ]] || return 0
  subplugins_file="$(plugin_subplugins_enabled_file "$plugin_id")" || return 1
  [[ -f "$subplugins_file" ]] || return 0

  while IFS= read -r subplugin_id || [[ -n "$subplugin_id" ]]; do
    subplugin_id="${subplugin_id#"${subplugin_id%%[![:space:]]*}"}"
    subplugin_id="${subplugin_id%"${subplugin_id##*[![:space:]]}"}"
    [[ -z "$subplugin_id" || "$subplugin_id" == \#* ]] && continue
    valid_plugin_id "$subplugin_id" || { echo "Invalid subplugin id in $subplugins_file: $subplugin_id" >&2; return 1; }
    [[ -d "$plugins_dir/$plugin_id/$subplugins_path/$subplugin_id" ]] || { echo "Enabled subplugin not found: $plugins_dir/$plugin_id/$subplugins_path/$subplugin_id" >&2; return 1; }
    validate_subplugin_manifest "$plugin_id" "$subplugin_id" "$plugins_dir/$plugin_id/$subplugins_path/$subplugin_id/plugin.yml"
    [[ "$seen_subplugins" != *"|$subplugin_id|"* ]] || { echo "Subplugin is listed more than once in $subplugins_file: $subplugin_id" >&2; return 1; }
    seen_subplugins+="$subplugin_id|"
    printf '%s\n' "$subplugin_id"
  done < "$subplugins_file"
}

plugins_csv() {
  enabled_plugins | paste -sd, -
}

show_enabled_plugins() {
  local plugin_id
  local found=0
  while IFS= read -r plugin_id; do
    ((found++)) || true
    printf '  - %s\n' "$plugin_id"
    local subplugin_id
    while IFS= read -r subplugin_id; do
      printf '    - %s/%s\n' "$plugin_id" "$subplugin_id"
    done < <(enabled_plugin_subplugins "$plugin_id")
  done < <(enabled_plugins)
  ((found)) || echo '  - none'
}

run_plugin_hooks() {
  local hook_name="$1"
  local selected_plugins
  selected_plugins="$(plugins_csv)"
  [[ -n "$selected_plugins" ]] || return 0
  exec_in_dev dev docker-dev-plugin-runner run-hook "$hook_name" "$selected_plugins"
}

validate_command_collisions() {
  local command_file command_name plugin_id subplugin_id subplugins_path
  local seen_commands='|'

  for command_file in "$docker_dev_dir"/commands/*/command.yml; do
    [[ -f "$command_file" ]] || continue
    command_name="$(basename "$(dirname "$command_file")")"
    seen_commands+="$command_name|"
  done

  while IFS= read -r plugin_id; do
    for command_file in "$plugins_dir/$plugin_id/commands"/*/command.yml; do
      [[ -f "$command_file" ]] || continue
      command_name="$(basename "$(dirname "$command_file")")"
      [[ "$seen_commands" != *"|$command_name|"* ]] || {
        echo "Command collision for '$command_name' in plugin '$plugin_id'." >&2
        return 1
      }
      seen_commands+="$command_name|"
    done
    subplugins_path="$(plugin_subplugins_path "$plugin_id")" || return 1
    while IFS= read -r subplugin_id; do
      for command_file in "$plugins_dir/$plugin_id/$subplugins_path/$subplugin_id/commands"/*/command.yml; do
        [[ -f "$command_file" ]] || continue
        command_name="$(basename "$(dirname "$command_file")")"
        [[ "$seen_commands" != *"|$command_name|"* ]] || {
        echo "Command collision for '$command_name' in subplugin '$plugin_id/$subplugin_id'." >&2
          return 1
        }
        seen_commands+="$command_name|"
      done
    done < <(enabled_plugin_subplugins "$plugin_id")
  done < <(enabled_plugins)
}
