#!/usr/bin/env bash
set -euo pipefail

bash /opt/docker-dev/plugins/trivy/lib/adapter-runner.sh run-hook post-asdf
