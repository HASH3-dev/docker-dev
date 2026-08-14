#!/usr/bin/env bash
set -euo pipefail

REPO="HASH3-dev/docker-dev"
BIN_NAME="docker-dev"
VERSION_FILE=".docker-dev-version"
PKG_JSON_URL="https://raw.githubusercontent.com/${REPO}/refs/heads/main/package.json"

target_dir="$PWD"
version_file_path="$target_dir/$VERSION_FILE"

version="${1:-}"
write_version_file=false

if [ -n "$version" ]; then
  write_version_file=true
  echo "Using version $version from argument"
elif [ -f "$version_file_path" ]; then
  version="$(tr -d '[:space:]' < "$version_file_path")"
  echo "Using version $version from existing $VERSION_FILE"
else
  echo "Fetching latest version from package.json..."
  version="$(curl -fsSL "$PKG_JSON_URL" | grep -m1 '"version"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
  if [ -z "$version" ]; then
    echo "Failed to determine version from $PKG_JSON_URL" >&2
    exit 1
  fi
  write_version_file=true
  echo "Using version $version from remote package.json"
fi

tag="v${version#v}"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) platform="linux" ;;
  Darwin) platform="darwin" ;;
  *) echo "Unsupported OS: $os" >&2; exit 1 ;;
esac

case "$arch" in
  x86_64|amd64) plat_arch="x64" ;;
  arm64|aarch64) plat_arch="arm64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac

asset="${BIN_NAME}-${platform}-${plat_arch}"
url="https://github.com/${REPO}/releases/download/${tag}/${asset}"

tmp="$(mktemp)"
echo "Downloading ${asset} (${tag})..."
curl -fsSL "$url" -o "$tmp"
chmod +x "$tmp"
mv "$tmp" "$target_dir/$BIN_NAME"

if [ "$write_version_file" = true ]; then
  echo "$version" > "$version_file_path"
  echo "Wrote $VERSION_FILE"
fi

echo "Installed $BIN_NAME $version to $target_dir/$BIN_NAME"

gitignore_path="$target_dir/.gitignore"
if [ -f "$gitignore_path" ]; then
  if ! grep -qxF "$BIN_NAME" "$gitignore_path"; then
    echo "$BIN_NAME" >> "$gitignore_path"
    echo "Added $BIN_NAME to .gitignore"
  fi
else
  echo "$BIN_NAME" > "$gitignore_path"
  echo "Created .gitignore with $BIN_NAME"
fi
