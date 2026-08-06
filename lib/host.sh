#!/usr/bin/env bash

run_privileged() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"; elif command -v sudo >/dev/null 2>&1; then sudo "$@"; else echo "Administrative privileges are required to run: $*" >&2; return 1; fi
}

install_direnv() {
  command -v direnv >/dev/null 2>&1 && return 0
  echo 'direnv was not found; installing it on the host...' >&2
  case "$(uname -s)" in
    Darwin) command -v brew >/dev/null 2>&1 || { echo 'Homebrew is required to install direnv automatically on macOS.' >&2; return 1; }; brew install direnv ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then run_privileged apt-get update; run_privileged apt-get install -y direnv
      elif command -v dnf >/dev/null 2>&1; then run_privileged dnf install -y direnv
      elif command -v pacman >/dev/null 2>&1; then run_privileged pacman -Sy --needed --noconfirm direnv
      elif command -v apk >/dev/null 2>&1; then run_privileged apk add direnv
      elif command -v zypper >/dev/null 2>&1; then run_privileged zypper --non-interactive install direnv
      else echo 'No supported Linux package manager was found to install direnv.' >&2; return 1; fi
      ;;
    *) echo "Automatic direnv installation is not supported on $(uname -s)." >&2; return 1 ;;
  esac
  command -v direnv >/dev/null 2>&1 || { echo 'direnv installation did not make the command available in PATH.' >&2; return 1; }
}

enable_direnv_hook() {
  local shell_name shell_config hook_line
  shell_name="$(basename "${SHELL:-bash}")"
  case "$shell_name" in
    bash) shell_config="${HOME}/.bashrc"; hook_line='eval "$(direnv hook bash)"' ;;
    zsh) shell_config="${HOME}/.zshrc"; hook_line='eval "$(direnv hook zsh)"' ;;
    fish) shell_config="${HOME}/.config/fish/config.fish"; hook_line='direnv hook fish | source' ;;
    *) echo "Unsupported shell '$shell_name'. Enable its direnv hook manually, then rerun setup." >&2; return 1 ;;
  esac
  grep -Fq '# >>> docker-dev direnv hook >>>' "$shell_config" 2>/dev/null && return 0
  mkdir -p "$(dirname "$shell_config")"
  { echo; echo '# >>> docker-dev direnv hook >>>'; echo "$hook_line"; echo '# <<< docker-dev direnv hook <<<'; } >> "$shell_config"
}

ensure_envrc_ignored() {
  local gitignore_file="$project_root/.gitignore"
  [[ -f "$gitignore_file" ]] && grep -Fq '# >>> docker-dev managed .envrc >>>' "$gitignore_file" && return 0
  [[ -f "$gitignore_file" ]] && grep -Fxq '.envrc' "$gitignore_file" && return 0
  [[ ! -e "$gitignore_file" || -f "$gitignore_file" ]] || { echo "Cannot add .envrc to $gitignore_file because it is not a regular file." >&2; return 1; }
  {
    [[ -s "$gitignore_file" ]] && echo
    echo '# >>> docker-dev managed .envrc >>>'
    echo '.envrc'
    echo '# <<< docker-dev managed .envrc <<<'
  } >> "$gitignore_file"
}

allow_managed_direnv() {
  local envrc_file="$project_root/.envrc"

  command -v direnv >/dev/null 2>&1 || return 0
  [[ -L "$envrc_file" ]] || return 0
  [[ "$(readlink "$envrc_file")" == '.docker-dev/direnv.envrc' ]] || return 0
  direnv allow "$envrc_file"
}

remove_managed_envrc() {
  local envrc_file="$project_root/.envrc"
  if [[ -L "$envrc_file" ]] && [[ "$(readlink "$envrc_file")" == '.docker-dev/direnv.envrc' ]]; then
    rm "$envrc_file"
    echo 'Removed the managed .envrc symlink.'
  elif [[ -e "$envrc_file" || -L "$envrc_file" ]]; then
    echo 'Preserved .envrc because it is not managed by docker-dev.' >&2
  fi
}

remove_managed_gitignore_rule() {
  local gitignore_file="$project_root/.gitignore"
  local temporary_file
  [[ -f "$gitignore_file" ]] || return 0
  grep -Fq '# >>> docker-dev managed .envrc >>>' "$gitignore_file" || return 0
  temporary_file="$(mktemp "$project_root/.gitignore.docker-dev.XXXXXX")"
  awk '
    $0 == "# >>> docker-dev managed .envrc >>>" { skipping=1; next }
    $0 == "# <<< docker-dev managed .envrc <<<" { skipping=0; next }
    !skipping { print }
  ' "$gitignore_file" > "$temporary_file"
  mv "$temporary_file" "$gitignore_file"
  echo 'Removed the managed .envrc rule from .gitignore.'
}

confirm_host_setup() {
  local response
  [[ -t 0 ]] || { echo 'Setup requires an interactive confirmation before changing the host.' >&2; return 1; }
  cat <<'EOF'
This setup may change the host machine:
  - install direnv if it is missing (using the host package manager);
  - add one managed direnv-hook block to your shell startup file;
  - create a root .envrc symlink pointing to .docker-dev/direnv.envrc;
  - add .envrc to the project .gitignore if that rule is absent;
  - create .tool-versions at the project root when it does not exist.
  - download yq $(yq_version) if it is not cached, then verify its SHA-256.

Enabled docker-dev plugins:
EOF
  show_enabled_plugins
  printf 'No application source code will be changed. Continue? [y/N] '
  read -r response
  [[ "$response" =~ ^(y|Y|yes|YES)$ ]] || { echo 'Setup cancelled; no host changes were made.' >&2; return 1; }
}
