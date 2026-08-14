import manifest from "./command.json";
import { relative, resolve } from "node:path";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("runSecretsWrapper", async (context, args) => {
    const envFile = context.commandOptions.envFile;

    if (typeof envFile !== "string" || !envFile) {
      throw new Error("Provide --env-file <path>.");
    }

    const relativePath = relative(context.projectRoot, resolve(context.projectRoot, envFile));

    if (!relativePath || relativePath.startsWith("..") || relativePath.startsWith("/")) {
      throw new Error("The env file must stay within the project.");
    }

    await start(context);
    await execInDev(context, [
      "dev",
      "docker-dev-secrets",
      `/workspace/${relativePath}`,
      ...args,
    ]);
  });
}
