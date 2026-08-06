#!/usr/bin/env bash
set -euo pipefail

readonly version="${1:?Usage: scripts/package-release.sh <vX.Y.Z> <output-directory>}"
readonly output_directory="${2:?Usage: scripts/package-release.sh <vX.Y.Z> <output-directory>}"
readonly repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly archive_name="docker-dev-${version}.tar.gz"
readonly archive_path="$output_directory/$archive_name"

[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9._-]+)?$ ]] || {
  echo "Invalid release version: $version (expected vX.Y.Z)." >&2
  exit 2
}

mkdir -p "$output_directory"
rm -f "$archive_path" "$archive_path.sha256"

# The release is a portable project directory, not a Git checkout. Keep only
# kit files: local caches, generated settings, Git metadata and release tooling
# must never be installed into a consumer project.
tar \
  --create \
  --gzip \
  --file="$archive_path" \
  --sort=name \
  --mtime='@0' \
  --owner=0 --group=0 --numeric-owner \
  --exclude-vcs \
  --exclude='./.github' \
  --exclude='./scripts' \
  --exclude='./internal/.cache' \
  --exclude='./.ports.generated.yml' \
  --exclude='./.setup-state' \
  --transform='s,^\./,.docker-dev/,' \
  -C "$repository_root" .

sha256sum "$archive_path" > "$archive_path.sha256"
printf 'Created %s and %s\n' "$archive_path" "$archive_path.sha256"
