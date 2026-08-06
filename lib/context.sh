#!/usr/bin/env bash

project_path_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | cut -c1-10
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | cut -c1-10
  else
    printf '%s' "$1" | cksum | awk '{print $1}'
  fi
}

readonly docker_dev_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly project_root="$(cd -- "$docker_dev_dir/.." && pwd)"
readonly project_slug="$(basename "$project_root" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//; s/-*$//')"
readonly project_hash="$(project_path_hash "$project_root")"
readonly project_name="${project_slug:-project}-dev-${project_hash}"
readonly dev_image_name="${project_name}-dev"
readonly ports_file="$docker_dev_dir/ports.env"
readonly ports_override_file="$docker_dev_dir/.ports.generated.yml"
readonly plugins_file="$docker_dev_dir/plugins.enabled"
readonly plugins_dir="$docker_dev_dir/plugins"
readonly setup_state_file="$docker_dev_dir/.setup-state"
readonly tools_lock_file="$docker_dev_dir/internal/tools.lock.env"
readonly tools_cache_dir="$docker_dev_dir/internal/.cache"
