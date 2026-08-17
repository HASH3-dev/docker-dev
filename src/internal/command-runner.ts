import type { CommandManifest } from "../schemas/manifest";
import type { CommandContext } from "@lib/context";
import type { ActionRegistry } from "./registry";

export async function runManifest(
  manifest: CommandManifest,
  registry: ActionRegistry,
  context: CommandContext,
): Promise<void> {
  for (const step of manifest.steps) {
    const args = (step.call.args ?? []).flatMap((value) =>
      value === "$@" ? context.commandArguments : [value],
    );
    await registry.get(step.call.function)(context, args, manifest);
  }
}
