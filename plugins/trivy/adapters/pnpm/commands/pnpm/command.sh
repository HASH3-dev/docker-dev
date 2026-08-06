run_pnpm_wrapper() {
  local relative_path="${command_args[0]:-}"
  [[ -n "$relative_path" ]] || { echo 'Provide the project-relative working path.' >&2; return 2; }
  case "$relative_path" in /*|*'..'*) echo 'The pnpm working path must stay within the project.' >&2; return 2 ;; esac
  start
  exec_in_dev --workdir "/workspace/$relative_path" dev pnpm "${command_args[@]:1}"
}
