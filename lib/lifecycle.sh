#!/usr/bin/env bash

start() {
  if compose ps --status running --services 2>/dev/null | grep -qx 'dev'; then
    echo 'Development container is already running; attaching a new terminal.'
  else
    compose up --detach --build
  fi
  install_asdf_tools
  run_plugin_hooks post-asdf
}

rebuild_environment() {
  compose up --detach --build --force-recreate
  install_asdf_tools
  run_plugin_hooks post-asdf
  allow_managed_direnv
}
