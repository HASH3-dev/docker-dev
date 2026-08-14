import { existsSync } from "node:fs";
import { installAsdfTools } from "@lib/asdf";
import { compose, execInDev, runPluginHook, start } from "@lib/compose";
import { ensureProjectExecutable } from "@lib/host";
import { requireMatchingVersion } from "@lib/update";
import { materializeAssets } from "./assets";
import { prunePlugins } from "./plugins";
import type { ActionRegistry } from "./registry";

/** Reusable orchestration actions available to JSON command manifests. */
export function registerInternalActions(registry: ActionRegistry): void {
  registry.register("requireNoArguments", async (_context, args) => {
    if (args.length) {
      throw new Error(
        "This command does not accept arguments. Run the command with --help for usage.",
      );
    }
  });

  registry.register("requireCommandArguments", async (_context, args) => {
    if (!args.length) {
      throw new Error("Provide a command to run.");
    }
  });

  registry.register("requireSetup", async (context) => {
    if (!existsSync(context.dockerDevDirectory)) {
      throw new Error(
        "docker-dev is not configured in this project. Run `docker-dev setup` first.",
      );
    }
  });

  registry.register("refreshAssets", async (context) => {
    await requireMatchingVersion(context.projectRoot);
    await materializeAssets(context.dockerDevDirectory);
    await ensureProjectExecutable(context.dockerDevDirectory);
    await prunePlugins(context.dockerDevDirectory);
  });

  registry.register("start", async (context) => {
    await start(context);
  });

  registry.register("compose", async (context, args) => {
    await compose(context, args);
  });

  registry.register("execInDev", async (context, args) => {
    await execInDev(context, args);
  });

  registry.register("installAsdfTools", async (context) => {
    await installAsdfTools(context);
  });

  registry.register("runPluginHook", async (context, args) => {
    const [hook] = args;

    if (!hook) {
      throw new Error("Provide a plugin hook name.");
    }

    await runPluginHook(context, hook);
  });
}
