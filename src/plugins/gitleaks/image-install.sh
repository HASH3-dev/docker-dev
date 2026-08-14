#!/usr/bin/env bash
set -euo pipefail

readonly gitleaks_version='8.30.1'

case "$(dpkg --print-architecture)" in
  amd64) readonly arch='x64' ;;
  arm64) readonly arch='arm64' ;;
  *) echo "Unsupported architecture for gitleaks: $(dpkg --print-architecture)" >&2; exit 1 ;;
esac

readonly archive="gitleaks_${gitleaks_version}_linux_${arch}.tar.gz"
readonly download_dir='/tmp/gitleaks-install'

mkdir -p "$download_dir"
curl --fail --location --silent --show-error \
  "https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks_version}/${archive}" \
  --output "$download_dir/$archive"
curl --fail --location --silent --show-error \
  "https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks_version}/gitleaks_${gitleaks_version}_checksums.txt" \
  --output "$download_dir/checksums.txt"

(
  cd "$download_dir"
  grep " ${archive}\$" checksums.txt | sha256sum --check --status -
)

tar -xzf "$download_dir/$archive" -C "$download_dir"
install -m 0755 "$download_dir/gitleaks" /usr/local/bin/gitleaks
rm -rf "$download_dir"

gitleaks version
