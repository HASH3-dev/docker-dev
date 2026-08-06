#!/usr/bin/env sh
set -eu

repository='HASH3-dev/docker-dev'
version=''
force=0

usage() {
  cat <<'EOF'
Usage: docker-dev-init.sh --version vX.Y.Z [--repo owner/repository] [--force]

Downloads a versioned docker-dev release, verifies its SHA-256 and installs its
.docker-dev directory in the current directory. Existing installations are
never replaced unless --force is supplied.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) version="${2:-}"; shift 2 ;;
    --repo) repository="${2:-}"; shift 2 ;;
    --force) force=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

printf '%s\n' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9._-]+)?$' || {
  echo '--version vX.Y.Z is required.' >&2
  exit 2
}
case "$repository" in */*) ;; *) echo '--repo must use owner/repository.' >&2; exit 2 ;; esac

target_directory="$(pwd)/.docker-dev"
if [ -e "$target_directory" ] || [ -L "$target_directory" ]; then
  [ "$force" -eq 1 ] || { echo "$target_directory already exists; refusing to replace it." >&2; exit 1; }
fi

command -v tar >/dev/null 2>&1 || { echo 'tar is required.' >&2; exit 1; }
if command -v curl >/dev/null 2>&1; then
  download() { curl --fail --location --silent --show-error --output "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -qO "$2" "$1"; }
else
  echo 'curl or wget is required to download docker-dev.' >&2
  exit 1
fi

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/docker-dev-init.XXXXXX")"
cleanup() { rm -rf "$temporary_directory"; }
trap cleanup EXIT HUP INT TERM

archive_name="docker-dev-${version}.tar.gz"
release_url="https://github.com/${repository}/releases/download/${version}"
archive_path="$temporary_directory/$archive_name"
checksum_path="$archive_path.sha256"

printf 'Downloading docker-dev %s from %s...\n' "$version" "$repository"
download "$release_url/$archive_name" "$archive_path"
download "$release_url/$archive_name.sha256" "$checksum_path"

expected_checksum="$(awk 'NR == 1 { print $1 }' "$checksum_path")"
case "$expected_checksum" in *[!0123456789abcdef]*|'') echo 'Release checksum is invalid.' >&2; exit 1 ;; esac
[ "${#expected_checksum}" -eq 64 ] || { echo 'Release checksum is invalid.' >&2; exit 1; }

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "$archive_path" | awk '{ print $1 }')"
elif command -v shasum >/dev/null 2>&1; then
  actual_checksum="$(shasum -a 256 "$archive_path" | awk '{ print $1 }')"
else
  echo 'sha256sum or shasum is required to verify the download.' >&2
  exit 1
fi
[ "$actual_checksum" = "$expected_checksum" ] || { echo 'Downloaded archive failed SHA-256 verification.' >&2; exit 1; }

tar -tzf "$archive_path" | while IFS= read -r archive_entry; do
  case "$archive_entry" in ./|.docker-dev|.docker-dev/*) ;; *) echo "Unsafe release entry: $archive_entry" >&2; exit 1 ;; esac
done

tar -xzf "$archive_path" -C "$temporary_directory"
[ -d "$temporary_directory/.docker-dev" ] || { echo 'Release archive does not contain .docker-dev.' >&2; exit 1; }

if [ -e "$target_directory" ] || [ -L "$target_directory" ]; then
  rm -rf "$target_directory"
fi
mv "$temporary_directory/.docker-dev" "$target_directory"
printf 'Installed docker-dev %s in %s\n' "$version" "$target_directory"
printf 'Next step: ./.docker-dev/dev.sh setup\n'
