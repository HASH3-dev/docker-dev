#!/usr/bin/env bash
set -euo pipefail

readonly bearer_version='2.1.0'
readonly checksums_url="https://github.com/Bearer/bearer/releases/download/v${bearer_version}/checksums.txt"

case "$(dpkg --print-architecture)" in
  amd64) readonly arch='amd64' ;;
  arm64) readonly arch='arm64' ;;
  *) echo "Unsupported architecture for bearer: $(dpkg --print-architecture)" >&2; exit 1 ;;
esac

readonly archive="bearer_${bearer_version}_linux_${arch}.tar.gz"
readonly download_dir='/tmp/bearer-install'

mkdir -p "$download_dir"
curl --fail --location --silent --show-error \
  "https://github.com/Bearer/bearer/releases/download/v${bearer_version}/${archive}" \
  --output "$download_dir/$archive"
curl --fail --location --silent --show-error "$checksums_url" --output "$download_dir/checksums.txt"

(
  cd "$download_dir"
  grep " ${archive}\$" checksums.txt | sha256sum --check --status -
)

tar -xzf "$download_dir/$archive" -C "$download_dir"
install -m 0755 "$download_dir/bearer" /usr/local/bin/bearer
rm -rf "$download_dir"

bearer --version
