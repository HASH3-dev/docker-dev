import type { CommandContext } from "./context";
import { execInDev } from "./compose";

const installScript = `
set -euo pipefail

[[ -f .tool-versions ]] || exit 0

while read -r tool_name _; do
  case "$tool_name" in
    ""|\\#*) continue ;;
  esac

  if ! asdf plugin list | grep -Fqx -- "$tool_name"; then
    echo "Installing asdf plugin: $tool_name"
    asdf plugin add "$tool_name"
  fi
done < .tool-versions

asdf install
`;

/** Installs the asdf plugins and versions selected in the project workspace. */
export async function installAsdfTools(context: CommandContext): Promise<void> {
  await execInDev(context, ["dev", "bash", "-lc", installScript]);
}
