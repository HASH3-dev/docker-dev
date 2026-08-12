#!/usr/bin/env bash
# Blocks `git commit` invocations that include a Co-Authored-By trailer.
# CLAUDE.md forbids this trailer in this repo; this hook enforces it.
set -euo pipefail

input=$(cat)
command=$(echo "$input" | bun -e '
let data = "";
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
  try {
    process.stdout.write(JSON.parse(data).tool_input?.command ?? "");
  } catch {
    process.stdout.write("");
  }
});
')

if echo "$command" | grep -qi 'git commit' && echo "$command" | grep -qi 'co-authored-by'; then
  echo "Blocked: commits in this repo must not include a Co-Authored-By trailer (see CLAUDE.md). Remove it and retry." >&2
  exit 2
fi

exit 0
