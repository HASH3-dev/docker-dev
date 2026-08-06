#!/usr/bin/env bash

remove_managed_tool_versions() {
  local tool_versions_file="$project_root/.tool-versions"
  local recorded_digest current_digest
  [[ -f "$setup_state_file" ]] || return 0
  recorded_digest="$(sed -n 's/^created_tool_versions_digest=//p' "$setup_state_file" | head -n 1)"
  if [[ -n "$recorded_digest" && -f "$tool_versions_file" ]]; then
    current_digest="$(project_path_hash "$(<"$tool_versions_file")")"
    if [[ "$current_digest" == "$recorded_digest" ]]; then
      rm "$tool_versions_file"
      echo 'Removed .tool-versions created by setup.'
    else
      echo 'Preserved .tool-versions because it was changed after setup.' >&2
    fi
  fi
  rm -f "$setup_state_file"
}

remove_docker_dev_resources() {
  local volume_name
  local -a volume_names=(node_modules npm_cache dev_home asdf_data)

  command -v docker >/dev/null 2>&1 || return 0
  docker compose version >/dev/null 2>&1 || return 0

  # Remove only this kit's service. Infrastructure passed through
  # --merge-compose is intentionally left running.
  compose rm --stop --force dev >/dev/null 2>&1 || true
  for volume_name in "${volume_names[@]}"; do
    docker volume rm "${project_name}_${volume_name}" >/dev/null 2>&1 || true
  done
  docker network rm "${project_name}_default" >/dev/null 2>&1 || true
  docker image rm "$dev_image_name" >/dev/null 2>&1 || true
}

teardown_environment() {
  remove_docker_dev_resources
  remove_cached_yq
  remove_managed_envrc
  remove_managed_gitignore_rule
  remove_managed_tool_versions
  echo 'docker-dev repository configuration was removed. direnv remains installed.'
}
