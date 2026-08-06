#!/usr/bin/env bash

active_infra_compose=''

resolve_infra_compose() {
  local requested_path="${1:-}"
  local candidate
  local -a candidates=()

  if [[ -n "$requested_path" ]]; then
    [[ "$requested_path" == /* ]] || requested_path="$project_root/$requested_path"
    [[ -f "$requested_path" ]] || {
      echo "Compose file not found: $requested_path" >&2
      return 1
    }
    active_infra_compose="$(cd -- "$(dirname -- "$requested_path")" && pwd)/$(basename -- "$requested_path")"
    return 0
  fi

  for candidate in compose.yaml compose.yml docker-compose.yaml docker-compose.yml; do
    [[ -f "$project_root/$candidate" ]] && candidates+=("$project_root/$candidate")
  done
  case "${#candidates[@]}" in
    0) active_infra_compose='' ;;
    1)
      active_infra_compose="${candidates[0]}"
      echo "Using project infrastructure compose: $(basename -- "$active_infra_compose")"
      ;;
    *)
      echo 'More than one Compose file was found at the project root.' >&2
      echo 'Use --file to select one explicitly.' >&2
      return 1
      ;;
  esac
}

configure_up_compose() {
  case "$#" in
    0) active_infra_compose='' ;;
    1)
      [[ "$1" == '--merge-compose' ]] || { echo 'Use: up [--merge-compose [--file <compose-file>]].' >&2; return 1; }
      resolve_infra_compose
      ;;
    3)
      [[ "$1" == '--merge-compose' && "$2" == '--file' ]] || { echo 'Use: up [--merge-compose [--file <compose-file>]].' >&2; return 1; }
      resolve_infra_compose "$3"
      ;;
    *) echo 'Use: up [--merge-compose [--file <compose-file>]].' >&2; return 1 ;;
  esac
}

read_configured_ports() {
  local ports_line
  ports_line="$(grep -E '^DOCKER_DEV_PORTS=' "$ports_file" | tail -n 1 || true)"
  printf '%s' "${ports_line#DOCKER_DEV_PORTS=}"
}

validate_port_list() {
  local mapping host_port container_port
  local -a mappings=()
  IFS=',' read -r -a mappings <<< "$1"
  ((${#mappings[@]})) || return 1
  for mapping in "${mappings[@]}"; do
    if [[ "$mapping" == *:* ]]; then
      host_port="${mapping%%:*}"; container_port="${mapping#*:}"
      [[ "$container_port" != *:* ]] || return 1
    else
      host_port="$mapping"; container_port="$mapping"
    fi
    [[ "$host_port" =~ ^[1-9][0-9]{0,4}$ ]] && ((host_port <= 65535)) || return 1
    [[ "$container_port" =~ ^[1-9][0-9]{0,4}$ ]] && ((container_port <= 65535)) || return 1
  done
}

configure_ports() {
  local current_ports selected_ports
  current_ports="$(read_configured_ports)"
  echo
  echo 'Development ports are published only to localhost.'
  echo 'Default ports: 3000'
  echo 'Use commas for multiple ports; use host:container to avoid conflicts.'
  echo 'Example: 3000,3002:3001,5173'
  printf 'Ports [%s]: ' "${current_ports:-3000}"
  read -r selected_ports
  selected_ports="${selected_ports//[[:space:]]/}"
  selected_ports="${selected_ports:-${current_ports:-3000}}"
  validate_port_list "$selected_ports" || { echo 'Ports must be comma-separated values such as 3000 or 3002:3001.' >&2; return 1; }
  printf '%s\n' '# Comma-separated host:container mappings published only on localhost.' '# A plain port maps to itself. Example: DOCKER_DEV_PORTS=3000,3002:3001,5173' "DOCKER_DEV_PORTS=$selected_ports" > "$ports_file"
}

generate_ports_override() {
  local configured_ports mapping host_port container_port temporary_file
  local -a mappings=()
  configured_ports="${DOCKER_DEV_PORTS:-}"
  [[ -n "$configured_ports" ]] || configured_ports="$(read_configured_ports)"
  [[ -n "$configured_ports" ]] || { echo "Set DOCKER_DEV_PORTS in $ports_file." >&2; return 1; }
  validate_port_list "$configured_ports" || { echo "Invalid port list in $ports_file: $configured_ports" >&2; return 1; }
  IFS=',' read -r -a mappings <<< "$configured_ports"
  temporary_file="$(mktemp "$docker_dev_dir/.ports.generated.XXXXXX")"
  {
    echo 'services:'; echo '  dev:'; echo '    ports:'
    for mapping in "${mappings[@]}"; do
      if [[ "$mapping" == *:* ]]; then host_port="${mapping%%:*}"; container_port="${mapping#*:}"; else host_port="$mapping"; container_port="$mapping"; fi
      printf '      - "127.0.0.1:%s:%s"\n' "$host_port" "$container_port"
    done
  } > "$temporary_file"
  mv "$temporary_file" "$ports_override_file"
}

compose() {
  local selected_plugins
  local -a compose_files=()
  generate_ports_override
  [[ -n "$active_infra_compose" ]] && compose_files=(-f "$active_infra_compose")
  compose_files+=(-f "$docker_dev_dir/compose.yml" -f "$ports_override_file")
  selected_plugins="$(plugins_csv)"
  LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" DOCKER_DEV_DIR="$docker_dev_dir" DOCKER_DEV_PROJECT_ROOT="$project_root" DOCKER_DEV_PLUGINS="$selected_plugins" DOCKER_DEV_IMAGE="$dev_image_name" \
    docker compose -p "$project_name" "${compose_files[@]}" "$@"
}

exec_in_dev() {
  compose exec --user "$(id -u):$(id -g)" "$@"
}
