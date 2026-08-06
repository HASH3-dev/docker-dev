#!/usr/bin/env bash

require_no_arguments() {
  [[ ${#command_args[@]} -eq 0 ]] || { echo 'This command does not accept arguments. Run the command with --help for usage.' >&2; return 2; }
}

require_command_arguments() {
  [[ ${#command_args[@]} -gt 0 ]] || { echo 'Provide a command to run.' >&2; return 2; }
}
