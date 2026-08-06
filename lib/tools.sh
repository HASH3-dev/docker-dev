#!/usr/bin/env bash

# Host-tool downloads are deliberately locked and verified. This file never
# sources the lock file, so editing the lock cannot execute shell code.
read_tool_lock_value() {
  local key="$1" value
  [[ -f "$tools_lock_file" ]] || { echo "Tool lock file was not found: $tools_lock_file" >&2; return 1; }
  value="$(sed -n "s/^${key}=//p" "$tools_lock_file")"
  [[ "$(printf '%s\n' "$value" | wc -l | tr -d ' ')" == '1' && -n "$value" ]] || {
    echo "Missing or duplicate $key in $tools_lock_file." >&2
    return 1
  }
  printf '%s\n' "$value"
}

yq_version() {
  local version
  version="$(read_tool_lock_value YQ_VERSION)"
  [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9._-]+)?$ ]] || {
    echo "Invalid YQ_VERSION in $tools_lock_file." >&2
    return 1
  }
  printf '%s\n' "$version"
}

yq_platform() {
  local operating_system architecture
  case "$(uname -s)" in
    Linux) operating_system='linux' ;;
    Darwin) operating_system='darwin' ;;
    *) echo "Unsupported operating system for yq: $(uname -s)" >&2; return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) architecture='amd64' ;;
    arm64|aarch64) architecture='arm64' ;;
    *) echo "Unsupported architecture for yq: $(uname -m)" >&2; return 1 ;;
  esac
  printf '%s-%s\n' "$operating_system" "$architecture"
}

yq_expected_sha256() {
  local platform="$1" key checksum
  case "$platform" in
    linux-amd64) key='YQ_LINUX_AMD64_SHA256' ;;
    linux-arm64) key='YQ_LINUX_ARM64_SHA256' ;;
    darwin-amd64) key='YQ_DARWIN_AMD64_SHA256' ;;
    darwin-arm64) key='YQ_DARWIN_ARM64_SHA256' ;;
    *) echo "No yq checksum is configured for $platform." >&2; return 1 ;;
  esac
  checksum="$(read_tool_lock_value "$key")"
  [[ "$checksum" =~ ^[a-f0-9]{64}$ ]] || { echo "Invalid $key in $tools_lock_file." >&2; return 1; }
  printf '%s\n' "$checksum"
}

sha256_of_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo 'Neither sha256sum nor shasum is available to verify yq.' >&2
    return 1
  fi
}

yq_binary_path() {
  local version platform
  version="$(yq_version)"
  platform="$(yq_platform)"
  printf '%s/yq-%s-%s\n' "$tools_cache_dir" "$version" "$platform"
}

ensure_yq() {
  local version platform expected_checksum binary_path actual_checksum temporary_file download_url
  version="$(yq_version)"
  platform="$(yq_platform)"
  expected_checksum="$(yq_expected_sha256 "$platform")"
  binary_path="$(yq_binary_path)"

  if [[ -f "$binary_path" ]]; then
    actual_checksum="$(sha256_of_file "$binary_path")"
    if [[ "$actual_checksum" == "$expected_checksum" ]]; then
      chmod 0755 "$binary_path"
      return 0
    fi
    echo 'The cached yq binary failed verification; replacing it.' >&2
    rm -f "$binary_path"
  fi

  command -v curl >/dev/null 2>&1 || { echo 'curl is required to download the pinned yq binary.' >&2; return 1; }
  mkdir -p "$tools_cache_dir"
  temporary_file="$(mktemp "$tools_cache_dir/.yq.${platform}.XXXXXX")"
  # Asset names use an underscore between OS and architecture.
  download_url="https://github.com/mikefarah/yq/releases/download/${version}/yq_${platform/-/_}"
  echo "Downloading pinned yq $version for $platform..." >&2
  if ! curl --fail --location --silent --show-error --output "$temporary_file" "$download_url"; then
    rm -f "$temporary_file"
    return 1
  fi

  actual_checksum="$(sha256_of_file "$temporary_file")"
  if [[ "$actual_checksum" != "$expected_checksum" ]]; then
    rm -f "$temporary_file"
    echo "Downloaded yq failed SHA-256 verification for $platform." >&2
    return 1
  fi
  chmod 0755 "$temporary_file"
  mv "$temporary_file" "$binary_path"
}

remove_cached_yq() {
  local cached_tool
  [[ -d "$tools_cache_dir" ]] || return 0

  while IFS= read -r -d '' cached_tool; do
    rm -f "$cached_tool"
    echo "Removed cached $(basename "$cached_tool")."
  done < <(find "$tools_cache_dir" -maxdepth 1 -type f -name 'yq-*' -print0)

  rmdir "$tools_cache_dir" 2>/dev/null || true
}
