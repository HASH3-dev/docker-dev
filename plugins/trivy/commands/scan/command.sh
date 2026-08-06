scan_trivy_path() {
  [[ ${#command_args[@]} -le 1 ]] || { echo 'scan accepts at most one path.' >&2; return 2; }
  start
  exec_in_dev --workdir /workspace dev docker-dev-trivy-gate scan-path "${command_args[0]:-.}"
}
