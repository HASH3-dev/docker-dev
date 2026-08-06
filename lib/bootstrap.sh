#!/usr/bin/env bash

readonly docker_dev_lib_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$docker_dev_lib_dir/context.sh"
source "$docker_dev_lib_dir/tools.sh"
source "$docker_dev_lib_dir/plugins.sh"
source "$docker_dev_lib_dir/compose.sh"
source "$docker_dev_lib_dir/asdf.sh"
source "$docker_dev_lib_dir/host.sh"
source "$docker_dev_lib_dir/lifecycle.sh"
source "$docker_dev_lib_dir/teardown.sh"
source "$docker_dev_lib_dir/command-actions.sh"
