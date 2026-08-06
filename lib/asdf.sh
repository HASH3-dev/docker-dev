#!/usr/bin/env bash

valid_tool_name() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }
valid_tool_version() { [[ -n "$1" && "$1" != *[[:space:]]* && "$1" != *$'\n'* ]]; }

record_created_tool_versions() {
  local tool_versions_file="$project_root/.tool-versions"
  local digest
  digest="$(project_path_hash "$(<"$tool_versions_file")")"
  printf 'created_tool_versions_digest=%s\n' "$digest" > "$setup_state_file"
}

configure_tool_versions() {
  local tool_versions_file="$project_root/.tool-versions" tool_name tool_version more_tools
  [[ -f "$tool_versions_file" ]] && return 0
  echo; echo 'No .tool-versions was found at the project root.'; echo 'Enter each language/runtime and version used by this project.'
  while :; do
    printf 'Language or runtime (for example: nodejs, python): '; read -r tool_name
    valid_tool_name "$tool_name" || { echo 'Use a non-empty asdf plugin name.' >&2; continue; }
    printf 'Version for %s: ' "$tool_name"; read -r tool_version
    valid_tool_version "$tool_version" || { echo 'Use one non-empty version value without spaces.' >&2; continue; }
    printf '%s %s\n' "$tool_name" "$tool_version" >> "$tool_versions_file"
    printf 'Add another language/runtime? [y/N]: '; read -r more_tools
    case "$more_tools" in y|Y|yes|YES) ;; *) break ;; esac
  done
  record_created_tool_versions
}

install_asdf_tools() {
  [[ -f "$project_root/.tool-versions" ]] || return 0
  exec_in_dev dev bash -lc '
    set -euo pipefail
    while read -r tool_name _; do
      [[ -z "$tool_name" || "$tool_name" == \#* ]] && continue
      if ! asdf plugin list | grep -Fqx "$tool_name"; then
        echo "Installing asdf plugin: $tool_name"
        asdf plugin add "$tool_name"
      fi
    done < .tool-versions
    asdf install
  '
}
